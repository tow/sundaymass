const https = require("https");
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const GENERATED_DATA = path.join(ROOT, "data", "generated");
const cpbjr = require("../data/generated/lectionary_table.json"); // slotKey "Cycle | Name" -> {first,psalm,second,gospel,...}

function fetchJson(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) { res.resume(); return resolve(null); }
      let d = ""; res.on("data", c => d += c); res.on("end", () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    }).on("error", () => resolve(null));
  });
}

// Book-abbreviation -> full name, to match cpbjr display style
const BK = {
  "Gen":"Genesis","Exod":"Exodus","Lev":"Leviticus","Num":"Numbers","Deut":"Deuteronomy","Josh":"Joshua",
  "Neh":"Nehemiah","Prov":"Proverbs","Eccl":"Ecclesiastes","Sir":"Sirach","Wis":"Wisdom",
  "Isa":"Isaiah","Jer":"Jeremiah","Bar":"Baruch","Ezek":"Ezekiel","Dan":"Daniel","Hos":"Hosea","Amos":"Amos",
  "Mic":"Micah","Hab":"Habakkuk","Zeph":"Zephaniah","Zech":"Zechariah","Mal":"Malachi","Jon":"Jonah","Joel":"Joel",
  "Ps":"Psalm","Matt":"Matthew","Mk":"Mark","Lk":"Luke","Jn":"John",
  "Rom":"Romans","Gal":"Galatians","Eph":"Ephesians","Phil":"Philippians","Col":"Colossians","Phlm":"Philemon",
  "Titus":"Titus","Heb":"Hebrews","Rev":"Revelation","Acts":"Acts",
  "1 Sam":"1 Samuel","2 Sam":"2 Samuel","1 Kgs":"1 Kings","2 Kgs":"2 Kings","1 Chr":"1 Chronicles","2 Chr":"2 Chronicles",
  "1 Cor":"1 Corinthians","2 Cor":"2 Corinthians","1 Tim":"1 Timothy","2 Tim":"2 Timothy",
  "1 Thess":"1 Thessalonians","2 Thess":"2 Thessalonians","1 Pet":"1 Peter","2 Pet":"2 Peter",
  "1 John":"1 John","2 John":"2 John","3 John":"3 John","1 Macc":"1 Maccabees","2 Macc":"2 Maccabees",
};
function expand(cite) {
  if (!cite) return "";
  // replace leading book token(s); handle "1 Cor", "Isa", etc. Longest keys first.
  let s = cite;
  const keys = Object.keys(BK).sort((a,b)=>b.length-a.length);
  for (const k of keys) {
    // word-boundary-ish: book followed by space+digit
    const re = new RegExp("(^|\\| |or )" + k.replace(/ /g,"\\s") + "(?=\\s\\d)", "g");
    s = s.replace(re, (m,p1)=> p1 + BK[k]);
  }
  return s.replace(/—/g,"-").replace(/\b3b4\b/g,"3b-4");
}
function row(f,p,s,g){ return { first:expand(f), psalm:expand(p), second:expand(s), gospel:expand(g) }; }

