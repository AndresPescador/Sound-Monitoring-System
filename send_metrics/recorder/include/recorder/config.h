#pragma once

#include <filesystem>
#include <string>

namespace recorder {

enum class ChannelMode { automatic, mono, stereo };

struct RecorderConfig {
    std::string device;
    int sample_rate = 44100;
    ChannelMode channels = ChannelMode::automatic;
    int segment_seconds = 60;
    std::filesystem::path output_dir;
    std::filesystem::path state_file;
};

RecorderConfig load_config(const std::filesystem::path& config_path);
void validate_config_values(const RecorderConfig& config);
std::string channel_mode_name(ChannelMode mode);

}  // namespace recorder
