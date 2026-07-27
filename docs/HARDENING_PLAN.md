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
| 6. Offline/PWA guarantees | In progress | Reliable cached public viewing and explicit online-only editing |
| 7. Browser and print coverage | In progress | Automated primary-workflow and A4 print tests |
| 8. Documentation | Pending | Accurate, split developer and operations documentation |
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
