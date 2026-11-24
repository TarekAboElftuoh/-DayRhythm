cmake_minimum_required(VERSION 3.20)
project(dayrhythm_core VERSION 2.0.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# Source files
set(CORE_SOURCES
    src/engine.cpp
    src/spirc.cpp
    src/prayer.cpp
    src/storage.cpp
    src/c_api.cpp
)

# Public headers
set(CORE_HEADERS
    include/dayrhythm/types.hpp
    include/dayrhythm/engine.hpp
    include/dayrhythm/spirc.hpp
    include/dayrhythm/prayer.hpp
    include/dayrhythm/storage.hpp
    include/dayrhythm/c_api.h
)

add_library(dayrhythm_core STATIC
    ${CORE_SOURCES}
    ${CORE_HEADERS}
)

target_include_directories(dayrhythm_core PUBLIC
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
    $<INSTALL_INTERFACE:include>
)

# Optional SQLite3 linking (system or embedded)
find_package(SQLite3 QUIET)
if(SQLite3_FOUND)
    target_link_libraries(dayrhythm_core PUBLIC SQLite::SQLite3)
else()
    message(STATUS "SQLite3 package not found via find_package; consumers should link sqlite3")
endif()
