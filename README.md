# St James the Apostle 6pm Mass — Music Planner

A mobile-first tool for planning the sung parts of the 6pm Sunday Mass at St James the
Apostle. Pick any Sunday, review the liturgical day and full text of all four readings,
choose the music, and print or save an A4 PDF planning sheet with or
without the readings. Music choices are publicly viewable and authorized editors save
changes live. Editors can also download the selected songs' lyrics as a 16:9
PowerPoint deck for projection.

Live site: <https://tow.github.io/sundaymass/>

Developer documentation:

- [Architecture and module boundaries](docs/architecture.md)
- [Architecture decisions](docs/decisions/)
- [Data model and authorization](docs/data-model.md)
- [Calendar and lectionary](docs/lectionary.md)
- [Operations and deployment](docs/operations.md)
- [Testing guide](docs/testing.md)
- [Current hardening plan](docs/HARDENING_PLAN.md)
- [Proprietary software notice](LICENSE.md)

This is an independent planning aid, not an official parish or Diocese of Helsinki
publication. Liturgical details must always be checked against the parish Ordo.

For deployment, serve `index.html`, `repertoire.html`, and `about.html` together with
`supabase-config.js`, both files in `src/services/`, `data/generated/readings_text.json`,
`manifest.webmanifest`, `service-worker.js`, `vendor/`, and `icons/`. On HTTPS, the
planner can be installed to a phone's home screen.

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
- `in_repertoire` distinguishes songs the choir knows from complete candidate records
  in the extended library. Both are canonical songs and both remain searchable. The
  semantic result reserves two places for repertoire songs and one for a candidate, so
  unfamiliar material can be discovered without displacing familiar choices.
- Editing a canonical song immediately changes every Sunday which references it. This
  is an explicit product decision: the current small data set does not require weekly
  snapshots or immutable history.
- There are two separate Communion slots: `communion` and `communion2`.
- “Listen to all” builds an unsaved, public YouTube queue from the selected Sunday in
  canonical Mass order. It includes every assigned slot with a valid YouTube video
  link, reports and skips missing links, and does not require a YouTube account, API
  key, or stored playlist. Reusing one video in two slots intentionally queues it twice.
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
- The lyrics PowerPoint action is editor-only and online-only. It fetches each selected
  song through the existing private-song read, refuses to create an incomplete deck,
  and generates the `.pptx` entirely in the browser. The deck follows canonical Mass
  order, repeats a song when it is assigned twice, and is not uploaded or cached.
- Song and reading embeddings are also private. Logged-out users may view suggestions
  for an empty Mass slot, but the bounded database function returns only public song
  metadata. It may include one clearly labelled extended-library candidate alongside
  known repertoire songs. Searching, assigning, creating, and editing remain
  editor-only.
- The initial extended library was loaded on 2026-07-27 from a user-supplied, 244-page
  historic hymn list. Of 575 usable full-lyric entries, 12 were exact matches to
  existing canonical songs and 563 became candidates. Title-only placeholders were not
  imported. This was a one-off production data import, not a schema migration: neither
  the source lyrics nor temporary extraction/import scripts belong in Git. Preserve the
  library through database backups and human-readable exports.

## Files to edit

`index.html` is generated. Make planner UI, behavior, and export changes in the
appropriate source file:

