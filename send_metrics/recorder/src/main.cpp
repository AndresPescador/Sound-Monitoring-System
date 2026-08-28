#include "recorder/config.h"
#include "recorder/engine.h"

#include <atomic>
#include <chrono>
#include <csignal>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <string>
#include <thread>

namespace {

volatile std::sig_atomic_t stop_signal = 0;

void handle_stop_signal(int) {
    stop_signal = 1;
}

void print_usage(std::ostream& output) {
    output << "Uso:\n"
           << "  continuous-recorder devices [--json]\n"
           << "  continuous-recorder validate-config --config ARCHIVO\n"
           << "  continuous-recorder record --config ARCHIVO [--json]\n"
           << "  continuous-recorder status --config ARCHIVO [--json]\n";
}

std::filesystem::path config_argument(int argc, char* argv[], bool& json) {
    std::filesystem::path config;
    json = false;
    for (int index = 2; index < argc; ++index) {
        const std::string argument = argv[index];
        if (argument == "--json") {
            json = true;
        } else if (argument == "--config") {
            if (++index == argc) throw std::runtime_error("Falta el valor de --config.");
            config = argv[index];
        } else {
            throw std::runtime_error("Argumento no reconocido: " + argument);
        }
    }
    if (config.empty()) throw std::runtime_error("--config es obligatorio para este comando.");
    return config;
}

}  // namespace

int main(int argc, char* argv[]) {
    if (argc < 2) {
        print_usage(std::cerr);
        return 2;
    }

    if (std::string(argv[1]) == "--help" || std::string(argv[1]) == "-h") {
        print_usage(std::cout);
        return 0;
    }

    try {
        const std::string command = argv[1];
        if (command == "devices") {
            bool json = false;
            if (argc == 3 && std::string(argv[2]) == "--json") json = true;
            else if (argc != 2) throw std::runtime_error("devices solo acepta --json.");
            const auto devices = recorder::list_devices_json();
            if (json) {
                std::cout << devices << '\n';
            } else {
                std::cout << "Fuentes ALSA detectadas (copie el valor device al TOML):\n" << devices << '\n';
            }
            return 0;
        }

        bool json = false;
        const auto config_path = config_argument(argc, argv, json);
        const auto config = recorder::load_config(config_path);

        if (command == "validate-config") {
            if (json) throw std::runtime_error("validate-config no admite --json.");
            recorder::probe_device(config);
            std::cout << "Configuración válida: " << config.device << ", " << config.sample_rate
                      << " Hz, canales " << recorder::channel_mode_name(config.channels) << ".\n";
            return 0;
        }

        if (command == "status") {
            const std::ifstream input(config.state_file, std::ios::binary);
            if (!input) throw std::runtime_error("No existe estado del grabador en " + config.state_file.string());
            std::cout << input.rdbuf();
            return 0;
        }

        if (command == "record") {
            std::signal(SIGINT, handle_stop_signal);
            std::signal(SIGTERM, handle_stop_signal);
            recorder::RecorderEngine engine(config, [json](const recorder::RecorderStatus& status) {
                if (json) {
                    std::cout << recorder::status_to_json(status) << std::endl;
                } else if (status.state == recorder::RecorderState::error) {
                    std::cerr << "Error: " << status.last_error << '\n';
                } else if (status.state == recorder::RecorderState::recording) {
                    std::cerr << "Grabando desde " << status.device << " (" << status.sample_rate
                              << " Hz, " << status.channels << " canal(es)).\n";
                } else if (!status.last_published_file.empty()) {
                    std::cerr << "Publicado: " << status.last_published_file << '\n';
                }
            });

            std::atomic<bool> finished{false};
            std::thread signal_watcher([&engine, &finished] {
                while (!finished.load()) {
                    if (stop_signal != 0) engine.stop();
                    std::this_thread::sleep_for(std::chrono::milliseconds(50));
                }
            });
            const int result = engine.run();
            finished.store(true);
            signal_watcher.join();
            return result;
        }

        throw std::runtime_error("Comando no reconocido: " + command);
    } catch (const std::exception& error) {
        std::cerr << "continuous-recorder: " << error.what() << '\n';
        return 2;
    }
}
