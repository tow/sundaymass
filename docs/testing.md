# Testing

The default verification command is:

```bash
npm ci
npm run check
```

`check` first syntax-checks the JavaScript sources and type-checks the Supabase Edge
Function with the npm-pinned Deno runtime. It then runs the Node behavior suite, the
headless system-Chrome suite, and a clean deterministic rebuild.
`.github/workflows/verify.yml` runs it for pull requests and pushes to `main`.

For a `main` push, the Pages build waits for both `check` and the migrated-Supabase
integration job. Only then does it stage the explicit public files and publish through
GitHub's Pages Actions deployment. A failed verification job cannot deploy.

## Test layers

- `npm run test:unit` runs the fast Node suite in `tests/*.test.js`. These tests cover
  domain rules, controller state, rendering, store adapters, privacy projections,
  generated-data invariants, and source/build contracts.
- `npm run test:e2e` serves the repository on an ephemeral localhost port and controls
  installed Chrome through pinned `playwright-core`. It does not download or bundle a
  second browser. The suite currently checks 320 px, 390 px, and desktop overflow plus
  the public reading-anchor, Sunday-navigation, print, and lyric-privacy workflow. At
  320 px it also measures the linked reading target, confirms every visible verse
  marker remains on the same rendered line as the following word, and checks visible
  `[...]` elisions. Its editor flow covers the mobile song picker's page-scroll lock and
  restoration, bounded suggestions, explicit search mode, duplicate-title
  disambiguation, private lyric exclusion, and keyboard activation of the selected
  song. A second editor workflow creates a song from Communion 2, changes its soft
  suggestion positions, enters private lyrics, submits by keyboard, verifies the exact
  mutation, and confirms those lyrics never enter the plan DOM. Chrome also renders
  both print modes to real PDF buffers; the suite verifies A4 media boxes, separate
  reading pages, every music slot including both Communion songs, HTML escaping,
  attribution warnings, celebration and individual-reading overrides, and lyric
  exclusion. A service-worker-controlled workflow then goes offline, reloads and
  prints a cached Sunday, and distinguishes an uncached Sunday without contacting
  production.
- `npm run test:integration` resets a local Supabase project and tests the migrated
  authorization, RLS, RPC, privacy, and semantic-suggestion contract. Run it separately
  because it requires Docker and the pinned Supabase CLI.
- `npm run test:coverage` runs the Node suite with Node's built-in coverage report.
- `npm run lint` syntax-checks tracked JavaScript modules. Build-tokenized entry points
  are syntax-checked after assembly by the build-contract tests.
- `npm run check:edge` type-checks the deployed Edge Function and resolves its locked
  Deno/JSR dependency graph without invoking the function.
- `npm run verify:generated` rebuilds the ignored deployable files and fails if the same
  source inputs produce different bytes on a second build.

## Browser requirements

Browser tests use the machine's existing Google Chrome or Chromium. They check the
standard macOS and Linux installation paths. Set `CHROME_PATH` when Chrome lives
elsewhere:

```bash
CHROME_PATH=/path/to/chrome npm run test:e2e
```

The browser tests normally replace `supabase-config.js` with an empty local
configuration and inject controlled plan stores. The offline test primes an isolated
browser cache with the public production configuration only after its context has been
taken offline. Tests therefore do not read or mutate production data, and public
lyric-exclusion checks can deliberately pass a hostile plan value containing lyrics
without exposing a real lyric record.

## Exploratory mobile checks

Chrome DevTools remains useful after automated checks for visual review, especially
  native dialogs and mobile keyboard behavior. Use a 390 × 844 viewport as the baseline
  and also inspect 320 px when changing headers, dialogs, or plan rows. Exploratory
  checks supplement `npm run check`; they do not replace it.

## Adding tests

- Put pure domain, controller, store, or rendering tests directly under `tests/`.
- Put real migrated-database tests under `tests/integration/`.
- Put system-browser workflows under `tests/e2e/`.
- Assert user-visible behavior and module contracts rather than expecting an
  implementation to remain inside `src/app/planner.js`.
- Hard privacy rules need both a browser/store projection test and a migrated Supabase
  authorization test.
