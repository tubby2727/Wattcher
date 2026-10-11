// Wattcher firmware v0.2 (ESP32-C3): passive Victron + ATC temp-sensor scan, history in flash,
// GATT server for the phone. See docs/protocol.md. Apache-2.0.
#include <Arduino.h>
#include <Preferences.h>
#include <Update.h>
#include <esp_ota_ops.h>
#include <LittleFS.h>
#include <NimBLEDevice.h>
#include <mbedtls/sha256.h>
#include "victron.h"
#include "atc.h"
#include "metrics.h"
#include "alarms.h"
#include "claim.h"
#include "frame.h"
#include "history.h"

#define SVC_UUID  "7a7c0001-0000-4a77-8a77-63686572776d"
#define INFO_UUID "7a7c0002-0000-4a77-8a77-63686572776d"
#define LIVE_UUID "7a7c0003-0000-4a77-8a77-63686572776d"
#define CTRL_UUID "7a7c0005-0000-4a77-8a77-63686572776d"
#define HIST_UUID "7a7c0006-0000-4a77-8a77-63686572776d"
#define OTA_UUID  "7a7c0007-0000-4a77-8a77-63686572776d"
#define SENS_UUID "7a7c0008-0000-4a77-8a77-63686572776d"
#define FW_VERSION "0.3.0"
#define BOOT_PIN 9   // BOOT button on the C3 SuperMini; hold 10 s while running = factory reset

using namespace wattcher;

// ---------------------------------------------------------------- state
struct VDev { bool set = false; String mac; NimBLEAddress addr; uint8_t key[16]; uint16_t lastNonce = 0; bool haveNonce = false; uint32_t lastMs = 0; };
static VDev shuntCfg, mpptCfg;
static victron::BatteryMonitor shunt; static victron::SolarCharger mppt;
static volatile bool shuntOk = false, mpptOk = false;

struct TempCfg { bool set = false; String mac; NimBLEAddress addr; String name; float temp = 0; uint8_t hum = 0, batt = 0; uint32_t lastMs = 0; bool have = false; };
static TempCfg temps[kMaxSensors];

static Preferences prefs;
static ClaimState claimState;
static AlarmEngine alarms;
static Metrics metrics;
static History history;
static String vanName = "My van";
static int32_t clockOffset = 0; static bool clockSet = false;
static NimBLECharacteristic *liveCh, *ctrlCh, *histCh, *sensCh;
static bool authed = false;
static uint16_t connHandle = 0;
static volatile bool saveRequested = false, resetRequested = false, rebootRequested = false;

struct HistStream { volatile bool active = false; bool coarse = false; size_t idx = 0; uint8_t seq = 0; };
static HistStream hs;
static bool otaActive = false; static uint32_t otaGot = 0, otaSize = 0; static volatile bool otaReboot = false;

static uint32_t nowEpoch() { return clockSet ? (uint32_t)(clockOffset + (int32_t)(millis() / 1000)) : millis() / 1000; }

// ---------------------------------------------------------------- helpers
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

static String popToken(String &s) {
  s.trim();
  int sp = s.indexOf(' ');
  String t = sp < 0 ? s : s.substring(0, sp);
  s = sp < 0 ? String("") : s.substring(sp + 1);
  s.trim();
  return t;
}

// Replies are newline-terminated and split into 160-byte notifications; the phone reassembles.
static void reply(const String &msg) {
  String m = msg + "\n";
  for (size_t i = 0; i < m.length(); i += 160) {
    String part = m.substring(i, i + 160);
    ctrlCh->setValue((uint8_t *)part.c_str(), part.length());
    ctrlCh->notify();
    delay(10);
  }
}

