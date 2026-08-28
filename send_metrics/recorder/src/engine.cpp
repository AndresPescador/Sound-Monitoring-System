#include "recorder/engine.h"

#include "recorder/paths.h"

#include <alsa/asoundlib.h>
#include <sndfile.h>

#include <algorithm>
#include <array>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <cstdlib>
#include <cstdio>
#include <cstring>
#include <deque>
#include <exception>
#include <fcntl.h>
#include <fstream>
#include <iomanip>
#include <limits>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <thread>
#include <unistd.h>
#include <vector>

namespace recorder {

namespace {

constexpr snd_pcm_uframes_t kFramesPerRead = 1024;
constexpr std::size_t kQueueCapacity = 128;

std::string alsa_error(const std::string& action, int error) {
    return action + ": " + snd_strerror(error);
}

std::string json_escape(const std::string& value) {
    std::ostringstream output;
    for (const unsigned char character : value) {
        switch (character) {
            case '"': output << "\\\""; break;
            case '\\': output << "\\\\"; break;
            case '\b': output << "\\b"; break;
            case '\f': output << "\\f"; break;
            case '\n': output << "\\n"; break;
            case '\r': output << "\\r"; break;
            case '\t': output << "\\t"; break;
            default:
                if (character < 0x20) {
                    output << "\\u" << std::hex << std::setw(4) << std::setfill('0')
                           << static_cast<int>(character) << std::dec << std::setfill(' ');
                } else {
                    output << character;
                }
        }
    }
    return output.str();
}

std::string iso_timestamp(std::chrono::system_clock::time_point point) {
    const auto raw = std::chrono::system_clock::to_time_t(point);
    std::tm local{};
    if (localtime_r(&raw, &local) == nullptr) {
        return {};
    }
    std::ostringstream output;
    output << std::put_time(&local, "%Y-%m-%dT%H:%M:%S%z");
    return output.str();
}

void ensure_writable_directory(const std::filesystem::path& directory, const char* label) {
    const auto effective_directory = directory.empty() ? std::filesystem::path{"."} : directory;
    std::error_code error;
    std::filesystem::create_directories(effective_directory, error);
    if (error || !std::filesystem::is_directory(effective_directory)) {
        throw std::runtime_error(std::string("No se pudo preparar ") + label + ": " + effective_directory.string());
    }

    const auto probe = effective_directory / (".continuous-recorder-write-probe-" + std::to_string(::getpid()));
    const int descriptor = ::open(probe.c_str(), O_CREAT | O_EXCL | O_WRONLY, 0600);
    if (descriptor < 0) {
        throw std::runtime_error(std::string("Sin permiso de escritura en ") + label + ": " + effective_directory.string());
    }
    ::close(descriptor);
    std::filesystem::remove(probe, error);
}

void fsync_path(const std::filesystem::path& path) {
    const int descriptor = ::open(path.c_str(), O_RDONLY);
    if (descriptor < 0) {
        throw std::runtime_error("No se pudo sincronizar " + path.string());
    }
    const int result = ::fsync(descriptor);
    ::close(descriptor);
    if (result != 0) {
        throw std::runtime_error("No se pudo sincronizar " + path.string());
    }
}

void fsync_directory(const std::filesystem::path& path) {
    const int descriptor = ::open(path.c_str(), O_RDONLY | O_DIRECTORY);
    if (descriptor < 0) {
        throw std::runtime_error("No se pudo sincronizar el directorio " + path.string());
    }
    const int result = ::fsync(descriptor);
    ::close(descriptor);
    if (result != 0) {
        throw std::runtime_error("No se pudo sincronizar el directorio " + path.string());
    }
}

struct CaptureSetup {
    snd_pcm_t* handle = nullptr;
    snd_pcm_format_t format = SND_PCM_FORMAT_UNKNOWN;
    int significant_bits = 0;
    int channels = 0;
    int sample_rate = 0;

    ~CaptureSetup() {
        if (handle != nullptr) {
            snd_pcm_close(handle);
        }
    }

