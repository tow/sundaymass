# Future work

This is a parking lot for ideas, not a committed roadmap. Scope and priority still need
to be decided.

## Non-Sunday music planning

Goal: let editors plan music for a Mass on any date, with that date's liturgically
appropriate readings by default, while keeping the Sunday-to-Sunday workflow as the
primary path. The motivating case is the parish's Filipino community, which has agreed
with the priest to celebrate a Filipino Mass on a date of their choosing, such as an
ordinary weekday like 30 October, and wants to plan its music here. Holy days (Christmas
Eve, Ash Wednesday) and ritual Masses (a wedding) are the same problem at the edges. One
plan per calendar date is enough for now; no need for multiple Masses on the same date.
Planned as four parts.

1. **Done (2026-09-10):** renamed the `plans`/`plan_songs`/`plan_song_lyrics`/
   `song_requests` primary key and every dependent column, RPC parameter, and RLS
   policy body from `sunday` to `plan_date`, since a PK literally named "sunday" would
   mislead readers once it can hold non-Sunday dates. Landed on
   `claude/music-planning-non-sunday-tojmw8`. Sunday-to-Sunday calendar navigation
   (`liturgical-calendar.js`, `calendar-navigation.js`, `planner-state.js`) was left
   untouched — that's a distinct concept from the plan-row date identifier.
2. **Done (2026-09-13): default readings for every date.** `LiturgicalCalendar.resolveDay()`
   gives any date the Finnish calendar's celebration, and `LectionaryCatalog` its
   readings, from a new `weekday-lectionary.json` built from Felix Just's weekday and
   Sunday scripture indexes. Not yet embedded in the planner or reachable from its UI;
   that is part 3. The assumptions made and the information still missing, above all the
   Finnish national calendar, are in `docs/lectionary.md` under "Weekdays and other
   non-Sunday dates".
3. **Not started: plan a Mass on any date** — stop `calendarNavigation.selectionFor`
   from snapping an explicit non-Sunday `?date=` to the nearest Sunday (keep the snap
   only for the no-date default landing); add a date picker as a first-class way into a
   plan, alongside the existing prev/next-Sunday arrows; an additive
   `plans.occasion_label text` column so a plan can say what it is ("Filipino Mass")
   and cover anything the catalogues don't resolve; and a resolution order (Sunday →
   the date's default readings from part 2 → celebration override/Sanctoral/Ritual
   picker → free-text label). Re-verify at this stage, per CLAUDE.md, that public views
   and song requests for a non-Sunday plan still never expose lyrics.
4. **Not started, lower priority: Ritual Mass readings** (weddings, funerals) — a
   materially larger, separate effort that the motivating case does not need. No
   existing source (`cpbjr`, the Felix Just tables, the 2002 US Sanctoral index) covers
   this; needs its own citation list, a `commons.json`-style multi-option-per-role shape
   (editor picks one reading per role rather than the app resolving one), and new
   selection UI/domain logic in `src/domain/lectionary.js` and the celebration/reading
   picker. Independently shippable after parts 2 and 3.

Every new liturgical data entry should be confirmed by a human against the actual
parish Ordo before relying on it live, per `docs/lectionary.md`'s existing caveat that
this planner is "an independent planning aid, not an authoritative Finnish lectionary
or parish Ordo."

## Repertoire and planning

- Normalize lyrics formatting so pasted lyrics have consistent whitespace, stanza
  breaks, punctuation, and line endings.
- Evaluate the quality of automatic song suggestions with real Sundays and repertoire
  choices; define examples of good and bad recommendations before tuning the ranking.
- automatically prepopulate psalm based on the OCP series
- do a run through to get youtube links for as many songs as possible.

## Authentication

- Replace email/password sign-in with email magic links.
- Keep `public.editors` as the authorization boundary and public signup disabled.
- Before switching, configure production SMTP, redirect URLs, link expiry, resend and
  rate limits, unknown-email behavior, and installed-PWA return flows.

## Communication

- Make a short demo video covering Sunday selection, music planning, repertoire
  editing, suggestions, and PDF export.
- Check permissions and consent for any music, recordings, people, lyrics, or church
  interior shown in the video.

## Backups and recovery

- Current decision (2026-07-27): do not change the backup setup yet. The live Free
  project has no user-restorable backup snapshots and point-in-time recovery is off.
  Supabase Pro is currently the cheapest plan with managed backups at $25/month,
  including daily database backups retained for seven days. Revisit the choice before
  relying on the planner for data that would be costly to recreate.
- Define acceptable data loss and recovery time.
- Back up the Supabase database, including plans, repertoire, private lyrics, editor
  membership, and authentication data, to encrypted off-site storage.
