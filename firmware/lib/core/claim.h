// Claim window + PIN (pure C++). The unit accepts a claim for the first `window_s` seconds after
// power-up while unclaimed. Once claimed, privileged writes need the PIN; 5 wrong tries lock for 5 min.
// PIN storage is a salted hash supplied by the platform layer (SHA-256 via mbedtls on ESP32).
#pragma once
#include <cstdint>
#include <cstring>

namespace wattcher {

struct ClaimState {
  bool claimed = false;
  uint8_t pin_hash[32] = {0};
  uint8_t salt[8] = {0};
  uint8_t failures = 0;
  uint32_t locked_until = 0;
  uint32_t window_s = 300;
};

// hash(pin, salt) -> out[32]; provided by platform.
typedef void (*HashFn)(const char *pin, const uint8_t salt[8], uint8_t out[32]);

enum ClaimResult { CLAIM_OK, CLAIM_WINDOW_CLOSED, CLAIM_ALREADY, CLAIM_BAD_PIN_FORMAT };
enum AuthResult { AUTH_OK, AUTH_BAD_PIN, AUTH_LOCKED, AUTH_UNCLAIMED };

inline bool pinFormatOk(const char *pin) {
  if (strlen(pin) != 6) return false;
  for (int i = 0; i < 6; i++) if (pin[i] < '0' || pin[i] > '9') return false;
  return true;
}

inline ClaimResult claim(ClaimState &s, uint32_t uptime_s, const char *pin, const uint8_t salt[8], HashFn h) {
  if (s.claimed) return CLAIM_ALREADY;
  if (uptime_s > s.window_s) return CLAIM_WINDOW_CLOSED;
  if (!pinFormatOk(pin)) return CLAIM_BAD_PIN_FORMAT;
  memcpy(s.salt, salt, 8);
  h(pin, s.salt, s.pin_hash);
  s.claimed = true; s.failures = 0; s.locked_until = 0;
  return CLAIM_OK;
}

inline AuthResult authenticate(ClaimState &s, uint32_t now_s, const char *pin, HashFn h) {
  if (!s.claimed) return AUTH_UNCLAIMED;
  if (now_s < s.locked_until) return AUTH_LOCKED;
  uint8_t out[32]; h(pin, s.salt, out);
  uint8_t diff = 0; for (int i = 0; i < 32; i++) diff |= out[i] ^ s.pin_hash[i];
  if (diff == 0) { s.failures = 0; return AUTH_OK; }
  if (++s.failures >= 5) { s.locked_until = now_s + 300; s.failures = 0; return AUTH_LOCKED; }
  return AUTH_BAD_PIN;
}

// Factory reset (10 s button hold while running) clears the claim.
inline void reset(ClaimState &s) { s = ClaimState(); }

}  // namespace wattcher
