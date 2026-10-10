// Wattcher - Victron Instant Readout decoder (pure C++, no ESP dependencies).
// Layouts re-derived from Victron's public "Extra manufacturer data" PDF and
// checked against real SmartShunt / SmartSolar captures. Apache-2.0.
#pragma once
#include <cstdint>
#include <cstddef>

namespace victron {

constexpr uint16_t kCompanyId = 0x02E1;

// Header after the company ID: 10 | len-ish | product(2 LE) | record type | nonce(2 LE) | key byte0 | payload
struct Header {
  uint16_t product_id;
  uint8_t  record_type;
  uint16_t nonce;
  uint8_t  key_byte0;
  const uint8_t *payload;  // encrypted bytes
  size_t   payload_len;
};

// data = manufacturer data AFTER the 2-byte company ID. Returns false if not a 0x10 record advert.
bool parseHeader(const uint8_t *data, size_t len, Header &out);

// In-place AES-128-CTR; counter block = nonce lo, nonce hi, 14 zero bytes.
// Implemented per platform (mbedtls on ESP32, built-in on host tests).
bool decrypt(const uint8_t key[16], uint16_t nonce, const uint8_t *in, uint8_t *out, size_t len);

constexpr float kNA = -1.0e9f;  // marker for "not available"

struct BatteryMonitor {
  int   ttg_min;        // -1 = NA
  float voltage;        // V
  uint16_t alarm;
  float current;        // A (negative = discharging)
  float consumed_ah;    // Ah (negative = consumed)
  float soc;            // %, kNA if not available
  uint8_t aux_type;     // 0 starter V, 1 midpoint V, 2 temp, 3 none
};

struct SolarCharger {
  uint8_t state;
  uint8_t error;
  float voltage;
  float current;
  float yield_kwh;
  uint16_t pv_w;
  float load_a;         // kNA if no load output
};

bool decodeBatteryMonitor(const uint8_t *p, size_t len, BatteryMonitor &out);
bool decodeSolarCharger(const uint8_t *p, size_t len, SolarCharger &out);

}  // namespace victron