    CaptureSetup() = default;
    CaptureSetup(const CaptureSetup&) = delete;
    CaptureSetup& operator=(const CaptureSetup&) = delete;
    CaptureSetup(CaptureSetup&& other) noexcept
        : handle(other.handle), format(other.format), significant_bits(other.significant_bits),
          channels(other.channels), sample_rate(other.sample_rate) {
        other.handle = nullptr;
    }
    CaptureSetup& operator=(CaptureSetup&& other) noexcept {
        if (this != &other) {
            if (handle != nullptr) snd_pcm_close(handle);
            handle = other.handle;
            format = other.format;
            significant_bits = other.significant_bits;
            channels = other.channels;
            sample_rate = other.sample_rate;
            other.handle = nullptr;
        }
        return *this;
    }
};

bool configure_candidate(
    snd_pcm_t* handle,
    int requested_channels,
    int requested_rate,
    snd_pcm_format_t requested_format,
    CaptureSetup& result) {
    snd_pcm_hw_params_t* raw_params = nullptr;
    snd_pcm_hw_params_malloc(&raw_params);
    std::unique_ptr<snd_pcm_hw_params_t, decltype(&snd_pcm_hw_params_free)> params(raw_params, snd_pcm_hw_params_free);

    int error = snd_pcm_hw_params_any(handle, params.get());
    if (error < 0) return false;
    error = snd_pcm_hw_params_set_access(handle, params.get(), SND_PCM_ACCESS_RW_INTERLEAVED);
    if (error < 0) return false;
    error = snd_pcm_hw_params_set_format(handle, params.get(), requested_format);
    if (error < 0) return false;
    error = snd_pcm_hw_params_set_channels(handle, params.get(), static_cast<unsigned int>(requested_channels));
    if (error < 0) return false;

    unsigned int actual_rate = static_cast<unsigned int>(requested_rate);
    int direction = 0;
    error = snd_pcm_hw_params_set_rate_near(handle, params.get(), &actual_rate, &direction);
    if (error < 0 || actual_rate != static_cast<unsigned int>(requested_rate)) return false;

    snd_pcm_uframes_t period = kFramesPerRead;
    direction = 0;
    error = snd_pcm_hw_params_set_period_size_near(handle, params.get(), &period, &direction);
    if (error < 0) return false;
    error = snd_pcm_hw_params(handle, params.get());
    if (error < 0) return false;
    error = snd_pcm_prepare(handle);
    if (error < 0) return false;

    result.format = requested_format;
    result.significant_bits = snd_pcm_hw_params_get_sbits(params.get());
    result.channels = requested_channels;
    result.sample_rate = static_cast<int>(actual_rate);
    return true;
}

CaptureSetup open_capture(const RecorderConfig& config) {
    CaptureSetup setup;
    const int open_error = snd_pcm_open(&setup.handle, config.device.c_str(), SND_PCM_STREAM_CAPTURE, 0);
    if (open_error < 0) {
        throw std::runtime_error(alsa_error("No se pudo abrir el dispositivo ALSA '" + config.device + "'", open_error));
    }

    std::vector<int> channel_candidates;
    switch (config.channels) {
        case ChannelMode::automatic: channel_candidates = {2, 1}; break;
        case ChannelMode::mono: channel_candidates = {1}; break;
        case ChannelMode::stereo: channel_candidates = {2}; break;
    }
    const std::array<snd_pcm_format_t, 2> format_candidates = {
        SND_PCM_FORMAT_S24_3LE,
        SND_PCM_FORMAT_S32_LE,
    };

    for (const int channels : channel_candidates) {
        for (const auto format : format_candidates) {
            if (configure_candidate(setup.handle, channels, config.sample_rate, format, setup)) {
                return setup;
            }
        }
    }
    throw std::runtime_error(
        "El dispositivo ALSA no admite la tasa, canales o formato solicitados "
        "(se requiere captura intercalada PCM de 24/32 bits)."
    );
}

std::vector<std::int32_t> convert_frames(
    const std::vector<unsigned char>& source,
    snd_pcm_format_t format,
    int significant_bits,
    snd_pcm_sframes_t frames,
    int channels) {
    const auto sample_count = static_cast<std::size_t>(frames) * static_cast<std::size_t>(channels);
    std::vector<std::int32_t> output(sample_count);
    if (format == SND_PCM_FORMAT_S24_3LE) {
        for (std::size_t index = 0; index < sample_count; ++index) {
            const auto base = index * 3;
            std::int32_t sample = static_cast<std::int32_t>(source[base])
                | (static_cast<std::int32_t>(source[base + 1]) << 8)
                | (static_cast<std::int32_t>(source[base + 2]) << 16);
            if ((sample & 0x00800000) != 0) sample |= static_cast<std::int32_t>(0xff000000);
            output[index] = static_cast<std::int32_t>(static_cast<std::uint32_t>(sample) << 8);
        }
    } else if (format == SND_PCM_FORMAT_S32_LE) {
        std::memcpy(output.data(), source.data(), sample_count * sizeof(std::int32_t));
        if (significant_bits > 0 && significant_bits < 32) {
            const auto shift = static_cast<unsigned int>(32 - significant_bits);
            for (auto& sample : output) {
                sample = static_cast<std::int32_t>(static_cast<std::uint32_t>(sample) << shift);
            }
        }
    } else {
        throw std::runtime_error("Formato ALSA de captura no soportado.");
    }
    return output;
}

class ChunkQueue {
public:
    struct Chunk {
        std::vector<std::int32_t> samples;
        snd_pcm_sframes_t frames = 0;
    };

