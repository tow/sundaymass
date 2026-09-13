# Calendar and lectionary

The planner calculates the Finnish liturgical calendar locally at runtime, for Sundays and
for any other date, and stores each distinct Sunday and weekday lectionary set once. It
separately carries a searchable catalogue of standard celebrations and Commons for rare
editor overrides. Browser domain logic resolves those catalogues into usable, role-aware
choices at runtime.

This is an independent planning aid, not an authoritative Finnish lectionary or parish
Ordo. National, diocesan, later-decreed, or current-Ordo choices may differ. The UI must
continue to tell editors to confirm exceptional choices against the parish Ordo.

## Data boundary

Calendar calculation and reading selection are deliberately separate:

```text
liturgical-calendar.js
  selected date -> title, season, cycle, rank, lectionary key
                         |
                         v
sunday-lectionary.json          weekday-lectionary.json
  one set per Sunday/cycle        one set per weekday of the Proper of Time

celebrations.json --references--> commons.json
          \                           /
           +---- runtime resolution -+
                         |
                         v
                 readings_text.json
                 full text by citation
```

The calculated day's `l` key joins to exactly one record through
`LectionaryCatalog.scheduledCelebration()`: a `sunday-lectionary.json` template
(`A|Christmas`), a `weekday-lectionary.json` set (`II|Ordinary Time|30|Friday`, tried
first in its Sunday-cycle variant `v`), or a celebration (`celebration:sanctoral-543`).
No dated dataset is built, checked in, embedded, downloaded, or cached.

This boundary keeps date selection deterministic and offline-capable without
materializing decades of occurrences. A saved celebration override is different: it
is intentionally a complete resolved snapshot of the choices an editor reviewed.

## Generated files

| File | Current role |
|---|---|
| `lectionary_table.json` | Harvested A/B by-date citation input |
| `readings_master.json` | Normalized Sunday and fixed-feast citation source |
| `sunday-lectionary.json` | 207 distinct scheduled reading sets |
| `weekday-lectionary.json` | 540 weekday reading sets, including Sunday-cycle variants |
| `celebrations.json` | 235 usable Proper/Finnish celebrations |
| `commons.json` | Seven role-specific Common groups |
| `readings_text.json` | 974 current selectable citation-to-full-text entries |

Counts are useful diagnostics, not permanent schema constants. Executable tests verify
that runtime dates resolve uniquely, every runtime key has a complete template,
selectable celebrations are usable, required second readings exist, alternatives
remain selectable, and every generated citation has text.

## Build pipeline

The full data rebuild is ordered:

1. `scripts/harvest.js` enumerates dates and harvests Years A and B citations from the
   public `cpbjr/catholic-readings-api` data.
2. `scripts/build_readings.js` merges those citations with Year C, displaced weeks, and
   fixed feasts. Year C comes from the Felix Just tables because the harvested 2025
   source is known to mislabel All Souls.
3. `scripts/build_sunday_lectionary.js` converts the normalized sources directly into
   cycle-keyed reading templates. It does not enumerate calendar dates.
4. `scripts/build_weekday_lectionary.js` inverts Felix Just's scripture indexes of the
   weekday and Sunday Lectionary into one reading set per weekday of the Proper of Time,
   plus Ascension, Sacred Heart, Holy Thursday, and Good Friday by cycle. It shares
   citation normalization with the celebrations importer
   (`scripts/lectionary-citations.js`) and corrects a few source typos, each commented.
5. `scripts/build_celebrations.js` imports the Proper of Saints, explicit alternatives,
   Common references, and all seven Commons from the 2002 US lectionary citation
   indexes. It then applies Finnish and parish-specific entries.
6. `scripts/extract_readings.js` collects every distinct selectable citation and
   extracts public-domain full text.
7. `scripts/build-app.js` embeds the generated catalogues in the planner. It does not
   decide which lectionary options are valid.

The browser rules live in `src/domain/lectionary.js`, separately from rendering and
persistence.

