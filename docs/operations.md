# Operations runbook

This runbook covers the small production installation at
<https://tow.github.io/sundaymass/>. The static frontend is served by GitHub Pages from
an explicit artifact built from verified `main`; shared data and authentication use the
Supabase project referenced by `supabase-config.js`.

Commands in the local verification sections are exercised by development and CI.
Production commands require the operator's Supabase/GitHub credentials and must be run
deliberately against the linked project. Never put a database password, access token,
service-role key, lyric export, or backup in the repository.

## Current production shape

- GitHub Pages uses the custom GitHub Actions publishing source.
- HTTPS is enforced.
- `main` is currently not branch-protected.
- `.github/workflows/verify.yml` runs unit/browser/generated checks and a local Supabase
  integration job on pushes to `main`. It then verifies the existing production
  backend's public contract, deploys Pages, and exercises the result in a fresh browser.
- The Pages build waits for the production backend contract smoke. It stages an
  explicit public artifact and deploys that artifact through the protected
  `github-pages` environment. A failed check or incompatible production schema cannot
  deploy the frontend even though `main` itself is not branch-protected.
- The production smoke runs once after each Pages deployment. There is no scheduled
  synthetic monitor; this installation does not need continuous availability checks.
- Both push and manual deployment paths require `refs/heads/main`; a workflow manually
  run from another branch cannot publish.
- The browser's Supabase URL and publishable key are intentionally public. Security
  comes from grants, RLS, RPC checks, and editor membership.
- No service-role key belongs in a GitHub Pages file. The Edge Function receives its
  platform-provided server environment inside Supabase.

## Required tools

- Node 22.20.x and npm 10.9.x, as pinned by `.node-version` and `package.json`
- Deno 2.8.1, installed locally by `npm ci` from the pinned development dependency
- Google Chrome or Chromium for the browser gate
- Git and GitHub credentials for frontend deployment
- Docker-compatible runtime for local Supabase integration tests
- Supabase CLI 2.109.1, matching the CI workflow

The examples use the pinned CLI without installing it globally:

```bash
npx --yes supabase@2.109.1 --version
```

## Local verification

From a clean clone:

```bash
npm ci
npm run check
```

For database/RLS changes, also run:

```bash
npx --yes supabase@2.109.1 start
npm run test:integration
```

The integration command resets the local database, applies every migration, creates
temporary fixtures, and verifies the authorization matrix. It must never target the
linked production database.

See [`testing.md`](testing.md) for test ownership and browser requirements.

## First Supabase deployment

The production project reference is the subdomain/project ID in `supabase-config.js`,
not an organization slug.

Authenticate and link the repository:

```bash
npx --yes supabase@2.109.1 login
npx --yes supabase@2.109.1 link --project-ref igeeigohcupcxakmlxno
npx --yes supabase@2.109.1 migration list --linked
```

Review the linked project shown by the CLI before any write. Preview and apply tracked
migrations without seed data:

```bash
npx --yes supabase@2.109.1 db push --linked --dry-run
npx --yes supabase@2.109.1 db push --linked
npx --yes supabase@2.109.1 migration list --linked
```

Never use `--include-seed` on production. Never run `db reset --linked` against this
project: it drops remote data and replays the schema.

Deploy the native semantic function after its tables/RPCs exist:

```bash
npx --yes supabase@2.109.1 functions deploy semantic-songs \
  --project-ref igeeigohcupcxakmlxno
```

Do not pass `--no-verify-jwt`. The function also verifies editor membership before
using its service-role access.

### Authentication configuration

In the Supabase Dashboard:

1. Set the Auth Site URL to `https://tow.github.io/sundaymass/`.
2. Disable public user signup.
3. Leave Email/password sign-in enabled for existing administrator-created users.
4. Create each editor under Authentication → Users, set an initial password, and mark
   the user confirmed.
5. Add the Auth user UUID to `public.editors`.

The editor grant can be made in the SQL Editor after replacing the address:

```sql
insert into public.editors (user_id)
select id
from auth.users
where lower(email) = lower('editor@example.com')
on conflict (user_id) do nothing;
```

Confirm that exactly one intended Auth user has that email before treating the insert
as successful. Removing the `editors` row revokes writes but does not delete the Auth
account or its audit history.

Public signup and password sign-in are separate settings: disabling signup prevents new
self-service accounts but does not prevent existing users signing in. Magic-link
authentication is planned but not implemented; it will require production email
delivery and redirect-flow testing.

### Browser configuration

`supabase-config.js` must contain only:

- the project HTTPS URL; and
- the public/publishable browser key.

After changing it, run `npm run check` so the generated service-worker cache represents
the new asset. Never put the database password, personal access token, or service-role
key in this file.

## Normal release

Every new migration begins with one of these exact headers:

```sql
-- rollout: expand
```

```sql
-- rollout: contract
```

An ordinary release must be backward-compatible and use `expand`: add nullable
columns, tables, functions, overloads, indexes, or permissive policies without removing
the contract used by the already-deployed site. Populate or dual-write new data in the
same or a later expand migration. Deploy frontend code that can coexist with both old
and new data before removing anything.