// ---------------------------------------------------------------- persistence
static void loadDevices() {
  shuntCfg.set = mpptCfg.set = false; shuntCfg.haveNonce = mpptCfg.haveNonce = false; shuntOk = mpptOk = false;
  for (auto &t : temps) { t.set = false; t.have = false; }
  String sm = prefs.getString("shunt_mac", ""), mm = prefs.getString("mppt_mac", "");
  if (sm.length() && prefs.getBytes("shunt_key", shuntCfg.key, 16) == 16) { shuntCfg.mac = sm; shuntCfg.addr = NimBLEAddress(sm.c_str()); shuntCfg.set = true; }
  if (mm.length() && prefs.getBytes("mppt_key", mpptCfg.key, 16) == 16) { mpptCfg.mac = mm; mpptCfg.addr = NimBLEAddress(mm.c_str()); mpptCfg.set = true; }
  for (int i = 0; i < (int)kMaxSensors; i++) {
    String m = prefs.getString(("t" + String(i) + "_mac").c_str(), "");
    if (m.length()) { temps[i].set = true; temps[i].mac = m; temps[i].addr = NimBLEAddress(m.c_str()); temps[i].name = prefs.getString(("t" + String(i) + "_name").c_str(), "Sensor"); }
  }
}

static void loadConfig() {
  prefs.begin("wattcher", false);
  claimState.claimed = prefs.getBool("claimed", false);
  prefs.getBytes("salt", claimState.salt, 8); prefs.getBytes("phash", claimState.pin_hash, 32);
  metrics.capacity_ah = prefs.getFloat("cap", 100.f);
  vanName = prefs.getString("name", "My van");
  alarms.th.soc_low = prefs.getFloat("t_soclow", 20); alarms.th.soc_crit = prefs.getFloat("t_soccrit", 10);
  alarms.th.volt_low = prefs.getFloat("t_vlow", 11.8f); alarms.th.volt_high = prefs.getFloat("t_vhigh", 14.8f);
  alarms.th.tte_short_min = prefs.getUInt("t_tte", 60); alarms.th.no_charge_s = prefs.getUInt("t_nochg", 24 * 3600);
  loadDevices();
}

static const uint32_t kHistMagic = 0x31494857;  // "WHI1"

static void saveHistory() {
  File f = LittleFS.open("/hist.tmp", "w");
  if (!f) return;
  uint32_t nf = history.fine.size(), nc = history.coarse.size();
  f.write((const uint8_t *)&kHistMagic, 4); f.write((const uint8_t *)&nf, 4); f.write((const uint8_t *)&nc, 4);
  for (uint32_t i = 0; i < nf; i++) f.write((const uint8_t *)&history.fine.at(i), sizeof(Sample));
  for (uint32_t i = 0; i < nc; i++) f.write((const uint8_t *)&history.coarse.at(i), sizeof(Sample));
  f.close();
  LittleFS.remove("/hist.bin");
  LittleFS.rename("/hist.tmp", "/hist.bin");
}

static void loadHistory() {
  File f = LittleFS.open("/hist.bin", "r");
  if (!f) return;
  uint32_t magic = 0, nf = 0, nc = 0;
  f.read((uint8_t *)&magic, 4); f.read((uint8_t *)&nf, 4); f.read((uint8_t *)&nc, 4);
  if (magic != kHistMagic || nf > kFineN || nc > kCoarseN) { f.close(); return; }
  Sample s;
  for (uint32_t i = 0; i < nf; i++) if (f.read((uint8_t *)&s, sizeof s) == sizeof s) history.restoreFine(s);
  for (uint32_t i = 0; i < nc; i++) if (f.read((uint8_t *)&s, sizeof s) == sizeof s) history.restoreCoarse(s);
  f.close();
}

