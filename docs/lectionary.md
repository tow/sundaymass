# Calendar and lectionary

The planner calculates the Finnish Sunday calendar locally at runtime and stores each
distinct Sunday lectionary set once. It separately carries a searchable catalogue of
standard celebrations and Commons for rare editor overrides. Browser domain logic
resolves those catalogues into usable, role-aware choices at runtime.

This is an independent planning aid, not an authoritative Finnish lectionary or parish
Ordo. National, diocesan, later-decreed, or current-Ordo choices may differ. The UI must
continue to tell editors to confirm exceptional choices against the parish Ordo.

## Data boundary

Calendar calculation and reading selection are deliberately separate:

```text
liturgical-calendar.js
  selected date -> title, season, cycle, lectionary key
                         |
                         v
sunday-lectionary.json
  one canonical citation set per distinct Sunday/cycle

celebrations.json --references--> commons.json
          \                           /
           +---- runtime resolution -+
                         |
                         v
                 readings_text.json
                 full text by citation
```

The calculated Sunday's `l` key joins to one `sunday-lectionary.json` record through
`LectionaryCatalog.scheduledCelebration()`. No dated Sunday dataset is built, checked
in, embedded, downloaded, or cached.

This boundary keeps date selection deterministic and offline-capable without
materializing decades of occurrences. A saved celebration override is different: it
is intentionally a complete resolved snapshot of the choices an editor reviewed.

## Generated files

| File | Current role |
|---|---|
| `lectionary_table.json` | Harvested A/B by-date citation input |
| `readings_master.json` | Normalized Sunday and fixed-feast citation source |
| `sunday-lectionary.json` | 207 distinct scheduled reading sets |
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
4. `scripts/build_celebrations.js` imports the Proper of Saints, explicit alternatives,
   Common references, and all seven Commons from the 2002 US lectionary citation
   indexes. It then applies Finnish and parish-specific entries.
5. `scripts/extract_readings.js` collects every distinct selectable citation and
   extracts public-domain full text.
6. `scripts/build-app.js` embeds the generated catalogues in the planner. It does not
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
