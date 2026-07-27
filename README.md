# St James the Apostle 6pm Mass — Music Planner

A mobile-first tool for planning the sung parts of the 6pm Sunday Mass at St James the
Apostle. Pick any Sunday from 2025–2075, review the liturgical day and full text of all
four readings, choose the music, and generate a Word planning sheet with or without the
readings. Music choices are publicly viewable and authorized editors save changes live.

Live site: <https://tow.github.io/sundaymass/>

Current engineering work is tracked in
[`docs/HARDENING_PLAN.md`](docs/HARDENING_PLAN.md).

This is an independent planning aid, not an official parish or Diocese of Helsinki
publication. Liturgical details must always be checked against the parish Ordo.

**The standalone planner deliverable is `StJames_Mass_Planner.html`** (same planner as
`index.html`). The planner itself is self-contained and works offline — all data and
both Word templates are embedded. Deploy `repertoire.html` and `about.html` alongside
it for repertoire browsing and help.

For deployment, serve `index.html`, `repertoire.html`, and `about.html` together with
`supabase-config.js`, both files in `src/services/`, `data/generated/readings_text.json`,
`manifest.webmanifest`, `service-worker.js`, and `icons/`. On HTTPS, the planner can be
installed to a phone's home screen.

## Product decisions to preserve

- The primary job is to choose a Sunday and quickly print its music plan. Editing
  readings is deliberately secondary.
- Full reading texts are always visible on the page. The two print actions generate
  either music only or music plus readings; there is no separate print-settings panel.
- Reading citations near the top link to their corresponding full text.
- Public visitors see the live music plan. Authorized editors change it directly:
  there is no draft/publish workflow and every successful save is immediately live.
- Celebration and reading overrides are also live and public, but deliberately hidden
  behind the bottom-of-page editor button because they are rarely needed. The preferred
  override replaces the computed Sunday with another standard celebration and all of
  its readings atomically. Individual role-constrained reading changes remain a
  secondary fine-tuning option.
- There is one public music-plan view, not separate "live plan" and "preview" sections.
- Songs are canonical entities referenced by weekly plan slots. Editors choose an
  existing song or can always create another one, including when its title exactly
  matches an existing title. Titles are intentionally non-unique; UUIDs are identity.
- Songs have no hard Mass-part eligibility restriction. Any song can be found and
  assigned to any music slot in extremis. Each song does have editable
  `suggestion_parts`, however: these are a soft allow-list used only before semantic
  ranking. Thus a Psalm is not suggested for Communion, and a Memorial Acclamation is
  suggested only for that part, without preventing an editor from deliberately finding
  and choosing either song elsewhere. `communion` and `communion2` share one suggestion
  class. Unclassified songs are omitted from suggestions rather than guessed into
  several positions.
- Only a title is required when creating a song. YouTube, attribution, and lyrics can
  all be added later. Repertoire search is deliberately limited to alphabetical title
  and author matching. Semantic suggestions are shown separately in the song picker
  and never restrict which song can be chosen.
- Editing a canonical song immediately changes every Sunday which references it. This
  is an explicit product decision: the current small data set does not require weekly
  snapshots or immutable history.
- There are two separate Communion slots: `communion` and `communion2`.
- Copyright planning fields are `authors`, `copyrightOwner`, `copyrightYear`, and
  `source`. Source is optional and must not make an otherwise complete entry
  "incomplete". The current completeness rule requires authors, owner/publisher, and
  year; entering `Public domain` as the owner allows the year to be blank.
- Recording attribution does not itself grant permission to reproduce or project
  lyrics. That warning belongs in the help page.
- Full lyrics are hard-private: public and signed-in non-editor clients must never be
  able to retrieve them. `song_lyrics` is physically separate from public song metadata
  solely to enforce that database permission boundary; it is not a separate domain
  concept. Without this requirement, the extra table would not be justified.
- Song and reading embeddings are also private. Suggestions return only public song
  metadata to authorised editors and always draw from the known repertoire.

## Files to edit

