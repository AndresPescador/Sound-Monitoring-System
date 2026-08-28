#include "recorder/paths.h"

#include <ctime>
#include <iomanip>
#include <sstream>
#include <stdexcept>

namespace recorder {

namespace {

std::tm local_time(std::time_t value) {
    std::tm result{};
    if (localtime_r(&value, &result) == nullptr) {
        throw std::runtime_error("No se pudo obtener la hora local para nombrar el archivo.");
    }
    return result;
}

}  // namespace

std::filesystem::path recording_path_for(
    const std::filesystem::path& output_dir,
    std::chrono::system_clock::time_point started_at) {
    const auto raw_time = std::chrono::system_clock::to_time_t(started_at);
    const auto local = local_time(raw_time);

    std::ostringstream stem;
    stem << "Rec " << std::put_time(&local, "%Y-%m-%d %Hh%Mm%Ss") << " 1";
    const auto canonical = output_dir / (stem.str() + ".wav");
    if (!std::filesystem::exists(canonical) && !std::filesystem::exists(temporary_path_for(canonical))) {
        return canonical;
    }

    for (unsigned int suffix = 2; suffix < 10000; ++suffix) {
        const auto candidate = output_dir / (stem.str() + " (" + std::to_string(suffix) + ").wav");
        if (!std::filesystem::exists(candidate) && !std::filesystem::exists(temporary_path_for(candidate))) {
            return candidate;
        }
    }
    throw std::runtime_error("No se encontró un nombre de grabación disponible.");
}

std::filesystem::path temporary_path_for(const std::filesystem::path& final_path) {
    return final_path.string() + ".part";
}

}  // namespace recorder
