// g++ -std=c++17 -Ifirmware/lib/tempsensor firmware/test/test_atc.cpp -o t && ./t
#include "atc.h"
#include <cstdio>
#include <cmath>
static int fails = 0;
#define CHECK(c) do { if (!(c)) { printf("FAIL line %d: %s\n", __LINE__, #c); fails++; } } while (0)
int main() {
  atc::Reading r;
  // ATC1441: 4.5 C -> 45 ; humidity 61 ; battery 87 % ; 3012 mV ; counter 7
  const uint8_t a[13] = {0xA4,0xC1,0x38,0x01,0x02,0x03, 0x00,0x2D, 61, 87, 0x0B,0xC4, 7};
  CHECK(atc::decode(a, 13, r) && r.mac[0] == 0xA4 && fabsf(r.temp_c - 4.5f) < 0.01f);
  CHECK(r.humidity == 61 && r.battery_pct == 87 && r.battery_mv == 3012 && r.counter == 7);
  // Negative temperature (freezer): -18.3 C = -183 = 0xFF49
  const uint8_t n[13] = {1,2,3,4,5,6, 0xFF,0x49, 50, 90, 0x0B,0xB8, 1};
  CHECK(atc::decode(n, 13, r) && fabsf(r.temp_c - (-18.3f)) < 0.01f);
  // pvvx: MAC reversed, temp 0.01 C: 21.37 C = 2137 = 0x0859, hum 45.50 % = 4550 = 0x11C6, 2950 mV, 80 %
  const uint8_t p[15] = {0x06,0x05,0x04,0x03,0x02,0x01, 0x59,0x08, 0xC6,0x11, 0x86,0x0B, 80, 9, 0};
  CHECK(atc::decode(p, 15, r) && r.mac[0] == 1 && r.mac[5] == 6 && fabsf(r.temp_c - 21.37f) < 0.01f);
  CHECK(fabsf(r.humidity - 45.5f) < 0.01f && r.battery_mv == 2950 && r.battery_pct == 80 && r.counter == 9);
  CHECK(!atc::decode(a, 8, r));
  printf(fails ? "FAILED\n" : "all ok\n");
  return fails;
}
