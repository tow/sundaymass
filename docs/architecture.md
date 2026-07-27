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
- `repertoire.html` is the public repertoire browser and editor surface.
- `about.html` contains help, provenance, and limitations.
- `vendor/supabase.js` is built locally from the exact pinned npm dependency.
- `data/generated/` contains deterministic lectionary catalogues used by the planner.
- `service-worker.js` is generated from `src/service-worker.js` and the explicit shell
  in `src/service-worker-assets.json`.
- `supabase/migrations/` and `supabase/functions/semantic-songs/` are the backend
  deployables.

Run `npm run build` after changing source or generated-data inputs. Root planner files,
the repertoire page, vendor bundle, icons, and service worker are ignored outputs built
again by tests and deployment. Do not hand-edit them.

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

### Feature controllers and views

Controllers own one interaction or lifecycle, such as the song picker, plan
subscription, song mutation, celebration replacement, reading override, authentication,
printing, modal behavior, or PWA installation. Views turn already-decided state into
escaped markup or update one bounded part of the DOM.

`song-workflow.js` is the feature-level composition boundary for the picker and editor.
It wires their DOM, combines the independently tested picker-state and mutation
controllers, and reports canonical-song changes back to `planner.js`; it does not own
the page's calendar, readings, authentication, or plan subscription.

Controllers may depend on stores and pure domain functions. Views must not fetch or
persist data. A controller should not reach into another controller's private state;
their entry-point caller coordinates cross-feature changes.

### Domain modules

`src/domain/` contains pure rules and transformations:

- Mass-part definitions and suggestion normalization
- canonical song validation and presentation
- public plan projection
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

### Song selection and editing

The picker has separate Suggested, Search, and Add modes. Suggestions are filtered by
the slot's soft `suggestion_parts` classification before semantic ranking. Search can
return every public song, and manual assignment to any Mass slot remains unrestricted.

Creating a song and assigning it use one atomic RPC. Editing updates the canonical song,
so every Mass referencing its UUID sees the new metadata. Lyrics are loaded only for
an authorised editor editing song details.

After an explicit song save, the browser requests one best-effort vector refresh.
Autosave typing does not invoke the embedding model repeatedly. Repertoire maintenance
can repair missing or stale vectors in bounded batches.

### Reading and celebration changes

The normal Sunday lectionary is computed from checked-in generated catalogues. Editors
may rarely replace it with any supported standard celebration. The browser resolves
the selected alternative options into a complete snapshot, and one RPC stores that
snapshot while clearing individual overrides atomically.

Individual overrides remain available for fine-tuning. Domain validation constrains
each slot to its sane book family and requires an explicit confirmation for another
valid passage outside the offered Ordo options.

### Printing

Print actions construct a dedicated escaped A4 document rather than printing the
mobile interface. Music-only and music-plus-readings modes share the same renderer.
The output includes public song attribution but never private lyrics.

### Offline behavior

The service worker caches the static application shell. The plan store preserves the
last public plan cached for a previously visited Sunday. That plan and its computed
readings remain viewable and printable offline.

Shared editing is online-only. Offline mutations are refused before a request and must
not be presented as saved. Local-storage persistence is a development adapter, not a
production fallback for shared edits.

## Security and privacy invariants

These are hard constraints:

1. Anonymous and authenticated non-editor users can read public plans and song
   metadata.
2. Only users listed in `public.editors` can mutate shared data.
3. `song_lyrics` is a separate table so public roles cannot retrieve lyrics, even by
   bypassing the UI.
4. Browser roles cannot read or write `song_embeddings` or `reading_embeddings`.
5. The semantic Edge Function returns public song metadata only; service-role secrets,
   lyrics, and raw vectors never reach browser assets.
6. Public plan projections, cached plans, rendered music rows, and print documents
   contain no lyrics.
7. HTML and user-entered URLs are escaped or validated at presentation boundaries.

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
