#pragma once

#include "recorder/config.h"

#include <atomic>
#include <functional>
#include <mutex>
#include <string>

namespace recorder {

enum class RecorderState { stopped, starting, recording, error, stopping };

struct RecorderStatus {
    RecorderState state = RecorderState::stopped;
    std::string device;
    int sample_rate = 0;
    int channels = 0;
    std::string current_file;
    std::string segment_started_at;
    long long frames_in_segment = 0;
    std::string last_published_file;
    std::string last_error;
};

std::string state_name(RecorderState state);
std::string status_to_json(const RecorderStatus& status);

class RecorderEngine {
public:
    using StatusCallback = std::function<void(const RecorderStatus&)>;

    explicit RecorderEngine(RecorderConfig config, StatusCallback callback = {});
    ~RecorderEngine();

    RecorderEngine(const RecorderEngine&) = delete;
    RecorderEngine& operator=(const RecorderEngine&) = delete;

    // Blocks until stop() is called, SIGINT/SIGTERM is handled by the CLI, or an error occurs.
    int run();
    void stop();
    RecorderStatus status() const;

private:
    void update_status(const std::function<void(RecorderStatus&)>& update, bool notify = false);
    void publish_status_file();
    void notify_status();

    RecorderConfig config_;
    StatusCallback callback_;
    std::atomic<bool> stop_requested_{false};
    mutable std::mutex status_mutex_;
    mutable std::mutex state_file_mutex_;
    RecorderStatus status_;
};

// Opens the configured capture source and verifies that the requested rate, format and
// channel mode can be negotiated. It does not start a recording.
void probe_device(const RecorderConfig& config);
std::string list_devices_json();

}  // namespace recorder