// ---------------------------------------------------------------- scanning
class ScanCB : public NimBLEAdvertisedDeviceCallbacks {
  void handleVictron(NimBLEAdvertisedDevice *d, VDev &cfg, bool isShunt) {
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
  void handleTemp(NimBLEAdvertisedDevice *d, TempCfg &t) {
    std::string sd = d->getServiceData(NimBLEUUID((uint16_t)0x181A));
    atc::Reading r;
    if (sd.empty() || !atc::decode((const uint8_t *)sd.data(), sd.size(), r)) return;
    t.temp = r.temp_c; t.hum = (uint8_t)r.humidity; t.batt = r.battery_pct; t.lastMs = millis(); t.have = true;
  }
  void onResult(NimBLEAdvertisedDevice *d) override {
    if (shuntCfg.set && d->getAddress().equals(shuntCfg.addr)) { handleVictron(d, shuntCfg, true); return; }
    if (mpptCfg.set && d->getAddress().equals(mpptCfg.addr)) { handleVictron(d, mpptCfg, false); return; }
    for (auto &t : temps) if (t.set && d->getAddress().equals(t.addr)) { handleTemp(d, t); return; }
  }
};

// ---------------------------------------------------------------- phone commands
static String statusJson() {
  String j = "{\"fw\":\"" FW_VERSION "\",\"name\":\"" + vanName + "\",\"claimed\":1,\"cap\":" + String(metrics.capacity_ah, 0);
  j += ",\"shunt\":\"" + (shuntCfg.set ? shuntCfg.mac : String("")) + "\",\"mppt\":\"" + (mpptCfg.set ? mpptCfg.mac : String("")) + "\"";
  j += ",\"th\":[" + String(alarms.th.soc_low, 0) + "," + String(alarms.th.soc_crit, 0) + "," + String(alarms.th.volt_low, 1) + "," + String(alarms.th.volt_high, 1) + "," +
       String(alarms.th.tte_short_min) + "," + String(alarms.th.no_charge_s / 3600) + "]";
  j += ",\"temps\":[";
  bool first = true;
  for (int i = 0; i < (int)kMaxSensors; i++) if (temps[i].set) { if (!first) j += ","; first = false; j += "{\"i\":" + String(i) + ",\"n\":\"" + temps[i].name + "\",\"m\":\"" + temps[i].mac + "\"}"; }
  j += "],\"clock\":" + String(clockSet ? 1 : 0) + ",\"hist\":[" + String((unsigned)history.fine.size()) + "," + String((unsigned)history.coarse.size()) + "]}";
  return j;
}

class CtrlCB : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic *c) override {
    String arg = String(c->getValue().c_str()); arg.trim();
    String verb = popToken(arg);
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

