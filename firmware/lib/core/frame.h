// Live-state frame v0 (30 bytes, little-endian) shared with web/index.html and the Android app. Apache-2.0.
#pragma once
#include <cstdint>
#include <cstring>

namespace wattcher {

constexpr size_t kLiveFrameLen = 30;
constexpr int16_t  kNA16 = 0x7FFF;
constexpr uint16_t kNAU16 = 0xFFFF;
constexpr int32_t  kNA32 = 0x7FFFFFFF;

struct Live {
  uint32_t epoch = 0;
  int16_t volts_cv = kNA16, amps_da = kNA16;
  uint16_t soc_dpct = kNAU16;
  int32_t tte_min = kNA32;
  uint32_t last_full_epoch = 0;
  int16_t pv_w = kNA16;
  uint32_t alarm_mask = 0, off_mask = 0;
  uint8_t flags = 0;   // bit0 shunt fresh, bit1 mppt fresh, bit2 temp sensors present
};

template <typename T> inline void put(uint8_t *&p, T v) { memcpy(p, &v, sizeof v); p += sizeof v; }  // little-endian hosts only (ESP32, x86, ARM)

inline void packLive(const Live &l, uint8_t out[kLiveFrameLen]) {
  uint8_t *p = out;
  put<uint8_t>(p, 0);
  put(p, l.epoch); put(p, l.volts_cv); put(p, l.amps_da); put(p, l.soc_dpct);
  put(p, l.tte_min); put(p, l.last_full_epoch); put(p, l.pv_w);
  put(p, l.alarm_mask); put(p, l.off_mask); put<uint8_t>(p, l.flags);
}

}  // namespace wattcher