A `contract` migration may remove or rename a table, column, function, view, or type;
tighten access; truncate data; or otherwise break an older client. The rollout checker
recognises these operations and refuses to label them as expand. Because installed PWA
clients can remain cached, wait at least one full service-worker compatibility window
after the compatible frontend release, verify current usage, and take a fresh backup
before applying the contract migration manually.

GitHub Actions deliberately has no production Supabase credential and never mutates the
production backend. For a release with backend changes:

1. Run all local and migrated-database checks.
2. Preview and apply the migration manually with `db push --linked --dry-run`, then
   `db push --linked`.
3. Deploy `semantic-songs` manually if its implementation changed.
4. Run `npm run smoke:backend` against production.
5. Push the frontend to `main`.

The push then calls the public REST and suggestion RPC contracts before Pages can
deploy. This is the migration-forgetting gate: an incompatible production schema stops
the workflow while the currently deployed site remains untouched. After deployment,
the workflow opens the site in a new mobile-sized browser context and verifies the
planner, repertoire, Supabase responses, listening links, anonymous controls, and
lyric privacy.

`npm run build` writes the generated planner entry point, repertoire page, local
Supabase bundle, icons, and content-addressed service worker. These are ignored build
outputs, not versioned source. The workflow then runs `npm run stage:pages`, which
copies only the explicit public surface into the Pages artifact.

Frontend-only release:

```bash
npm ci
npm run check
git push origin main
```

The push starts the production workflow. The frontend deploy occurs only after the
Node/browser gate, migrated-Supabase integration suite, and public production backend
contract all pass.

To run the same read-only production checks from a workstation:

```bash
npm run smoke:production
```

### Post-release smoke test

In a public/private browser session:

- load the current Sunday;
- move to the next Sunday and back;
- follow all four reading-summary links;
- open the repertoire without signing in;
- confirm no editor controls or lyrics are visible;
- print music only and music plus readings; and
- reload once offline after a successful online visit.

With an editor account:

- sign in and verify the editor state;
- open and close the song picker without changing data;
- download a lyrics PowerPoint for a fully populated plan and open it in PowerPoint or
  LibreOffice; confirm every selected position appears in Mass order;
- verify suggestion-index status on the repertoire page; and
- make a real data change only when the release specifically needs a mutation test.

## Editor lifecycle

### Add an editor

1. Create and confirm the Auth user in the Dashboard.
2. Insert that user's UUID into `public.editors`.
3. Have the user sign in and perform a harmless read/open check.
4. Confirm another signed-in user without membership still cannot mutate through the
   integration test or a direct API check.

### Remove an editor

Delete only the membership row:

```sql
delete from public.editors
where user_id = '00000000-0000-0000-0000-000000000000';
```

Then revoke or delete the Auth account separately if the person should no longer be
able to sign in at all. Existing `created_by`/`updated_by` references explain why user
deletion may need more care than membership removal.

## Backups

For this low-volume installation, take a logical data backup before every schema/data
migration and on a regular schedule appropriate to the maximum acceptable loss. Free
projects should not be assumed to provide downloadable retained backups.

Create a directory outside the repository, then dump from the deliberately linked
project. Replace the example paths with a dated secure location:

```bash
npx --yes supabase@2.109.1 db dump --linked \
  --file /secure-backups/sundaymass/2026-07-27-schema.sql
npx --yes supabase@2.109.1 db dump --linked --data-only --use-copy \
  --file /secure-backups/sundaymass/2026-07-27-data.sql
```

The data dump can contain email/account data and private lyrics. Encrypt or otherwise
protect it, keep it outside Git, and verify that the files are non-empty. A backup is
not proven until a restore into a separate test project has succeeded.

Paid Supabase projects may also have managed daily backups or Point-in-Time Recovery in
Database → Backups. Restoring a hosted backup causes downtime; review the timestamp and
expected data loss before confirmation. Supabase's current backup guidance is at
<https://supabase.com/docs/guides/platform/backups>.

## Portable repertoire export

A complete database backup is the recovery artifact. For a human-readable repertoire
transfer, an authorized operator can run this in the Supabase SQL Editor and download
the result as CSV:

```sql
select
  s.id,
  s.title,
  s.youtube_video_id,
  s.authors,
  s.copyright_owner,
  s.copyright_year,
  s.source,
  s.suggestion_parts,
  sl.lyrics,
  s.created_at,
  s.updated_at
from public.songs s
left join public.song_lyrics sl on sl.song_id = s.id
order by lower(s.title), s.id;
```

That export contains private lyrics and must not be published or committed. Export plan
history separately so canonical songs remain reusable:

```sql
select
  ps.sunday,
  ps.part,
  ps.song_id,
  s.title,
  s.authors,
  ps.updated_at
from public.plan_songs ps
join public.songs s on s.id = ps.song_id
order by ps.sunday, ps.part;
```