`index.html` and `StJames_Mass_Planner.html` are generated files. Make planner UI,
behavior, and export changes in the appropriate source file:

- `src/planner.html` — page structure
- `src/styles/planner.css` — visual design and responsive layout
- `src/app/planner.js` — UI state, rendering, and event handling
- `src/domain/lectionary.js` — lectionary selection and validation rules
- `src/domain/songs.js` — song validation and phase-one title search
- `src/domain/plan-music-data.js` — database-row to browser-plan conversion
- `src/export/docx.js` — browser-side Word generation
- `src/services/plan-store.js` — Supabase/local persistence adapter
- `src/repertoire.html` — repertoire page structure
- `src/styles/repertoire.css` — repertoire layout
- `src/app/repertoire.js` — repertoire browsing, editing, and index management
- `src/services/repertoire-store.js` — Supabase/local repertoire adapter

Then run:

```bash
npm run build
```

Commit the generated HTML with its source change. Do not hand-edit only one generated
HTML file: the next build will overwrite it and the standalone version will diverge.

`about.html`, `service-worker.js`, and the manifest are maintained directly. The Word
layouts originate in `scripts/make_template.js` and `scripts/make_template2.js`.

### Repository layout

- `src/` contains browser application source grouped by responsibility.
- `scripts/` contains build and data-generation programs.
- `data/generated/` contains checked-in derived catalogues embedded by the build.
- `data/sources/` contains the ignored, downloadable public-domain Bible datasets.
- `tests/` contains Node tests for domain and data invariants.
- Root-level HTML, PWA files, Supabase configuration, and icons are deployable outputs
  for GitHub Pages.

## Live plans

Live data uses Supabase Auth, Postgres, Realtime, and Row Level Security:

- `plans` has one row per Sunday, a JSON `reading_overrides` object, and an optional
  `celebration_override`.
- `songs` owns the canonical title, YouTube link, attribution metadata, and audit
  fields. Its metadata is public. `title` has a non-unique lowercase search index and
  no uniqueness constraint.
- `plan_songs` assigns one canonical song UUID to each `(sunday, part)`. Assignments and
  current song metadata are public. `part` identifies the position in one Mass plan.
  `songs.suggestion_parts` separately records the normal positions in which a song may
  be recommended; it never imposes an assignment constraint.
- `song_lyrics` is an optional one-to-one extension keyed by song UUID. Anonymous users
  receive no table privileges at all. Authenticated access is further restricted by
  Row Level Security to members of `public.editors`. Public plan queries deliberately
  never join this table.
- `song_embeddings` and `reading_embeddings` contain 384-dimensional pgvector values.
  Both tables revoke all anonymous and authenticated access; only the service role used
  inside the Edge Function can read or write them. Song embeddings may be derived from
  private lyrics, so this boundary is as strict as the lyrics boundary.
- `semantic-songs` is an editor-only Supabase Edge Function. It uses Supabase’s built-in
  English `gte-small` model, so there is no external model API, model SDK, or API key.
  Long texts are split below the model’s 512-token limit and their normalized vectors
  are combined into one vector per canonical song or reading citation. The Supabase
  service role can also run maintenance indexing; that secret remains server-side and
  is never included in an app asset.
- The repertoire’s “Update suggestion index” action is deliberately manual and
  resumable for this very small installation. It batches the checked-in reading texts
  and song IDs through the Edge Function; unchanged content is skipped by SHA-256 hash.
  Creating or editing a song also refreshes that song’s vector immediately. On an
  editor visit, the repertoire compares each song/lyrics `updated_at` value with its
  vector timestamp and automatically repairs missing or stale song vectors. This gives
  reliable eventual consistency without cron, queues, webhooks, or another service.
- Song suggestions first keep only songs whose editable `suggestion_parts` contains
  the requested Mass position, then compare the effective reading citations currently
  displayed for the Mass with that compatible subset. The database combines each
  song’s best reading match with its average match and returns public metadata only.
  Search remains unrestricted, so this recommendation filter never controls what an
  editor may assign.
