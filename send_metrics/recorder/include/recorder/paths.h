#pragma once

#include <chrono>
#include <filesystem>

namespace recorder {

std::filesystem::path recording_path_for(
    const std::filesystem::path& output_dir,
    std::chrono::system_clock::time_point started_at);

std::filesystem::path temporary_path_for(const std::filesystem::path& final_path);

}  // namespace recorder
