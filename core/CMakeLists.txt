cmake_minimum_required(VERSION 3.18)
project(DayRhythmCore VERSION 2.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

set(CORE_SOURCES
  src/spirc_codec.cpp
)

if(ANDROID)
  list(APPEND CORE_SOURCES src/jni_bridge.cpp)
  add_library(dayrhythm_core SHARED ${CORE_SOURCES})
  target_include_directories(dayrhythm_core PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include)
  target_compile_definitions(dayrhythm_core PRIVATE DR_BUILDING_SHARED=1)
  find_library(log-lib log)
  target_link_libraries(dayrhythm_core PRIVATE ${log-lib})
else()
  add_library(DayRhythmCore SHARED ${CORE_SOURCES})
  target_include_directories(DayRhythmCore PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include)
  target_compile_definitions(DayRhythmCore PRIVATE DR_BUILDING_SHARED=1)

  enable_testing()
  add_executable(dayrhythm_core_test tests/core_test.cpp src/spirc_codec.cpp)
  target_include_directories(dayrhythm_core_test PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/include)
  target_compile_definitions(dayrhythm_core_test PRIVATE DR_STATIC=1)
  add_test(NAME DayRhythmCoreTest COMMAND dayrhythm_core_test)
endif()
