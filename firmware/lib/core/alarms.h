// Wattcher alarm engine (pure C++). Mute = per-alarm "off" with an optional expiry, never silent:
// off alarms are reported so the app can show a banner. Apache-2.0.
#pragma once
#include <cstdint>

namespace wattcher {

enum AlarmId : uint8_t { A_SOC_LOW, A_SOC_CRIT, A_VOLT_LOW, A_VOLT_HIGH, A_TTE_SHORT, A_NO_CHARGE, A_VICTRON_FAULT, A_SENSOR_LOST, A_COUNT };

struct Thresholds {
  float soc_low = 20, soc_crit = 10, volt_low = 11.8f, volt_high = 14.8f;
  uint32_t tte_short_min = 60, no_charge_s = 24 * 3600, stale_s = 120;
};

struct Reading {
  bool valid = false;        // false = data stale
  float soc = -1, volts = 0; // soc < 0 = unknown
  int tte_min = -1;
  bool charging = false;
  bool victron_fault = false;
  uint32_t age_s = 0;
};

class AlarmEngine {
 public:
  Thresholds th;
  // until == 0 : on. until == UINT32_MAX : off until turned on. else off until that epoch.
  uint32_t off_until[A_COUNT] = {0};
  bool active[A_COUNT] = {false};
  uint32_t last_charge_epoch = 0;

  void setOff(AlarmId a, uint32_t now, uint32_t duration_s) { off_until[a] = duration_s == 0 ? UINT32_MAX : now + duration_s; }
  void setOn(AlarmId a) { off_until[a] = 0; }
  bool isOff(AlarmId a, uint32_t now) const { return off_until[a] != 0 && now < off_until[a]; }
  // Critical battery cannot be turned off by "off all"; callers enforce via setOff policy.
  bool anyOff(uint32_t now) const { for (int i = 0; i < A_COUNT; i++) if (isOff((AlarmId)i, now)) return true; return false; }

  // Returns bitmask of alarms that should notify now (active and not off). `active[]` always updated
  // so an off alarm still shows in the app but does not notify.
  uint32_t evaluate(uint32_t now, const Reading &r) {
    for (int i = 0; i < A_COUNT; i++) if (off_until[i] && off_until[i] != UINT32_MAX && now >= off_until[i]) off_until[i] = 0;
    if (r.charging) last_charge_epoch = now;
    if (!last_charge_epoch) last_charge_epoch = now;
    bool fresh = r.valid;
    active[A_SENSOR_LOST] = !fresh;
    active[A_SOC_LOW]  = fresh && r.soc >= 0 && r.soc <= th.soc_low && r.soc > th.soc_crit;
    active[A_SOC_CRIT] = fresh && r.soc >= 0 && r.soc <= th.soc_crit;
    active[A_VOLT_LOW]  = fresh && r.volts > 0 && r.volts <= th.volt_low;
    active[A_VOLT_HIGH] = fresh && r.volts >= th.volt_high;
    active[A_TTE_SHORT] = fresh && r.tte_min >= 0 && (uint32_t)r.tte_min <= th.tte_short_min;
    active[A_NO_CHARGE] = fresh && (now - last_charge_epoch) >= th.no_charge_s;
    active[A_VICTRON_FAULT] = fresh && r.victron_fault;
    uint32_t mask = 0;
    for (int i = 0; i < A_COUNT; i++) if (active[i] && !isOff((AlarmId)i, now)) mask |= 1u << i;
    return mask;
  }
};

}  // namespace wattcher
