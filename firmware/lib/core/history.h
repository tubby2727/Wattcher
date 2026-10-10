// Wattcher history: 1-minute ring (24 h) and 15-minute ring (30 days), kept in RAM and persisted by the
// platform layer. Pure C++ so it can be tested on a PC. Apache-2.0.
#pragma once
#include "ring.h"
#include "frame.h"

namespace wattcher {

constexpr size_t kFineN = 1440;    // 24 h at 1 min
constexpr size_t kCoarseN = 2880;  // 30 days at 15 min

class History {
 public:
  Ring<kFineN> fine;
  Ring<kCoarseN> coarse;

  // Call about once a second with the latest readings (kNA16/kNAU16 where unknown). `epoch` must be real time.
  void add(uint32_t epoch, int16_t volts_cv, int16_t amps_da, uint16_t soc_dpct, int16_t pv_w) {
    uint32_t minute = epoch / 60;
    if (have_ && minute != minute_) flushMinute();
    if (!have_ || minute != minute_) { minute_ = minute; have_ = true; clearAcc(fineAcc_); }
    accumulate(fineAcc_, volts_cv, amps_da, soc_dpct, pv_w);
  }

  // Returns index of first sample with epoch > since, or size() if none.
  size_t findFirst(bool useCoarse, uint32_t since) const {
    size_t n = useCoarse ? coarse.size() : fine.size();
    for (size_t i = 0; i < n; i++) if ((useCoarse ? coarse.at(i) : fine.at(i)).epoch > since) return i;
    return n;
  }
  size_t size(bool useCoarse) const { return useCoarse ? coarse.size() : fine.size(); }
  const Sample &at(bool useCoarse, size_t i) const { return useCoarse ? coarse.at(i) : fine.at(i); }

  // Restore from persisted samples (oldest first).
  void restoreFine(const Sample &s) { fine.push(s); }
  void restoreCoarse(const Sample &s) { coarse.push(s); }

  uint32_t lastCoarseEpoch() const { return coarse.size() ? coarse.at(coarse.size() - 1).epoch : 0; }

 private:
  struct Acc { int64_t v = 0, a = 0, s = 0, p = 0; uint32_t nv = 0, na = 0, ns = 0, np = 0; };
  Acc fineAcc_, coarseAcc_;
  uint32_t minute_ = 0; bool have_ = false;
  uint32_t quarter_ = 0; bool haveQ_ = false;

  static void clearAcc(Acc &x) { x = Acc(); }
  static void accumulate(Acc &x, int16_t v, int16_t a, uint16_t s, int16_t p) {
    if (v != kNA16) { x.v += v; x.nv++; }
    if (a != kNA16) { x.a += a; x.na++; }
    if (s != kNAU16) { x.s += s; x.ns++; }
    if (p != kNA16) { x.p += p; x.np++; }
  }
  static Sample finish(const Acc &x, uint32_t epoch) {
    Sample s;
    s.epoch = epoch;
    s.volts_cv = x.nv ? (int16_t)(x.v / (int64_t)x.nv) : kNA16;
    s.amps_da = x.na ? (int16_t)(x.a / (int64_t)x.na) : kNA16;
    s.soc_dpct = x.ns ? (uint16_t)(x.s / (int64_t)x.ns) : kNAU16;
    s.pv_w = x.np ? (int16_t)(x.p / (int64_t)x.np) : kNA16;
    return s;
  }
  void flushMinute() {
    Sample s = finish(fineAcc_, minute_ * 60);
    fine.push(s);
    uint32_t q = (minute_ * 60) / 900;
    if (haveQ_ && q != quarter_) { coarse.push(finish(coarseAcc_, quarter_ * 900)); clearAcc(coarseAcc_); }
    quarter_ = q; haveQ_ = true;
    accumulate(coarseAcc_, s.volts_cv, s.amps_da, s.soc_dpct, s.pv_w);
  }
};

}  // namespace wattcher
