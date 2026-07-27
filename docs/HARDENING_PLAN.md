# Application hardening plan

This is the working plan for making the St James Mass Planner easier to change,
better tested, operationally safer, and accurately documented. It deliberately keeps
the existing mobile-first product and vanilla JavaScript approach. Refactors must be
incremental, behavior-preserving, and covered by executable tests before code moves.

## Working principles

- Fix known correctness defects before structural refactoring.
- Add a failing regression test before each behavioral fix.
- Keep lyrics and embeddings inaccessible to public and non-editor clients.
- Keep manual song selection unrestricted; suggestion positions are a soft filter.
- Use forward Supabase migrations once a migration has reached production.
- Keep every phase independently deployable.
- Prefer a small pinned build dependency over a framework rewrite when bundling becomes
  necessary.
- Public viewing may work offline; editing must not claim success without reaching the
  shared database.

## Status

| Phase | State | Outcome |
|---|---|---|
| 1. Correctness defects | Complete locally; deployment pending | Hash-based embedding staleness and truly empty suggestion positions |
| 2. Reproducible build and CI | In progress | Pinned installs and deterministic, CI-verified builds |
| 3. Testable stores and Edge logic | Complete locally | Dependency-injected adapters and executable behavior tests |
| 4. Supabase integration tests | Complete locally | Proven RLS, RPC, privacy, and suggestion behavior |
| 5. Application modularization | In progress | Small feature controllers and shared definitions |
| 6. Offline/PWA guarantees | Complete locally | Reliable cached public viewing and explicit online-only editing |
| 7. Browser and print coverage | In progress | Automated primary-workflow and A4 print tests |
| 8. Documentation | In progress | Accurate, split developer and operations documentation |
| 9. Repository cleanup | Pending | Intentional artifacts and generated-output enforcement |

## Phase 1 — correctness defects

### 1.1 Embedding staleness

The current status check compares `songs.updated_at` and lyric timestamps with the
embedding timestamp. However, the embedding hash excludes YouTube, copyright, and
suggestion-position fields. Editing only those fields leaves the content hash unchanged,
so synchronization skips the model call without advancing the embedding timestamp.
The repertoire then repeatedly tries to repair the same song.

Change staleness to compare the canonical current embedding-input hash with the stored
`content_hash`:

1. Extract one function that constructs a song's embedding input.
2. Use it for both synchronization and status checks.
3. Calculate SHA-256 hashes during status checks without invoking the model.
4. Mark a song stale only when the calculated hash differs or no vector exists.
5. Replace recursive automatic repair with one bounded repair pass per load.
6. Report any songs still stale after the pass instead of retrying indefinitely.

Acceptance:

- Metadata excluded from embedding input does not make a song perpetually stale.
- Title, author, source, or lyrics changes do make it stale.
- Successful synchronization clears staleness.
- A failed or ineffective repair cannot loop.

### 1.2 Empty suggestion positions

The editor says that clearing every position excludes a song from suggestions. The
database currently restores the planner's current position when an empty array reaches
`create_and_assign_song`.

Change this through a forward migration:

1. The planner continues to preselect the current position for a new song.
2. The RPC stores exactly the submitted array, including an intentional empty array.
3. An unclassified song remains searchable and manually assignable.
4. An unclassified song does not appear in automatic suggestions.

Acceptance:

- Leaving the default checkbox selected stores the current position.
- Clearing every checkbox stores `[]`.
- Empty classification never becomes a hard assignment restriction.

## Phase 2 — reproducible build and gated deployment

- Select npm as the package manager and commit `package-lock.json`.
- Pin production and development dependency versions.
- Record the supported Node version.
- Replace runtime CDN dependencies with pinned, locally built assets.
- Add `test:unit`, `test:integration`, `test:e2e`, `test:coverage`, `lint`, and
  `check` scripts.
- Make `check` build the app, run tests, and reject dirty generated output.
- Add GitHub Actions verification before GitHub Pages deployment.
- Type-check the Supabase Edge Function.

Acceptance:

- `npm ci && npm run check` succeeds from a fresh clone.
- A failing check prevents production deployment.
- Rebuilding with the same inputs produces the same tracked outputs.

## Phase 3 — executable store and Edge tests

