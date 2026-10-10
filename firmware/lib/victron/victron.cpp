#include "victron.h"
#include <cstring>

namespace victron {

static uint32_t bits(const uint8_t *p, size_t len, unsigned start, unsigned n) {
  uint32_t v = 0;
  for (unsigned i = 0; i < n; i++) {
    unsigned b = start + i;
    if ((b >> 3) >= len) return 0;
    if (p[b >> 3] & (1u << (b & 7))) v |= (1u << i);
  }
  return v;
}
static int32_t sbits(const uint8_t *p, size_t len, unsigned start, unsigned n) {
  uint32_t v = bits(p, len, start, n);
  if (v & (1u << (n - 1))) return (int32_t)(v | ~((1u << n) - 1u));  // n < 32
  return (int32_t)v;
}

bool parseHeader(const uint8_t *d, size_t len, Header &h) {
  if (len < 9 || d[0] != 0x10) return false;
  h.product_id  = d[2] | (d[3] << 8);
  h.record_type = d[4];
  h.nonce       = d[5] | (d[6] << 8);
  h.key_byte0   = d[7];
  h.payload     = d + 8;
  h.payload_len = len - 8;
  return true;
}

bool decodeBatteryMonitor(const uint8_t *p, size_t len, BatteryMonitor &o) {
  if (len < 15) return false;
  uint32_t ttg = bits(p, len, 0, 16);
  o.ttg_min = (ttg == 0xFFFF) ? -1 : (int)ttg;
  o.voltage = sbits(p, len, 16, 16) * 0.01f;
  o.alarm   = bits(p, len, 32, 16);
  o.aux_type = bits(p, len, 64, 2);
  o.current = sbits(p, len, 66, 22) * 0.001f;
  uint32_t aux = bits(p, len, 48, 16);
  o.starter_v = o.midpoint_v = o.temp_c = kNA;
  if (o.aux_type == 0) o.starter_v = (int16_t)aux * 0.01f;
  else if (o.aux_type == 1) o.midpoint_v = aux * 0.01f;
  else if (o.aux_type == 2) o.temp_c = aux * 0.01f - 273.15f;
  uint32_t ah = bits(p, len, 88, 20);
  o.consumed_ah = (ah == 0xFFFFF) ? kNA : -(float)ah * 0.1f;
  uint32_t soc = bits(p, len, 108, 10);
  o.soc = (soc == 0x3FF) ? kNA : soc * 0.1f;
  return true;
}

bool decodeSolarCharger(const uint8_t *p, size_t len, SolarCharger &o) {
  if (len < 12) return false;
  o.state   = bits(p, len, 0, 8);
  o.error   = bits(p, len, 8, 8);
  o.voltage = sbits(p, len, 16, 16) * 0.01f;
  o.current = sbits(p, len, 32, 16) * 0.1f;
  o.yield_kwh = bits(p, len, 48, 16) * 0.01f;
  o.pv_w    = bits(p, len, 64, 16);
  uint32_t l = bits(p, len, 80, 9);
  o.load_a  = (l == 0x1FF) ? kNA : l * 0.1f;
  return true;
}

static float na16(uint32_t v, float scale) { return v == 0xFFFF ? kNA : v * scale; }

bool decodeOrionXS(const uint8_t *p, size_t len, OrionXS &o) {
  if (len < 14) return false;
  o.state = bits(p, len, 0, 8);
  o.error = bits(p, len, 8, 8);
  o.out_v = na16(bits(p, len, 16, 16), 0.01f);
  o.out_a = na16(bits(p, len, 32, 16), 0.1f);
  o.in_v  = na16(bits(p, len, 48, 16), 0.01f);
  o.in_a  = na16(bits(p, len, 64, 16), 0.1f);
  o.off_reason = bits(p, len, 80, 32);
  return true;
}

bool decodeInverter(const uint8_t *p, size_t len, Inverter &o) {
  if (len < 10) return false;
  o.state = bits(p, len, 0, 8);
  o.alarm = bits(p, len, 8, 16);
  int32_t bv = sbits(p, len, 24, 16);
  o.battery_v = bv == 0x7FFF ? kNA : bv * 0.01f;
  uint32_t va = bits(p, len, 40, 16);
  o.ac_va = va == 0xFFFF ? -1 : (int)va;
  uint32_t av = bits(p, len, 56, 15);
  o.ac_v = av == 0x7FFF ? kNA : av * 0.01f;
  uint32_t aa = bits(p, len, 71, 11);
  o.ac_a = aa == 0x7FF ? kNA : aa * 0.1f;
  return true;
}

const char *stateName(uint8_t s) {
  switch (s) {
    case 0: return "Off"; case 1: return "Low power"; case 2: return "Fault";
    case 3: return "Bulk"; case 4: return "Absorption"; case 5: return "Float";
    case 6: return "Storage"; case 7: return "Equalize"; case 9: return "Inverting";
    case 11: return "Power supply"; case 245: return "Starting up";
    case 246: return "Repeated absorption"; case 247: return "Recondition";
    case 248: return "Battery safe"; case 249: return "Active";
    case 252: return "External control"; default: return "Unknown";
  }
}

const char *chargerErrorName(uint8_t e) {
  switch (e) {
    case 0: return "No error"; case 1: return "Battery temperature too high";
    case 2: return "Battery voltage too high"; case 3: case 4: case 5: return "Temperature sensor failure";
    case 6: case 7: case 8: return "Voltage sense failure"; case 11: return "High ripple";
    case 14: return "Battery temperature too low"; case 17: return "Charger temperature too high";
    case 116: return "Calibration lost"; case 117: return "Incompatible firmware";
    case 119: return "Settings lost"; case 121: return "Tester fail";
    case 200: case 201: return "Internal DC voltage error"; case 202: return "Self-test failure";
    case 203: case 205: case 212: case 215: return "Internal supply error";
    default: return "Unknown error";
  }
}

}  // namespace victron
