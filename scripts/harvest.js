const romcal = require("romcal");
const https = require("https");
const fs = require("fs");
const path = require("path");
const GENERATED_DATA = path.resolve(__dirname, "..", "data", "generated");

function fetchJson(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) { res.resume(); return resolve(null); }
      let d = ""; res.on("data", c => d += c); res.on("end", () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    }).on("error", () => resolve(null));
  });
}

// enumerate Sundays (+ any celebration that lands on a Sunday) across years
function sundaysInYears(years) {
  const cal = [].concat(...years.map(y => romcal.calendarFor({ year: y, country: "general", locale: "en" })));
  const byDate = {};
  cal.forEach(d => { // keep highest-priority per date (romcal already resolves; last wins ok, but prefer non-weekday)
    const iso = d.moment.slice(0, 10);
    const dt = new Date(d.moment);
    if (dt.getUTCDay() !== 0) return;
    // prefer SOLEMNITY/FEAST over SUNDAY if multiple
    if (!byDate[iso] || rank(d.type) > rank(byDate[iso].type)) byDate[iso] = d;
  });
  return Object.values(byDate).sort((a, b) => a.moment.localeCompare(b.moment));
}
function rank(t) { return ({ SOLEMNITY: 3, FEAST: 2, SUNDAY: 1 })[t] || 0; }
function slotKey(d) { return d.data.meta.cycle.value + " | " + d.name; }

(async () => {
  // Harvest span: cpbjr covers ~2025-08 .. 2027-12
  const harvestSundays = sundaysInYears([2025, 2026, 2027]).filter(d => d.moment >= "2025-08-01" && d.moment <= "2027-12-31");
  const table = {};       // slotKey -> {citations, type, name, cycle, sampleDate}
  const missingFetch = [];
  for (const d of harvestSundays) {
    const [y, m, day] = d.moment.slice(0, 10).split("-");
    const j = await fetchJson(`https://raw.githubusercontent.com/cpbjr/catholic-readings-api/main/readings/${y}/${m}-${day}.json`);
    const key = slotKey(d);
    if (j && j.readings) {
      if (!table[key]) table[key] = {
        cycle: d.data.meta.cycle.value, name: d.name, type: d.type, season: d.data.season.value,
        first: j.readings.firstReading, psalm: j.readings.psalm, second: j.readings.secondReading || "", gospel: j.readings.gospel,
        sampleDate: d.moment.slice(0, 10),
      };
    } else if (!table[key]) {
      missingFetch.push({ key, date: d.moment.slice(0, 10) });
    }
  }
  fs.writeFileSync(path.join(GENERATED_DATA, "lectionary_table.json"), JSON.stringify(table, null, 1));

  // Diagnose gaps in the finite source window. Complete, date-independent template
  // coverage is enforced later by build_sunday_lectionary.js.
  const need = {};
  harvestSundays.forEach(d => {
    const key = slotKey(d);
    (need[key] = need[key] || { count: 0, name: d.name, cycle: d.data.meta.cycle.value, type: d.type });
    need[key].count++;
  });
  const haveKeys = new Set(Object.keys(table));
  const missingSlots = Object.entries(need).filter(([k]) => !haveKeys.has(k))
    .map(([k, v]) => ({ key: k, ...v }))
    .sort((a, b) => b.count - a.count);

  console.log("harvested slots with citations:", Object.keys(table).length);
  console.log("distinct slots in source window:", Object.keys(need).length);
  console.log("MISSING slots:", missingSlots.length);
  const byCycle = {};
  missingSlots.forEach(m => { const c = m.cycle || "?"; (byCycle[c] = byCycle[c] || []).push(m); });
  for (const [c, arr] of Object.entries(byCycle)) {
    console.log(`\n== missing ${c} (${arr.length}) ==`);
    arr.forEach(m => console.log(`  [${m.type}] ${m.name}  (needed ${m.count}x)`));
  }
  fs.writeFileSync(path.join(GENERATED_DATA, "missing_slots.json"), JSON.stringify(missingSlots, null, 1));
})();
