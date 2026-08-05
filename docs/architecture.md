# Application architecture

This document is the starting point for changing the St James Mass Planner. It
describes the runtime boundaries, the direction of dependencies, and the guarantees
that must survive refactoring. Product behavior belongs in the README; database detail
belongs in `data-model.md`; liturgical rules belong in `lectionary.md`; commands and
release procedures belong in `operations.md`.

## System context

```text
                                      public metadata and plans
Browser application  <----------------------------------------------+
  planner / repertoire                                               |
       |                                                             |
       | Auth, Realtime, RPCs, public reads                           |
       v                                                             |
Supabase ------------------------------------------------------------+
  Auth | Postgres/RLS | Edge Function | built-in gte-small model
                              |
                              +-- private lyrics and vectors,
                                  available only inside authorised paths

Static GitHub Pages deployment
  HTML | JavaScript | CSS | generated catalogues | PWA service worker
```

The frontend is a mobile-first, framework-free browser application. GitHub Pages serves
only static assets. Supabase supplies shared persistence, authentication, realtime
updates, authorization, vector storage, and semantic ranking. There is no application
server between the browser and Supabase.

## Deployable surfaces

- `index.html` is the single generated planner entry point. It is not a self-contained
  file.
- `repertoire.html` is the public browser and editor surface for both the choir
  repertoire and the distinct extended library.
- `about.html` contains help, provenance, and limitations.
- `august-music.html` is a public, hand-maintained shortlist page for the music-choosing
  meeting of 2 August 2026. It carries no plan data; choices are held in `localStorage`
  only and are entered in the planner separately. **Delete this page, its `about.html`
  link, and its entries in `scripts/stage-pages.js`, `src/service-worker-assets.json`,
  `src/service-worker.js`, and `tests/pages-deployment.test.js` after that meeting.**
  It is a deliberate, time-boxed exception to the rule that public pages never carry
  lyrics: it quotes one identifying line per song so the people choosing can recognise
  it. Do not treat the exception as a precedent for the planner, the repertoire page, or
  any successor shortlist — those still carry no lyrics.
- `vendor/supabase.js`, export libraries, and the optional `vendor/sentry.js` are built
  locally from exact pinned npm dependencies. Export libraries and Sentry are outside
  the install shell and load only when their features are requested or configured;
  successful responses then enter the normal runtime cache. External source maps with
  embedded original sources are deployed beside every minified vendor bundle.
- `data/generated/` contains deterministic lectionary catalogue inputs.
- `data/readings/` is an ignored build output containing one content-hashed JSON file
  per citation. The planner embeds its manifest, requests only the selected citations,
  and fetches the complete source catalogue only for editor workflows that need it.
- `service-worker.js` is generated from `src/service-worker.js` and the explicit shell
  in `src/service-worker-assets.json`.
- `supabase/migrations/` and `supabase/functions/semantic-songs/` are the backend
  deployables.

Run `npm run build` after changing source or generated-data inputs. Root planner files,
the repertoire page, vendor bundle, icons, and service worker are ignored outputs built
again by tests and deployment. Do not hand-edit them.

Browser asset URLs must resolve from `document.baseURI`, not the origin root. Production
is a GitHub Pages project site under `/sundaymass/`; a root-relative or over-traversed
dynamic import can work on localhost while failing only after deployment. External
application and vendor URLs carry a build-generated content version so a fresh page
cannot silently reuse an incompatible stable-path script. The shared asset resolver
preserves the project subdirectory.

## Browser module boundaries

The browser code follows a simple dependency direction:

```text
entry points
    |
    +-- feature controllers and views
    |       |
    |       +-- domain modules
    |
    +-- service adapters
            |
            +-- domain modules

domain modules --> no DOM, network, storage, or Supabase dependencies
```

### Entry points

`src/app/planner.js` and `src/app/repertoire.js` compose the page. They own shared UI
state, wire DOM events, and pass explicit dependencies to smaller modules. They should
not accumulate validation, persistence mapping, or feature-specific state machines.

The planner's mutable Sunday, song, celebration, and reading values are held by the
DOM-free `planner-state.js`; the entry point coordinates its state transitions with the
session and feature workflows.

### Feature controllers and views

Controllers own one interaction or lifecycle, such as the song picker, plan
subscription, song mutation, celebration replacement, reading override, authentication,
modal behavior, or PWA installation. Views turn already-decided state into
escaped markup or update one bounded part of the DOM.

`song-workflow.js` is the feature-level composition boundary for the picker and editor.
It wires their DOM, combines the independently tested picker-state and mutation
controllers, and reports canonical-song changes back to `planner.js`; it does not own
the page's calendar, readings, authentication, or plan subscription.

`reading-workflow.js` is the corresponding editor boundary for celebration replacement
and individual reading overrides. It composes their state and persistence controllers,
owns the three editor dialogs, and reports effective-plan changes back to `planner.js`.

