# Future work

This is a parking lot for ideas, not a committed roadmap. Scope and priority still need
to be decided.

## Repertoire and planning

- Normalize lyrics formatting so pasted lyrics have consistent whitespace, stanza
  breaks, punctuation, and line endings.
- Evaluate the quality of automatic song suggestions with real Sundays and repertoire
  choices; define examples of good and bad recommendations before tuning the ranking.
- do a separate semantic match against each reading, might give different results
- automatically prepopulate psalm based on the OCP series
- assign psalm settings based exactly on psalm number.

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