### Rebuild commands

A normal application build uses the checked-in generated JSON:

```bash
npm ci
npm run build
npm run check
```

A full source refresh requires network access for the citation catalogues:

```bash
npm ci
bash scripts/fetch_sources.sh
node scripts/harvest.js
node scripts/build_readings.js
node scripts/build_sunday_lectionary.js
node scripts/build_weekday_lectionary.js
node scripts/build_celebrations.js
node scripts/extract_readings.js
npm run check
```

Review every generated-data diff. Do not refresh an upstream source and assume identical
structure, abbreviations, or liturgical coverage.

## Finland calendar corrections

`src/domain/liturgical-calendar.js` implements Gregorian Easter, the Sunday cycle,
seasons, movable Sundays, and the Finland-specific fixed celebrations needed by this
planner:

- Epiphany remains fixed on 6 January, a Finnish public holiday, rather than being
  transferred to a Sunday. A displaced early-January Sunday becomes the Second Sunday
  after Christmas or the Baptism of the Lord as appropriate.
- All Souls replaces an Ordinary Time Sunday when 2 November falls on Sunday.
- Saint Henry, patron of Finland, is a solemnity with the currently encoded option-one
  readings from the Finnish diocesan Ordo.

The runtime calculator returns only a date, display metadata, and a lectionary key.
`scripts/build_sunday_lectionary.js` rejects incomplete reading templates. Tests compare
every Sunday from 2025 through 2075 with an independent development-only `romcal`
oracle, exercise navigation beyond that former horizon, and prove across 1900–2200 that
every calculated key resolves to exactly one complete reusable template. `romcal` is
not included in the browser bundle.

## Weekdays and other non-Sunday dates

`LiturgicalCalendar.resolveDay()` gives any date its default celebration. Sundays go to
`resolveSunday()` unchanged. Any other date is the weekday of the Proper of Time unless a
solemnity or feast takes precedence, following the Table of Liturgical Days:

- **Weekday cycle.** Ordinary Time weekdays use Year I in odd years and Year II in even
  years; other seasons repeat every year. A few days replace one reading in a particular
  Sunday cycle (Monday of the 1st Week of Advent in Year A), stored as variants.
- **Finland.** Epiphany is 6 January, so the Christmas weekdays after it follow their
  dates (January 7–12); the Ascension is on its Thursday; Saint Henry is a solemnity.
- **Precedence.** Solemnities and feasts on fixed dates are listed in
  `FIXED_CELEBRATIONS`. A feast yields to a Sunday, a solemnity, or a privileged day (Ash
  Wednesday, Holy Week, the Easter Octave). An impeded solemnity moves: Saint Joseph in
  Holy Week to the Saturday before Palm Sunday, the Annunciation in Holy Week or the Easter
  Octave to the Monday after the Second Sunday of Easter, and any other to the next day
  free of a solemnity or feast (the Immaculate Conception from an Advent Sunday to 9
  December).
- **Readings.** A weekday uses its `weekday-lectionary.json` set. Christmas, Mary Mother
  of God, Epiphany, Holy Family, All Souls, and the June, August, and November
  solemnities use their Sunday templates, so they read the same whichever day they fall
  on. Other celebrations use their `celebrations.json` entry with its Proper and Common
  defaults. Holy Saturday has no Mass by day and no readings.

Tests compare every weekday from 2025 through 2075 with romcal's Finland calendar
(`epiphanyOnJan6`), check every weekday from 2000 through 2100 resolves to readings that
parse and have text, and pin representative dates. `scripts/verify_weekday_readings.js`
compares the defaults with the USCCB readings published by cpbjr for 2025–2027; it needs
the network and its differences are reviewed by hand. In the last review, 106 of 736
weekdays differed, all for these reasons: the US calendar (Epiphany on a Sunday and the
weekdays after it, Thanksgiving, Our Lady of Guadalupe), the Finnish and parish days
below, memorials the USCCB page gives proper readings, the Easter Vigil listed on Holy
Saturday, a week of October 2025 shifted by a day in cpbjr, and verse-letter or
punctuation differences between the two sources.