- Keep a human-readable repertoire export in addition to database backups.
- Document how to restore the database, redeploy Edge Functions, restore project and
  authentication settings, rebuild embeddings, and reconnect the frontend.
- Test recovery into a disposable project periodically; a backup is not considered
  sufficient until a restore has succeeded.

## Operations and security

- Write a small operations runbook covering deployment, rollback, migrations, PWA
  cache updates, editor provisioning, recovery, and common failure modes.
- Add public-site uptime monitoring and a check that a plan can load from Supabase.
- Add cost, quota, backup-failure, and service-pause alerts where available.
- Define an incident process for containment, rollback, credential rotation, recovery,
  and communication.
- Require MFA for GitHub, Supabase, the domain registrar, and the production email
  provider.
- Maintain at least two recoverable administrator accounts and document ownership
  handover.
- Inventory secrets and service-role credentials, and define how they are rotated.
- Periodically exercise authorization/RLS tests and dependency updates.

## Privacy and GDPR

- Identify and document the data controller: an individual, the parish, or another
  organization.
- Inventory personal data and where it appears, including editor email addresses and
  IDs, IP addresses, user agents, authentication events, and operational logs.
- Record the purpose and lawful basis for each processing activity.
- Define retention periods and procedures for access, correction, account removal,
  deletion, and backup expiry.
- Publish a concise privacy notice with controller contact details, purposes, legal
  bases, processors, retention, individual rights, and complaint information.
- Record processors and subprocessors, including Supabase and the future magic-link
  email provider; verify contracts, data-processing terms, and hosting regions.
- Keep data collection minimal and avoid adding analytics or tracking without a clear
  purpose and privacy review.
- Maintain a personal-data-breach checklist, including assessment, documentation,
  notification, and communication responsibilities.

## Copyright and continuity

- Lectionary text check (2026-07-29): the readings proclaimed at Mass (England & Wales
  lectionary, in use since Advent 2024, also the usual choice for English Masses in
  Helsinki) are the ESV Catholic Edition (© Crossway, anglicised) with the Abbey Psalms
  and Canticles (© USCCB) for the responsorial psalms — confirmed against a photo of
  the printed lectionary. There is no legal machine-readable source of that text to
  pull: Crossway's free ESV API serves only the standard US ESV (no anglicisation, no
  CE variants, no deuterocanonical books) and caps local storage at ~500 verses; the
  ESV-CE and Abbey Psalms exist digitally only inside licensed consumer products
  (CTS/SPCK, Augustine Institute apps, Universalis) with no redistribution rights. The
  public site therefore stays on the World English Bible.
- What the lectionary copyrights allow without formal permission vs with a licence
  (2026-07-29): reproducing a Sunday's readings in a one-off congregational worship
  aid — the printed booklet for a single celebration, and by the same reasoning the
  projected slides — is generally permitted with the required copyright
  acknowledgment lines printed on it; Crossway's standing gratis-use policy for the
  ESV (up to 1,000 verses, non-commercial, not a complete book, notice included)
  comfortably covers that scale. What does need actual permission: ongoing digital
  republication — the public website showing each Sunday's readings — and, to be
  clean, the per-Sunday generated exports as a recurring series rather than a true
  one-off. For that, write to the CBCEW Liturgy Office
  (Liturgy.Office@cbcew.org.uk; their copyright guidance still predates the new
  lectionary) for the ESV-CE readings and to USCCB permissions for the Abbey Psalms;
  for a free parish tool this is usually granted and often free or cheap. No data
  feed comes with permission, so ingestion would be an editor-only paste-per-Sunday
  field handled like private lyrics.
- Document the basis for storing, reproducing, printing, and projecting song lyrics,
  and provide a correction or removal contact.
- Keep copyright work separate from GDPR work: attribution alone does not grant
  permission to reproduce lyrics.
- Document how another maintainer can export the data, obtain operational access, and
  continue running the service.
- Periodically check for broken YouTube links and stale repertoire metadata.
- License check (2026-07-28): audited every dependency in `package-lock.json` (frontend/
  build, via `npm ci` + `npx license-checker --summary`) and every dependency in
  `deno.lock` (Supabase edge functions, including the `openai` package used by
  `semantic-songs`). All resolved to permissive licences (MIT, ISC, Apache-2.0,
  BSD-2-Clause, 0BSD, Unlicense, or MIT/Zlib). The only GPL-adjacent package is `jszip`
  (pulled in by `pptxgenjs`), which is dual-licensed `MIT OR GPL-3.0-or-later`; the MIT
  option applies, so no copyleft obligation is triggered. No GPL/LGPL/AGPL-only package
  is in use. Re-check after any dependency upgrade that adds or changes major deps.
