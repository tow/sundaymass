// Compares the planner's default weekday readings with cpbjr/catholic-readings-api for
// every weekday it publishes (2025-2027, USCCB calendar). A development check that needs
// the network; the differences it reports are reviewed by hand, and the expected kinds
// are described in docs/lectionary.md.
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const calendar = require(path.join(ROOT, "src/domain/liturgical-calendar.js"));
require(path.join(ROOT, "src/domain/lectionary.js"));
const catalog = global.LectionaryCatalog.create({
  liturgicalCalendar: calendar,
  sundayLectionary: require(path.join(ROOT, "data/generated/sunday-lectionary.json")),
  weekdayLectionary: require(path.join(ROOT, "data/generated/weekday-lectionary.json")),
  celebrations: require(path.join(ROOT, "data/generated/celebrations.json")),
  commons: require(path.join(ROOT, "data/generated/commons.json")),
  readings: require(path.join(ROOT, "data/generated/readings_text.json")),
});

const [start = "2025-08-01", end = "2027-12-31"] = process.argv.slice(2);

// Compare passages, not typography: book, chapter, and verse numbers only.
function normalized(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\bpsalms?\b/g, "ps")
    .replace(/[—–]/g, "-")
    .replace(/\band\b/g, "+")
    .replace(/[^a-z0-9:+,;-]/g, "")
    .replace(/[,;+]/g, ",");
}

(async () => {
  const differences = [];
  let compared = 0;
  for (let iso = start; iso <= end; iso = calendar.addDays(iso, 1)) {
    const day = calendar.resolveDay(iso);
    if (day.r === "Sunday") continue;
    const [year, month, date] = iso.split("-");
    const response = await fetch(`https://raw.githubusercontent.com/cpbjr/catholic-readings-api/main/readings/${year}/${month}-${date}.json`);
    if (!response.ok) continue;
    const source = (await response.json()).readings || {};
    const ours = catalog.scheduledCelebration(day).readings;
    compared += 1;
    const roles = { first: "firstReading", psalm: "psalm", second: "secondReading", gospel: "gospel" };
    const differing = Object.entries(roles).filter(([role, key]) => {
      const options = catalog.citationAlternatives(ours[role]).map(normalized);
      return !(options.length ? options : [""]).includes(normalized(source[key]));
    });
    if (differing.length) {
      differences.push(`${iso} ${day.n} [${day.r}]\n${differing.map(([role, key]) => `    ${role}: ours "${ours[role]}" / cpbjr "${source[key] || ""}"`).join("\n")}`);
    }
  }
  console.log(`compared ${compared} weekdays; ${differences.length} differ`);
  differences.forEach(line => console.log(line));
})();
