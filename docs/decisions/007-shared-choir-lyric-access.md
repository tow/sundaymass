# ADR 007: Use one shared choir identity for read-only lyric access

Status: Accepted

## Context

Anonymous visitors must not receive copyrighted lyric text, but choir members need to
read the full repertoire and download the selected Sunday's PowerPoint and PDF lyric
materials. Managing a separate username, email, invitation, or recovery flow for every
choir member would be disproportionate for this choir. Editors still need individual
identities because their changes affect shared canonical and Sunday-specific data.

## Decision

Represent the choir with one administrator-created Supabase email/password Auth user.
The browser supplies its fixed configured email and asks the choir member only for the
shared password. Put that Auth user in `public.choir_members`; keep individual editors
in `public.editors`.

Allow either membership to select canonical and weekly lyric tables. Continue to
require editor membership in every write policy and mutation RPC. Public repertoire
and plan queries remain lyric-free, and authorized clients fetch lyrics only on demand.
Lyric downloads remain online-only and never enter the public offline plan cache.

This supersedes ADR 001 only where that record says signed-in non-editors can never
read lyrics. Its separate-table permission boundary remains in force.

## Consequences

- Choir members handle one shared password and never enter a username.
- Rotating one password revokes every previously distributed choir credential.
- The fixed Auth email is a public implementation identifier, not a secret.
- Everyone holding the shared password can read any canonical lyric and any historic
  weekly override through the API, even though the normal UI shows canonical lyrics
  and selected-Sunday exports.
- Choir activity is attributable to the shared identity, not an individual singer.
- Editors retain individual accountability and exclusive write access.
- Integration tests must cover anonymous, unrelated authenticated, choir, editor, and
  service-role behavior independently.
