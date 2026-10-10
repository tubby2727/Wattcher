# Victron decode notes (verified on real hardware)
Advert (after company ID 0x02E1): `10 | 02 | product(2 LE) | record type | nonce(2 LE) | key byte0 | encrypted payload`.
AES-128-CTR, counter block = nonce lo, nonce hi, 14 zero bytes. Offsets are relative to the decrypted payload.
Battery monitor (02): ttg 0/16, V 16/16s x0.01, alarm 32/16, aux 48/16, aux type 64/2, I 66/22s x0.001, consumed 88/20 x-0.1, SOC 108/10 x0.1.
Solar charger (01): state 0/8, error 8/8, V 16/16s x0.01, I 32/16s x0.1, yield 48/16 x0.01 kWh, PV 64/16 W, load 80/9 x0.1 (NA 0x1FF).
Seen: SmartShunt product 0xC038, MPPT 150/45 product 0xA073. The 02 35 / 01 35 adverts are a second type; ignore.
