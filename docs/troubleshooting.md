# Troubleshooting

**The app finds nothing when I tap "Find my Wattcher"**
- Allow **Nearby devices** for Wattcher (Settings, Apps, Wattcher, Permissions).
- Make sure the unit has power. Unplug and replug it and wait 20 seconds.
- Switch the phone's Bluetooth off and on, then try again.

**"Connection failed with status 133" or "Unit not in range" right after updating the unit**
Android remembers the unit's old layout. Turn the phone's Bluetooth off and on, force-stop Wattcher and open it again. If it is listed under paired devices, forget it.

**"PIN does not match"**
The unit was reset or has a different PIN. Settings, Add another unit. A unit that was wiped shows "New unit" and lets you choose a PIN. Five wrong tries lock the unit for five minutes.

**I forgot the PIN**
It cannot be recovered. Erase the flash with the web flasher (Erase Flash, then flash again). The BOOT-button reset needs the button held 12 seconds with the unit running, which did not work reliably on one board. Then set it up again.

**Setup says "window closed"**
A new unit only accepts a PIN for 5 minutes after it powers up. Unplug it, plug it back in and try again.

**No readings from the shunt or solar charger**
- Check each device's key in VictronConnect (Settings, Product info, Instant readout, Show encryption data) and that Instant readout is on.
- Unit and Victron devices must be within Bluetooth range (a few metres, fewer through metal).
- Settings, Victron devices, Replace to enter the key again.

**Alarms are silent or late when the phone is locked**
- Settings, Apps, Wattcher, Battery: **Unrestricted**.
- Alarms notification card must be on, and Notifications allowed for Wattcher.
- Do Not Disturb hides notifications unless you allow Wattcher through it.

**A "no charge" alarm right after setup**
Fixed in firmware 0.5.1 and later. Update the unit from Settings, Firmware.

**Updating the firmware over Bluetooth fails**
Keep the phone next to the unit and the app open until it says it is done. If it fails the unit keeps its old firmware. You can also flash `wattcher-c3-factory.bin` with a USB cable.