- Editors sign in with an administrator-created, manually confirmed email/password
  account. Public signup is disabled, so phase 1 requires no outgoing email service.
- A signed-in user can write only when their user ID is also in `public.editors`.
  Celebration RPCs repeat that membership check explicitly and run as `security
  invoker`; the `plans` insert/update Row Level Security policies are the final
  database boundary. Hiding the edit button is only a usability measure, not the
  authorization mechanism.
- Song operations save only after an explicit choose/create/edit/remove action, so
  ordinary typing in a form never triggers a Realtime rerender or steals mobile
  keyboard focus.
- `assign_plan_song` and `clear_plan_song` change one slot.
  `create_and_assign_song` atomically creates a title-only-or-richer song and assigns
  it. `update_song` updates canonical metadata plus the optional editor-only lyric row.
  Each RPC repeats the editor-membership check and uses the tables' RLS policies as the
  final boundary.
- `save_reading_override` stores one structured override with its citation, parsed book
  and verse segments, origin, translation/text version, and Ordo-check flag.
  `clear_reading_override` restores one or all slots to their computed selections.
- `save_celebration_override` stores the selected celebration, its normal calendar date,
  rank, lectionary number, and complete reading set. Selecting or restoring a
  celebration clears individual reading overrides atomically so stale fine-tuning
  cannot leak between Masses.
- The reading picker derives its allowed catalogue separately for first reading,
  responsorial psalm, second reading, and Gospel from the generated Sunday lectionary,
  Proper-celebration, and Commons catalogues. This is more accurate than a simple
  Old/New Testament rule: the first-reading corpus includes Easter readings from Acts,
  while the psalm slot includes a small number of biblical canticles.
- Selection is atomic. Typing only validates and previews; nothing is published until
  the editor presses “Use reading”. Known passages in the wrong slot, unknown
  citations, invalid structures, and passages with no embedded full text are blocked.
- HTTPS YouTube and `youtu.be` URLs are rendered as practice links; other hosts remain
  stored but are not exposed as clickable links.
- Migration `20260727020000_song_entities.sql` converts every non-empty legacy JSON
  entry before dropping the old column and function. It merges only records whose
  complete title/YouTube/attribution tuples match, never titles alone, and aborts if
  the number of created assignments differs from the source count.
- If no Supabase config is present, localhost and local-file builds fall back to
  `localStorage` with the same canonical-song operations so the flow can be tested
  without a project.

To connect a Supabase project:

1. Link the project and run `supabase db push` to apply the tracked migrations in
   `supabase/migrations/`.
2. Deploy the native embedding function with
   `supabase functions deploy semantic-songs`.
3. Put the project URL and publishable key in `supabase-config.js`.
4. Under Authentication → General Configuration, turn off **Allow new users to sign
   up**. Leave the Email/password provider enabled so administrator-created users can
   still sign in. Supabase calls this setting "signup"; disabling signup does **not**
   disable password sign-in for existing users. Email confirmation can remain enabled.
5. Under Authentication → Users, create each editor with an initial password and mark
   the account confirmed.
6. Add each editor's Auth user ID to `public.editors`.
7. Sign in on the repertoire page and press “Update suggestion index” once after the
   first deployment. The operation can safely be repeated or resumed after interruption.

The publishable browser key in `supabase-config.js` is public by design. Security comes
from RLS and editor membership, never from hiding that key. Never put a service-role key
in a browser file.

### Future authentication

Replace password entry with Supabase email magic-link login. Keep public signup disabled
and retain `public.editors` as the authorization check: possession of a valid login link
authenticates the user, but editor membership still decides whether they may write.

Magic links introduce an email-delivery dependency that phase 1 intentionally avoids.
Before switching, configure the production Site URL and exact allowed redirect URLs,
use a suitable production SMTP sender, and test the installed-PWA return flow as well as
normal Safari/Chrome login. Email templates, expiry, resend/rate-limit behavior, and the
unknown-email experience should be deliberately defined rather than left at Supabase
defaults.

## PWA and deployment notes

