const fs = require("fs");
const path = require("path");

const SOURCE_URL = "https://catholic-resources.org/Lectionary/2002USL-Sanctoral.htm";
const COMMONS_URL = "https://catholic-resources.org/Lectionary/2002USL-Masses-Commons.htm";

const BOOKS = {
  Gen: "Genesis", Exod: "Exodus", Lev: "Leviticus", Num: "Numbers", Deut: "Deuteronomy",
  Josh: "Joshua", Judg: "Judges", Ruth: "Ruth", "1 Sam": "1 Samuel", "2 Sam": "2 Samuel",
  "1 Kgs": "1 Kings", "2 Kgs": "2 Kings", "1 Chr": "1 Chronicles", "2 Chr": "2 Chronicles",
  "1 Chron": "1 Chronicles", "2 Chron": "2 Chronicles",
  Ezra: "Ezra", Neh: "Nehemiah", Tob: "Tobit", Jdt: "Judith", Esth: "Esther",
  "1 Macc": "1 Maccabees", "2 Macc": "2 Maccabees", "1 Mac": "1 Maccabees", "2 Mac": "2 Maccabees", Job: "Job", Ps: "Psalm",
  Prov: "Proverbs", Eccl: "Ecclesiastes", Song: "Song of Songs", Songs: "Song of Songs", Wis: "Wisdom",
  Sir: "Sirach", Is: "Isaiah", Isa: "Isaiah", Jer: "Jeremiah", Lam: "Lamentations", Bar: "Baruch",
  Ezek: "Ezekiel", Dan: "Daniel", Hos: "Hosea", Joel: "Joel", Amos: "Amos",
  Obad: "Obadiah", Jonah: "Jonah", Mic: "Micah", Nah: "Nahum", Hab: "Habakkuk",
  Zeph: "Zephaniah", Hag: "Haggai", Zech: "Zechariah", Zac: "Zechariah", Mal: "Malachi",
  Cant: "Song of Songs", Matt: "Matthew", Mark: "Mark", Luke: "Luke", John: "John", Jn: "John", Acts: "Acts",
  Rom: "Romans", "1 Cor": "1 Corinthians", "2 Cor": "2 Corinthians", Gal: "Galatians",
  Eph: "Ephesians", Phil: "Philippians", Col: "Colossians",
  "1 Thess": "1 Thessalonians", "2 Thess": "2 Thessalonians",
  "1 Tim": "1 Timothy", "2 Tim": "2 Timothy", Titus: "Titus", Phlm: "Philemon",
  Heb: "Hebrews", Hebr: "Hebrews", Jas: "James", "1 Pet": "1 Peter", "2 Pet": "2 Peter", "1 Petr": "1 Peter",
  "1 John": "1 John", "2 John": "2 John", "3 John": "3 John", Jude: "Jude",
  Rev: "Revelation",
};

const MONTHS = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function decodeEntities(value) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&ndash;|&mdash;/gi, "-")
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)));
}

function textFromHtml(value) {
  return decodeEntities(
    value
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  ).replace(/\s+/g, " ").trim();
}

function expandBook(citation) {
  let value = citation.replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
  const keys = Object.keys(BOOKS).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const expression = new RegExp("^" + key.replace(/ /g, "\\s+") + "(?=\\s*\\d)", "i");
    if (expression.test(value)) return value.replace(expression, BOOKS[key]);
  }
  return value;
}

function readingFromCell(cell) {
  let value = textFromHtml(cell)
    .replace(/\s*\(#[^)]+\)\s*/g, " ")
    .replace(/\s*\(see\s+#[^)]+\)\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!value || /^(x|—|-)$/i.test(value)) return "";
  if (/\b\d+\s+to\s+\d+\s+options?\b/i.test(value)) return "";
  value = value
    .replace(/^([1-3])(?=[A-Za-z])/, "$1 ")
    .replace(/-(\d)\s+(\d)\b/g, "-$1$2");
  if (/^A:\s*/i.test(value)) {
    value = value.replace(/(?:^|\s)[ABC]:\s*/g, match => match.trimStart().length === match.length ? "" : " or ");
  }
  // Keep every explicit Lectionary option. The UI understands a citation joined
  // with "or" and lets the editor choose the actual form used at this Mass.
  value = value.replace(/\s+(?:OR|or)\s+/g, " or ");
  const citation = value.match(/(?:[1-3]\s+)?[A-Za-z][A-Za-z. ]*\s+\d[^()[\]]*/)?.[0]?.trim() || "";
  if (!citation) return "";
  return citation
    .split(/\s+or\s+/i)
    .map((option, index) => {
      const expanded = expandBook(option);
      if (index === 0 || !/^\d/.test(expanded)) return expanded;
      return expanded;
    })
    .join(" or ");
}

function numberedOptions(cell, lectionaryNumber, nextLectionaryNumber = null) {
  const value = textFromHtml(cell);
  const marker = new RegExp("(?:^|\\s)" + lectionaryNumber + ":\\s*");
  const start = marker.exec(value);
  if (!start) return [];
  let section = value.slice(start.index + start[0].length);
  if (nextLectionaryNumber) {
    const nextSection = section.search(new RegExp("\\s+" + nextLectionaryNumber + ":\\s*"));
    if (nextSection >= 0) section = section.slice(0, nextSection);
  }
  return [...section.matchAll(/(?:^|\s)\d+\)\s+([\s\S]*?)(?=(?:\s+\d+\)\s+)|$)/g)]
    .map(match => readingFromCell(match[1]))
    .filter(Boolean);
}

const COMMON_DEFINITIONS = {
  701: { id: "dedication", name: "Common of the Anniversary of the Dedication of a Church" },
  707: { id: "blessed-virgin-mary", name: "Common of the Blessed Virgin Mary" },
  713: { id: "martyrs", name: "Common of Martyrs" },
  719: { id: "pastors", name: "Common of Pastors" },
  725: { id: "doctors", name: "Common of Doctors of the Church" },
  731: { id: "virgins", name: "Common of Virgins" },
  737: { id: "holy-men-women", name: "Common of Holy Men and Women" },
};

function parseCommons(html) {
  const commons = [];
  for (const rowMatch of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...rowMatch[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(match => match[1]);
    if (cells.length < 6) continue;
    const range = textFromHtml(cells[0]).match(/^(\d{3})-\d{3}:/);
    if (!range) continue;
    const start = Number(range[1]);
    const definition = COMMON_DEFINITIONS[start];
    if (!definition) continue;
    commons.push({
      ...definition,
      lectionary: start + "-" + (start + 5),
      firstOutsideEaster: numberedOptions(cells[1], start, start + 1),
      firstEaster: numberedOptions(cells[1], start + 1),
      psalm: numberedOptions(cells[2], start + 2),
      second: numberedOptions(cells[3], start + 3),
      gospel: numberedOptions(cells[5], start + 5),
      source: "Lectionary for Mass — Commons",
    });
  }
  return commons;
}

function commonIdsFromCell(cell) {
  const value = textFromHtml(cell);
  const ids = [];
  const add = id => { if (!ids.includes(id)) ids.push(id); };
  if (/Common of (?:the )?Blessed Virgin Mary/i.test(value)) add("blessed-virgin-mary");
  if (/Common of Martyrs/i.test(value)) add("martyrs");
  if (/Common of Pastors/i.test(value)) add("pastors");
  if (/Common of (?:the )?Doctors of the Church/i.test(value)) add("doctors");
  if (/Common of Virgins/i.test(value)) add("virgins");
  if (/Common of (?:Saints|Holy Men and Women)/i.test(value)) add("holy-men-women");
  if (/Common of (?:the )?Anniversary of (?:the )?Dedication of a Church/i.test(value)) add("dedication");
  return ids;
}

function monthDayFromCell(cell) {
  const value = textFromHtml(cell);
  const match = value.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})/i);
  if (!match) return "";
  return MONTHS[match[1].slice(0, 3).toLowerCase()] + "-" + String(Number(match[2])).padStart(2, "0");
}

