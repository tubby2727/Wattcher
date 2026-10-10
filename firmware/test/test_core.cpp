// g++ -std=c++17 -Ifirmware/lib/core firmware/test/test_core.cpp -o t && ./t
#include "metrics.h"
#include "ring.h"
#include <cstdio>
static int fails = 0;
#define CHECK(c) do { if (!(c)) { printf("FAIL line %d: %s\n", __LINE__, #c); fails++; } } while (0)
int main() {
  wattcher::Metrics m; m.capacity_ah = 100;
  CHECK(m.timeToEmptyMin(50) == -1);                 // no data yet
  for (int i = 0; i < 100; i++) m.update(1000 + i, 50, 12.8f, -5.f);
  CHECK(m.timeToEmptyMin(50) == 600);                // 50 Ah / 5 A = 10 h
  CHECK(m.timeToFullMin(50) == -1);
  wattcher::Metrics c; c.capacity_ah = 100;
  for (int i = 0; i < 100; i++) c.update(2000 + i, 80, 13.4f, 10.f);
  CHECK(c.timeToFullMin(80) == 120);                 // 20 Ah / 10 A
  CHECK(c.last_full_epoch == 0);
  for (int i = 0; i < 200; i++) c.update(3000 + i, 100.f, 13.6f, 0.5f);
  CHECK(c.last_full_epoch >= 3120);
  wattcher::Ring<4> r;
  for (uint32_t i = 1; i <= 6; i++) r.push({i, 0, 0, 0, 0});
  CHECK(r.size() == 4 && r.at(0).epoch == 3 && r.at(3).epoch == 6);
  printf(fails ? "FAILED\n" : "all ok\n");
  return fails;
}