// ---- Felix Just data for slots cpbjr lacks (Year C first-half, seasonal, + fixed) ----
const FELIX = {
  // Year C Ordinary Time (2-33; wk34 = Christ the King handled elsewhere; 9th rare handled below)
  "Year C | 2nd Sunday of Ordinary Time": row("Isa 62:1-5","Ps 96:1-2a, 2b-3, 7-8, 9-10","1 Cor 12:4-11","John 2:1-11"),
  "Year C | 3rd Sunday of Ordinary Time": row("Neh 8:2-4a, 5-6, 8-10","Ps 19:8, 9, 10, 15","1 Cor 12:12-30","Luke 1:1-4; 4:14-21"),
  "Year C | 4th Sunday of Ordinary Time": row("Jer 1:4-5, 17-19","Ps 71:1-2, 3-4, 5-6, 15-17","1 Cor 12:31-13:13","Luke 4:21-30"),
  "Year C | 5th Sunday of Ordinary Time": row("Isa 6:1-2a, 3-8","Ps 138:1-2a, 2b-3, 4-5, 7-8","1 Cor 15:1-11","Luke 5:1-11"),
  "Year C | 6th Sunday of Ordinary Time": row("Jer 17:5-8","Ps 1:1-2, 3, 4, 6","1 Cor 15:12, 16-20","Luke 6:17, 20-26"),
  "Year C | 7th Sunday of Ordinary Time": row("1 Sam 26:2, 7-9, 12-13, 22-23","Ps 103:1-2, 3-4, 8, 10, 12-13","1 Cor 15:45-49","Luke 6:27-38"),
  "Year C | 8th Sunday of Ordinary Time": row("Sir 27:4-7","Ps 92:2-3, 13-14, 15-16","1 Cor 15:54-58","Luke 6:39-45"),
  "Year C | 9th Sunday of Ordinary Time": row("1 Kgs 8:41-43","Ps 117:1, 2","Gal 1:1-2, 6-10","Luke 7:1-10"),
  "Year C | 10th Sunday of Ordinary Time": row("1 Kgs 17:17-24","Ps 30:2, 4, 5-6, 11, 12, 13","Gal 1:11-19","Luke 7:11-17"),
  "Year C | 11th Sunday of Ordinary Time": row("2 Sam 12:7-10, 13","Ps 32:1-2, 5, 7, 11","Gal 2:16, 19-21","Luke 7:36-8:3"),
  "Year C | 12th Sunday of Ordinary Time": row("Zech 12:10-11; 13:1","Ps 63:2, 3-4, 5-6, 8-9","Gal 3:26-29","Luke 9:18-24"),
  "Year C | 13th Sunday of Ordinary Time": row("1 Kgs 19:16b, 19-21","Ps 16:1-2, 5, 7-8, 9-10, 11","Gal 5:1, 13-18","Luke 9:51-62"),
  "Year C | 14th Sunday of Ordinary Time": row("Isa 66:10-14c","Ps 66:1-3, 4-5, 6-7, 16, 20","Gal 6:14-18","Luke 10:1-12, 17-20"),
  "Year C | 15th Sunday of Ordinary Time": row("Deut 30:10-14","Ps 69:14, 17, 30-31, 33-34, 36, 37","Col 1:15-20","Luke 10:25-37"),
  "Year C | 16th Sunday of Ordinary Time": row("Gen 18:1-10a","Ps 15:2-3, 3-4, 5","Col 1:24-28","Luke 10:38-42"),
  "Year C | 17th Sunday of Ordinary Time": row("Gen 18:20-32","Ps 138:1-2, 2-3, 6-7, 7-8","Col 2:12-14","Luke 11:1-13"),
  "Year C | 18th Sunday of Ordinary Time": row("Eccl 1:2; 2:21-23","Ps 90:3-4, 5-6, 12-13, 14, 17","Col 3:1-5, 9-11","Luke 12:13-21"),
  "Year C | 19th Sunday of Ordinary Time": row("Wis 18:6-9","Ps 33:1, 12, 18-19, 20-22","Heb 11:1-2, 8-19","Luke 12:32-48"),
  "Year C | 20th Sunday of Ordinary Time": row("Jer 38:4-6, 8-10","Ps 40:2, 3, 4, 18","Heb 12:1-4","Luke 12:49-53"),
  "Year C | 21st Sunday of Ordinary Time": row("Isa 66:18-21","Ps 117:1, 2","Heb 12:5-7, 11-13","Luke 13:22-30"),
  "Year C | 22nd Sunday of Ordinary Time": row("Sir 3:17-18, 20, 28-29","Ps 68:4-5, 6-7, 10-11","Heb 12:18-19, 22-24a","Luke 14:1, 7-14"),
  "Year C | 23rd Sunday of Ordinary Time": row("Wis 9:13-18b","Ps 90:3-4, 5-6, 12-13, 14, 17","Phlm 9-10, 12-17","Luke 14:25-33"),
  "Year C | 24th Sunday of Ordinary Time": row("Exod 32:7-11, 13-14","Ps 51:3-4, 12-13, 17, 19","1 Tim 1:12-17","Luke 15:1-32"),
  "Year C | 25th Sunday of Ordinary Time": row("Amos 8:4-7","Ps 113:1-2, 4-6, 7-8","1 Tim 2:1-8","Luke 16:1-13"),
  "Year C | 26th Sunday of Ordinary Time": row("Amos 6:1a, 4-7","Ps 146:7, 8-9, 9-10","1 Tim 6:11-16","Luke 16:19-31"),
  "Year C | 27th Sunday of Ordinary Time": row("Hab 1:2-3; 2:2-4","Ps 95:1-2, 6-7, 8-9","2 Tim 1:6-8, 13-14","Luke 17:5-10"),
  "Year C | 28th Sunday of Ordinary Time": row("2 Kgs 5:14-17","Ps 98:1, 2-3, 3-4","2 Tim 2:8-13","Luke 17:11-19"),
  "Year C | 29th Sunday of Ordinary Time": row("Exod 17:8-13","Ps 121:1-2, 3-4, 5-6, 7-8","2 Tim 3:14-4:2","Luke 18:1-8"),
  "Year C | 30th Sunday of Ordinary Time": row("Sir 35:12-14, 16-18","Ps 34:2-3, 17-18, 19, 23","2 Tim 4:6-8, 16-18","Luke 18:9-14"),
  "Year C | 31st Sunday of Ordinary Time": row("Wis 11:22-12:2","Ps 145:1-2, 8-9, 10-11, 13-14","2 Thess 1:11-2:2","Luke 19:1-10"),
  "Year C | 32nd Sunday of Ordinary Time": row("2 Macc 7:1-2, 9-14","Ps 17:1, 5-6, 8, 15","2 Thess 2:16-3:5","Luke 20:27-38"),
  "Year C | 33rd Sunday of Ordinary Time": row("Mal 3:19-20a","Ps 98:5-6, 7-8, 9","2 Thess 3:7-12","Luke 21:5-19"),
  // Year C Advent
  "Year C | 1st Sunday of Advent": row("Jer 33:14-16","Ps 25:4-5, 8-9, 10, 14","1 Thess 3:12-4:2","Luke 21:25-28, 34-36"),
  "Year C | 2nd Sunday of Advent": row("Bar 5:1-9","Ps 126:1-2, 2-3, 4-5, 6","Phil 1:4-6, 8-11","Luke 3:1-6"),
  "Year C | 3rd Sunday of Advent": row("Zeph 3:14-18a","Isa 12:2-3, 4, 5-6","Phil 4:4-7","Luke 3:10-18"),
  "Year C | 4th Sunday of Advent": row("Mic 5:1-4a","Ps 80:2-3, 15-16, 18-19","Heb 10:5-10","Luke 1:39-45"),
  // Year C Lent
  "Year C | 1st Sunday of Lent": row("Deut 26:4-10","Ps 91:1-2, 10-11, 12-13, 14-15","Rom 10:8-13","Luke 4:1-13"),
  "Year C | 2nd Sunday of Lent": row("Gen 15:5-12, 17-18","Ps 27:1, 7-8, 8-9, 13-14","Phil 3:17-4:1","Luke 9:28b-36"),
  "Year C | 3rd Sunday of Lent": row("Exod 3:1-8a, 13-15","Ps 103:1-2, 3-4, 6-7, 8, 11","1 Cor 10:1-6, 10-12","Luke 13:1-9"),
  "Year C | 4th Sunday of Lent": row("Josh 5:9a, 10-12","Ps 34:2-3, 4-5, 6-7","2 Cor 5:17-21","Luke 15:1-3, 11-32"),
  "Year C | 5th Sunday of Lent": row("Isa 43:16-21","Ps 126:1-2, 2-3, 4-5, 6","Phil 3:8-14","John 8:1-11"),
  "Year C | Palm Sunday": row("Isa 50:4-7","Ps 22:8-9, 17-18, 19-20, 23-24","Phil 2:6-11","Luke 22:14-23:56"),
  // Year C Easter (Easter Sunday itself set as fixed below)
  "Year C | Divine Mercy Sunday": row("Acts 5:12-16","Ps 118:2-4, 13-15, 22-24","Rev 1:9-11a, 12-13, 17-19","John 20:19-31"),
  "Year C | 3rd Sunday of Easter": row("Acts 5:27-32, 40b-41","Ps 30:2, 4, 5-6, 11-12, 13","Rev 5:11-14","John 21:1-19"),
  "Year C | 4th Sunday of Easter": row("Acts 13:14, 43-52","Ps 100:1-2, 3, 5","Rev 7:9, 14b-17","John 10:27-30"),
  "Year C | 5th Sunday of Easter": row("Acts 14:21-27","Ps 145:8-9, 10-11, 12-13","Rev 21:1-5a","John 13:31-33a, 34-35"),
  "Year C | 6th Sunday of Easter": row("Acts 15:1-2, 22-29","Ps 67:2-3, 5, 6, 8","Rev 21:10-14, 22-23","John 14:23-29"),
  "Year C | 7th Sunday of Easter": row("Acts 7:55-60","Ps 97:1-2, 6-7, 9","Rev 22:12-14, 16-17, 20","John 17:20-26"),
  "Year C | Pentecost Sunday": row("Acts 2:1-11","Ps 104:1, 24, 29-30, 31, 34","Rom 8:8-17","John 14:15-16, 23b-26"),
  // Year C Christmas season + solemnities
  "Year C | Holy Family": row("1 Sam 1:20-22, 24-28","Ps 84:2-3, 5-6, 9-10","1 John 3:1-2, 21-24","Luke 2:41-52"),
  "Year C | Baptism of the Lord": row("Isa 40:1-5, 9-11","Ps 104:1b-2, 3-4, 24-25, 27-28, 29-30","Titus 2:11-14; 3:4-7","Luke 3:15-16, 21-22"),
  "Year C | Trinity Sunday": row("Prov 8:22-31","Ps 8:4-5, 6-7, 8-9","Rom 5:1-5","John 16:12-15"),
  "Year C | Corpus Christi": row("Gen 14:18-20","Ps 110:1, 2, 3, 4","1 Cor 11:23-26","Luke 9:11b-17"),
  "Year C | Christ the King": row("2 Sam 5:1-3","Ps 122:1-2, 3-4, 4-5","Col 1:12-20","Luke 23:35-43"),
  // Displaced Year A OT weeks
  "Year A | 7th Sunday of Ordinary Time": row("Lev 19:1-2, 17-18","Ps 103:1-2, 3-4, 8, 10, 12-13","1 Cor 3:16-23","Matt 5:38-48"),
  "Year A | 8th Sunday of Ordinary Time": row("Isa 49:14-15","Ps 62:2-3, 6-7, 8-9","1 Cor 4:1-5","Matt 6:24-34"),
  "Year A | 9th Sunday of Ordinary Time": row("Deut 11:18, 26-28, 32","Ps 31:2-3, 3-4, 17, 25","Rom 3:21-25, 28","Matt 7:21-27"),
  "Year A | 10th Sunday of Ordinary Time": row("Hos 6:3-6","Ps 50:1, 8, 12-13, 14-15","Rom 4:18-25","Matt 9:9-13"),
  "Year A | 31st Sunday of Ordinary Time": row("Mal 1:14b-2:2b, 8-10","Ps 131:1, 2, 3","1 Thess 2:7b-9, 13","Matt 23:1-12"),
  // Displaced Year B OT weeks
  "Year B | 6th Sunday of Ordinary Time": row("Lev 13:1-2, 44-46","Ps 32:1-2, 5, 11","1 Cor 10:31-11:1","Mark 1:40-45"),
  "Year B | 7th Sunday of Ordinary Time": row("Isa 43:18-19, 21-22, 24b-25","Ps 41:2-3, 4-5, 13-14","2 Cor 1:18-22","Mark 2:1-12"),
  "Year B | 8th Sunday of Ordinary Time": row("Hos 2:16b, 17b, 21-22","Ps 103:1-2, 3-4, 8, 10, 12-13","2 Cor 3:1b-6","Mark 2:18-22"),
  "Year B | 9th Sunday of Ordinary Time": row("Deut 5:12-15","Ps 81:3-4, 5-6, 7-8, 10-11","2 Cor 4:6-11","Mark 2:23-3:6"),
  "Year B | 20th Sunday of Ordinary Time": row("Prov 9:1-6","Ps 34:2-3, 4-5, 6-7","Eph 5:15-20","John 6:51-58"),
};

