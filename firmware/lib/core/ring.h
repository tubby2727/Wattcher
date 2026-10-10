// Fixed-size ring buffer for history samples (pure C++, storage-agnostic). Apache-2.0.
#pragma once
#include <cstddef>
#include <cstdint>

namespace wattcher {

struct Sample {            // 12 bytes
  uint32_t epoch;          // seconds
  int16_t  volts_cv;       // 0.01 V
  int16_t  amps_da;        // 0.1 A
  uint16_t soc_dpct;       // 0.1 %
  int16_t  pv_w;           // watts
};

template <size_t N>
class Ring {
 public:
  void push(const Sample &s) { buf_[head_] = s; head_ = (head_ + 1) % N; if (count_ < N) count_++; }
  size_t size() const { return count_; }
  // i = 0 oldest
  const Sample &at(size_t i) const { return buf_[(head_ + N - count_ + i) % N]; }
 private:
  Sample buf_[N];
  size_t head_ = 0, count_ = 0;
};

}  // namespace wattcher
