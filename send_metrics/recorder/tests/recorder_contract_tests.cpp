#include "recorder/config.h"
#include "recorder/engine.h"
#include "recorder/paths.h"

#include <cassert>
#include <chrono>
#include <filesystem>
#include <fstream>
#include <iostream>

int main() {
    const auto root = std::filesystem::temp_directory_path() / "continuous-recorder-contract-test";
    std::filesystem::remove_all(root);
    std::filesystem::create_directories(root);

    const auto timestamp = std::chrono::system_clock::from_time_t(1746694738); // 2025-05-08 08:58:58 -0500
    const auto first = recorder::recording_path_for(root, timestamp);
    assert(first.extension() == ".wav");
    assert(first.filename().string().find("Rec ") == 0);
    assert(first.filename().string().find(" 1.wav") != std::string::npos);

    std::ofstream(first).put('x');
    const auto second = recorder::recording_path_for(root, timestamp);
    assert(second != first);
    assert(second.filename().string().find("(2).wav") != std::string::npos);
    assert(recorder::temporary_path_for(first).filename().string().find(".wav.part") != std::string::npos);

    recorder::RecorderConfig defaults;
    defaults.device = "hw:1,0";
    defaults.output_dir = root;
    defaults.state_file = root / "state.json";
    recorder::validate_config_values(defaults);
    assert(defaults.sample_rate == 44100);
    assert(defaults.segment_seconds == 60);

    const auto config_path = root / "recorder.toml";
    {
        std::ofstream config_file(config_path);
        config_file << "station_code = \"ST-TEST\"\n"
                    << "station_secret = \"not-used-by-recorder\"\n"
                    << "server_url = \"https://monitor.example\"\n"
                    << "device = \"null\"\n"
                    << "sample_rate = 44100\n"
                    << "channels = \"stereo\"\n"
                    << "segment_seconds = 60\n"
                    << "output_dir = \"" << root.string() << "\"\n"
                    << "state_file = \"" << (root / "state.json").string() << "\"\n";
    }
    const auto loaded = recorder::load_config(config_path);
    assert(loaded.device == "null");
    assert(loaded.sample_rate == 44100);
    assert(loaded.channels == recorder::ChannelMode::stereo);
    assert(loaded.segment_seconds == 60);

    recorder::RecorderStatus status;
    status.state = recorder::RecorderState::recording;
    status.device = "hw:1,0";
    status.frames_in_segment = 44100;
    const auto json = recorder::status_to_json(status);
    assert(json.find("\"state\": \"recording\"") != std::string::npos);
    assert(json.find("\"frames_in_segment\": 44100") != std::string::npos);

    std::filesystem::remove_all(root);
    std::cout << "Recorder contract tests passed\n";
}
