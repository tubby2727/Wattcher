// Wattcher firmware v0.1 (ESP32-C3): passive Victron scan + GATT server for the phone.
// Not yet hardware-tested; see docs/protocol.md. Apache-2.0.
#include <Arduino.h>
#include <Preferences.h>
#include <NimBLEDevice.h>
#include <mbedtls/sha256.h>
#include "victron.h"
#include "metrics.h"
#include "alarms.h"
#include "claim.h"
#include "frame.h"

#define SVC_UUID  "7a7c0001-0000-4a77-8a77-63686572776d"
#define INFO_UUID "7a7c0002-0000-4a77-8a77-63686572776d"
#define LIVE_UUID "7a7c0003-0000-4a77-8a77-63686572776d"
#define CTRL_UUID "7a7c0005-0000-4a77-8a77-63686572776d"
#define FW_VERSION "0.1.0"

using namespace wattcher;

struct VDev { bool set = false; NimBLEAddress addr; uint8_t key[16]; uint16_t lastNonce = 0; bool haveNonce = false; uint32_t lastMs = 0; };
static VDev shuntCfg, mpptCfg;
static victron::BatteryMonitor shunt; static victron::SolarCharger mppt;
static volatile bool shuntOk = false, mpptOk = false;

static Preferences prefs;
static ClaimState claimState;
static AlarmEngine alarms;
static Metrics metrics;
static int32_t clockOffset = 0; static bool clockSet = false;
static NimBLECharacteristic *liveCh, *ctrlCh;
static bool authed = false;

static uint32_t nowEpoch() { return clockSet ? (uint32_t)(clockOffset + (int32_t)(millis() / 1000)) : millis() / 1000; }

static void sha(const char *pin, const uint8_t salt[8], uint8_t out[32]) {
  mbedtls_sha256_context c; mbedtls_sha256_init(&c); mbedtls_sha256_starts_ret(&c, 0);
  mbedtls_sha256_update_ret(&c, salt, 8); mbedtls_sha256_update_ret(&c, (const uint8_t *)pin, strlen(pin));
  mbedtls_sha256_finish_ret(&c, out); mbedtls_sha256_free(&c);
}

static bool hexToBytes(const String &h, uint8_t *out, size_t n) {
  if (h.length() != n * 2) return false;
  for (size_t i = 0; i < n; i++) { char b[3] = {h[2 * i], h[2 * i + 1], 0}; char *e; out[i] = strtoul(b, &e, 16); if (*e) return false; }
  return true;
}

static void loadConfig() {
  prefs.begin("wattcher", false);
  claimState.claimed = prefs.getBool("claimed", false);
  prefs.getBytes("salt", claimState.salt, 8); prefs.getBytes("phash", claimState.pin_hash, 32);
  metrics.capacity_ah = prefs.getFloat("cap", 100.f);
  String sm = prefs.getString("shunt_mac", ""), mm = prefs.getString("mppt_mac", "");
  if (sm.length() && prefs.getBytes("shunt_key", shuntCfg.key, 16) == 16) { shuntCfg.addr = NimBLEAddress(sm.c_str()); shuntCfg.set = true; }
  if (mm.length() && prefs.getBytes("mppt_key", mpptCfg.key, 16) == 16) { mpptCfg.addr = NimBLEAddress(mm.c_str()); mpptCfg.set = true; }
}

class ScanCB : public NimBLEAdvertisedDeviceCallbacks {
  void handle(NimBLEAdvertisedDevice *d, VDev &cfg, bool isShunt) {
    std::string md = d->getManufacturerData();
    if (md.size() < 2 || (uint8_t)md[0] != (victron::kCompanyId & 0xFF) || (uint8_t)md[1] != (victron::kCompanyId >> 8)) return;
    victron::Header h;
    if (!victron::parseHeader((const uint8_t *)md.data() + 2, md.size() - 2, h)) return;
    if (h.key_byte0 != cfg.key[0]) return;                       // wrong key
    if (cfg.haveNonce && h.nonce == cfg.lastNonce) return;       // duplicate
    uint8_t plain[16]; if (h.payload_len > sizeof plain || !victron::decrypt(cfg.key, h.nonce, h.payload, plain, h.payload_len)) return;
    cfg.lastNonce = h.nonce; cfg.haveNonce = true; cfg.lastMs = millis();
    if (isShunt && h.record_type == 0x02) shuntOk = victron::decodeBatteryMonitor(plain, h.payload_len, shunt);
    if (!isShunt && h.record_type == 0x01) mpptOk = victron::decodeSolarCharger(plain, h.payload_len, mppt);
  }
  void onResult(NimBLEAdvertisedDevice *d) override {
    if (shuntCfg.set && d->getAddress().equals(shuntCfg.addr)) handle(d, shuntCfg, true);
    else if (mpptCfg.set && d->getAddress().equals(mpptCfg.addr)) handle(d, mpptCfg, false);
  }
};

static void reply(const char *s) { ctrlCh->setValue((uint8_t *)s, strlen(s)); ctrlCh->notify(); }

