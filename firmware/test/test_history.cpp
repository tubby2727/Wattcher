// g++ -std=c++17 -Ifirmware/lib/core firmware/test/test_history.cpp -o t && ./t
#include "history.h"
#include <cstdio>
static int fails = 0;
#define CHECK(c) do { if (!(c)) { printf("FAIL line %d: %s\n", __LINE__, #c); fails++; } } while (0)
int main() {
  using namespace wattcher;
  History h; uint32_t t0 = 1700000040;   // aligned to a minute (divisible by 60)
  CHECK(t0 % 60 == 0);
  // 3 hours of readings every second: voltage 12.00 -> alternates 12.00/12.20 (avg 12.10), amps -5.0, soc 800, no solar sensor.
  for (uint32_t i = 0; i < 3 * 3600; i++)
    h.add(t0 + i, (i % 2) ? 1220 : 1200, -50, 800, kNA16);
  CHECK(h.fine.size() == 3 * 60 - 1 || h.fine.size() == 3 * 60);       // last minute not yet flushed
  CHECK(h.fine.at(0).epoch == t0);
  CHECK(h.fine.at(0).volts_cv == 1210 && h.fine.at(0).amps_da == -50 && h.fine.at(0).soc_dpct == 800);
  CHECK(h.fine.at(0).pv_w == kNA16);                                    // missing sensor stays NA, not zero
  CHECK(h.coarse.size() >= 10 && h.coarse.size() <= 13);                // ~3h / 15 min
  CHECK(h.coarse.at(0).epoch % 900 == 0);
  CHECK(h.findFirst(false, t0) == 1 && h.findFirst(false, 0) == 0);
  CHECK(h.findFirst(false, t0 + 999999) == h.fine.size());
  // Ring wraps at 24 h.
  History w;
  for (uint32_t i = 0; i < 26 * 3600; i += 1) w.add(t0 + i, 1200, 0, 500, 100);
  CHECK(w.fine.size() == kFineN);
  CHECK(w.fine.at(kFineN - 1).epoch - w.fine.at(0).epoch == (kFineN - 1) * 60);
  printf(fails ? "FAILED\n" : "all ok\n");
  return fails;
}