    if (verb == "STATUS") { reply(statusJson()); return; }
    if (verb == "SETDEV") {  // SETDEV shunt|mppt <mac> <32 hex key>
      String kind = popToken(arg), mac = popToken(arg), key = popToken(arg); uint8_t k[16];
      if ((kind != "shunt" && kind != "mppt") || !hexToBytes(key, k, 16) || mac.length() != 17) { reply("ERR bad args"); return; }
      mac.toLowerCase();
      prefs.putString((kind + "_mac").c_str(), mac); prefs.putBytes((kind + "_key").c_str(), k, 16);
      loadDevices(); reply("OK"); return;
    }
    if (verb == "DELDEV") {  // DELDEV shunt|mppt
      String kind = popToken(arg);
      if (kind != "shunt" && kind != "mppt") { reply("ERR bad args"); return; }
      prefs.remove((kind + "_mac").c_str()); prefs.remove((kind + "_key").c_str());
      loadDevices(); reply("OK"); return;
    }
    if (verb == "CAP") { float v = arg.toFloat(); if (v < 1 || v > 5000) { reply("ERR range"); return; } metrics.capacity_ah = v; prefs.putFloat("cap", v); reply("OK"); return; }
    if (verb == "NAME") { arg = arg.substring(0, 24); arg.replace("\"", ""); vanName = arg; prefs.putString("name", arg); reply("OK"); return; }
    if (verb == "THRESH") {  // THRESH soc_low soc_crit volt_low volt_high tte_min no_charge_hours
      float a = popToken(arg).toFloat(), b = popToken(arg).toFloat(), vl = popToken(arg).toFloat(), vh = popToken(arg).toFloat();
      uint32_t tte = popToken(arg).toInt(), nc = popToken(arg).toInt();
      if (a <= b || vl >= vh || nc < 1) { reply("ERR bad values"); return; }
      alarms.th.soc_low = a; alarms.th.soc_crit = b; alarms.th.volt_low = vl; alarms.th.volt_high = vh; alarms.th.tte_short_min = tte; alarms.th.no_charge_s = nc * 3600;
      prefs.putFloat("t_soclow", a); prefs.putFloat("t_soccrit", b); prefs.putFloat("t_vlow", vl); prefs.putFloat("t_vhigh", vh); prefs.putUInt("t_tte", tte); prefs.putUInt("t_nochg", alarms.th.no_charge_s);
      reply("OK"); return;
    }
    if (verb == "SENSOR") {  // SENSOR add <idx 0-3> <mac> <name...> | SENSOR del <idx>
      String op = popToken(arg); int idx = popToken(arg).toInt();
      if (idx < 0 || idx >= (int)kMaxSensors) { reply("ERR idx"); return; }
      if (op == "add") {
        String mac = popToken(arg); mac.toLowerCase(); if (mac.length() != 17) { reply("ERR mac"); return; }
        arg = arg.substring(0, 16); arg.replace("\"", ""); if (!arg.length()) arg = "Sensor";
        prefs.putString(("t" + String(idx) + "_mac").c_str(), mac); prefs.putString(("t" + String(idx) + "_name").c_str(), arg);
      } else if (op == "del") { prefs.remove(("t" + String(idx) + "_mac").c_str()); prefs.remove(("t" + String(idx) + "_name").c_str()); }
      else { reply("ERR usage"); return; }
      loadDevices(); reply("OK"); return;
    }
    if (verb == "MUTE") {    // MUTE <alarm id> <seconds, 0 = until turned on>
      int id = popToken(arg).toInt(); uint32_t secs = arg.toInt();
      if (id < 0 || id >= A_COUNT || id == A_SOC_CRIT) { reply("ERR cannot mute"); return; }
      alarms.setOff((AlarmId)id, nowEpoch(), secs); reply("OK"); return;
    }
    if (verb == "UNMUTE") { int id = arg.toInt(); if (id >= 0 && id < A_COUNT) alarms.setOn((AlarmId)id); reply("OK"); return; }
    if (verb == "HIST") {    // HIST fine|coarse <since epoch>
      String which = popToken(arg); uint32_t since = (uint32_t)strtoul(arg.c_str(), nullptr, 10);
      hs.coarse = (which == "coarse"); hs.idx = history.findFirst(hs.coarse, since); hs.seq = 0; hs.active = true;
      reply("OK " + String((unsigned)(history.size(hs.coarse) - hs.idx))); return;
    }
    if (verb == "OTA") {     // OTA BEGIN <size> <md5> | END | ABORT | ROLLBACK
      String op = popToken(arg);
      if (op == "BEGIN") {
        uint32_t sz = popToken(arg).toInt(); String md5 = popToken(arg);
        if (sz < 100000 || sz > 1700000 || md5.length() != 32) { reply("ERR bad args"); return; }
        if (otaActive) Update.abort();
        if (!Update.begin(sz)) { reply("ERR no space"); return; }
        Update.setMD5(md5.c_str()); otaActive = true; otaGot = 0; otaSize = sz; reply("OK"); return;
      }
      if (op == "END") {
        if (!otaActive || otaGot != otaSize) { reply("ERR incomplete " + String(otaGot)); return; }
        otaActive = false;
        if (!Update.end(true)) { reply("ERR verify"); return; }
        reply("OK reboot"); otaReboot = true; return;
      }
      if (op == "ABORT") { if (otaActive) Update.abort(); otaActive = false; reply("OK"); return; }
      if (op == "ROLLBACK") {
        const esp_partition_t *p = esp_ota_get_next_update_partition(nullptr);
        esp_app_desc_t d;
        if (!p || esp_ota_get_partition_description(p, &d) != ESP_OK) { reply("ERR no previous firmware"); return; }
        if (esp_ota_set_boot_partition(p) != ESP_OK) { reply("ERR failed"); return; }
        reply("OK reboot"); otaReboot = true; return;
      }
      reply("ERR usage"); return;
    }
    if (verb == "SAVE") { saveRequested = true; reply("OK"); return; }
    if (verb == "REBOOT") { reply("OK"); rebootRequested = true; return; }
    if (verb == "RESET") { reply("OK reboot"); resetRequested = true; return; }
    reply("ERR unknown");
  }
};

class OtaCB : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic *c) override {
    if (!authed || !otaActive) return;
    std::string v = c->getValue();
    if (otaGot + v.size() > otaSize) { Update.abort(); otaActive = false; return; }
    if (Update.write((uint8_t *)v.data(), v.size()) != v.size()) { Update.abort(); otaActive = false; return; }
    otaGot += v.size();
  }
};