class CtrlCB : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic *c) override {
    String cmd = String(c->getValue().c_str()); cmd.trim();
    int sp = cmd.indexOf(' '); String verb = sp < 0 ? cmd : cmd.substring(0, sp); String arg = sp < 0 ? "" : cmd.substring(sp + 1);
    if (verb == "TIME") { clockOffset = (int32_t)(arg.toInt() - (int32_t)(millis() / 1000)); clockSet = true; reply("OK"); return; }
    if (verb == "CLAIM") {   // CLAIM <pin>
      uint8_t salt[8]; for (auto &b : salt) b = esp_random();
      ClaimResult r = claim(claimState, millis() / 1000, arg.c_str(), salt, sha);
      if (r == CLAIM_OK) { prefs.putBool("claimed", true); prefs.putBytes("salt", claimState.salt, 8); prefs.putBytes("phash", claimState.pin_hash, 32); authed = true; reply("OK"); }
      else reply(r == CLAIM_WINDOW_CLOSED ? "ERR window closed" : r == CLAIM_ALREADY ? "ERR already claimed" : "ERR bad pin format");
      return;
    }
    if (verb == "AUTH") { AuthResult r = authenticate(claimState, millis() / 1000, arg.c_str(), sha); authed = r == AUTH_OK; reply(authed ? "OK" : r == AUTH_LOCKED ? "ERR locked" : "ERR bad pin"); return; }
    if (!authed) { reply("ERR auth required"); return; }
    if (verb == "SETDEV") {  // SETDEV shunt|mppt <mac> <32 hex key>
      int a = arg.indexOf(' '), b = arg.indexOf(' ', a + 1); if (a < 0 || b < 0) { reply("ERR usage"); return; }
      String kind = arg.substring(0, a), mac = arg.substring(a + 1, b), key = arg.substring(b + 1); uint8_t k[16];
      if ((kind != "shunt" && kind != "mppt") || !hexToBytes(key, k, 16)) { reply("ERR bad args"); return; }
      prefs.putString((kind + "_mac").c_str(), mac); prefs.putBytes((kind + "_key").c_str(), k, 16);
      reply("OK reboot"); return;
    }
    if (verb == "CAP") { metrics.capacity_ah = arg.toFloat(); prefs.putFloat("cap", metrics.capacity_ah); reply("OK"); return; }
    if (verb == "MUTE") {    // MUTE <alarm id> <seconds, 0 = until turned on>
      int a = arg.indexOf(' '); int id = arg.substring(0, a).toInt(); uint32_t secs = arg.substring(a + 1).toInt();
      if (id < 0 || id >= A_COUNT || id == A_SOC_CRIT) { reply("ERR cannot mute"); return; }
      alarms.setOff((AlarmId)id, nowEpoch(), secs); reply("OK"); return;
    }
    if (verb == "UNMUTE") { int id = arg.toInt(); if (id >= 0 && id < A_COUNT) alarms.setOn((AlarmId)id); reply("OK"); return; }
    if (verb == "RESET") { prefs.clear(); reply("OK reboot"); delay(200); ESP.restart(); return; }
    reply("ERR unknown");
  }
};

class SrvCB : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer *) override { authed = false; }
  void onDisconnect(NimBLEServer *s) override { authed = false; NimBLEDevice::startAdvertising(); }
};

void setup() {
  Serial.begin(115200);
  loadConfig();
  NimBLEDevice::init("Wattcher");
  NimBLEServer *srv = NimBLEDevice::createServer(); srv->setCallbacks(new SrvCB());
  NimBLEService *svc = srv->createService(SVC_UUID);
  String info = String("{\"fw\":\"" FW_VERSION "\",\"claimed\":") + (claimState.claimed ? "true" : "false") + "}";
  svc->createCharacteristic(INFO_UUID, NIMBLE_PROPERTY::READ)->setValue(info.c_str());
  liveCh = svc->createCharacteristic(LIVE_UUID, NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);
  ctrlCh = svc->createCharacteristic(CTRL_UUID, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::NOTIFY);
  ctrlCh->setCallbacks(new CtrlCB());
  svc->start();
  NimBLEAdvertising *adv = NimBLEDevice::getAdvertising(); adv->addServiceUUID(SVC_UUID); adv->setScanResponse(true); adv->start();
  NimBLEScan *scan = NimBLEDevice::getScan();
  scan->setAdvertisedDeviceCallbacks(new ScanCB(), true);
  scan->setActiveScan(false); scan->setInterval(320); scan->setWindow(100);   // window < interval leaves radio time for GATT
  scan->start(0, nullptr, false);
}

void loop() {
  static uint32_t last = 0;
  if (millis() - last < 1000) return;
  last = millis();
  uint32_t now = nowEpoch();
  bool sFresh = shuntCfg.set && shuntCfg.lastMs && millis() - shuntCfg.lastMs < 120000;
  bool mFresh = mpptCfg.set && mpptCfg.lastMs && millis() - mpptCfg.lastMs < 120000;
  Live l; l.epoch = now; l.flags = (sFresh ? 1 : 0) | (mFresh ? 2 : 0);
  Reading r; r.valid = sFresh;
  if (sFresh && shuntOk) {
    float soc = shunt.soc == victron::kNA ? -1 : shunt.soc;
    metrics.update(now, soc, shunt.voltage, shunt.current);
    l.volts_cv = (int16_t)lroundf(shunt.voltage * 100); l.amps_da = (int16_t)lroundf(shunt.current * 10);
    if (soc >= 0) l.soc_dpct = (uint16_t)lroundf(soc * 10);
    int t = shunt.current < 0 ? metrics.timeToEmptyMin(soc) : metrics.timeToFullMin(soc);
    if (t >= 0) l.tte_min = t;
    l.last_full_epoch = metrics.last_full_epoch;
    r.soc = soc; r.volts = shunt.voltage; r.tte_min = metrics.timeToEmptyMin(soc); r.charging = shunt.current > 0.2f;
    r.victron_fault = shunt.alarm != 0;
  }
  if (mFresh && mpptOk) l.pv_w = mppt.pv_w;
  uint32_t mask = alarms.evaluate(now, r);
  l.alarm_mask = mask;
  for (int i = 0; i < A_COUNT; i++) if (alarms.isOff((AlarmId)i, now)) l.off_mask |= 1u << i;
  uint8_t f[kLiveFrameLen]; packLive(l, f);
  liveCh->setValue(f, sizeof f); liveCh->notify();
}
