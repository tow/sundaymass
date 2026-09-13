// Citation handling shared by the importers of catholic-resources.org lectionary tables,
// so every generated catalogue spells a passage the same way and its text is found once.
const BOOKS = {
  Gen: "Genesis", Exod: "Exodus", Lev: "Leviticus", Num: "Numbers", Deut: "Deuteronomy",
  Josh: "Joshua", Judg: "Judges", Ruth: "Ruth", "1 Sam": "1 Samuel", "2 Sam": "2 Samuel",
  "1 Kgs": "1 Kings", "2 Kgs": "2 Kings", "1 Chr": "1 Chronicles", "2 Chr": "2 Chronicles",
  "1 Chron": "1 Chronicles", "2 Chron": "2 Chronicles",
  Ezra: "Ezra", Neh: "Nehemiah", Tob: "Tobit", Jdt: "Judith", Esth: "Esther",
  "1 Macc": "1 Maccabees", "2 Macc": "2 Maccabees", "1 Mac": "1 Maccabees", "2 Mac": "2 Maccabees", Job: "Job", Ps: "Psalm",
  Prov: "Proverbs", "Eccl/Qoh": "Ecclesiastes", Eccl: "Ecclesiastes", Song: "Song of Songs", Songs: "Song of Songs", Wis: "Wisdom",
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

module.exports = { BOOKS, decodeEntities, expandBook, textFromHtml };
