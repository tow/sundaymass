// Builds data/generated/weekday-lectionary.json: the readings for every day of the Proper
// of Time that is not a Sunday, keyed the way LiturgicalCalendar.resolveDay() names days.
//
// Both sources are Felix Just's scripture indexes of the Lectionary for Mass. The weekday
// index lists every weekday reading with its day and Year I/II; inverting it gives each
// day's complete set. The Sunday index supplies the solemnities of the Lord that can fall
// on a weekday (Ascension, Sacred Heart) and the Triduum. Saints' days come from
// celebrations.json instead, and Christmas, Mary Mother of God, Epiphany, and All Souls
// already have Sunday-lectionary templates.
const fs = require("fs");
const path = require("path");
const { expandBook, textFromHtml } = require("./lectionary-citations.js");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "data", "generated", "weekday-lectionary.json");
const WEEKDAY_INDEX_URL = "https://catholic-resources.org/Lectionary/Index-Weekdays.htm";
const SUNDAY_INDEX_URL = "https://catholic-resources.org/Lectionary/Index-Sundays.htm";

const WEEKDAYS = {
  Mon: "Monday", Tues: "Tuesday", Wed: "Wednesday", Thurs: "Thursday", Fri: "Friday", Sat: "Saturday",
  Monday: "Monday", Tuesday: "Tuesday", Wednesday: "Wednesday", Thursday: "Thursday",
  Friday: "Friday", Saturday: "Saturday",
};
const ROLE_KEYS = { first: "f", psalm: "p", second: "e", gospel: "g" };

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

// Each index is one table in four sections, each opened by a header row naming its role.
function indexRows(html) {
  let section = null;
  const rows = [];
  for (const match of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...match[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map(cell => textFromHtml(cell[1]).replace(/&[lr]squo;|[‘’]/g, "'").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")"));
    if (/^Old Testament Reading/i.test(cells[0])) section = "ot";
    else if (/^Gospel Reading/i.test(cells[0])) section = "gospel";
    else if (/^New Testament Reading/i.test(cells[0])) section = "nt";
    else if (/^Responsorial Psalm/i.test(cells[0])) section = "psalm";
    else if (section && cells.length >= 3 && /\d/.test(cells[0])) rows.push({ section, cells });
  }
  return rows;
}

// Corrections to the source index, each checked against the printed Lectionary number.
const SOURCE_CORRECTIONS = {
  // Lectionary 224 answers with Psalm 19; the index prints "Ps 20", which has ten verses.
  "Ps 20:8, 9, 10, 15": "Ps 19:8, 9, 10, 15",
  // Lectionary 230 answers with Psalm 79, as the index prints it everywhere else.
  "Ps 78:8, 9, 11+13": "Ps 79:8, 9, 11+13",
  // Lectionary 237 and 279 join Psalm 42 to Psalm 43; the index repeats "42".
  "Ps 42:2, 3; 42:3, 4": "Ps 42:2, 3; 43:3, 4",
  "Ps 42:2-3; 42:3, 4": "Ps 42:2-3; 43:3, 4",
  // Addition C to Esther, in the Vulgate chapter numbering the extracted text uses.
  "Esth C:12, 14-16, 23-25": "Esth 14:1, 3-5, 12-14",
};

function citation(value) {
  // "[Vulg.]" marks the Tobit canticle's Vulgate verse numbers; the numbers are kept.
  // "12ab[cd]" prints optional verse parts in brackets; the verse is read whole.
  return (SOURCE_CORRECTIONS[value] || value).replace(/\s*\[Vulg\.\]/, "").replace(/\[([a-z]+)\]/g, "$1")
    .split(/\s+or\s+/i)
    .map(option => expandBook(option.replace(/^([1-3])(?=[A-Za-z])/, "$1 ")))
    .join(" or ");
}

const days = new Map();

function day(id, name) {
  if (!days.has(id)) days.set(id, { id, n: name, f: [], p: [], e: [], g: [] });
  return days.get(id);
}

function add(id, name, role, value) {
  const readings = day(id, name)[ROLE_KEYS[role]];
  if (!readings.includes(value)) readings.push(value);
}

function ordinal(value) {
  const remainder = value % 100;
  if (remainder >= 11 && remainder <= 13) return `${value}th`;
  return `${value}${({ 1: "st", 2: "nd", 3: "rd" })[value % 10] || "th"}`;
}

function monthDay(month, dayOfMonth) {
  return `${month}-${String(dayOfMonth).padStart(2, "0")}`;
}

