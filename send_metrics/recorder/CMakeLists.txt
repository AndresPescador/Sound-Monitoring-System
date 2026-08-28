cmake_minimum_required(VERSION 3.16)

project(continuous-recorder VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

find_package(PkgConfig REQUIRED)
pkg_check_modules(ALSA REQUIRED IMPORTED_TARGET alsa)
pkg_check_modules(SNDFILE REQUIRED IMPORTED_TARGET sndfile)
find_package(tomlplusplus CONFIG REQUIRED)

add_library(recorder_core
    src/config.cpp
    src/engine.cpp
    src/paths.cpp
)

target_include_directories(recorder_core PUBLIC include)
target_link_libraries(recorder_core
    PUBLIC
        PkgConfig::ALSA
        PkgConfig::SNDFILE
        tomlplusplus::tomlplusplus
)
target_compile_options(recorder_core PRIVATE -Wall -Wextra -Wpedantic)

add_executable(continuous-recorder src/main.cpp)
target_link_libraries(continuous-recorder PRIVATE recorder_core)

include(CTest)
if(BUILD_TESTING)
    add_executable(recorder-contract-tests tests/recorder_contract_tests.cpp)
    target_link_libraries(recorder-contract-tests PRIVATE recorder_core)
    add_test(NAME recorder-contract-tests COMMAND recorder-contract-tests)
endif()

install(TARGETS continuous-recorder RUNTIME DESTINATION bin)
