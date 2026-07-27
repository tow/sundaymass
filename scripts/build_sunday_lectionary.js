const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const GENERATED_DATA = path.join(ROOT, "data", "generated");
const { bySlot, feastByName } = require("../data/generated/readings_master.json");

// These Finland-specific entries are not present in the upstream general-calendar
// source. They are cycle-independent, but each cycle gets its own stable key.
const LOCAL_READINGS = {
  "All Souls": {
    first: "Wisdom 3:1-9",
    psalm: "Psalm 23:1-3a, 3b-4, 5, 6",
    second: "Romans 5:5-11",
    gospel: "John 6:37-40",
  },
  "Second Sunday after Christmas": {
    first: "Sirach 24:1-4, 12-16",
    psalm: "Psalm 147:12-13, 14-15, 19-20",
    second: "Ephesians 1:3-6, 15-18",
    gospel: "John 1:1-18",
  },
  "Saint Henry, Bishop and Martyr": {
    first: "Sirach 45:12-20, 4-5",
    psalm: "Psalm 126:1-2, 2-3, 4-5, 6",
    second: "2 Corinthians 5:14-20",
    gospel: "John 4:34-39a",
  },
};

function displayName(name) {
  return name.replace(/ of Ordinary Time/, " in Ordinary Time");
}

function entry(cycle, name, readings) {
  const shownName = displayName(name);
  return {
    id: `${cycle}|${shownName}`,
    n: shownName,
    c: cycle,
    f: readings.first,
    p: readings.psalm,
    e: readings.second,
    g: readings.gospel,
  };
}

const entries = new Map();

function add(item) {
  if (entries.has(item.id)) {
    // A cycle-specific source row is more precise than the cycle-independent
    // fixed-feast fallback added later.
    return;
  }
  if (!item.f || !item.p || !item.e || !item.g) {
    throw new Error(`Incomplete Sunday lectionary entry for ${item.id}`);
  }
  entries.set(item.id, item);
}

Object.entries(bySlot).forEach(([slot, readings]) => {
  const match = slot.match(/^Year ([ABC]) \| (.+)$/);
  if (!match) throw new Error(`Unexpected Sunday slot key: ${slot}`);
  add(entry(match[1], match[2], readings));
});

["A", "B", "C"].forEach(cycle => {
  Object.entries(feastByName).forEach(([name, readings]) => {
    add(entry(cycle, name, readings));
  });
  Object.entries(LOCAL_READINGS).forEach(([name, readings]) => {
    add(entry(cycle, name, readings));
  });
});

const sundayLectionary = Array.from(entries.values())
  .sort((a, b) => a.id.localeCompare(b.id, "en"));

fs.writeFileSync(
  path.join(GENERATED_DATA, "sunday-lectionary.json"),
  JSON.stringify(sundayLectionary),
);

console.log("distinct Sunday lectionary sets:", sundayLectionary.length);
console.log("complete required readings:", sundayLectionary.length);