class SrvCB : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer *, ble_gap_conn_desc *desc) override { authed = false; connHandle = desc->conn_handle; hs.active = false; }
  void onDisconnect(NimBLEServer *) override { authed = false; hs.active = false; NimBLEDevice::startAdvertising(); }
};

// ---------------------------------------------------------------- history streaming
static void streamStep() {
  if (!hs.active) return;
  size_t total = history.size(hs.coarse);
  uint16_t mtu = NimBLEDevice::getServer()->getPeerMTU(connHandle);
  size_t perPkt = mtu > 40 ? (mtu - 4) / sizeof(Sample) : 1;
  if (perPkt > 15) perPkt = 15;
  if (hs.idx >= total) {
    uint8_t end[5] = {0xFF, 0, 0, 0, 0}; uint32_t n = total; memcpy(end + 1, &n, 4);
    histCh->setValue(end, sizeof end); histCh->notify(); hs.active = false; return;
  }
  uint8_t buf[1 + 15 * sizeof(Sample)]; size_t n = 0;
  buf[0] = hs.seq++; if (hs.seq == 0xFF) hs.seq = 0;
  while (n < perPkt && hs.idx < total) { memcpy(buf + 1 + n * sizeof(Sample), &history.at(hs.coarse, hs.idx), sizeof(Sample)); n++; hs.idx++; }
  histCh->setValue(buf, 1 + n * sizeof(Sample)); histCh->notify();
  delay(12);
}

// ---------------------------------------------------------------- setup / loop
void setup() {
  Serial.begin(115200);
  pinMode(BOOT_PIN, INPUT_PULLUP);
  loadConfig();
  bool fsOk = LittleFS.begin(true);
  if (fsOk) loadHistory();
  NimBLEDevice::init("Wattcher");
  NimBLEDevice::setMTU(247);
  NimBLEServer *srv = NimBLEDevice::createServer(); srv->setCallbacks(new SrvCB());
  NimBLEService *svc = srv->createService(SVC_UUID);
  String info = String("{\"fw\":\"" FW_VERSION "\",\"claimed\":") + (claimState.claimed ? "true" : "false") + "}";
  svc->createCharacteristic(INFO_UUID, NIMBLE_PROPERTY::READ)->setValue(info.c_str());
  liveCh = svc->createCharacteristic(LIVE_UUID, NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);
  ctrlCh = svc->createCharacteristic(CTRL_UUID, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::NOTIFY);
  ctrlCh->setCallbacks(new CtrlCB());
  histCh = svc->createCharacteristic(HIST_UUID, NIMBLE_PROPERTY::NOTIFY);
  svc->createCharacteristic(OTA_UUID, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR)->setCallbacks(new OtaCB());
  sensCh = svc->createCharacteristic(SENS_UUID, NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);
  svc->start();
  // Name in the main advert (so every scanner shows it), service UUID in the scan response.
  NimBLEAdvertising *adv = NimBLEDevice::getAdvertising();
  NimBLEAdvertisementData ad; ad.setFlags(BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP); ad.setName("Wattcher");
  NimBLEAdvertisementData sr; sr.setCompleteServices(NimBLEUUID(SVC_UUID));
  adv->setAdvertisementData(ad); adv->setScanResponseData(sr);
  bool advOk = adv->start();
  Serial.printf("Wattcher %s boot: advertising=%d claimed=%d shunt=%d mppt=%d fs=%d hist=%u/%u addr=%s\n", FW_VERSION, advOk, claimState.claimed, shuntCfg.set, mpptCfg.set, fsOk,
                (unsigned)history.fine.size(), (unsigned)history.coarse.size(), NimBLEDevice::getAddress().toString().c_str());
  NimBLEScan *scan = NimBLEDevice::getScan();
  scan->setAdvertisedDeviceCallbacks(new ScanCB(), true);
  scan->setActiveScan(false); scan->setInterval(320); scan->setWindow(100);   // window < interval leaves radio time for GATT
  scan->start(0, nullptr, false);
}

