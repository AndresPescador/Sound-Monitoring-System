#include "recorder/config.h"

#include <toml++/toml.h>

#include <stdexcept>

namespace recorder {

namespace {

std::filesystem::path required_path(const toml::table& table, const char* key) {
    const auto value = table[key].value<std::string>();
    if (!value || value->empty()) {
        throw std::runtime_error(std::string("La clave TOML '") + key + "' es obligatoria.");
    }
    return *value;
}

}  // namespace

RecorderConfig load_config(const std::filesystem::path& config_path) {
    toml::table table;
    try {
        table = toml::parse_file(config_path.string());
    } catch (const toml::parse_error& error) {
        throw std::runtime_error(
            "No se pudo leer " + config_path.string() + ": " + std::string(error.description()));
    }

    RecorderConfig config;
    const auto device = table["device"].value<std::string>();
    if (!device || device->empty()) {
        throw std::runtime_error("La clave TOML 'device' es obligatoria.");
    }
    config.device = *device;
    config.sample_rate = table["sample_rate"].value_or(44100);
    config.segment_seconds = table["segment_seconds"].value_or(60);
    config.output_dir = required_path(table, "output_dir");
    config.state_file = required_path(table, "state_file");

    const auto channel_value = table["channels"].value_or(std::string("auto"));
    if (channel_value == "auto") {
        config.channels = ChannelMode::automatic;
    } else if (channel_value == "mono") {
        config.channels = ChannelMode::mono;
    } else if (channel_value == "stereo") {
        config.channels = ChannelMode::stereo;
    } else {
        throw std::runtime_error("'channels' debe ser 'auto', 'mono' o 'stereo'.");
    }

    validate_config_values(config);
    return config;
}

void validate_config_values(const RecorderConfig& config) {
    if (config.device.empty()) {
        throw std::runtime_error("Debe configurar un dispositivo ALSA en 'device'.");
    }
    if (config.sample_rate < 8000 || config.sample_rate > 192000) {
        throw std::runtime_error("'sample_rate' debe estar entre 8000 y 192000 Hz.");
    }
    if (config.segment_seconds < 1 || config.segment_seconds > 86400) {
        throw std::runtime_error("'segment_seconds' debe estar entre 1 y 86400.");
    }
    if (config.output_dir.empty() || config.state_file.empty()) {
        throw std::runtime_error("'output_dir' y 'state_file' no pueden estar vacíos.");
    }
}

std::string channel_mode_name(ChannelMode mode) {
    switch (mode) {
        case ChannelMode::automatic: return "auto";
        case ChannelMode::mono: return "mono";
        case ChannelMode::stereo: return "stereo";
    }
    return "unknown";
}

}  // namespace recorder