// Fixed-date feasts (cycle-independent): fetch by date, key by NAME (fallback for any cycle)
const FIXED_FEAST_DATES = {
  "Christmas": "2026/12-25",
  "Mary, Mother of God": "2026/01-01",
  "Epiphany": "2027/01-03",
  "Presentation of the Lord": "2026/02-02",
  "Saints Peter and Paul, Apostles": "2026/06-29",
  "Birth of John the Baptist": "2026/06-24",
  "Transfiguration": "2026/08-06",
  "The Assumption of the Blessed Virgin Mary": "2026/08-15",
  "The Exaltation of the Holy Cross": "2026/09-14",
  "Dedication of the Lateran Basilica": "2026/11-09",
  "All Saints": "2026/11-01",
};
const FIXED_FEAST_FALLBACKS = {
  "The Assumption of the Blessed Virgin Mary": row(
    "Rev 11:19a; 12:1-6a, 10ab",
    "Ps 45:10, 11, 12, 16",
    "1 Cor 15:20-27",
    "Luke 1:39-56",
  ),
};

(async () => {
  const table = {};
  // 1) start with cpbjr harvested for A & B only (2025 Year C harvest is contaminated by All Souls etc.)
  for (const [k, v] of Object.entries(cpbjr)) {
    if (k.startsWith("Year C |")) continue;
    table[k] = { ...row(v.first, v.psalm, v.second, v.gospel), src: "usccb" };
  }
  // 2) add Felix only where cpbjr lacks
  const felixVerify = [];
  for (const [k, v] of Object.entries(FELIX)) {
    if (!table[k]) table[k] = { ...v, src: "felix" };
    else felixVerify.push(k); // overlap -> use to QA transcription
  }
  // 3) Easter Sunday fixed (same all cycles) — take from a cpbjr Year B if present
  const easterB = cpbjr["Year B | Easter Sunday"];
  const easterFixed = easterB ? { first: easterB.first, psalm: easterB.psalm, second: easterB.second, gospel: easterB.gospel } : row("Acts 10:34a, 37-43","Ps 118:1-2, 16-17, 22-23","Col 3:1-4","John 20:1-9");
  ["Year A","Year B","Year C"].forEach(c => { table[c + " | Easter Sunday"] = { ...easterFixed, src: "fixed" }; });
  // 4) fixed feasts by name (fallback map)
  const feastByName = {};
  for (const [name, date] of Object.entries(FIXED_FEAST_DATES)) {
    const [y, md] = date.split("/");
    const j = await fetchJson(`https://raw.githubusercontent.com/cpbjr/catholic-readings-api/main/readings/${y}/${md}.json`);
    if (j && j.readings) {
      const fallback = FIXED_FEAST_FALLBACKS[name] || {};
      feastByName[name] = {
        ...row(
          j.readings.firstReading || fallback.first || "",
          j.readings.psalm || fallback.psalm || "",
          j.readings.secondReading || fallback.second || "",
          j.readings.gospel || fallback.gospel || "",
        ),
        src: "usccb-fixed",
      };
    }
  }

  fs.writeFileSync(path.join(GENERATED_DATA, "readings_master.json"), JSON.stringify({ bySlot: table, feastByName }, null, 1));

  // ---- VERIFY: my Felix Year C OT gospel transcription vs Felix's independent gospel-overview page ----
  const OVERVIEW_C = {2:"John 2:1-12",3:"Luke 1:1-4; 4:14-21",4:"Luke 4:21-30",5:"Luke 5:1-11",6:"Luke 6:17, 20-26",7:"Luke 6:27-38",8:"Luke 6:39-45",9:"Luke 7:1-10",10:"Luke 7:11-17",11:"Luke 7:36-8:3",12:"Luke 9:18-24",13:"Luke 9:51-62",14:"Luke 10:1-12, 17-20",15:"Luke 10:25-37",16:"Luke 10:38-42",17:"Luke 11:1-13",18:"Luke 12:13-21",19:"Luke 12:32-48",20:"Luke 12:49-53",21:"Luke 13:22-30",22:"Luke 14:1, 7-14",23:"Luke 14:25-33",24:"Luke 15:1-32",25:"Luke 16:1-13",26:"Luke 16:19-31",27:"Luke 17:5-10",28:"Luke 17:11-19",29:"Luke 18:1-8",30:"Luke 18:9-14",31:"Luke 19:1-10",32:"Luke 20:27-38",33:"Luke 21:5-19"};
  const ord = n => n+["th","st","nd","rd"][(n%100>>3^1&&n%10)<4?n%10:0]; // not used
  const num = s => (s||"").replace(/[^0-9:;.\-]/g,"").split("or")[0];
  let qaMismatch = 0;
  console.log("=== Year C OT gospel QA (my transcription vs independent overview page) ===");
  for (let n=2;n<=33;n++){
    const suffix = n===2?"2nd":n===3?"3rd":n===21?"21st":n===22?"22nd":n===23?"23rd":n===31?"31st":n===32?"32nd":n===33?"33rd":n+"th";
    const key = "Year C | "+suffix+" Sunday of Ordinary Time";
    if(!table[key]) { if(n!==9){} continue; }
    if(num(table[key].gospel)!==num(OVERVIEW_C[n])) { qaMismatch++; console.log("  MISMATCH", key, "| table:", table[key].gospel, "| overview:", OVERVIEW_C[n]); }
  }
  console.log("Year C OT gospels checked; mismatches:", qaMismatch);

  // ---- coverage vs 50-year need ----
  const romcal = require("romcal");
  const years = Array.from({ length: 51 }, (_, i) => 2025 + i);
  const cal = [].concat(...years.map(y => romcal.calendarFor({ year: y, country: "general", locale: "en" })));
  const byDate = {};
  cal.forEach(d => { const dt = new Date(d.moment); if (dt.getUTCDay() !== 0) return; const iso = d.moment.slice(0,10); const rank = t=>({SOLEMNITY:3,FEAST:2,SUNDAY:1})[t]||0; if(!byDate[iso]||rank(d.type)>rank(byDate[iso].type)) byDate[iso]=d; });
  let miss = {};
  Object.values(byDate).forEach(d => {
    const key = d.data.meta.cycle.value + " | " + d.name;
    if (!table[key] && !feastByName[d.name]) { miss[key] = (miss[key]||0)+1; }
  });
  const missArr = Object.entries(miss).sort((a,b)=>b[1]-a[1]);
  console.log("\n=== coverage: uncovered slots over 50yr:", missArr.length, "===");
  missArr.forEach(([k,n]) => console.log(`  ${k}  (${n}x)`));
  console.log("\ntotal slots in table:", Object.keys(table).length, "| fixed feasts:", Object.keys(feastByName).length);
})();
