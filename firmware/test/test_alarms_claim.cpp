// g++ -std=c++17 -Ifirmware/lib/core firmware/test/test_alarms_claim.cpp -o t && ./t
#include "alarms.h"
#include "claim.h"
#include <cstdio>
static int fails = 0;
#define CHECK(c) do { if (!(c)) { printf("FAIL line %d: %s\n", __LINE__, #c); fails++; } } while (0)
// Toy hash for tests only.
static void toyHash(const char *pin, const uint8_t salt[8], uint8_t out[32]) {
  for (int i = 0; i < 32; i++) out[i] = (uint8_t)(pin[i % 6] * 31 + salt[i % 8] + i);
}
int main() {
  using namespace wattcher;
  AlarmEngine e; Reading r; r.valid = true; r.soc = 15; r.volts = 12.5f;
  CHECK(e.evaluate(1000, r) == (1u << A_SOC_LOW));
  e.setOff(A_SOC_LOW, 1000, 3600);                       // mute for 1 h
  CHECK(e.evaluate(1001, r) == 0 && e.active[A_SOC_LOW] && e.anyOff(1001));
  r.soc = 8;                                             // different alarm breaks through
  CHECK(e.evaluate(1002, r) == (1u << A_SOC_CRIT));
  r.soc = 15;
  CHECK(e.evaluate(1000 + 3600, r) == (1u << A_SOC_LOW)); // timed mute expired
  e.setOff(A_SOC_LOW, 5000, 0);                          // until turned on
  CHECK((e.evaluate(999999, r) & (1u << A_SOC_LOW)) == 0 && e.isOff(A_SOC_LOW, 999999));
  e.setOn(A_SOC_LOW);
  CHECK(e.evaluate(1000000, r) != 0);
  r.valid = false;
  CHECK(e.evaluate(1000001, r) == (1u << A_SENSOR_LOST));

  ClaimState c; uint8_t salt[8] = {1,2,3,4,5,6,7,8};
  CHECK(claim(c, 400, "123456", salt, toyHash) == CLAIM_WINDOW_CLOSED);
  CHECK(claim(c, 10, "12ab56", salt, toyHash) == CLAIM_BAD_PIN_FORMAT);
  CHECK(claim(c, 10, "123456", salt, toyHash) == CLAIM_OK);
  CHECK(claim(c, 11, "654321", salt, toyHash) == CLAIM_ALREADY);
  CHECK(authenticate(c, 20, "123456", toyHash) == AUTH_OK);
  for (int i = 0; i < 4; i++) CHECK(authenticate(c, 30, "000000", toyHash) == AUTH_BAD_PIN);
  CHECK(authenticate(c, 30, "000000", toyHash) == AUTH_LOCKED);
  CHECK(authenticate(c, 40, "123456", toyHash) == AUTH_LOCKED);   // correct PIN still locked
  CHECK(authenticate(c, 400, "123456", toyHash) == AUTH_OK);      // lock expired
  reset(c); CHECK(authenticate(c, 500, "123456", toyHash) == AUTH_UNCLAIMED);
  printf(fails ? "FAILED\n" : "all ok\n");
  return fails;
}