Controllers may depend on stores and pure domain functions. Views must not fetch or
persist data. A controller should not reach into another controller's private state;
their entry-point caller coordinates cross-feature changes.

### Domain modules

`src/domain/` contains pure rules and transformations:

- Mass-part definitions and suggestion normalization
- canonical song validation and presentation
- public plan projection
- runtime Finnish Sunday calculation
- lectionary selection and role-aware reading validation
- embedding content and repair policy

These modules are the preferred home for logic that can be tested without a browser.
They must not import browser globals or a Supabase client.

### Service adapters

`src/services/plan-store.js` and `src/services/repertoire-store.js` expose browser-facing
store interfaces. Each chooses between:

- a Supabase adapter for deployed shared data; and
- a local-storage adapter for `localhost` and `file:` development.

The Supabase client, storage, scheduling, UUID, and domain dependencies are injected
where practical so behavior can be tested under Node. Store results returned to public
planner code must never contain lyrics.

## Principal runtime flows

### Public Sunday view

1. Calendar logic computes the selected Sunday and its standard celebration.
2. The plan store emits a cached public plan first when one exists.
3. Supabase loads the shared `plans` row and its public `plan_songs`/`songs` metadata.
4. A celebration snapshot or individual reading overrides are applied over the
   computed lectionary.
5. Separate music and reading views render the effective plan.
6. Realtime invalidation reloads the currently selected Sunday.

### Editor mutation

1. Supabase Auth establishes identity.
2. The application checks editor membership to present editing controls.
3. The relevant controller validates and sends one RPC or table mutation.
4. Postgres independently enforces editor membership through RLS and explicit RPC
   checks.
5. Successful changes are live immediately; there is no draft or publish state.

The UI check is convenience, not authorization. A mutation is secure only when the
database rejects an unauthorized direct request.

### Choir lyric access

1. The password-first dialog authenticates the administrator-managed shared choir
   identity without asking the singer for its fixed email.
2. The application checks `choir_members` and `editors` membership to expose read-only
   lyric actions.
3. Repertoire lyrics load on demand, while Sunday exports fetch canonical lyrics plus
   any selected-Sunday overrides.
4. Postgres independently permits reads to either membership and continues to reject
   every choir mutation.
5. Private text remains outside public plans, rendered public pages, and offline caches.

### Choir song requests

1. A signed-in choir member uses “Suggest a song” on any public plan row.
2. The dialog searches public song metadata, or captures a free-text title with
   an optional YouTube link; domain validation reduces links to video IDs before
   persistence. An optional note travels with the request.
3. One RPC records a pending request. Postgres re-checks choir or editor
   membership; anonymous users can neither read nor create requests.
4. Editors review pending requests from the planner. Accepting a library song
   with a target slot assigns it through the normal assignment RPC; a free-text
   request only records the decision, and creating the song stays in the normal
   editor flow.
5. Requests are choir-internal, carry no lyrics, and never appear in public
   plans or rendered public pages.

### Song selection and editing

An empty public plan slot offers a read-only “See suggestions” action. It opens only
the Suggested view: no previous-Sunday choice, search, creation, selection, or save
controls are shown. Suggestions are filtered by the slot's soft
`suggestion_parts` classification before semantic ranking. The result is deliberately
bounded to two known repertoire songs plus one extended-library candidate. The public
security-definer RPC bounds citation input and returns only safe song metadata; lyrics
and the underlying song/reading vectors remain private.

For editors, the same picker also provides Search and Add modes. Search can return
every public song, and manual assignment to any Mass slot remains unrestricted.
Candidate membership affects presentation and ranking, not song identity or
eligibility.

Creating a song and assigning it use one atomic RPC. Editing updates the canonical song,
so every Mass referencing its UUID sees the new metadata. Lyrics are loaded only for
an authorised editor editing song details.

“Lyrics for this Sunday” creates one private full-text override for the selected slot.
The editor can reset to canonical text or explicitly copy the newest earlier override
for the same song. There is no linked template/version layer. Responsorial Psalm text
stays free-form in the database and is normalized at the domain boundary into one
assembly response and cantor verse sections. The editor presents those normalized
sections separately; omitted verses stay visible but are excluded from saved effective
text and all exports.

Psalm suggestions take a separate structured path. The reading's book and number are
matched against responsorial metadata, with exact citations used only to rank matching
settings. Semantic song search is never used for the Psalm slot.

After an explicit song save, the browser requests one best-effort vector refresh.
Autosave typing does not invoke the embedding model repeatedly. Repertoire maintenance
can repair missing or stale vectors in bounded batches.

### Reading and celebration changes

The normal Sunday and its lectionary key are calculated locally at runtime, then
resolved through a checked-in catalogue of reusable reading templates. Editors may
rarely replace it with any supported standard celebration. The browser resolves the
selected alternative options into a complete snapshot, and one RPC stores that snapshot
while clearing individual overrides atomically.

