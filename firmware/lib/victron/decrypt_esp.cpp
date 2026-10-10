#if defined(ARDUINO) || defined(ESP_PLATFORM)
#include "victron.h"
#include <mbedtls/aes.h>
#include <cstring>
namespace victron {
bool decrypt(const uint8_t key[16], uint16_t nonce, const uint8_t *in, uint8_t *out, size_t len) {
  mbedtls_aes_context ctx; mbedtls_aes_init(&ctx);
  if (mbedtls_aes_setkey_enc(&ctx, key, 128) != 0) { mbedtls_aes_free(&ctx); return false; }
  uint8_t counter[16] = {0}; counter[0] = nonce & 0xFF; counter[1] = nonce >> 8;
  uint8_t stream[16]; size_t off = 0;
  int r = mbedtls_aes_crypt_ctr(&ctx, len, &off, counter, stream, in, out);
  mbedtls_aes_free(&ctx);
  return r == 0;
}
}
#endif
