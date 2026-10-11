// Wattcher derived metrics (pure C++). Apache-2.0.
#pragma once
#include <cstdint>
#include <cmath>

namespace wattcher {

// Tracks last full charge and smoothed net current for time-to-empty/full estimates.
struct Metrics {
  float capacity_ah = 100.f;     // set per van profile
  float full_soc = 99.0f;        // SOC at/above which the battery counts as full
  float full_voltage = 13.3f;    // optional extra check
  float smoothed_a = 0.f;        // EMA of battery current (A, +charging)
  float slow_a = 0.f;            // slower EMA (about a minute) used for time estimates so they do not jump
  bool  have_current = false;
  uint32_t last_full_epoch = 0;  // 0 = never seen
  uint32_t full_since = 0;       // when SOC first stayed >= full_soc
  uint32_t full_hold_s = 120;    // must stay full this long

  void update(uint32_t now_epoch, float soc, float volts, float current_a) {
    const float alpha = 0.1f;
    smoothed_a = have_current ? smoothed_a + alpha * (current_a - smoothed_a) : current_a;
    slow_a = have_current ? slow_a + 0.02f * (current_a - slow_a) : current_a;
    have_current = true;
    if (soc >= full_soc && volts >= full_voltage) {
      if (!full_since) full_since = now_epoch;
      if (now_epoch - full_since >= full_hold_s) last_full_epoch = now_epoch;
    } else {
      full_since = 0;
    }
  }

  // Minutes until empty at the smoothed discharge rate; -1 if not discharging meaningfully.
  int timeToEmptyMin(float soc) const {
    if (!have_current || slow_a > -0.05f || soc < 0) return -1;
    float ah_left = capacity_ah * soc / 100.f;
    return (int)lroundf(ah_left / -slow_a * 60.f);
  }
  // Minutes until full at the smoothed charge rate; -1 if not charging meaningfully.
  int timeToFullMin(float soc) const {
    if (!have_current || slow_a < 0.05f || soc < 0) return -1;
    float ah_needed = capacity_ah * (100.f - soc) / 100.f;
    return (int)lroundf(ah_needed / slow_a * 60.f);
  }
};

}  // namespace wattcher