void loop() {
  static uint32_t last = 0, lastSave = 0, btnDown = 0;
  streamStep();
  if (resetRequested) { prefs.clear(); LittleFS.format(); delay(300); ESP.restart(); }
  if (otaReboot) { delay(500); ESP.restart(); }
  if (rebootRequested) { if (clockSet) saveHistory(); delay(300); ESP.restart(); }
  if (saveRequested) { saveRequested = false; if (clockSet) saveHistory(); }
  if (digitalRead(BOOT_PIN) == LOW) { if (!btnDown) btnDown = millis(); else if (millis() - btnDown > 10000) resetRequested = true; } else btnDown = 0;

  if (millis() - last < 1000) { delay(2); return; }
  last = millis();
  uint32_t now = nowEpoch();
  static uint32_t lastLog = 0;
  if (millis() - lastLog > 10000) { lastLog = millis(); Serial.printf("t=%lus shunt=%d mppt=%d clients=%u clock=%d hist=%u\n", millis() / 1000, shuntOk, mpptOk, (unsigned)NimBLEDevice::getServer()->getConnectedCount(), clockSet, (unsigned)history.fine.size()); }
  bool sFresh = shuntCfg.set && shuntCfg.lastMs && millis() - shuntCfg.lastMs < 120000;
  bool mFresh = mpptCfg.set && mpptCfg.lastMs && millis() - mpptCfg.lastMs < 120000;
  bool anyTemp = false; for (auto &t : temps) if (t.set) anyTemp = true;
  Live l; l.epoch = now; l.flags = (sFresh ? 1 : 0) | (mFresh ? 2 : 0) | (anyTemp ? 4 : 0);
  Reading r; r.valid = sFresh;
  if (sFresh && shuntOk) {
    float soc = shunt.soc == victron::kNA ? -1 : shunt.soc;
    metrics.update(now, soc, shunt.voltage, shunt.current);
    l.volts_cv = (int16_t)lroundf(shunt.voltage * 100); l.amps_da = (int16_t)lroundf(shunt.current * 10);
    if (soc >= 0) l.soc_dpct = (uint16_t)lroundf(soc * 10);
    // Discharging: use the shunt's own time-to-go (smoothed by Victron); fall back to ours if it reports none.
    int ttgShunt = shunt.ttg_min > 0 ? shunt.ttg_min : -1;
    int t = shunt.current < 0 ? (ttgShunt >= 0 ? ttgShunt : metrics.timeToEmptyMin(soc)) : metrics.timeToFullMin(soc);
    if (t >= 0) l.tte_min = t;
    l.last_full_epoch = metrics.last_full_epoch;
    r.soc = soc; r.volts = shunt.voltage; r.tte_min = ttgShunt >= 0 ? ttgShunt : metrics.timeToEmptyMin(soc); r.charging = shunt.current > 0.2f;
    r.victron_fault = shunt.alarm != 0;
  }
  if (mFresh && mpptOk) l.pv_w = mppt.pv_w;
  uint32_t mask = alarms.evaluate(now, r);
  l.alarm_mask = mask;
  for (int i = 0; i < A_COUNT; i++) if (alarms.isOff((AlarmId)i, now)) l.off_mask |= 1u << i;
  uint8_t f[kLiveFrameLen]; packLive(l, f);
  liveCh->setValue(f, sizeof f); liveCh->notify();

  // Temperature sensors (only configured ones are reported; the app hides everything else).
  SensorSlot slots[kMaxSensors]; uint8_t ns = 0;
  for (int i = 0; i < (int)kMaxSensors; i++) if (temps[i].set) {
    bool fresh = temps[i].have && millis() - temps[i].lastMs < 600000;
    slots[ns++] = {(uint8_t)i, fresh ? (int16_t)lroundf(temps[i].temp * 100) : (int16_t)kNA16, temps[i].hum, temps[i].batt, (uint8_t)(fresh ? 1 : 0)};
  }
  uint8_t sb[1 + kMaxSensors * 6]; size_t sl = packSensors(slots, ns, sb);
  sensCh->setValue(sb, sl); sensCh->notify();

  // History: record only with a real clock (the phone sets it on connect), flush to flash every 30 min.
  if (clockSet && sFresh && shuntOk) history.add(now, l.volts_cv, l.amps_da, l.soc_dpct, l.pv_w);
  if (clockSet && millis() - lastSave > 1800000UL) { lastSave = millis(); saveHistory(); }
}