- Turn the plan and repertoire stores into dependency-injected factories.
- Share Supabase setup, authentication, row mapping, RPC payload mapping, URL
  validation, attribution formatting, and semantic invocation.
- Extract Edge helpers for chunking, input construction, hashing, staleness, and request
  validation.
- Keep browser/Deno entry points as thin composition layers.
- Replace source-text assertions with behavior tests where practical.

Acceptance:

- Stores and Edge helpers appear in real coverage.
- Store success, failure, subscription, stale-response, and corrupted-cache behavior is
  executable under Node.
- Public plan mapping is proven never to contain lyrics.

## Phase 4 — local Supabase integration tests

Run all tracked migrations against local Supabase and seed anonymous, non-editor, editor,
song, lyric, plan, and embedding fixtures.

Test:

- Public plan and song metadata access.
- Lyrics denied to anonymous and authenticated non-editors.
- Lyrics available to editors only.
- Vector tables unavailable to browser roles.
- All mutations denied to non-editors.
- Atomic song creation/assignment and celebration replacement.
- Duplicate-title identity.
- Invalid Mass-part rejection.
- Empty suggestion-position persistence.
- Communion-position normalization.
- Position filtering before semantic ranking.
- Manual cross-position assignment.

Acceptance:

- The hard privacy and authorization matrix is proven against an actual migrated
  database, not inferred from SQL text.

## Phase 5 — modularize the application

Split the planner into feature-focused modules:

```text
src/app/planner/
  index.js
  state.js
  navigation.js
  music-controller.js
  readings-controller.js
  celebration-controller.js
  auth-controller.js
  modal-controller.js
  print-controller.js
  pwa-controller.js
```

Centralize:

- Music-part keys, labels, notes, and Communion normalization.
- Song normalization and row/RPC mapping.
- Attribution and copyright completeness.
- Safe YouTube URL handling.
- Authentication and Supabase client creation.

Generate repeated HTML controls and print rows from the canonical music-part definition.
Use a contract test where SQL must repeat the same allow-list.

Acceptance:

- The planner entry point primarily composes modules.
- No feature module owns unrelated state or UI behavior.
- Shared mapping and validation logic has one implementation.
- Existing mobile behavior remains unchanged.

## Phase 6 — explicit offline/PWA behavior

The supported guarantee should be:

- Public readings, printing, and the last cached plan work offline.
- Editing requires a network connection.
- Offline state is visible and never misrepresented as a successful shared save.

Work:

- Bundle the Supabase client locally.
- Preserve cached public plans if network or Supabase startup fails.
- Disable shared mutations offline with an actionable message.
- Generate the service-worker cache version from build content.
- Cache every same-origin asset required for viewing and printing.
- Decide whether `StJames_Mass_Planner.html` is a genuinely self-contained supported
  artifact or remove that claim.

Acceptance:

- A previously visited Sunday remains viewable and printable after an offline reload.
- Editing is explicitly unavailable rather than silently local.
- A service-worker upgrade replaces the previous shell.

## Phase 7 — browser and print coverage

Add automated browser tests at 390 × 844, 320 px wide, and desktop width for:

- Header and horizontal-overflow behavior.
- Sunday navigation and print controls.
- Reading anchors and verse-number wrapping.
- Modal scroll locking and restoration.
- Song picker modes, focus, duplicate titles, and mutations.
- Suggestion-position editing.
- Public/editor visibility and lyric privacy.
- Keyboard reachability of dialog actions.

Use a dedicated A4 print-only document rather than printing the mobile interface. Test
all music slots, both Communion songs, citation and full-reading modes, overrides, HTML
escaping, attribution warnings, page-break rules, and absence of private lyrics. Verify
the actual browser print preview at A4 size.

Acceptance:

- Primary mobile and print workflows are deployment-gating tests.
- Chrome MCP remains useful for exploratory review, not as the only regression method.

## Phase 8 — documentation

Keep the README concise and add:

```text
docs/architecture.md
docs/data-model.md
docs/lectionary.md
docs/testing.md
docs/operations.md
docs/decisions/
```

Correct stale claims about mobile picker shape, search scope, standalone/offline behavior,
and visual tests. Document architecture decisions for private lyrics, soft suggestion
positions, live canonical song edits, resolved celebration snapshots, and offline
behavior.

The operations runbook must cover project setup, migrations, Edge deployment, editor
provisioning, backup/restore, repertoire export, embedding rebuild and diagnosis,
frontend rollback, migration recovery, and PWA cache behavior.