- GitHub Pages publishes the repository's `main` branch at the live URL above.
- `service-worker.js` caches the app shell and provides offline access. Navigations are
  network-first; other same-origin assets use the cached response while refreshing it.
- **Increment `CACHE_NAME` whenever a deployed app-shell file changes.** Without a new
  cache name, an installed home-screen app can continue showing stale HTML. Users may
  still need to close and reopen an already-running installed app once after deployment.
- Keep `about.html` as its own navigation cache target. Caching every navigation as
  `index.html` previously allowed the About response to replace the cached planner.
- The install button depends on `beforeinstallprompt` and therefore is normally an
  Android/Chromium affordance. On iPhone/iPad, installation is Safari Share → Add to
  Home Screen.

## How it works (data pipeline)

Everything is generated by Node scripts. Run order and purpose:

1. **`scripts/harvest.js`** — enumerates Sundays/solemnities via `romcal` and pulls USCCB reading
   *citations* by date from the public `cpbjr/catholic-readings-api` (raw GitHub) for
   Years A & B (2026–2027). Writes `data/generated/lectionary_table.json`. *(needs network)*
2. **`scripts/build_readings.js`** — merges the harvested A/B citations with Year C + displaced
   A/B weeks transcribed from Felix Just (catholic-resources.org), plus fixed feasts.
   Note: the API's 2025 Year C data is contaminated (All Souls mislabelled), so **Year C
   comes from Felix Just, not the API**. Writes `data/generated/readings_master.json`.
3. **`scripts/build_sunday_schedule.js`** — uses `romcal` with the **Finland** national
   calendar and applies the Finland corrections below. It writes two deliberately
   separate files:
   `data/generated/sunday-calendar.json`, containing each Sunday from 2025–2075 as a
   lightweight `{date, title, season, cycle, lectionary key}` occurrence, and
   `data/generated/sunday-lectionary.json`, containing each distinct A/B/C or fixed
   Sunday reading set once. The dated calendar does not duplicate reading citations.
