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
  float starter_v;      // kNA unless aux_type == 0
  float midpoint_v;     // kNA unless aux_type == 1
  float temp_c;         // kNA unless aux_type == 2 (also Smart Battery Sense)
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

// EXPERIMENTAL: layouts ported from victron-ble (Unlicense); unverified on real units.
struct OrionXS {          // DC-DC charger, record type 0x0F
  uint8_t state;          // OperationMode, 255 = NA
  uint8_t error;          // ChargerError, 255 = NA
  float out_v, out_a, in_v, in_a;  // kNA if not available
  uint32_t off_reason;
};
struct Inverter {         // inverter record type 0x03
  uint8_t state;
  uint16_t alarm;
  float battery_v;        // kNA if NA
  int ac_va;              // -1 if NA
  float ac_v, ac_a;       // kNA if NA
};

const char *stateName(uint8_t state);
const char *chargerErrorName(uint8_t err);

bool decodeBatteryMonitor(const uint8_t *p, size_t len, BatteryMonitor &out);
bool decodeSolarCharger(const uint8_t *p, size_t len, SolarCharger &out);
bool decodeOrionXS(const uint8_t *p, size_t len, OrionXS &out);
bool decodeInverter(const uint8_t *p, size_t len, Inverter &out);

}  // namespace victron