- `src/planner.html` — page structure
- `src/styles/planner.css` — visual design and responsive layout
- `src/app/planner.js` — UI state, rendering, and event handling
- `src/app/auth-controller.js` — shared sign-in dialog and sign-out interactions
- `src/app/calendar-navigation.js` — Sunday/date selection and calendar boundaries
- `src/app/date-url-state.js` — reloadable and back/forward-aware Sunday URLs
- `src/app/repertoire-url-state.js` — shareable repertoire collection and search state
- `src/app/modal-controller.js` — native-dialog page scroll locking and restoration
- `src/app/pwa-controller.js` — install prompt and service-worker registration behavior
- `src/app/plan-session-controller.js` — authentication and date-scoped live-plan subscriptions
- `src/app/planner-state.js` — selected Sunday and effective live-plan state
- `src/service-worker.js` — offline fetch/cache behavior template
- `src/service-worker-assets.json` — complete same-origin app shell
- `src/app/song-form.js` — canonical song editor form read/write mapping
- `src/app/music-plan-view.js` — lyric-free public/editor music-row rendering
- `src/app/practice-queue-controller.js` — temporary player dialog lifecycle and queue navigation
- `src/app/reading-plan-view.js` — selected celebration, linked citations, and full-text rendering
- `src/app/reading-editor-view.js` — editor celebration and reading-override summary
- `src/app/song-picker-view.js` — search/suggestion rows and duplicate-title disambiguation
- `src/app/song-picker-controller.js` — picker queries, selection, and stale-response handling
- `src/app/song-mutation-controller.js` — editor song loading, assignment, saving, and indexing
- `src/app/song-workflow.js` — song picker/editor DOM wiring and Mass-slot coordination
- `src/app/celebration-picker-view.js` — standard-lectionary search and reading preview
- `src/app/celebration-controller.js` — celebration selection, resolved snapshots, and restore
- `src/app/reading-override-controller.js` — individual reading save and restore persistence
- `src/app/reading-dialog-controller.js` — reading slot, validation, and confirmation state
- `src/app/reading-workflow.js` — celebration and reading-editor DOM coordination
- `src/domain/lectionary.js` — lectionary selection and validation rules
- `src/domain/reading-selection.js` — role-aware override validation and confirmation policy
- `src/domain/music-parts.js` — canonical Mass slots, labels, and suggestion normalization
- `src/domain/song-presentation.js` — YouTube ID parsing, canonical links, and shared attribution formatting
- `src/domain/practice-queue.js` — validated YouTube IDs and ordered ephemeral queue URLs
- `src/domain/lyrics-presentation.js` — deterministic lyric splitting and projection-deck layout
- `src/domain/songs.js` — song validation and phase-one title search
- `src/domain/plan-music-data.js` — database-row to browser-plan conversion
- `src/app/print-controller.js` — print-only A4 document rendering and browser print lifecycle
- `src/app/lyrics-pptx-controller.js` — editor-only lyric preflight and PowerPoint download
- `src/services/plan-store.js` — Supabase/local persistence adapter
- `src/repertoire.html` — repertoire page structure
- `src/styles/repertoire.css` — repertoire layout
- `src/app/repertoire.js` — repertoire browsing, editing, and index management
- `src/services/repertoire-store.js` — Supabase/local repertoire adapter

Then run:

```bash
npm run build
```

Generated planner HTML, repertoire HTML, service worker, vendor bundle, and icons are
ignored build products. Do not hand-edit them: the next build overwrites them, tests
rebuild them first, and the Pages workflow creates a fresh deployment artifact.

`about.html` and the manifest are maintained directly. `service-worker.js` is generated
from the source template and asset manifest; do not hand-edit it. The print/PDF layout
is the final `@media print` block in `src/styles/planner.css`.

### Repository layout

- `src/` contains browser application source grouped by responsibility.
- `scripts/` contains build and data-generation programs.
- `vendor/` contains ignored browser bundles generated from pinned npm packages.
- `data/generated/` contains checked-in derived catalogues embedded by the build.
- `data/sources/` contains the ignored, downloadable public-domain Bible datasets.
- `tests/` contains Node tests for domain and data invariants.
- Root-level generated HTML, service worker, vendor bundle, and icons are local build
  outputs. The tracked manifest, Supabase configuration, About page, services, and
  generated catalogues join them in the explicit GitHub Pages artifact.

## Live plans

Live data uses Supabase Auth, Postgres, Realtime, Row Level Security, and an editor-only
Edge Function using Supabase's built-in embedding model. Plans reference canonical song
entities; public clients receive song metadata but never lyrics or vector data.

Authenticated users can write only when their user ID is in `public.editors`. The
database enforces this independently of the interface. Successful actions are
immediately live—there is no draft or publish workflow.

