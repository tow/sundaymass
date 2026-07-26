const fs = require("fs");
// ---- parse WEB (by book number) ----
const webRaw = require("./web.json").resultset.row;
const WEB = {}; // num -> ch -> v -> text
webRaw.forEach(r => { const [id, b, c, v, t] = r.field; (WEB[b] = WEB[b] || {}); (WEB[b][c] = WEB[b][c] || {}); WEB[b][c][v] = cleanText(t); });
// ---- parse KJVA (by book name) ----
const kjva = require("./kjva.json").books;
const KJV = {}; // name -> ch -> v -> text
kjva.forEach(bk => { const m = {}; bk.chapters.forEach(ch => { const cm = {}; ch.verses.forEach(vs => cm[vs.verse] = cleanText(vs.text)); m[ch.chapter] = cm; }); KJV[bk.name] = m; });

function cleanText(t) { return String(t).replace(/\{[^}]*\}/g, "").replace(/\[[^\]]*\]/g, "").replace(/\\(["'])/g, "$1").replace(/\\/g, "").replace(/\s+/g, " ").trim(); }
function verseLabel(v) {
  const superscript = { "0":"⁰", "1":"¹", "2":"²", "3":"³", "4":"⁴", "5":"⁵", "6":"⁶", "7":"⁷", "8":"⁸", "9":"⁹" };
  // Keep the verse number attached to its first word at line wraps.
  return String(v).split("").map(digit => superscript[digit]).join("") + "\u202F";
}

// WEB book numbers
const WEBNUM = { "Genesis":1,"Exodus":2,"Leviticus":3,"Numbers":4,"Deuteronomy":5,"Joshua":6,"Judges":7,"Ruth":8,"1 Samuel":9,"2 Samuel":10,"1 Kings":11,"2 Kings":12,"1 Chronicles":13,"2 Chronicles":14,"Ezra":15,"Nehemiah":16,"Esther":17,"Job":18,"Psalm":19,"Psalms":19,"Proverbs":20,"Ecclesiastes":21,"Song of Songs":22,"Isaiah":23,"Jeremiah":24,"Lamentations":25,"Ezekiel":26,"Daniel":27,"Hosea":28,"Joel":29,"Amos":30,"Obadiah":31,"Jonah":32,"Micah":33,"Nahum":34,"Habakkuk":35,"Zephaniah":36,"Haggai":37,"Zechariah":38,"Malachi":39,"Matthew":40,"Mark":41,"Luke":42,"John":43,"Acts":44,"Romans":45,"1 Corinthians":46,"2 Corinthians":47,"Galatians":48,"Ephesians":49,"Philippians":50,"Colossians":51,"1 Thessalonians":52,"2 Thessalonians":53,"1 Timothy":54,"2 Timothy":55,"Titus":56,"Philemon":57,"Hebrews":58,"James":59,"1 Peter":60,"2 Peter":61,"1 John":62,"2 John":63,"3 John":64,"Jude":65,"Revelation":66 };
// deuterocanon -> KJVA names
const KJVNAME = { "Sirach":"Sirach","Wisdom":"Wisdom","Baruch":"Baruch","2 Maccabees":"II Maccabees","1 Maccabees":"I Maccabees","Tobit":"Tobit","Judith":"Judith" };

// The Lectionary/NAB follows Hebrew Psalm verse numbering; WEB follows the
// traditional English convention and omits some superscriptions from the verse
// count. Values are NAB verse number minus WEB verse number for the psalm body.
// Derived by comparing:
//   https://bible.usccb.org/bible/psalms/0
//   https://www.sefaria.org/api/shape/Psalms
// against the bundled WEB chapter lengths. Keep the complete map so future
// lectionary additions do not silently extract the verse before the cited one.
const PSALM_NAB_TO_WEB_OFFSET = {
  3:1, 4:1, 5:1, 6:1, 7:1, 8:1, 9:1, 12:1, 18:1, 19:1, 20:1, 21:1,
  22:1, 30:1, 31:1, 34:1, 36:1, 38:1, 39:1, 40:1, 41:1, 42:1, 44:1,
  45:1, 46:1, 47:1, 48:1, 49:1, 51:2, 52:2, 53:1, 54:2, 55:1, 56:1,
  57:1, 58:1, 59:1, 60:2, 61:1, 62:1, 63:1, 64:1, 65:1, 67:1, 68:1,
  69:1, 70:1, 75:1, 76:1, 77:1, 80:1, 81:1, 83:1, 84:1, 85:1, 88:1,
  89:1, 92:1, 102:1, 108:1, 140:1, 142:1,
};

function getVerse(book, ch, v) {
  // Neo-Vulgate/lectionary vs WEB chapter differences
  if (book === "Malachi" && ch === 3 && v >= 19) { ch = 4; v = v - 18; }   // Mal 3:19-24 (NAB) = Mal 4:1-6 (WEB/KJV)
  if (book === "Zechariah" && ch === 2 && v >= 14) { v = v - 4; }          // Zech 2:14-17 (NAB) = Zech 2:10-13 (WEB/KJV)
  if (book === "Psalm" && PSALM_NAB_TO_WEB_OFFSET[ch] && v > PSALM_NAB_TO_WEB_OFFSET[ch]) {
    v -= PSALM_NAB_TO_WEB_OFFSET[ch];
  }
  // Catholic Daniel inserts the Prayer of Azariah/Song of the Three into ch. 3.
  // KJVA stores that addition as a separate one-chapter book: Dan 3:24 = Azar 1.
  if (book === "Daniel" && ch === 3 && v >= 24) {
    const azariahVerse = v - 23;
    if (KJV["Prayer of Azariah"]?.[1]?.[azariahVerse] != null) {
      return { t: KJV["Prayer of Azariah"][1][azariahVerse], src: "KJV" };
    }
  }
  if (WEBNUM[book] && WEB[WEBNUM[book]] && WEB[WEBNUM[book]][ch] && WEB[WEBNUM[book]][ch][v] != null)
    return { t: WEB[WEBNUM[book]][ch][v], src: "WEB" };
  const kn = KJVNAME[book] || book;
  if (KJV[kn] && KJV[kn][ch] && KJV[kn][ch][v] != null) return { t: KJV[kn][ch][v], src: "KJV" };
  if (book === "Psalm" && KJV["Psalms"] && KJV["Psalms"][ch] && KJV["Psalms"][ch][v] != null) return { t: KJV["Psalms"][ch][v], src: "KJV" };
  return null;
}
const SINGLE_CH = { "Philemon":1,"Jude":1,"Obadiah":1,"2 John":1,"3 John":1,"Baruch":0 };

// parse "Book c:v, v-v, c:v-c:v ..." -> ordered list of {ch,v}
function parseRef(cite) {
  let s = cite.split(/\s+or\s+/i)[0].replace(/\([^)]*\)/g, "").replace(/[—–]/g, "-").replace(/:\s+/g, ":").replace(/\b3b4\b/g, "3b-4").replace(/(\d+)-\d+-\d+-(\d+)/g, "$1-$2").trim(); // primary alt, normalize dashes/spacing
  const bm = s.match(/^((?:[1-3]\s)?[A-Za-z][A-Za-z ]*?)\s+(\d.*)$/);
  let book, rest;
  if (bm) { book = bm[1].trim(); rest = bm[2].trim(); }
  else if (/^\d+:/.test(s)) { book = "Psalm"; rest = s; } // malformed psalm
  else return null;
  const list = [];
  let curCh = (/^\d+:/.test(rest) ? null : (SINGLE_CH[book] || 1)); // single-chapter books start at ch1
  rest.split(/[;,.+]/).forEach(seg => {
    seg = seg.trim().replace(/([0-9])[a-z]+/gi, "$1"); if (!seg) return; // strip verse letter-suffixes (3a, 1bc)
    // cross-chapter range a:b-c:d
    let m = seg.match(/^(\d+):(\d+)[a-z]?-(\d+):(\d+)[a-z]?$/);
    if (m) { const [_, c1, v1, c2, v2] = m.map(Number); for (let c = c1; c <= c2; c++) { const lo = c === c1 ? v1 : 1; const hi = c === c2 ? v2 : lastVerse(book, c); for (let v = lo; v <= hi; v++) list.push({ ch: c, v }); } curCh = c2; return; }
    // c:v-v
    m = seg.match(/^(\d+):(\d+)[a-z]?-(\d+)[a-z]?$/);
    if (m) { curCh = +m[1]; for (let v = +m[2]; v <= +m[3]; v++) list.push({ ch: curCh, v }); return; }
    // c:v
    m = seg.match(/^(\d+):(\d+)[a-z]?$/);
    if (m) { curCh = +m[1]; list.push({ ch: curCh, v: +m[2] }); return; }
    // v-v (same chapter)
    m = seg.match(/^(\d+)[a-z]?-(\d+)[a-z]?$/);
    if (m && curCh) { for (let v = +m[1]; v <= +m[2]; v++) list.push({ ch: curCh, v }); return; }
    // v
    m = seg.match(/^(\d+)[a-z]?$/);
    if (m && curCh) { list.push({ ch: curCh, v: +m[1] }); return; }
  });
  return { book, list };
}
function lastVerse(book, ch) {
  if (WEBNUM[book] && WEB[WEBNUM[book]] && WEB[WEBNUM[book]][ch]) return Math.max(...Object.keys(WEB[WEBNUM[book]][ch]).map(Number));
  const kn = KJVNAME[book] || (book === "Psalm" ? "Psalms" : book);
  if (KJV[kn] && KJV[kn][ch]) return Math.max(...Object.keys(KJV[kn][ch]).map(Number));
  return 200;
}

function extract(cite) {
  const p = parseRef(cite); if (!p) return { text: "", src: "", missing: ["parse"] };
  let out = [], prev = null, src = new Set(), missing = [];
  p.list.forEach(({ ch, v }) => {
    const g = getVerse(p.book, ch, v);
    if (!g) { missing.push(ch + ":" + v); return; }
    src.add(g.src);
    if (prev && !(prev.ch === ch && prev.v === v - 1)) out.push("[...]");
    out.push(verseLabel(v) + g.t); prev = { ch, v };
  });
  return { text: out.join(" ").replace(/ …/g, " …").replace(/… /g, "… "), src: [...src].join("+"), missing };
}

function expandAlternatives(cite) {
  const parts = String(cite || "").split(/\s+or\s+/i).map(part => part.trim()).filter(Boolean);
  if (parts.length < 2) return parts;
  const book = parts[0].match(/^((?:[1-3]\s)?[A-Za-z][A-Za-z ]*?)\s+\d/)?.[1];
  return parts.map((part, index) => index === 0 || !book || !/^\d+:/.test(part) ? part : book + " " + part);
}

// ---- run over all distinct citations ----
const sundayLectionary = require("./sunday-lectionary.json");
const celebrations = require("./celebrations.json");
const commons = require("./commons.json");
const cites = new Set();
sundayLectionary.forEach(o => [o.f, o.p, o.e, o.g].forEach(c => c && cites.add(c)));
celebrations.forEach(o => [o.f, o.p, o.e, o.g].forEach(c => c && cites.add(c)));
commons.forEach(common => [
  ...common.firstOutsideEaster,
  ...common.firstEaster,
  ...common.psalm,
  ...common.second,
  ...common.gospel,
].forEach(c => c && cites.add(c)));
const extractableCites = new Set(cites);
cites.forEach(cite => expandAlternatives(cite).forEach(alternative => extractableCites.add(alternative)));
const map = {}; let full = 0, partial = 0, none = 0; const problems = [];
[...extractableCites].forEach(c => {
  const r = extract(c);
  map[c] = r.text;
  if (!r.text) { none++; problems.push("NONE  " + c + "  (" + r.missing.join(",") + ")"); }
  else if (r.missing.length) { partial++; problems.push("PARTIAL " + c + "  missing " + r.missing.join(",")); }
  else full++;
});
const outputPath = require("path").join(__dirname, "readings_text.json");
fs.writeFileSync(outputPath, JSON.stringify(map));
console.log("calendar citation strings:", cites.size, "| expanded entries:", extractableCites.size, "| full:", full, "| partial:", partial, "| none:", none);
console.log("readings_text.json KB:", Math.round(fs.statSync(outputPath).size/1024));
console.log("\n--- problems (first 25) ---"); problems.slice(0,25).forEach(p=>console.log(" ", p));
// versification spot checks
console.log("\n--- spot checks (verify against known text) ---");
["Psalm 23:1-3a, 3b-4, 5, 6","Psalm 51:3-4, 12-13, 14-15","Matthew 13:44-52","Sirach 45:12-20, 4-5","Wisdom 3:1-9","Isaiah 55:1-3","Daniel 3:52, 53, 54, 55, 56"].forEach(c=>{
  console.log("\n["+c+"]:", (map[c]||"(none)").slice(0,180));
});
