# St James the Apostle 6pm Mass — Music Planner

A mobile-first tool for planning the sung parts of the 6pm Sunday Mass at St James the
Apostle. Pick any Sunday from 2025–2075, review the liturgical day and full text of all
four readings, choose the music, and generate a Word planning sheet with or without the
readings. Music choices are publicly viewable and authorized editors save changes live.

Live site: <https://tow.github.io/sundaymass/>

This is an independent planning aid, not an official parish or Diocese of Helsinki
publication. Liturgical details must always be checked against the parish Ordo.

**The standalone deliverable is `StJames_Mass_Planner.html`** (same planner as
`index.html`). The planner itself is self-contained and works offline — all data and
both Word templates are embedded. Deploy `about.html` alongside it for the help page.

For deployment, serve `index.html` and `about.html` together with `supabase-config.js`,
`supabase-client.js`, `manifest.webmanifest`, `service-worker.js`, and `icons/`. On
HTTPS, the planner can be installed to a phone's home screen.

## Product decisions to preserve

- The primary job is to choose a Sunday and quickly print its music plan. Editing
  readings is deliberately secondary.
- Full reading texts are always visible on the page. The two print actions generate
  either music only or music plus readings; there is no separate print-settings panel.
- Reading citations near the top link to their corresponding full text.
- Public visitors see the live music plan. Authorized editors change it directly:
  there is no draft/publish workflow and every successful save is immediately live.
- There is one public music-plan view, not separate "live plan" and "preview" sections.
- Song entry is deliberately free-form. Phase 1 has no song catalogue: every Mass part
  stores a title and an optional manually found YouTube practice link.
- There are two separate Communion slots: `communion` and `communion2`.
- Copyright planning fields are `authors`, `copyrightOwner`, `copyrightYear`, and
  `source`. Source is optional and must not make an otherwise complete entry
  "incomplete". The current completeness rule requires authors, owner/publisher, and
  year; entering `Public domain` as the owner allows the year to be blank.
- Recording attribution does not itself grant permission to reproduce or project
  lyrics. That warning belongs in the help page.
- Future LLM song suggestions should fill empty slots without requiring a catalogue;
  the existing per-Sunday, per-part data model can remain the source of truth.

## Files to edit

`index.html` and `StJames_Mass_Planner.html` are generated files. Make planner UI,
behavior, and embedded-data changes in `build_tool2.js`, then run:

```bash
npm run build
```

Commit the generated HTML with its source change. Do not hand-edit only one generated
HTML file: the next build will overwrite it and the standalone version will diverge.

`about.html`, `supabase-client.js`, `service-worker.js`, and the manifest are maintained
directly. The Word layouts originate in `make_template.js` and `make_template2.js`.

## Live plans

Live data uses Supabase Auth, Postgres, Realtime, and Row Level Security:

- `plans` has one row per Sunday and a JSON `choices` object. Each Mass part stores
  `song`, `youtubeUrl`, `authors`, `copyrightOwner`, `copyrightYear`, and `source`.
- Anyone can read plans.
- Editors sign in with an administrator-created, manually confirmed email/password
  account. Public signup is disabled, so phase 1 requires no outgoing email service.
- A signed-in user can write only when their user ID is also in `public.editors`.
- Each part autosaves 500 ms after its latest edit. Realtime updates may refresh other
  fields, but `renderMusicPlan()` deliberately does not replace the active input. This
  is essential: replacing the editor DOM during autosave causes the iPhone keyboard
  and focus to jump.
- `save_music_choice` updates one JSON part and merges it into the Sunday row, preserving
  all other song choices.
- HTTPS YouTube and `youtu.be` URLs are rendered as practice links; other hosts remain
  stored but are not exposed as clickable links.
- If no Supabase config is present, localhost and local-file builds fall back to
  `localStorage` so the editing flow can be tested without a project.

The "Adjust liturgical day or readings" fields are currently client-side overrides
only and are not auth-gated. They update the visible and generated readings for the
current browser session, but are not stored in Supabase or shared publicly. Persisting
reading overrides would require an explicit schema and UI change.

To connect a Supabase project:

1. Link the project and run `supabase db push` to apply the tracked migration in
   `supabase/migrations/`.
2. Put the project URL and publishable key in `supabase-config.js`.
3. Under Authentication → General Configuration, turn off **Allow new users to sign
   up**. Leave the Email/password provider enabled so administrator-created users can
   still sign in. Supabase calls this setting "signup"; disabling signup does **not**
   disable password sign-in for existing users. Email confirmation can remain enabled.
4. Under Authentication → Users, create each editor with an initial password and mark
   the account confirmed.
5. Add each editor's Auth user ID to `public.editors`.

The publishable browser key in `supabase-config.js` is public by design. Security comes
from RLS and editor membership, never from hiding that key. Never put a service-role key
in a browser file.

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