Acceptance:

- Every documented command has been run from a fresh clone.
- Product guarantees correspond to executable tests or state an explicit limitation.

## Phase 9 — repository hygiene

- Remove legacy generated DOCX files and template directories.
- Put intentional fixtures under `tests/fixtures/`.
- Decide whether both identical planner HTML outputs remain necessary.
- Keep generated deployment outputs only when the deployment mechanism requires them.
- Enforce generated-output consistency in CI.
- Keep applied migration history and add a readable schema snapshot if useful.
- State the source-code licence or proprietary status.

Acceptance:

- Every tracked binary and generated artifact has an explicit purpose.
- A clean build leaves the working tree clean.

## Progress log

- 2026-07-27: Initial architecture, testing, and documentation audit completed.
- 2026-07-27: Plan written; Phase 1 started.
- 2026-07-27: Phase 1 implemented in red-green order. Embedding status now compares
  canonical content hashes, automatic repair is limited to one pass, and a forward
  migration preserves explicitly empty suggestion positions. All 59 tests and the
  production build pass; the migration dry run succeeds. Git push, migration
  application, and Edge Function deployment remain deliberately pending.
- 2026-07-27: Phase 2 started. Dependencies and the Node/npm toolchain are pinned,
  `package-lock.json` is tracked, generated DOCX metadata is normalized so identical
  inputs produce identical HTML, `npm run check` rejects stale generated output, and
  GitHub Actions runs that check. Making the check required before GitHub Pages
  deployment remains a repository-settings task.
- 2026-07-27: Phase 3 started with the repertoire's local adapter. Browser startup is
  separated from construction, storage/catalogue/UUID dependencies are injectable,
  malformed cached data is handled, and editor authorization plus mutation behavior
  is covered by executable Node tests.
- 2026-07-27: The planner's local adapter now has the same construction boundary and
  dependency injection. Executable tests cover offline subscription state, corrupt
  cache recovery, editor authorization, missing-song assignment, reading/celebration
  overrides, and the hard rule that public plan values never expose lyrics.
- 2026-07-27: The Supabase repertoire adapter is now constructed from an injected
  client. Behavior tests prove that public browsing does not request lyrics, editor
  detail loading does, validated drafts map to the expected RPC payload, and database
  failures propagate to the UI.
- 2026-07-27: The Supabase plan adapter now accepts injected client, cache, domain, and
  scheduling dependencies. Tests cover cached-first delivery, suppression of late
  network results after unsubscribe, lyric-free public queries, load-error delivery,
  channel cleanup, and atomic create-and-assign payloads.
- 2026-07-27: Phase 3 completed locally by extracting Edge request parsing and
  embedding chunk selection. Node tests now cover input caps, malformed data,
  suggestion-position validation, reading sanitization, and bounded representative
  chunks without needing Deno or a deployed function.
- 2026-07-27: Phase 4 started with a reset-based local Supabase security suite and a
  separate CI job. Raw HTTP tests provision temporary users and prove public song/plan
  metadata, anonymous and non-editor lyric denial, editor lyric access, private vector
  tables, non-editor mutation denial, atomic create-and-assign, duplicate-title
  identity, explicitly empty suggestion positions, unrestricted manual cross-position
  assignment, and invalid-part rejection.
- 2026-07-27: Phase 4 completed locally. Celebration replacement, Communion suggestion
  normalization, and position-before-vector-ranking are covered. Auditing every
  application mutation found that `clear_reading_override` returned a successful
  no-op to non-editors; a forward migration now makes both reading-override RPCs check
  editor membership explicitly. The full migration chain resets cleanly and the
  eight-test database matrix passes.
- 2026-07-27: Phase 5 started by extracting the ordered Mass music-part definition.
  Planner rendering, DOCX export, both template builders, and semantic Communion
  normalization now consume one tested module instead of maintaining three arrays and
  two normalization implementations.
- 2026-07-27: Safe YouTube-link validation, copyright completeness, and public/editor
  attribution formatting now live in one tested song-presentation module shared by
  the planner, repertoire, and DOCX export. The source field remains explicitly
  optional, and public-domain ownership consistently permits a blank year.
