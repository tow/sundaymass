# ADR 001: Keep song lyrics behind a separate permission boundary

Status: Accepted

## Context

Song titles and attribution must be publicly browsable, but lyrics must never be
readable by anonymous visitors or signed-in non-editors. Hiding a field in the UI or
omitting it from one query would still allow a browser client to request a public table
directly.

## Decision

Store optional lyrics in the one-to-one `song_lyrics` table rather than on `songs`.
Grant the browser's authenticated role table access only so Row Level Security can
admit members of `public.editors`; grant anonymous users no access. Public plan and
repertoire queries never join this table.

Vectors may be derived from lyrics, so vector tables receive the same or a stricter
boundary: browser roles have all privileges revoked and only the service-role Edge
Function may access them.

## Consequences

- The database, not merely the page, enforces lyric privacy.
- Public song records and caches cannot accidentally include a lyrics column.
- Editing a complete song requires joining two records and saving them together through
  an authorised path.
- This split is justified by permissions, not because lyrics are a separate domain
  entity. If the privacy requirement disappeared, a separate table would be
  questionable.
- Integration tests must continue to exercise anonymous, non-editor, and editor access
  directly against the migrated database.
