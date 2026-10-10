// Host test: g++ -std=c++17 -Ifirmware/lib/victron firmware/test/test_victron.cpp firmware/lib/victron/victron.cpp -o t && ./t
#include "victron.h"
#include <cstdio>
#include <cmath>
static int fails = 0;
#define CHECK(c) do { if (!(c)) { printf("FAIL line %d: %s\n", __LINE__, #c); fails++; } } while (0)
int main() {
  // Real SmartShunt record (decrypted from a live capture, 2026-10-11).
  const uint8_t shunt[15] = {0x40,0x38,0x01,0x05,0x00,0x00,0x00,0x00,0x6B,0xFE,0xFF,0xBF,0x00,0xC0,0xFA};
  victron::BatteryMonitor b;
  CHECK(victron::decodeBatteryMonitor(shunt, 15, b));
  CHECK(b.ttg_min == 14400);
  CHECK(fabsf(b.voltage - 12.81f) < 0.001f);
  CHECK(fabsf(b.current - (-0.102f)) < 0.0005f);
  CHECK(fabsf(b.consumed_ah - (-19.1f)) < 0.01f);
  CHECK(fabsf(b.soc - 94.0f) < 0.01f);
  CHECK(b.aux_type == 3 && b.alarm == 0);

  // Header parse (nonce / key byte / payload length).
  const uint8_t adv[] = {0x10,0x02,0x38,0xC0,0x02,0x34,0x12,0xAB, 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15};
  victron::Header h;
  CHECK(victron::parseHeader(adv, sizeof adv, h));
  CHECK(h.product_id == 0xC038 && h.record_type == 2 && h.nonce == 0x1234 && h.key_byte0 == 0xAB && h.payload_len == 15);
  const uint8_t other[] = {0x02,0x35,0,0,0,0,0,0,0};
  CHECK(!victron::parseHeader(other, sizeof other, h));

  // Synthetic MPPT record: 12.75 V, 1.5 A, 0.42 kWh, 25 W, load NA.
  uint8_t m[12] = {3, 0, 0xFB,0x04, 15,0, 42,0, 25,0, 0xFF,0x01};
  victron::SolarCharger s;
  CHECK(victron::decodeSolarCharger(m, 12, s));
  CHECK(s.state == 3 && fabsf(s.voltage - 12.75f) < 0.001f && fabsf(s.current - 1.5f) < 0.01f);
  CHECK(fabsf(s.yield_kwh - 0.42f) < 0.001f && s.pv_w == 25 && s.load_a == victron::kNA);
  printf(fails ? "FAILED\n" : "all ok\n");
  return fails;
}