- 2026-07-27: Native-dialog page locking and scroll restoration moved into a small
  controller. Unit tests now cover nested dialogs, deferred restoration after the last
  dialog closes, exact scroll-position recovery, and listener lifecycle.
- 2026-07-27: Install-prompt and service-worker registration behavior now share a
  dependency-injected PWA controller. Tests cover Android prompt retention, iOS manual
  instructions, standalone suppression, load-time registration, and local-file
  exclusion.
- 2026-07-27: Sunday navigation now uses a pure calendar-navigation module. Tests cover
  exact dates, nearest Sundays, range warnings, invalid input, initial upcoming-Sunday
  selection, and previous/next boundary clamping.
- 2026-07-27: Planner and repertoire sign-in dialogs now share an authentication UI
  controller while their stores retain authorization responsibility. Tests cover
  sign-in, sign-out, focus, loading state, error display, unavailable stores, and
  listener cleanup.
- 2026-07-27: Planner and repertoire song editors now share one tested form mapper for
  canonical metadata, private lyrics, and suggestion positions. Context-specific new
  song title and Mass-position defaults remain explicit caller options.
- 2026-07-27: DOCX generation was replaced with a dependency-free, print-only A4
  document that supports physical printing and the browser's Save as PDF action.
  Music-only and full-reading modes share tested markup; private lyrics are excluded,
  music rows cannot split, reading headings stay with their text, and browser print
  lifecycle behavior is covered.
- 2026-07-27: The browser no longer imports an unpinned Supabase client from jsDelivr.
  The exact npm client is bundled locally with a pinned build-only esbuild version,
  included in deterministic-output checks, and cached in the PWA shell. An executable
  smoke test verifies that the generated module exports `createClient`.
- 2026-07-27: Shared-plan startup now preserves the last cached public plan even when
  Supabase startup or loading fails. Offline editor reads and mutations are rejected
  before any request, cached and never-visited Sundays have distinct status text, and
  no successful offline-save message remains.
- 2026-07-27: Phase 6 completed locally. The service worker is generated from a source
  template and explicit app-shell manifest; its cache key hashes the worker logic and
  every cached asset. Chrome verifies that an installed app reloads and prints a
  populated cached Sunday while fully offline, then clearly distinguishes an unvisited
  Sunday. The former single-file claim was removed because deployment requires sibling
  service, vendor, data, configuration, and PWA assets.
- 2026-07-27: Phase 5 continued by extracting music-plan presentation from the planner
  orchestrator. The renderer accepts the existing song-presentation rules as explicit
  dependencies, projects assigned songs down to lyric-free public metadata, and has
  direct tests for public/editor rows, escaping, copyright warnings, safe practice
  links, and the one-action-per-row design. Chrome at 390×844 confirms all 14 public
  rows, no horizontal overflow, no visible lyric data, and no console warnings.
- 2026-07-27: Public reading presentation is now a separate tested module covering the
  selected celebration, linked four-reading summary, full texts, Psalm fallback, and
  celebration/reading adjustment markers. Chrome found and drove the fix for a
  dependency initialization-order error that syntax checks could not detect; the
  corrected 390×844 build has four working anchors, complete texts, no horizontal
  overflow, and no console warnings.
- 2026-07-27: Song-picker result presentation is now separate from picker orchestration.
  Direct tests cover selection state, empty results, compact suggestions, author
  fallback, duplicate-title record identifiers, escaping, and the rule that private
  lyric text is never rendered. A 390×844 local-editor Chrome check confirms the
  Suggested/Search transition, zero initial scroll offset, duplicate records, disabled
  action before selection, one scrolling sheet, and no horizontal overflow.
- 2026-07-27: The celebration picker now delegates nearby-date filtering, multi-word
  standard-lectionary search, ordering, metadata, selected-result markup, and
  alternative-reading previews to a tested module. Coverage includes exclusion of the
  computed Sunday, distant text matches, optional second readings, fixed/selectable
  citations, and escaping. At 390×844 Chrome confirms 30 nearby results, a one-result
  Saint James search, four previewed readings, an enabled selection action, and no
  horizontal overflow.
- 2026-07-27: Reading-override policy is now independent of its dialog. Direct tests
  cover computed restoration, explicit long/short Ordo options, empty and unknown
  citations, wrong-role rejection, missing full text, structured override snapshots,
  and mandatory confirmation for another valid passage in the same slot. Mobile
  Chrome confirms Gospel-in-First-Reading rejection and the Acts 4:32–35 preview,
  confirmation gate, and enabled action at 390 px with no horizontal overflow.
