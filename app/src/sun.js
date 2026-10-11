// Sunrise / sunset (NOAA approximation, good to a couple of minutes). Returns epoch seconds or null (polar day/night).
export function sunTimes(date, lat, lon) {
  const rad = Math.PI / 180, d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const n = Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000);
  const g = (2 * Math.PI / 365) * (n - 1 + 0.5);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const cosH = Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl);
  if (cosH > 1 || cosH < -1) return null;
  const ha = Math.acos(cosH) / rad;
  const riseMin = 720 - 4 * (lon + ha) - eqt, setMin = 720 - 4 * (lon - ha) - eqt;
  return { rise: d.getTime() / 1000 + riseMin * 60, set: d.getTime() / 1000 + setMin * 60 };
}

// Night spans [from, to] (epoch s) overlapping [t0, t1].
export function nightSpans(t0, t1, lat, lon) {
  const out = []; const day = new Date(t0 * 1000); day.setDate(day.getDate() - 1);
  for (let i = 0; i < 40 && day.getTime() / 1000 < t1 + 86400; i++, day.setDate(day.getDate() + 1)) {
    const a = sunTimes(day, lat, lon), b = sunTimes(new Date(day.getTime() + 86400000), lat, lon);
    if (!a || !b) continue;
    const from = a.set, to = b.rise;
    if (to > t0 && from < t1) out.push([Math.max(from, t0), Math.min(to, t1)]);
  }
  return out;
}