### Assumptions

These are planner defaults, not claims about the current Finnish diocesan Ordo:

- **Memorials keep the weekday readings.** Obligatory and optional memorials, including
  those with a proper reading (Saint Martha, Our Lady of Sorrows, Mary Mother of the
  Church), are not defaults; an editor chooses them through the celebration picker.
- **The Finnish feasts are the universal list plus the European co-patrons.** Saints
  Cyril and Methodius, Catherine of Siena, Benedict, Bridget of Sweden, and Teresa
  Benedicta of the Cross are feasts, taken from romcal's Finland calendar. Their readings
  are the US Proper of Saints entries for the same saints.
- **Saint James is a solemnity on weekdays too,** as the parish's titular celebration. When
  25 July is a Sunday the Sunday of Ordinary Time is kept, as the Sunday calendar already
  does.
- **Clashing solemnities.** When the Sacred Heart falls on 24 June the Birth of John the
  Baptist is anticipated to 23 June, as in 2022; when Corpus Christi takes Sunday 24 June,
  or the Sacred Heart takes 29 June, the saint moves to the next free day. romcal omits
  the saint in these years (2033, 2044, 2057, 2068).
- **Feasts are celebrated in Lent.** A feast outranks a Lent weekday; romcal instead
  reduces the Chair of Saint Peter and Saints Cyril and Methodius to commemorations then.
- **The Mass of the day.** Holy Thursday is the Mass of the Lord's Supper, December 24 the
  morning Mass, and vigil Masses are not defaults.
- **Readings follow the US Lectionary.** The weekday readings themselves are universal,
  but citations and verse divisions follow the 1998/2002 US edition, and the Tobit
  canticle keeps the source's Vulgate verse numbers.

### Missing information

- **The Finnish national calendar.** Confirm against the diocese of Helsinki's Ordo which
  days are solemnities and feasts in Finland, whether any US Proper of Saints entry
  differs from the Finnish one, and whether Finland has further proper celebrations
  above memorial rank.
- **Transfers.** Confirm how the diocese handles the clashing solemnities above and a
  Sunday 25 July at Saint James.
- **Source discrepancies.** The celebrations source gives Luke 6:12-19 for Saints Simon
  and Jude where the USCCB gives Luke 6:12-16. Several Sunday templates carry citations
  the reading editor cannot parse (`137:1-2` without its book, `Psalm 23: 1-3a`,
  `6 and 8`).

## Proper celebrations and Commons

The Proper importer keeps:

- explicit Proper citations;
- printed `or` alternatives rather than silently choosing one;
- source order;
- normalized full book names;
- references to Common IDs instead of expanding every combination; and
- separate Common first-reading lists for Easter and outside Easter.

The runtime resolution algorithm is:

1. Expand every explicit `or` into independently selectable citations.
2. Put the celebration's direct Proper choices first.
3. Add choices from each referenced Common only to the same reading role.
4. For a Common's first reading, use its Easter list during Easter and its
   outside-Easter list otherwise.
5. Remove duplicates without changing Proper-before-Common or source order.
6. Remove citations that cannot be parsed structurally or have no embedded full text.
7. Require at least one usable first reading, Psalm, and Gospel before offering a
   celebration.
8. Default each role to its first Proper choice, or the Common's first usable choice
   when no Proper exists.

Feasts and memorials may validly have no second reading. The picker offers Common second
readings but retains “No second reading” as the default unless the Proper supplies one.
Sundays and solemnities require a usable second reading and never offer the empty
choice.

The imported catalogue is comprehensive for the explicit choices and Commons printed
in its source indexes. It does not guarantee exhaustive Finnish national, diocesan, or
current-Ordo coverage.

## Local titular solemnity of Saint James

