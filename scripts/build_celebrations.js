const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const GENERATED_DATA = path.join(ROOT, "data", "generated");
const { expandBook, textFromHtml } = require("./lectionary-citations.js");

const SOURCE_URL = "https://catholic-resources.org/Lectionary/2002USL-Sanctoral.htm";
const COMMONS_URL = "https://catholic-resources.org/Lectionary/2002USL-Masses-Commons.htm";

// This planner is specific to the Church of St James the Apostle. The titular
// celebration is therefore a local solemnity, not the two-reading universal
// feast imported as Lectionary 605. Preserve the imported ID so saved plans and
// search results continue to refer to the same celebration.
//
// The universal Proper's 2 Corinthians passage becomes the second reading. The
// supplementary first reading and psalm follow the complete patronal solemnity
// set used for Saint James in Spain.
const LOCAL_CELEBRATION_OVERRIDES = {
  "sanctoral-605": {
    name: "Saint James the Apostle",
    rank: "Solemnity at St James",
    f: "Acts 11:19-21; 12:1-2, 24",
    p: "Psalm 67:2-3, 5, 7-8",
    e: "2 Corinthians 4:7-15",
    g: "Matthew 20:20-28",
    source: "Parish titular solemnity — Proper of Saint James with supplementary patronal readings",
  },
};

const MONTHS = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

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

  celebrations.forEach(celebration => {
    const override = LOCAL_CELEBRATION_OVERRIDES[celebration.id];
    if (override) Object.assign(celebration, override);
  });

  celebrations.sort((a, b) => a.monthDay.localeCompare(b.monthDay) || a.name.localeCompare(b.name));
  const outputPath = path.join(GENERATED_DATA, "celebrations.json");
  const commonsPath = path.join(GENERATED_DATA, "commons.json");
  fs.writeFileSync(outputPath, JSON.stringify(celebrations));
  fs.writeFileSync(commonsPath, JSON.stringify(commons));
  console.log("wrote", celebrations.length, "standard celebrations to", outputPath);
  console.log("wrote", commons.length, "Commons with", commons.reduce((total, common) =>
    total + common.firstOutsideEaster.length + common.firstEaster.length
      + common.psalm.length + common.second.length + common.gospel.length, 0), "reading options to", commonsPath);
  const james = celebrations.find(item => item.id === "sanctoral-605");
  console.log("St James:", james || "MISSING");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