1. **`harvest.js`** — enumerates Sundays/solemnities via `romcal` and pulls USCCB reading
   *citations* by date from the public `cpbjr/catholic-readings-api` (raw GitHub) for
   Years A & B (2026–2027). Writes `lectionary_table.json`. *(needs network)*
2. **`build_readings.js`** — merges the harvested A/B citations with Year C + displaced
   A/B weeks transcribed from Felix Just (catholic-resources.org), plus fixed feasts.
   Note: the API's 2025 Year C data is contaminated (All Souls mislabelled), so **Year C
   comes from Felix Just, not the API**. Writes `readings_master.json`.
3. **`precompute2.js`** — uses `romcal` with the **Finland** national calendar to expand
   every Sunday 2025–2075 to {date, day, season, cycle, 4 citations}. Applies the Finland
   corrections (see below). Writes `sundays.json`.
4. **`extract_readings.js`** — resolves each distinct citation to full scripture text from
   the public-domain **World English Bible** (`web.json`), falling back to **KJV-with-
   Apocrypha** (`kjva.json`) for deuterocanonical books. It preserves visible verse
   numbers in the resulting text and writes `readings_text.json`. Verse numbers use
   superscript digits followed by U+202F NARROW NO-BREAK SPACE; do not replace it with
   U+2009 THIN SPACE, which can orphan a verse number at the end of a line. Gaps between
   non-consecutive verses are rendered exactly as `[...]`.
   *(needs `web.json` + `kjva.json` — see `fetch_sources.sh`)*
5. **`make_template.js`** / **`make_template2.js`** — build the 1-page and 2-page Word
   templates (docx-js) with `@@TOKEN@@` placeholders, and unzip their parts into
   `tpl/` and `tpl2/`. *(needs `docx` npm)*
6. **`build_tool2.js`** — embeds `sundays.json`, `readings_text.json`, and both template
   part-sets into the final `StJames_Mass_Planner.html`. The browser fills the tokens and
   re-zips a genuine `.docx` on download (tiny inline zip writer, no library).

### Minimal offline rebuild of the HTML (from the included JSON)

```bash
npm install docx romcal
npm run build             # regenerates icons, templates and both planner HTML files
```

### Full rebuild from scratch

```bash
npm install docx romcal
bash fetch_sources.sh                 # downloads web.json + kjva.json (public domain)
node harvest.js                       # network: USCCB citations (A/B)
node build_readings.js
node precompute2.js
node extract_readings.js
node make_template.js && node make_template2.js
node build_tool2.js
```

## Finland calendar corrections (in `precompute2.js`)

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
  - **Psalm verse numbering** can be off by 1–2 (Hebrew superscriptions counted differently).
  - The current extraction reports 624 complete, 18 partial, and 3 missing passages out
    of 645 distinct citations. The main gaps are the deuterocanonical **Daniel canticle
    (Prayer of Azariah)** and psalms whose source versification lacks a requested final verse.
  - Lettered citation fragments such as `3a`/`3b` are normalized to the whole verse by the
    current parser.
- Every reading field can be temporarily overridden in the tool; see the persistence
  limitation under "Live plans".

## Mobile UI regression checklist

Mobile is the primary target. Before shipping a UI change, check at an iPhone-sized
viewport (390 × 844 is the established baseline) and at a desktop width:

- No horizontal overflow.
- The planner and About top bars are both 48 px high. Their CSS is duplicated between
  `build_tool2.js` and `about.html`; keep the padding and inner minimum heights aligned.
- The first screen keeps Sunday selection, both print actions, and the reading summary
  compact and usable.
- The visible date stays vertically centered. The native date input is an invisible
  full-size overlay inside `.date-slot`; its separate `.date-display` avoids Safari's
  inconsistent native date formatting.
- Both print buttons remain equal-width columns on mobile.
- Editing and autosave do not move focus or dismiss the keyboard.
- Reading verse numbers remain attached to their first word at forced narrow wraps, and
  elisions appear as `[...]`.
- The About link is visible in the top bar; users must not need to reach a troublesome
  footer to discover help.
- Test the locally served app in Chrome with an iPhone Safari user agent when possible,
  then verify the deployed GitHub Pages version after its build completes.

## Suggested next steps / TODO

- Verify St Henry's odd-looking first-reading citation ("Sirach 45:12-20, 4-5") against a
  printed Ordo; wire in the option-2 alternates as a toggle if wanted.
- Improve Psalm versification (map NAB→WEB superscription offset) or source a PD psalter
  with lectionary numbering.
- Handle the Daniel 3 canticle (maps to KJVA "Prayer of Azariah").
- Decide whether reading/day overrides should be persisted per Sunday and restricted to
  authorized editors.
- Optional: hymnal / hymn-number column on the sung-parts grid.
- Add optional automatic song suggestions as a separate phase.

## Dependencies

Node ≥ 18. npm: `docx`, `romcal`. Rendering/verification used LibreOffice + poppler +
Playwright (Chromium) — only needed if you re-run the visual tests, not to build the tool.