async function main() {
  const [properResponse, commonsResponse] = await Promise.all([fetch(SOURCE_URL), fetch(COMMONS_URL)]);
  if (!properResponse.ok) throw new Error("Could not fetch Proper of Saints index: HTTP " + properResponse.status);
  if (!commonsResponse.ok) throw new Error("Could not fetch Commons index: HTTP " + commonsResponse.status);
  const html = new TextDecoder("windows-1252").decode(await properResponse.arrayBuffer());
  const commonsHtml = new TextDecoder("windows-1252").decode(await commonsResponse.arrayBuffer());
  const commons = parseCommons(commonsHtml);
  const commonById = new Map(commons.map(common => [common.id, common]));
  const celebrations = [];

  for (const rowMatch of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...rowMatch[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(match => match[1]);
    if (cells.length < 10) continue;
    const lectionary = textFromHtml(cells[0]);
    const monthDay = monthDayFromCell(cells[1]);
    const name = textFromHtml(cells[2]);
    if (!/^\d+[A-Z]?$/.test(lectionary) || !monthDay || !name) continue;

    const first = readingFromCell(cells[5]);
    const psalm = readingFromCell(cells[6]);
    const second = readingFromCell(cells[7]);
    const gospel = readingFromCell(cells[9]);
    const commonIds = commonIdsFromCell(cells[4]);
    const hasCompleteCommon = commonIds.some(id => {
      const common = commonById.get(id);
      return common && (common.firstOutsideEaster.length || common.firstEaster.length)
        && common.psalm.length && common.gospel.length;
    });
    if ((!first || !psalm || !gospel) && !hasCompleteCommon) continue;

    celebrations.push({
      id: "sanctoral-" + lectionary.toLowerCase(),
      monthDay,
      name,
      rank: textFromHtml(cells[3]),
      lectionary,
      f: first,
      p: psalm,
      e: second,
      g: gospel,
      commonIds,
      source: "Lectionary for Mass — Proper of Saints",
    });
  }

  // Proper to the Diocese of Helsinki; option 1 from the Finnish diocesan Ordo.
  celebrations.push({
    id: "finland-saint-henry",
    monthDay: "01-19",
    name: "Saint Henry, Bishop and Martyr",
    rank: "Solemnity in Finland",
    lectionary: "",
    f: "Sirach 45:12-20, 4-5",
    p: "Psalm 126:1-2, 2-3, 4-5, 6",
    e: "2 Corinthians 5:14-20",
    g: "John 4:34-39a",
    commonIds: [],
    source: "Finnish diocesan Ordo",
  });

  celebrations.sort((a, b) => a.monthDay.localeCompare(b.monthDay) || a.name.localeCompare(b.name));
  const outputPath = path.join(__dirname, "celebrations.json");
  const commonsPath = path.join(__dirname, "commons.json");
  fs.writeFileSync(outputPath, JSON.stringify(celebrations));
  fs.writeFileSync(commonsPath, JSON.stringify(commons));
  console.log("wrote", celebrations.length, "standard celebrations to", outputPath);
  console.log("wrote", commons.length, "Commons with", commons.reduce((total, common) =>
    total + common.firstOutsideEaster.length + common.firstEaster.length
      + common.psalm.length + common.second.length + common.gospel.length, 0), "reading options to", commonsPath);
  const james = celebrations.find(item => item.monthDay === "07-25" && /James, Apostle/i.test(item.name));
  console.log("St James:", james || "MISSING");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