    bool push(Chunk chunk) {
        std::lock_guard<std::mutex> lock(mutex_);
        if (closed_ || chunks_.size() >= kQueueCapacity) return false;
        chunks_.push_back(std::move(chunk));
        available_.notify_one();
        return true;
    }

    bool pop(Chunk& chunk) {
        std::unique_lock<std::mutex> lock(mutex_);
        available_.wait(lock, [this] { return closed_ || !chunks_.empty(); });
        if (chunks_.empty()) return false;
        chunk = std::move(chunks_.front());
        chunks_.pop_front();
        return true;
    }

    void close() {
        std::lock_guard<std::mutex> lock(mutex_);
        closed_ = true;
        available_.notify_all();
    }

private:
    std::mutex mutex_;
    std::condition_variable available_;
    std::deque<Chunk> chunks_;
    bool closed_ = false;
};

class SegmentWriter {
public:
    SegmentWriter(std::filesystem::path output_dir, int sample_rate, int channels)
        : output_dir_(std::move(output_dir)), sample_rate_(sample_rate), channels_(channels) {}

    ~SegmentWriter() {
        if (file_ != nullptr) sf_close(file_);
    }

    void open(std::chrono::system_clock::time_point started_at) {
        final_path_ = recording_path_for(output_dir_, started_at);
        temporary_path_ = temporary_path_for(final_path_);
        SF_INFO info{};
        info.samplerate = sample_rate_;
        info.channels = channels_;
        info.format = SF_FORMAT_WAV | SF_FORMAT_PCM_24;
        file_ = sf_open(temporary_path_.c_str(), SFM_WRITE, &info);
        if (file_ == nullptr) {
            throw std::runtime_error("No se pudo crear " + temporary_path_.string() + ": " + sf_strerror(nullptr));
        }
    }

    void write(const std::int32_t* samples, sf_count_t frames) {
        const auto written = sf_writef_int(file_, samples, frames);
        if (written != frames) {
            throw std::runtime_error("Error al escribir WAV: " + std::string(sf_strerror(file_)));
        }
    }

    std::filesystem::path close_and_publish() {
        if (file_ == nullptr) return {};
        sf_write_sync(file_);
        if (sf_close(file_) != 0) {
            file_ = nullptr;
            throw std::runtime_error("No se pudo cerrar " + temporary_path_.string());
        }
        file_ = nullptr;
        fsync_path(temporary_path_);
        if (::rename(temporary_path_.c_str(), final_path_.c_str()) != 0) {
            throw std::runtime_error("No se pudo publicar " + final_path_.string());
        }
        fsync_directory(output_dir_);
        return final_path_;
    }