Individual overrides remain available for fine-tuning. Domain validation constrains
each slot to its sane book family and requires an explicit confirmation for another
valid passage outside the offered Ordo options.

### Lyrics PowerPoint export

The authorized export controller derives the selected songs in canonical Mass order,
deduplicates IDs only for private fetching, calls `getSong` for each distinct song, and
loads the selected Sunday's private lyric overrides.
That existing store operation is independently protected by editor membership and
`song_lyrics` RLS. The controller refuses export when any selected song has no lyrics.

The pure lyrics-presentation domain module normalizes stanza spacing, wraps unusually
long lines, divides the effective text into bounded large-type slides, and builds a
16:9 deck. Psalm response slides are marked `ALL`, included verse slides are marked
`CANTOR`, and omitted verses are absent. Repeated assignments remain repeated in the
deck. PptxGenJS writes the file
in the browser; neither lyrics nor the generated deck enter the public plan, DOM,
service-worker data cache, application storage, or an application server. The static
generator library itself is part of the offline shell, but exporting private content
remains online-only because it must fetch authorised current lyrics.

### YouTube practice queue

The public planner derives an ephemeral practice queue from the selected plan in
canonical Mass-slot order. Editors may paste recognised HTTPS YouTube video URL
forms, but song validation reduces them to 11-character video IDs before persistence.
The public watch link and privacy-enhanced `youtube-nocookie.com` embed are derived
from those IDs. Invalid or missing links are reported and omitted. Repeated
assignments remain repeated in the queue because they represent distinct points in
the Mass.

The queue is created only when the user opens “Listen to all”. It has no database row,
YouTube account, API key, or persistent playlist. Closing the dialog removes the
iframe source to stop playback. The feature requires internet access even when the
rest of a previously visited plan is available offline.

### Offline behavior

The service worker caches the static application shell. Selected reading-text responses
are cached on demand rather than placing the complete full-text catalogue in the
install payload. The plan store preserves the last public plan cached for a previously
visited Sunday. That plan and the readings fetched during its online visit remain
viewable offline.

Shared editing is online-only. Offline mutations are refused before a request and must
not be presented as saved. Local-storage persistence is a development adapter, not a
production fallback for shared edits.

### Browser error and log reporting

Browser code reports caught failures, warnings, and explicit informational messages
through `AppLogger`; uncaught errors and rejected promises are handled by the same
Sentry installation. Entries logged before the monitoring bundle finishes loading are
buffered and forwarded afterward. Errors appear both as Sentry issues and structured
logs; warnings and information appear as structured logs.

Monitoring is disabled when its DSN is blank. When enabled, the locally built browser
SDK sends errors and application-authored logs only: tracing, replay, metrics, and
automatic console capture are absent, default PII is disabled, and processors remove
user, request, breadcrumb, and unapproved log-attribute data. Release and page-surface
tags identify the affected build without attaching plan, song, lyric, or reading
content.

## Security and privacy invariants

These are hard constraints:

1. Anonymous and authenticated non-editor users can read public plans and song
   metadata.
2. Only users listed in `public.editors` can mutate shared plan and song data.
   The choir-internal song-request queue is the one exception: choir members may
   add to it, and only editors resolve it.
3. `song_lyrics` is a separate table so public roles cannot retrieve lyrics, even by
   bypassing the UI.
4. Browser roles cannot read or write `song_embeddings` or `reading_embeddings`.
5. The semantic Edge Function returns public song metadata only; service-role secrets,
   lyrics, and raw vectors never reach browser assets.
6. Public plan projections, cached plans, and rendered music rows contain no lyrics.
7. Lyrics PowerPoint export fetches private lyrics only after editor authorization and
   creates a local download without publishing or persisting the result.
8. HTML and user-entered URLs are escaped or validated at presentation boundaries.

The Supabase integration suite is the executable authority for database permissions.
Unit and browser tests cover the corresponding client-side projections and workflows.

## Change routing

| Change | Primary location |
|---|---|
| Planner structure or styling | `src/planner.html`, `src/styles/planner.css` |
| Repertoire structure or styling | `src/repertoire.html`, `src/styles/repertoire.css` |
| Interaction lifecycle | matching controller under `src/app/` |
| Rendering only | matching view under `src/app/` |
| Shared validation or transformation | `src/domain/` |
| Supabase/local persistence mapping | `src/services/` |
| Database permissions or RPC contract | forward migration under `supabase/migrations/` |
| Semantic request/model behavior | `supabase/functions/semantic-songs/` |
| Calendar or reading catalogue generation | `scripts/` and `data/generated/` |
| Offline shell | `src/service-worker.js`, `src/service-worker-assets.json` |

See [`testing.md`](testing.md) for the test layer appropriate to each change and
[`decisions/`](decisions/) for the reasons behind the non-obvious boundaries.