The schema, JSON snapshot shapes, access matrix, RPC contracts, public projection, and
Realtime behavior are documented in
[`docs/data-model.md`](docs/data-model.md). The underlying forward migrations and local
Supabase integration suite remain the executable authority.

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

GitHub Pages publishes an explicit artifact from the verified `main` workflow. A
content-addressed service worker caches the complete shell and previously visited
public plans remain viewable and printable offline. Shared editing is always
online-only.

The first deployment, normal release order, editor lifecycle, backup/export, restore,
semantic-index maintenance, migration recovery, frontend rollback, PWA cache diagnosis,
and incident priorities are documented in
[`docs/operations.md`](docs/operations.md).

## Calendar and lectionary

The planner calculates Finnish Sundays locally as they are selected. It embeds one
canonical reading set per distinct Sunday/cycle, a searchable standard-celebration and
Commons catalogue, and public-domain full reading texts. Browser domain logic keeps
calendar rules separate from reading data and resolves Proper and Common alternatives
without materializing dated rows.

This remains an independent planning aid, not the authoritative Finnish lectionary or
parish Ordo. The sources, Finland corrections, Saint James titular solemnity, Commons
resolution, role-aware sanity checks, full-text limitations, rebuild procedure, and
extension rules are documented in
[`docs/lectionary.md`](docs/lectionary.md).

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
- The song picker opens as a tall single-scroller sheet over the plan on mobile. Its
  Suggested, Search, and Add modes avoid competing nested result areas.
- Celebration/reading controls appear only after the bottom editor button is pressed.
  Their pickers open full-screen on mobile, keep action buttons reachable, block
  wrong-role citations, and require the Ordo checkbox for a non-standard individual
  reading.
- Reading verse numbers remain attached to their first word at forced narrow wraps, and
  elisions appear as `[...]`.
- The About link is visible in the top bar; users must not need to reach a troublesome
  footer to discover help.
- Run `npm run check`, inspect native mobile interactions in Chrome when appropriate,
  then verify the deployed GitHub Pages version after its build completes.

## Lyric-powered repertoire and projector slides

Canonical song entities, weekly song-ID assignments, optional lyrics, and basic title
search are implemented. Lyrics are editor-only and may be omitted at song creation.
The first projection workflow is also implemented:

1. **Automatic projector slides.** Editors can generate each Sunday's PowerPoint from
   the ordered music plan and selected songs' full lyrics. The current deterministic
   splitter preserves blank-line stanza boundaries and never truncates content.
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

The accepted history policy is intentionally simple: editing a song rewrites what every
referencing Sunday displays. Exported decks are local files, not durable app records,
so the application adds no immutable snapshot model.

Full lyric storage and projection make licensing material, not merely attribution. The
church must ensure that its licences or direct permissions cover storing and projecting
the lyrics it uses.

## Suggested next steps / TODO

- Verify St Henry's odd-looking first-reading citation ("Sirach 45:12-20, 4-5") against a
  printed Ordo; wire in the option-2 alternates as a toggle if wanted.
- Improve Psalm versification (map NAB→WEB superscription offset) or source a PD psalter
  with lectionary numbering.
- Handle the Daniel 3 canticle (maps to KJVA "Prayer of Azariah").
- Optional: hymnal / hymn-number column on the sung-parts grid.
- Optional: define a structured lyric format for explicit verses, choruses, responses,
  and repeats beyond the current blank-line stanza convention.
- Refine `suggestion_parts` as the choir uses the repertoire; intentionally
  unclassified songs remain searchable but are not automatically suggested.
- Replace password sign-in with email magic links and configure production email
  delivery and redirects.

## Dependencies

Node 22.20.x and npm 10.9.3; use the committed `.node-version` and
`package-lock.json`. The Supabase JavaScript client is the only browser/runtime npm
package. `romcal` is a development-only independent calendar oracle, and `esbuild` is a
pinned build-only dependency used to produce the local Supabase module.
