// g++ -std=c++17 -Ifirmware/lib/core firmware/test/test_frame.cpp -o t && ./t
#include "frame.h"
#include <cstdio>
static int fails = 0;
#define CHECK(c) do { if (!(c)) { printf("FAIL line %d: %s\n", __LINE__, #c); fails++; } } while (0)
int main() {
  wattcher::Live l; l.epoch = 0x01020304; l.volts_cv = 1281; l.amps_da = -1; l.soc_dpct = 940;
  l.tte_min = 540; l.last_full_epoch = 99; l.pv_w = 120; l.alarm_mask = 5; l.off_mask = 2; l.flags = 3;
  uint8_t f[wattcher::kLiveFrameLen]; wattcher::packLive(l, f);
  CHECK(f[0] == 0 && f[1] == 4 && f[4] == 1);               // epoch LE at 1..4
  CHECK((int16_t)(f[5] | f[6] << 8) == 1281);                // volts at 5
  CHECK((int16_t)(f[7] | f[8] << 8) == -1);                  // amps at 7
  CHECK((uint16_t)(f[9] | f[10] << 8) == 940);               // soc at 9
  CHECK((f[11] | f[12] << 8) == 540);                        // tte at 11
  CHECK(f[15] == 99);                                        // last full at 15
  CHECK((int16_t)(f[19] | f[20] << 8) == 120);               // pv at 19
  CHECK(f[21] == 5 && f[25] == 2 && f[29] == 3);             // alarms 21, off 25, flags 29
  wattcher::Live n; wattcher::packLive(n, f);
  CHECK((int16_t)(f[5] | f[6] << 8) == 0x7FFF && (uint16_t)(f[9] | f[10] << 8) == 0xFFFF);
  printf(fails ? "FAILED\n" : "all ok\n");
  return fails;
}
