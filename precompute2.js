const romcal = require("romcal");
const fs = require("fs");
const { bySlot, feastByName } = require("./readings_master.json");

// Cycle-independent special readings (editable in the tool)
const ALL_SOULS = { first: "Wisdom 3:1-9", psalm: "Psalm 23:1-3a, 3b-4, 5, 6", second: "Romans 5:5-11", gospel: "John 6:37-40" };
const SECOND_AFTER_XMAS = { first: "Sirach 24:1-4, 12-16", psalm: "Psalm 147:12-13, 14-15, 19-20", second: "Ephesians 1:3-6, 15-18", gospel: "John 1:1-18" };
const BLANK = { first: "", psalm: "", second: "", gospel: "" };
// St Henry (Patron of Finland) — proper readings from the Finnish diocesan Ordo (katolinen.fi), option 1
const ST_HENRY = { first: "Sirach 45:12-20, 4-5", psalm: "Psalm 126:1-2, 2-3, 4-5, 6", second: "2 Corinthians 5:14-20", gospel: "John 4:34-39a" };

const START_Y = 2025, END_Y = 2075;
const years = []; for (let y = START_Y; y <= END_Y + 1; y++) years.push(y);
const cal = [].concat(...years.map(y => romcal.calendarFor({ year: y, country: "finland", locale: "en" })));
const rank = t => ({ SOLEMNITY: 3, FEAST: 2, SUNDAY: 1 })[t] || 0;
const byDate = {};
cal.forEach(d => { const dt = new Date(d.moment); if (dt.getUTCDay() !== 0) return; const iso = d.moment.slice(0,10); if(!byDate[iso]||rank(d.type)>rank(byDate[iso].type)) byDate[iso]=d; });

const out = []; const notes = { epiphanyFixed: 0, secondAfterXmas: 0, baptismFromEpiph: 0, allSouls: 0, henry: 0, gaps: [] };
Object.values(byDate).sort((a,b)=>a.moment.localeCompare(b.moment)).forEach(d => {
  const iso = d.moment.slice(0,10); const y=+iso.slice(0,4); if(y<START_Y||y>END_Y) return;
  const mmdd = iso.slice(5); const dom = +iso.slice(8,10);
  const cycle = d.data.meta.cycle.value; const cyShort = cycle.replace("Year ","");
  let name = d.name; let season = d.data.season.value; let r = null;

  // --- Finland corrections ---
  if (name === "Epiphany") {
    if (mmdd === "01-06") { notes.epiphanyFixed++; /* genuine Epiphany on Sunday */ r = feastByName["Epiphany"]; }
    else if (dom <= 5) { name = "Second Sunday after Christmas"; season = "Christmas"; r = SECOND_AFTER_XMAS; notes.secondAfterXmas++; }
    else { name = "Baptism of the Lord"; season = "Christmas"; r = bySlot[cycle+" | Baptism of the Lord"]; notes.baptismFromEpiph++; }
  } else if (mmdd === "11-02") { // All Souls replaces a Sunday of Ordinary Time
    name = "All Souls"; season = "Ordinary Time"; r = ALL_SOULS; notes.allSouls++;
  } else if (/Saint Henry/.test(name)) {
    name = "Saint Henry, Bishop and Martyr"; r = ST_HENRY; notes.henry++;
  } else {
    r = bySlot[cycle+" | "+name] || feastByName[name] || null;
  }
  if (!r) { notes.gaps.push(iso+"  "+cycle+" | "+name); r = BLANK; }

  out.push({ d: iso, n: name.replace(/ of Ordinary Time/," in Ordinary Time"), s: season, c: cyShort,
    f: r.first, p: r.psalm, e: r.second, g: r.gospel });
});

fs.writeFileSync("/root/sundays.json", JSON.stringify(out));
console.log("Sundays 2025-2075 (Finland):", out.length);
console.log("full 4 readings:", out.filter(o=>o.f&&o.p&&o.g).length);
console.log("corrections -> Epiphany kept on Jan6:", notes.epiphanyFixed, "| 2nd Sun after Christmas:", notes.secondAfterXmas, "| Baptism (from transferred Epiph):", notes.baptismFromEpiph, "| All Souls:", notes.allSouls, "| St Henry (blank):", notes.henry);
console.log("unexpected gaps:", notes.gaps.length);
notes.gaps.slice(0,10).forEach(g=>console.log("  gap", g));
// show a few corrected Januaries + St Henry + All Souls
["2027-01-03","2029-01-07","2030-01-06","2031-01-05"].forEach(dt=>{const o=out.find(x=>x.d===dt);if(o)console.log("  JAN",o.d,"|",o.c,"|",o.n,"|",o.g);});
out.filter(o=>o.n.includes("Henry")).slice(0,3).forEach(o=>console.log("  HENRY",o.d,o.n,"(blank readings:",!o.g,")"));
out.filter(o=>o.n==="All Souls").slice(0,3).forEach(o=>console.log("  ALLSOULS",o.d,o.n,"|",o.g));