The universal Proper celebrates Saint James as a feast with one reading, a Psalm, and
the Gospel. At the church dedicated to Saint James, the titular celebration is a local
solemnity and therefore needs a first reading, second reading, and Gospel.

`scripts/build_celebrations.js` deliberately transforms stable entry `sanctoral-605`:

- First Reading: `Acts 11:19-21; 12:1-2, 24`
- Psalm: `Psalm 67:2-3, 5, 7-8`
- Second Reading: `2 Corinthians 4:7-15`
- Gospel: `Matthew 20:20-28`

The universal Proper's apostolic reading is retained as the second reading. The
supplementary first reading and Psalm form the encoded patronal default. This remains a
planner default, not a claim about the current Finnish diocesan Ordo.

Keep this transformation after the upstream import and preserve the ID. Editing only
`celebrations.json` would be erased by the next refresh and changing the ID would break
saved references and search expectations.

## Individual reading sanity checks

The individual-reading editor is rarer and more permissive than the standard
celebration flow, but it does not accept arbitrary text.

`src/domain/lectionary.js` builds a separate catalogue for each role from Sunday sets,
Proper celebrations, and Commons:

- First Reading includes the normal Old Testament corpus and valid Easter first
  readings such as Acts.
- Responsorial Psalm includes Psalms and the small number of lectionary biblical
  canticles catalogued for that role.
- Second Reading contains citations actually catalogued for that role.
- Gospel contains the Gospel passages catalogued for that role.

A typed citation must:

1. parse into a book plus one or more structured chapter/verse segments;
2. exist in the catalogue for the selected role;
3. have embedded full text; and
4. contain one citation only, after an explicit `or` option is selected.

Unknown citations, malformed structures, wrong-role passages, and missing full text are
blocked. A normal computed or explicit Ordo option can be used directly. Another valid
catalogued passage for that role requires the editor to tick the non-standard
confirmation before “Use reading” is enabled.

Typing only validates and previews. Persistence happens only on the explicit use action.
The saved structured snapshot records its origin, translation, text version, and
Ordo-check status.

## Full-text sources and formatting

`scripts/extract_readings.js` uses:

- public-domain World English Bible text for most books; and
- KJV with Apocrypha for deuterocanonical books not present in that source.

This is not necessarily the translation proclaimed at Mass. Recording a citation and
displaying this planning text does not license a copyrighted official lectionary
translation.

Important extraction rules:

- Psalm numbering is mapped chapter by chapter from Lectionary/NAB Hebrew numbering to
  the source numbering. Do not replace this with a blanket one-verse offset.
- Catholic Daniel 3:24 onward maps to the separately stored Prayer of Azariah.
- Lettered fragments such as `3a` and `3b` currently expand to the whole source verse.
- Visible verse numbers use superscript digits followed by U+202F NARROW NO-BREAK
  SPACE. This prevents the number being orphaned at the end of a line.
- A gap between non-consecutive verses is rendered exactly as `[...]`.

The reading presentation layer preserves that text; it must not normalize the narrow
no-break space back to ordinary or thin whitespace.

## Overrides and future catalogue changes

Selecting a different standard celebration resolves its actual readings before save.
The stored snapshot includes the celebration metadata and final citations, while the
database clears individual reading overrides atomically. This prevents an older
fine-tuning choice leaking into a newly selected Mass.

Because the snapshot is resolved, correcting generated catalogues later does not
silently change a previously selected Mass. An editor must deliberately restore the
computed celebration or select a corrected standard celebration.

When adding a national or diocesan Proper:

1. encode it in the appropriate generator, not only generated JSON;
2. use a stable ID;
3. include every explicit alternative;
4. provide full text for every selectable citation;
5. classify each citation by its actual reading role;
6. update source/provenance notes;
7. add a focused red test before the data or rule change; and
8. run the complete unit and local-Supabase suites before committing generated
   catalogue changes.

See [`testing.md`](testing.md) for the lectionary invariant tests and
[`data-model.md`](data-model.md) for persisted override shapes.