4. **`scripts/build_celebrations.js`** — imports Proper readings, explicit `or` alternatives,
   and each celebration's references to a Common from Felix Just's
   [Proper of Saints](https://catholic-resources.org/Lectionary/2002USL-Sanctoral.htm).
   It separately imports all seven groups in the
   [Commons index](https://catholic-resources.org/Lectionary/2002USL-Masses-Commons.htm).
   It writes `data/generated/celebrations.json` (currently 235 usable dated
   celebrations) and `data/generated/commons.json` (seven Commons containing 239
   role-specific reading options).
   The importer keeps source order, normalizes book abbreviations, preserves explicit
   long/short and `or` choices, records referenced Common IDs instead of expanding a
   Cartesian product, and keeps Easter first-reading options separate from those used
   outside Easter. *(needs network only when refreshing the catalogue)*
5. **`scripts/extract_readings.js`** — resolves each distinct citation from the unique Sunday
   lectionary and celebration catalogues to full scripture text from
   the public-domain **World English Bible** (`data/sources/web.json`), falling back to
   **KJV-with-Apocrypha** (`data/sources/kjva.json`) for deuterocanonical books.
   Citations containing “or” are also expanded into individually selectable long/short
   alternatives. It preserves visible verse numbers in the resulting text and writes
   `data/generated/readings_text.json`. Verse numbers use superscript digits followed
   by U+202F NARROW NO-BREAK SPACE; do not replace it with U+2009 THIN SPACE, which can
   orphan a verse number at the end of a line. Gaps between non-consecutive verses are
   rendered exactly as `[...]`. *(see `scripts/fetch_sources.sh`)*
6. **`scripts/make_template.js`** / **`scripts/make_template2.js`** — build the 1-page
   and 2-page Word templates (docx-js) with `@@TOKEN@@` placeholders, and unzip their
   parts into `tpl/` and `tpl2/`. *(needs `docx` npm)*
7. **`src/domain/lectionary.js`** — contains the browser-side lectionary domain logic:
   citation parsing, `or` expansion, role catalogues, Easter-aware Common resolution,
   deduplication, full-text eligibility, scheduled calendar-to-lectionary resolution,
   and construction of selectable celebrations. It is intentionally separate from UI
   rendering. For a Proper celebration it places explicit readings first, then adds
   every usable option from each referenced Common. Missing full texts and citations
   that cannot be parsed structurally are not offered. A Common's second readings are
   offered but “No second reading” remains the default for feasts and memorials when
   the Proper itself does not specify one. Sundays and solemnities must have a usable
   second reading and never offer that empty option.
8. **`scripts/build-app.js`** — assembles `src/planner.html`,
   `src/styles/planner.css`, `src/app/planner.js`, the domain and DOCX modules, generated
   JSON catalogues, and both template part-sets into the final planner HTML. It also
   assembles the repertoire source into `repertoire.html`. It embeds the planner data
   but does not decide which lectionary options are valid.

### Calendar/lectionary data boundary

The dated calendar and the lectionary are separate domain concepts:

- A row in `data/generated/sunday-calendar.json` identifies when a celebration occurs and points to
  its lectionary entry through `l`. Calendar rows must never contain `f`, `p`, `e`, or
  `g` reading fields.
- `data/generated/sunday-lectionary.json` owns the canonical scheduled citation set for each Sunday
  title and cycle. The browser joins calendar → lectionary at runtime through
  `LectionaryCatalog.scheduledCelebration()`.
- `scripts/build_celebrations.js` deliberately transforms Lectionary 605 from the
  universal two-reading Feast of Saint James into this church's local titular
  solemnity. It keeps the stable `sanctoral-605` ID, moves the Proper's
  `2 Corinthians 4:7-15` to the second-reading slot, and supplies
  `Acts 11:19-21; 12:1-2, 24` with `Psalm 67:2-3, 5, 7-8` as the first reading
  and psalm. Keep this parish-specific override after the upstream import; do not
  edit only the generated JSON, because the next catalogue refresh would erase it.
- The distinction is intentional: the universal calendar celebrates Saint James
  as a **feast**, whose [Lectionary 605](https://bible.usccb.org/bible/readings/072524.cfm)
  provides one reading, a psalm, and the Gospel. In the church dedicated to Saint
  James, the titular celebration is a **local solemnity**, so Mass has a first
  reading, a second reading, and the Gospel. The universal Proper's apostolic
  reading is retained as the second reading and a suitable first reading and psalm
  are added. The default supplementary pair here follows the complete Saint James
  patronal set described in this
  [liturgy explanation](https://zenit.org/2018/07/03/3rd-readings-for-a-solemnity/).
  This is a planner default, not a claim to be the Finnish diocesan Ordo; an editor
  can still apply the readings actually approved for the parish celebration.
- A saved `celebration_override` remains a complete resolved snapshot rather than a
  lectionary pointer. This preserves exactly what an editor selected even if the
  catalogue is corrected later.

Keep this boundary when extending the rules: precompute the finite Finnish calendar,
but do not materialize another copy of the readings for every date.

### Alternative-celebration and Commons rules

The stored `celebration_override` is a resolved snapshot, not merely a pointer to a
saint or Common. The editor searches for a celebration, then chooses the actual first
reading, psalm, optional second reading, and Gospel before pressing “Use this
celebration”. The four selected citations are saved atomically with the celebration
name, rank, normal calendar date, lectionary number, and source. Public viewers and
printed documents therefore never have to re-run catalogue rules to interpret an old
plan.

The resolution rules are:

1. Start with every explicit Proper citation, expanding each printed `or` into
   independently selectable options.
2. Follow the celebration's `commonIds` and merge options only into the same reading
   role: first reading, psalm, second reading, or Gospel.
3. For the first reading, use the Common's New Testament/Easter list during Easter
   and its Old Testament/outside-Easter list otherwise.
4. Remove duplicates while preserving Proper-before-Common and source order.
5. Remove an option when its citation cannot be parsed or its embedded full text is
   unavailable. Require at least one usable first reading, psalm, and Gospel before a
   celebration can appear in the picker.
6. Default to the Proper reading when it exists. If a celebration relies entirely on a
   Common, use that Common's first option as the initial first reading, psalm, and
   Gospel. Never invent a second reading: when the Proper has none, the editor must
   explicitly choose one if it is needed.

This is comprehensive for the explicit choices and Commons printed in the imported
2002 US *Lectionary for Mass* citation indexes. It is **not a guarantee of exhaustive
Finnish coverage**: national or diocesan propers, later decrees, and choices expressed
only in a current Finnish Ordo may differ. St Henry is currently the one manually added
Finnish proper. Keep the in-app instruction to confirm the result against the parish
Ordo; do not describe this catalogue as an authoritative Finnish lectionary.

### Minimal offline rebuild of the HTML (from the included JSON)

```bash
npm ci
npm run build             # regenerates icons, templates and both planner HTML files
npm test                  # lectionary alternatives, Commons and picker invariants
npm run check             # tests, rebuilds, and rejects stale generated output
```

### Full rebuild from scratch

```bash
npm ci
bash scripts/fetch_sources.sh                 # downloads public-domain Bible sources
node scripts/harvest.js                       # network: USCCB citations (A/B)
node scripts/build_readings.js
node scripts/build_sunday_schedule.js
node scripts/build_celebrations.js            # network: Proper of Saints + Commons citations
node scripts/extract_readings.js
node scripts/make_template.js && node scripts/make_template2.js
node scripts/build-app.js
```

## Finland calendar corrections (in `scripts/build_sunday_schedule.js`)

`romcal`'s data is General-Roman-ish and gets a few Finland things wrong; these are patched:

- **Epiphany** is fixed to **6 January** (a Finnish public holiday), not transferred to a
  Sunday. The wrongly-transferred Sunday becomes the *Second Sunday after Christmas* (or
  *Baptism of the Lord* if it falls after 6 Jan). Genuine 6-Jan-on-Sunday stays Epiphany.
- **All Souls (2 Nov)** correctly replaces a Sunday of Ordinary Time when 2 Nov is a Sunday
  (romcal doesn't promote it).
- **St Henry** (patron of Finland, 19 Jan) is a solemnity; proper readings from the Finnish
  diocesan Ordo (katolinen.fi) are hard-coded (option 1 of each).

## Readings — sources & known limitations

- **Citations**: Years A/B from USCCB by-date (verified vs Felix Just); Year C + gaps from
  Felix Just (catholic-resources.org). All cross-checked; see the verify blocks in the scripts.
- **Full text**: public-domain **World English Bible** (+ KJV Apocrypha for
  deuterocanon). This is *not* the translation proclaimed at Mass — chosen to avoid
  copyrighted lectionary text. Caveats shown in the app and printed document:
  - **Psalm verse numbering** is normalized chapter by chapter from the
    Lectionary/NAB Hebrew numbering to WEB numbering. The offset table in
    `scripts/extract_readings.js` was derived by comparing the official USCCB
    description of NAB numbering, Sefaria's Hebrew chapter shapes, and the bundled WEB chapter
    lengths. Do not replace it with a blanket one-verse shift: some Psalms have no
    shift, while Psalms 51, 52, 54 and 60 have a two-verse shift.
  - The Sunday, Proper, and Commons catalogues contain 934 distinct citation strings.
    Expanding explicit “or” alternatives creates 972 selectable/text entries; all 972
    currently extract in full. Catholic Daniel 3:24 onward maps to the separately
    stored **Prayer of Azariah** in the KJV Apocrypha source.
  - Lettered citation fragments such as `3a`/`3b` are normalized to the whole verse by the
    current parser.
- Authorised editors can persist a complete alternative celebration and then optionally
  fine-tune individual readings. Public viewing and both Word exports use the saved
  celebration name, citations and embedded full texts; adjustments are marked in the
  on-screen summary and full-text section.

## Mobile UI regression checklist

Mobile is the primary target. Before shipping a UI change, check at an iPhone-sized
viewport (390 × 844 is the established baseline) and at a desktop width:

- No horizontal overflow.
- The planner and About top bars are both 48 px high. Their CSS is duplicated between
  `src/styles/planner.css` and `about.html`; keep the padding and inner minimum heights
  aligned.
- The first screen keeps Sunday selection, both print actions, and the reading summary
  compact and usable.
- The visible date stays vertically centered. The native date input is an invisible
  full-size overlay inside `.date-slot`; its separate `.date-display` avoids Safari's
  inconsistent native date formatting.
- Both print buttons remain equal-width columns on mobile.
- Song forms save only when submitted; typing does not move focus or dismiss the
  keyboard.
- The song picker opens full-screen on mobile. The create-new action remains visible
  above results with zero, partial, exact, or duplicate-title matches.
- Celebration/reading controls appear only after the bottom editor button is pressed.
  Their pickers open full-screen on mobile, keep action buttons reachable, block
  wrong-role citations, and require the Ordo checkbox for a non-standard individual
  reading.
- Reading verse numbers remain attached to their first word at forced narrow wraps, and
  elisions appear as `[...]`.
- The About link is visible in the top bar; users must not need to reach a troublesome
  footer to discover help.
- Test the locally served app in Chrome with an iPhone Safari user agent when possible,
  then verify the deployed GitHub Pages version after its build completes.

## Future lyric-powered repertoire and projector slides

Canonical song entities, weekly song-ID assignments, optional lyrics, and basic title
search are now implemented. Lyrics are editor-only and may be omitted at song creation.
The next phases can build three connected capabilities on that foundation:

1. **Automatic projector slides.** Generate each Sunday's slide deck from the ordered
   music plan and the selected songs' full lyrics. Lyrics should preserve meaningful
   structure such as verses, choruses, responses, and repeated sections rather than
   being stored only as an undifferentiated text blob.
2. **A parish repertoire.** Build up the set of songs the community already knows.
   Planning and future recommendations should prefer familiar or previously used songs
   when they are suitable; plan history can provide useful usage and recency signals.
3. **Semantic lyric search.** Create embeddings from the lyrics so editors and future
   LLM suggestions can search by theme, scripture, imagery, or meaning rather than only
   exact title words.

The relational song/lyric record remains canonical. Vector embeddings are derived
search data and must be regenerable when lyrics or embedding models change. Since the
app already uses Supabase Postgres, `pgvector` is the natural first option before adding
a separate vector database.

The accepted phase-one history policy is intentionally simple: editing a song rewrites
what every referencing Sunday displays. Before generated slides become durable records,
decide whether those exported artifacts need their own immutable snapshots; do not add
snapshot complexity to weekly planning by default.

Full lyric storage and projection also make licensing material, not merely attribution.
Before this phase ships, confirm that the church's licences or direct permissions cover
storing lyrics in the app and generating projector slides, and design public/editor
access accordingly.

## Suggested next steps / TODO

- Verify St Henry's odd-looking first-reading citation ("Sirach 45:12-20, 4-5") against a
  printed Ordo; wire in the option-2 alternates as a toggle if wanted.
- Improve Psalm versification (map NAB→WEB superscription offset) or source a PD psalter
  with lectionary numbering.
- Handle the Daniel 3 canticle (maps to KJVA "Prayer of Azariah").
- Optional: hymnal / hymn-number column on the sung-parts grid.
- Define a structured lyric format for verses, choruses, responses, and repeats before
  slide generation.
- Generate projector slides from each Sunday's ordered plan.
- Refine `suggestion_parts` as the choir uses the repertoire; intentionally
  unclassified songs remain searchable but are not automatically suggested.
- Replace password sign-in with email magic links and configure production email
  delivery and redirects.

## Dependencies

Node 22.20.x and npm 10.9.3; use the committed `.node-version` and
`package-lock.json`. Runtime build dependencies are `docx` and `romcal`.
Rendering/verification used LibreOffice + poppler +
Playwright (Chromium) — only needed if you re-run the visual tests, not to build the tool.
