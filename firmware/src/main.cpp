// Milestone 1 bench sketch: passive BLE scan, decrypt + decode one SmartShunt, print to serial.
#include <Arduino.h>
#include <NimBLEDevice.h>
#include "victron.h"
#include "secrets.h"

static const uint8_t KEY[16] = SHUNT_KEY;
static uint16_t lastNonce = 0; static bool haveNonce = false;

class CB : public NimBLEAdvertisedDeviceCallbacks {
  void onResult(NimBLEAdvertisedDevice *d) override {
    if (!d->getAddress().equals(NimBLEAddress(SHUNT_MAC))) return;
    std::string md = d->getManufacturerData();
    if (md.size() < 2 || (uint8_t)md[0] != (victron::kCompanyId & 0xFF) || (uint8_t)md[1] != (victron::kCompanyId >> 8)) return;
    victron::Header h;
    if (!victron::parseHeader((const uint8_t *)md.data() + 2, md.size() - 2, h)) return;
    if (h.key_byte0 != KEY[0]) { Serial.println("key mismatch"); return; }
    if (haveNonce && h.nonce == lastNonce) return;
    lastNonce = h.nonce; haveNonce = true;
    uint8_t plain[16];
    if (h.payload_len > sizeof plain || !victron::decrypt(KEY, h.nonce, h.payload, plain, h.payload_len)) return;
    victron::BatteryMonitor b;
    if (h.record_type == 0x02 && victron::decodeBatteryMonitor(plain, h.payload_len, b))
      Serial.printf("V=%.2f I=%.3f SOC=%.1f Ah=%.1f TTG=%d min\n", b.voltage, b.current, b.soc, b.consumed_ah, b.ttg_min);
  }
};

void setup() {
  Serial.begin(115200);
  NimBLEDevice::init("");
  NimBLEScan *scan = NimBLEDevice::getScan();
  scan->setAdvertisedDeviceCallbacks(new CB(), true);
  scan->setActiveScan(false);  // passive only
  scan->setInterval(320); scan->setWindow(300);
  scan->start(0, nullptr, false);
}
void loop() { delay(1000); }