// The role a weekday-index row fills: its section, unless the label says otherwise.
function weekdayRole(section, note) {
  if (/resp\./i.test(note)) return "psalm";
  if (/2nd Reading/i.test(note)) return "second";
  if (section === "gospel") return "gospel";
  if (section === "psalm") return "psalm";
  return "first";
}

// Returns the days a weekday-index label contributes to, or null for a label this
// catalogue deliberately leaves out (saints' days, optional Masses, Chrism Mass).
function weekdayTargets(label, year) {
  const years = year === "1" ? ["I"] : year === "2" ? ["II"] : ["I", "II"];
  let match = label.match(/^Ord\. Time, Week (\d+), (\w+)(?: \((resp\. - note 2|Year ([ABC]))\))?$/);
  if (match) {
    const [, week, weekday, note, cycle] = match;
    const name = `${WEEKDAYS[weekday]} of the ${ordinal(Number(week))} Week in Ordinary Time`;
    return {
      note: note || "",
      ids: years.map(value => [`${cycle ? `${cycle}|` : ""}${value}|Ordinary Time|${week}|${WEEKDAYS[weekday]}`, name]),
    };
  }
  match = label.match(/^Advent, Week (\d), (\w+)(?: \(in Year ([ABC])\))?$/);
  if (match) {
    const [, week, weekday, cycle] = match;
    return {
      note: "",
      ids: [[`${cycle ? `${cycle}|` : ""}Advent|${week}|${WEEKDAYS[weekday]}`, `${WEEKDAYS[weekday]} of the ${ordinal(Number(week))} Week of Advent`]],
    };
  }
  match = label.match(/^Advent, Dec\. (\d+)(?: \((opt\. [12]|resp\. - note 2|morning Mass)\))?$/);
  if (match) {
    return { note: match[2] || "", ids: [[`Advent|${monthDay("12", match[1])}`, `December ${match[1]}`]] };
  }
  match = label.match(/^\d+th Day in Xmas Octave, Dec\. (\d+)$/);
  if (match) {
    return { note: "", ids: [[`Christmas|${monthDay("12", match[1])}`, `December ${match[1]}, within the Octave of Christmas`]] };
  }
  match = label.match(/^Christmas Weekday: Jan\. (\d)$/);
  if (match) return { note: "", ids: [[`Christmas|${monthDay("01", match[1])}`, `January ${match[1]}, Christmas Weekday`]] };
  // Finland keeps Epiphany on 6 January, so the weekdays after it follow their dates.
  match = label.match(/^\w+ after Epiphany, or Jan\. (\d+)$/);
  if (match) return { note: "", ids: [[`Christmas|${monthDay("01", match[1])}`, `January ${match[1]}, Christmas Weekday`]] };
  match = label.match(/^Ash Wednesday(?: \(((?:1st|2nd) Reading) - note 4\))?$/);
  if (match) return { note: match[1] || "", ids: [["Ash Wednesday", "Ash Wednesday"]] };
  match = label.match(/^(Thursday|Friday|Saturday) after Ash Wed\.$/);
  if (match) return { note: "", ids: [[`Lent|0|${match[1]}`, `${match[1]} after Ash Wednesday`]] };
  match = label.match(/^Lent, Week (\d), (\w+)(?: \((resp\. - note 2|Year ([ABC]))\))?$/);
  if (match) {
    const [, week, weekday, note, cycle] = match;
    return {
      note: cycle ? "" : note || "",
      ids: [[`${cycle ? `${cycle}|` : ""}Lent|${week}|${WEEKDAYS[weekday]}`, `${WEEKDAYS[weekday]} of the ${ordinal(Number(week))} Week of Lent`]],
    };
  }
  match = label.match(/^Holy Week, (Mon|Tues|Wed)$/);
  if (match) return { note: "", ids: [[`Holy Week|${WEEKDAYS[match[1]]}`, `${WEEKDAYS[match[1]]} of Holy Week`]] };
  match = label.match(/^Easter Octave, (\w+)$/);
  if (match) return { note: "", ids: [[`Easter|1|${WEEKDAYS[match[1]]}`, `${WEEKDAYS[match[1]]} within the Octave of Easter`]] };
  match = label.match(/^Easter, Week (\d), (\w+)(?: \(Year ([ABC])\)| morn\.)?$/);
  if (match) {
    const [, week, weekday, cycle] = match;
    return {
      note: "",
      ids: [[`${cycle ? `${cycle}|` : ""}Easter|${week}|${WEEKDAYS[weekday]}`, `${WEEKDAYS[weekday]} of the ${ordinal(Number(week))} Week of Easter`]],
    };
  }
  return null;
}

