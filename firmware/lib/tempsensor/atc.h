// Xiaomi LYWSD03MMC with community ATC firmware: passive advert decoder (pure C++). Apache-2.0.
// Service data UUID 0x181A. Two formats: ATC1441 (13 bytes, big-endian) and pvvx custom (15 bytes, little-endian).
#pragma once
#include <cstdint>
#include <cstddef>

namespace atc {

struct Reading {
  uint8_t mac[6];       // in display order (aa:bb:cc:dd:ee:ff)
  float temp_c;
  float humidity;       // %
  uint8_t battery_pct;
  uint16_t battery_mv;
  uint8_t counter;      // changes per advert; use to drop duplicates
};

// data = service data payload for UUID 0x181A (after the UUID itself).
inline bool decode(const uint8_t *d, size_t n, Reading &r) {
  if (n == 13) {  // ATC1441
    for (int i = 0; i < 6; i++) r.mac[i] = d[i];
    r.temp_c = (int16_t)((d[6] << 8) | d[7]) * 0.1f;
    r.humidity = d[8];
    r.battery_pct = d[9];
    r.battery_mv = (d[10] << 8) | d[11];
    r.counter = d[12];
    return true;
  }
  if (n >= 15) {  // pvvx custom
    for (int i = 0; i < 6; i++) r.mac[i] = d[5 - i];
    r.temp_c = (int16_t)(d[6] | (d[7] << 8)) * 0.01f;
    r.humidity = (d[8] | (d[9] << 8)) * 0.01f;
    r.battery_mv = d[10] | (d[11] << 8);
    r.battery_pct = d[12];
    r.counter = d[13];
    return true;
  }
  return false;
}

}  // namespace atc