    bool active() const { return file_ != nullptr; }
    const std::filesystem::path& final_path() const { return final_path_; }

private:
    std::filesystem::path output_dir_;
    int sample_rate_;
    int channels_;
    SNDFILE* file_ = nullptr;
    std::filesystem::path final_path_;
    std::filesystem::path temporary_path_;
};

}  // namespace

std::string state_name(RecorderState state) {
    switch (state) {
        case RecorderState::stopped: return "stopped";
        case RecorderState::starting: return "starting";
        case RecorderState::recording: return "recording";
        case RecorderState::error: return "error";
        case RecorderState::stopping: return "stopping";
    }
    return "unknown";
}

std::string status_to_json(const RecorderStatus& status) {
    std::ostringstream output;
    output << "{\n"
           << "  \"state\": \"" << state_name(status.state) << "\",\n"
           << "  \"device\": \"" << json_escape(status.device) << "\",\n"
           << "  \"sample_rate\": " << status.sample_rate << ",\n"
           << "  \"channels\": " << status.channels << ",\n"
           << "  \"current_file\": \"" << json_escape(status.current_file) << "\",\n"
           << "  \"segment_started_at\": \"" << json_escape(status.segment_started_at) << "\",\n"
           << "  \"frames_in_segment\": " << status.frames_in_segment << ",\n"
           << "  \"last_published_file\": \"" << json_escape(status.last_published_file) << "\",\n"
           << "  \"last_error\": \"" << json_escape(status.last_error) << "\"\n"
           << "}";
    return output.str();
}

RecorderEngine::RecorderEngine(RecorderConfig config, StatusCallback callback)
    : config_(std::move(config)), callback_(std::move(callback)) {
    status_.device = config_.device;
}

RecorderEngine::~RecorderEngine() {
    stop();
}

void RecorderEngine::stop() {
    stop_requested_.store(true);
}

RecorderStatus RecorderEngine::status() const {
    std::lock_guard<std::mutex> lock(status_mutex_);
    return status_;
}

void RecorderEngine::update_status(const std::function<void(RecorderStatus&)>& update, bool notify) {
    {
        std::lock_guard<std::mutex> lock(status_mutex_);
        update(status_);
    }
    if (notify) {
        publish_status_file();
        notify_status();
    }
}

void RecorderEngine::publish_status_file() {
    const auto snapshot = status();
    std::lock_guard<std::mutex> file_lock(state_file_mutex_);
    const auto parent = config_.state_file.parent_path().empty()
        ? std::filesystem::path{"."}
        : config_.state_file.parent_path();
    std::error_code error;
    std::filesystem::create_directories(parent, error);
    if (error) throw std::runtime_error("No se pudo crear el directorio de estado: " + parent.string());

    const auto temporary = config_.state_file.string() + ".tmp." + std::to_string(::getpid());
    {
        std::ofstream output(temporary, std::ios::binary | std::ios::trunc);
        if (!output) throw std::runtime_error("No se pudo escribir el estado: " + config_.state_file.string());
        output << status_to_json(snapshot) << '\n';
        output.flush();
        if (!output) throw std::runtime_error("No se pudo terminar de escribir el estado.");
    }
    fsync_path(temporary);
    if (::rename(temporary.c_str(), config_.state_file.c_str()) != 0) {
        throw std::runtime_error("No se pudo publicar el estado: " + config_.state_file.string());
    }
    fsync_directory(parent);
}

void RecorderEngine::notify_status() {
    if (!callback_) return;
    callback_(status());
}

void probe_device(const RecorderConfig& config) {
    validate_config_values(config);
    ensure_writable_directory(config.output_dir, "output_dir");
    ensure_writable_directory(config.state_file.parent_path(), "el directorio de state_file");
    auto setup = open_capture(config);
    (void)setup;
}

int RecorderEngine::run() {
    try {
        validate_config_values(config_);
        ensure_writable_directory(config_.output_dir, "output_dir");
        ensure_writable_directory(config_.state_file.parent_path(), "el directorio de state_file");
        update_status([](RecorderStatus& state) { state.state = RecorderState::starting; }, true);

        auto capture = open_capture(config_);
        update_status([&capture](RecorderStatus& state) {
            state.state = RecorderState::recording;
            state.sample_rate = capture.sample_rate;
            state.channels = capture.channels;
            state.last_error.clear();
        }, true);

        ChunkQueue queue;
        std::exception_ptr writer_error;
        std::thread writer([this, &queue, &writer_error, sample_rate = capture.sample_rate, channels = capture.channels] {
            try {
                SegmentWriter segment(config_.output_dir, sample_rate, channels);
                const auto frames_per_segment = static_cast<long long>(sample_rate) * config_.segment_seconds;
                long long frames_in_segment = 0;
                auto last_state_write = std::chrono::steady_clock::now();
                ChunkQueue::Chunk chunk;
                while (queue.pop(chunk)) {
                    std::size_t offset = 0;
                    while (offset < static_cast<std::size_t>(chunk.frames)) {
                        if (!segment.active()) {
                            const auto started = std::chrono::system_clock::now();
                            segment.open(started);
                            frames_in_segment = 0;
                            update_status([&segment, started](RecorderStatus& state) {
                                state.current_file = segment.final_path().string();
                                state.segment_started_at = iso_timestamp(started);
                                state.frames_in_segment = 0;
                            }, true);
                        }

                        const auto remaining_segment = frames_per_segment - frames_in_segment;
                        const auto available = static_cast<long long>(chunk.frames) - static_cast<long long>(offset);
                        const auto frames_to_write = std::min(remaining_segment, available);
                        segment.write(
                            chunk.samples.data() + offset * static_cast<std::size_t>(channels),
                            static_cast<sf_count_t>(frames_to_write));
                        offset += static_cast<std::size_t>(frames_to_write);
                        frames_in_segment += frames_to_write;

                        const auto now = std::chrono::steady_clock::now();
                        if (now - last_state_write >= std::chrono::seconds(1)) {
                            update_status([frames_in_segment](RecorderStatus& state) {
                                state.frames_in_segment = frames_in_segment;
                            });
                            publish_status_file();
                            last_state_write = now;
                        }

                        if (frames_in_segment == frames_per_segment) {
                            const auto published = segment.close_and_publish();
                            update_status([published](RecorderStatus& state) {
                                state.last_published_file = published.string();
                                state.current_file.clear();
                                state.segment_started_at.clear();
                                state.frames_in_segment = 0;
                            }, true);
                        }
                    }
                }

                if (segment.active()) {
                    const auto published = segment.close_and_publish();
                    update_status([published, frames_in_segment](RecorderStatus& state) {
                        state.last_published_file = published.string();
                        state.current_file.clear();
                        state.segment_started_at.clear();
                        state.frames_in_segment = frames_in_segment;
                    }, true);
                }
            } catch (...) {
                writer_error = std::current_exception();
                stop_requested_.store(true);
            }
        });

        std::vector<unsigned char> read_buffer(kFramesPerRead * 2 * sizeof(std::int32_t));
        std::exception_ptr capture_error;
        try {
            while (!stop_requested_.load()) {
                const auto bytes_per_sample = capture.format == SND_PCM_FORMAT_S24_3LE ? 3U : 4U;
                read_buffer.resize(kFramesPerRead * static_cast<std::size_t>(capture.channels) * bytes_per_sample);
                const auto read = snd_pcm_readi(capture.handle, read_buffer.data(), kFramesPerRead);
                if (read < 0) {
                    const auto recovered = snd_pcm_recover(capture.handle, static_cast<int>(read), 1);
                    if (recovered < 0) {
                        throw std::runtime_error(alsa_error("Error de captura ALSA", recovered));
                    }
                    update_status([read](RecorderStatus& state) {
                        state.last_error = "XRUN ALSA recuperado: " + std::string(snd_strerror(static_cast<int>(read)));
                    }, true);
                    continue;
                }
                if (read == 0) continue;

                ChunkQueue::Chunk chunk;
                chunk.frames = read;
                chunk.samples = convert_frames(
                    read_buffer, capture.format, capture.significant_bits, read, capture.channels);
                if (!queue.push(std::move(chunk))) {
                    throw std::runtime_error("La cola de escritura está llena; se detiene la captura para no perder audio silenciosamente.");
                }
            }
        } catch (...) {
            capture_error = std::current_exception();
            stop_requested_.store(true);
        }

        queue.close();
        writer.join();
        if (writer_error) std::rethrow_exception(writer_error);
        if (capture_error) std::rethrow_exception(capture_error);

        update_status([](RecorderStatus& state) { state.state = RecorderState::stopped; }, true);
        return 0;
    } catch (const std::exception& error) {
        update_status([&error](RecorderStatus& state) {
            state.state = RecorderState::error;
            state.last_error = error.what();
        });
        try {
            publish_status_file();
            notify_status();
        } catch (...) {
            // The original error is more useful than a secondary state-file failure.
        }
        return 1;
    }
}

std::string list_devices_json() {
    void** hints = nullptr;
    const int error = snd_device_name_hint(-1, "pcm", &hints);
    if (error < 0) throw std::runtime_error(alsa_error("No se pudieron enumerar dispositivos ALSA", error));

    std::ostringstream output;
    output << "[";
    bool first = true;
    for (void** item = hints; *item != nullptr; ++item) {
        char* name = snd_device_name_get_hint(*item, "NAME");
        char* description = snd_device_name_get_hint(*item, "DESC");
        char* ioid = snd_device_name_get_hint(*item, "IOID");
        const bool capture_capable = ioid == nullptr || std::string(ioid) != "Output";
        if (name != nullptr && capture_capable) {
            if (!first) output << ",";
            output << "\n  {\"device\": \"" << json_escape(name) << "\", \"description\": \""
                   << json_escape(description == nullptr ? "" : description) << "\"}";
            first = false;
        }
        if (name) free(name);
        if (description) free(description);
        if (ioid) free(ioid);
    }
    snd_device_name_free_hint(hints);
    if (!first) output << "\n";
    output << "]";
    return output.str();
}

}  // namespace recorder
