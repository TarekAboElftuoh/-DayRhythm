cmake_minimum_required(VERSION 3.20)
project(dayrhythm_jni)

set(CMAKE_CXX_STANDARD 20)

# Link C++ Core static library
add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/../../../../core ${CMAKE_CURRENT_BINARY_DIR}/core_build)

add_library(dayrhythm_jni SHARED
    dayrhythm_jni.cpp
)

target_include_directories(dayrhythm_jni PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/../../../../core/include
)

find_library(log-lib log)

target_link_libraries(dayrhythm_jni
    dayrhythm_core
    ${log-lib}
)