- 2026-07-27: Authentication and date-scoped live-plan subscription ownership moved
  from the planner orchestrator into a dependency-injected session controller. Tests
  cover startup without a store, cached-first delivery, date changes, online and
  offline errors, reconnect cleanup, and idempotent shutdown. At 390×844 Chrome
  confirms that changing Sunday stops the previous subscription exactly once, loads
  the new date, remains “Up to date,” has no horizontal overflow, and logs no warnings.
- 2026-07-27: Song-picker query and selection state now belongs to a dedicated
  controller. Direct tests cover editor/store availability, normalized position
  filtering, the three-suggestion cap, duplicate-title record identity, query errors,
  latest-search-wins behavior, and invalidation of both searches and suggestions when
  the picker closes. At 390×844 Chrome confirms Suggest and Search modes, duplicate
  records, selection state, action enablement, and no horizontal overflow or warnings.
- 2026-07-27: Standard-lectionary celebration replacement now has a dedicated
  controller for candidate state, alternative-reading changes, resolved snapshots,
  saving, and restoration. Tests prove editor-only access, confirmation, immutable
  catalogue data, complete payloads, individual-override clearing, and recoverable
  errors. At 390×844 Chrome finds and saves Saint James with its second reading,
  updates the live Mass, closes the picker, and reports no overflow or warnings.
- 2026-07-27: Individual reading persistence moved behind a controller shared by save,
  single-restore, and restore-all actions. Tests cover computed-reading restoration,
  canonical snapshot fields, explicit confirmation for non-standard passages,
  editor-only access, confirmation before bulk restoration, and failed writes. At
  390×844 Chrome keeps Acts 4:32–35 disabled as a First Reading until confirmation,
  then saves and displays the override without overflow or warnings.
- 2026-07-27: Song loading, Mass assignment/removal, create/update, online enforcement,
  and post-save embedding scheduling now share a mutation controller. Tests cover
  authorization, offline refusal, exact-part updates, editor-only detail loading,
  global canonical-song updates, atomic creation, write failures, and non-blocking
  indexing failures. At 390×844 Chrome confirms one explicit create produces exactly
  one assignment and one embedding sync while private lyrics remain absent from the
  rendered Mass plan.
- 2026-07-27: The individual-reading dialog now delegates slot selection, suggestions,
  allowed-citation options, canonicalization, preview state, and non-standard
  confirmation gating to a controller. Tests cover existing overrides, invalid input,
  editor-only access, suggested choices, confirmation reset, and lifecycle cleanup.
  At 390×844 Chrome confirms the Acts 4:32–35 gate and structured save remain intact
  with no overflow or warnings.
- 2026-07-27: The editor-only liturgical summary now uses a pure view for celebration
  metadata, four reading rows, change/restore actions, and Computed, Selected Mass, or
  Changed badges. Tests cover non-editor suppression, HTML escaping, computed Sundays,
  celebration replacement, and individual overrides. At 390×844 Chrome confirms all
  four rows and both override levels render with the correct restore controls and no
  overflow or warnings.
- 2026-07-27: Phase 7 now has a deployment-gating system-Chrome suite using pinned
  `playwright-core` without downloading another browser. It covers horizontal overflow
  at 320, 390, and 1280 px plus reading anchors, Sunday navigation, music-and-readings
  print output, and hostile public-plan lyric exclusion. `npm run check` runs it after
  the Node suite. `docs/testing.md` records the test layers and browser requirements,
  and the stale README claim that the song picker is full-screen is corrected.
- 2026-07-27: Phase 8 started with a system-level architecture map and accepted decision
  records for the hard-private lyrics boundary, live canonical song edits, soft
  suggestion positions, resolved celebration snapshots, and offline public/online
  editing behavior. The README now routes developers to architecture, decisions,
  testing, and the current hardening plan.
- 2026-07-27: The live schema, entity relationships, snapshot shapes, field constraints,
  access matrix, RPC contracts, public cache projection, Realtime behavior, and
  migration rules now have a dedicated data-model guide. The README retains the
  product-level Supabase summary and links to that guide instead of duplicating its
  implementation detail.