## Restore and disaster recovery

Prefer restoration into a new project first. It preserves the damaged production
project for diagnosis and lets the operator verify schema, data, Auth users, RLS, Edge
Function deployment, and the frontend configuration before switching.

For a managed backup, use Database → Backups and follow the Dashboard confirmation.
For a logical dump, follow Supabase's maintained CLI restore guide rather than assuming
that feeding one SQL file into a live project reconstructs Auth and platform-managed
state:
<https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore>.

After any restore or project replacement:

1. compare `migration list --linked` with the repository;
2. run the integration suite against an equivalent local reset;
3. deploy `semantic-songs`;
4. verify Auth Site URL, signup setting, users, and editor memberships;
5. update `supabase-config.js` only if the project changed;
6. rebuild the semantic index;
7. run public/editor privacy smoke tests; and
8. deploy the rebuilt frontend if its project configuration changed.

Vectors are derived data. Losing them affects suggestions, not canonical songs, private
lyrics, reading texts, or Mass assignments.

## Semantic-index maintenance

The repertoire page is the normal maintenance surface:

- saving a new or edited song requests one post-save vector sync;
- opening the repertoire as an editor compares canonical song content hashes with
  stored hashes and performs one bounded repair pass; and
- “Update suggestion index” batches every song and checked-in reading, while the Edge
  Function skips unchanged content by hash.

Run the manual update after:

- first Edge Function deployment;
- a full restore;
- changing the embedding model or canonical input construction;
- rebuilding the reading catalogue; or
- an interrupted/failed repair that still reports stale songs.

The operation is resumable and safe to repeat. It does not run on every autosave
keystroke.

If the repertoire says the index is unavailable:

1. confirm the user is still an editor;
2. confirm `semantic-songs` is deployed;
3. inspect the function logs in the Supabase Dashboard;
4. compare remote migrations and check that vector tables/RPCs exist;
5. retry the manual update; and
6. verify that the built-in model invocation is available in the project region.

For a deliberate complete rebuild, make a backup, delete only rows from
`song_embeddings` and `reading_embeddings` in the SQL Editor, then press “Update
suggestion index.” Never delete `songs`, `song_lyrics`, or `plan_songs` to repair
derived vectors.

## Migration recovery

Before applying:

- create a forward migration;
- prove a full local `db reset` through `npm run test:integration`;
- make a production backup; and
- inspect `db push --linked --dry-run`.

If a push fails before a migration is recorded, inspect the remote schema and the error
before retrying. If the migration has been applied anywhere shared, do not rewrite it;
add a new corrective migration.

Use:

```bash
npx --yes supabase@2.109.1 migration list --linked
```

to compare local and remote history. Migration-history repair is appropriate only when
the schema has been manually audited and the history table, rather than the actual
schema, is wrong. Do not mark a failed migration applied merely to make the list green.

If a migration corrupts or deletes canonical data, stop writes and restore the last
acceptable backup or Point-in-Time Recovery point. A Git revert cannot undo a database
migration or recover rows.

## Frontend rollback

Use a new revert commit so history remains explicit:

```bash
git revert <bad-commit>
npm ci
npm run check
git push origin main
```

If the bad release also changed the database, determine whether the previous frontend
is compatible with the forward schema. Add a corrective forward migration when needed;
do not edit or remove an applied migration.

After Pages rebuilds, verify the live HTML and the service-worker cache name. GitHub
Pages status can be checked with:

```bash
gh api repos/tow/sundaymass/pages
```

## PWA cache behavior and diagnosis

The build hashes the service-worker template, shell manifest, and contents of every
shell asset into `CACHE_NAME`. A changed asset therefore produces a new worker cache
without a manually maintained version.

On installation, the worker downloads the complete shell and calls `skipWaiting()`. On
activation, it claims clients and removes old application caches. Navigations are
network-first with page-specific offline fallbacks; other same-origin assets return the
cached response while refreshing it. Planner, repertoire, and About navigations have
distinct cache targets.

When a device appears stale:

1. confirm the expected commit is actually published by Pages;
2. fetch `service-worker.js` and compare its cache name with the local generated file;
3. reload while online so the browser can discover and activate the worker;
4. close and reopen the installed app if an existing page still holds old in-memory
   state; and
5. only as a last resort, clear the site's storage/service worker and revisit online.

Clearing site storage also removes cached public plans and may remove the persisted Auth
session. Do not recommend it as the first refresh step.

An unvisited Sunday cannot have a shared plan offline. The expected message is
“Offline — no saved plan,” not a blank success state.

## Incident priorities

1. Protect private lyrics and credentials.
2. Stop unauthorized or destructive writes.
3. Preserve/backup canonical songs, plans, and editor membership.
4. Restore public viewing and printing.
5. Rebuild derived vectors and offline caches last.

Record the affected commit, migration versions, project, time window, observed behavior,
and recovery action. For a suspected lyric leak, revoke the path first, preserve logs,
and verify anonymous plus non-editor denial directly against the database before
declaring recovery.
