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

}  // namespace victron