// The Sunday-index celebrations that can fall on a weekday in Finland.
function sundayTargets(label, lectionary) {
  const cycles = (lectionary.match(/-([ABC]+)$/)?.[1] || "ABC").split("");
  let match = label.match(/^Ascension of the Lord(?: \(opt\. ([BC])\))?$/);
  if (match) return { note: "", ids: cycles.map(cycle => [`${cycle}|Ascension`, "Ascension of the Lord"]) };
  if (/^Friday after 2nd Sun after Pentecost: Sacred Heart$|^Sacred Heart Friday \(Response - note 4\)$/.test(label)) {
    return {
      note: /Response/.test(label) ? "resp." : "",
      ids: cycles.map(cycle => [`${cycle}|Sacred Heart`, "Most Sacred Heart of Jesus"]),
    };
  }
  if (/^Holy Thursday: Mass of the Lord'?s? ?Supper$/.test(label)) {
    return { note: "", ids: [["Holy Thursday", "Holy Thursday — Mass of the Lord's Supper"]] };
  }
  if (/^Good Friday of the Lord'?s? ?Passion$/.test(label)) {
    return { note: "", ids: [["Good Friday", "Good Friday of the Passion of the Lord"]] };
  }
  return null;
}

// In the Sunday index, New Testament readings are second readings, except the Acts and
// Revelation passages that replace the Old Testament reading.
function sundayRole(section, note, value) {
  if (/resp\./i.test(note)) return "psalm";
  if (section === "gospel") return "gospel";
  if (section === "psalm") return "psalm";
  if (section === "nt" && !/^(Acts|Revelation)\b/.test(value)) return "second";
  return "first";
}

(async () => {
  const [weekdayHtml, sundayHtml] = await Promise.all([
    fetchText(WEEKDAY_INDEX_URL),
    fetchText(SUNDAY_INDEX_URL),
  ]);
  const optionFirstReadings = new Map();

  indexRows(weekdayHtml).forEach(({ section, cells: [reference, label, year] }) => {
    const target = weekdayTargets(label, year);
    if (!target) return;
    const value = citation(reference);
    // December 21 prints its two first readings as separate options.
    if (/^opt\./.test(target.note)) {
      const [[id, name]] = target.ids;
      optionFirstReadings.set(`${id}|${target.note}`, { id, name, value });
      return;
    }
    const role = weekdayRole(section, target.note);
    target.ids.forEach(([id, name]) => add(id, name, role, value));
  });
  [...optionFirstReadings.keys()].sort().forEach(key => {
    const { id, name, value } = optionFirstReadings.get(key);
    add(id, name, "first", value);
  });

  indexRows(sundayHtml).forEach(({ section, cells: [reference, lectionary, label] }) => {
    const target = sundayTargets(label, lectionary);
    if (!target) return;
    const value = citation(reference);
    const role = sundayRole(section, target.note, value);
    target.ids.forEach(([id, name]) => add(id, name, role, value));
  });

  // A weekday's Sunday-cycle variant (Monday of the 1st Week of Advent in Year A) replaces
  // only the reading it prints; the ordinary day supplies the rest. Ascension and Sacred
  // Heart are complete per cycle and have no base day.
  const records = [...days.values()].map(record => {
    const variant = record.id.match(/^[ABC]\|(.+)$/);
    const base = variant && !/^(Ascension|Sacred Heart)$/.test(variant[1]) ? days.get(variant[1]) : null;
    if (variant && base === undefined) throw new Error(`No ordinary day for variant ${record.id}`);
    const pick = key => (record[key].length ? record[key] : base?.[key] || []).join(" or ");
    return { id: record.id, n: record.n, f: pick("f"), p: pick("p"), e: pick("e"), g: pick("g") };
  });

  const incomplete = records.filter(record => !record.f || !record.p || !record.g);
  if (incomplete.length) {
    throw new Error(`Incomplete weekday reading sets: ${incomplete.map(record => record.id).join(", ")}`);
  }
  records.sort((a, b) => a.id.localeCompare(b.id));
  fs.writeFileSync(OUTPUT, `${JSON.stringify(records, null, 1)}\n`);
  console.log(`written ${records.length} weekday reading sets`);
})();
