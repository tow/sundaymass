# Architecture decisions

These records explain choices that would otherwise look accidental or unnecessarily
complex:

- [ADR 001: Keep song lyrics behind a separate permission boundary](001-private-song-lyrics.md)
- [ADR 002: Edit canonical songs live](002-live-canonical-song-edits.md)
- [ADR 003: Treat suggestion positions as soft filters](003-soft-suggestion-parts.md)
- [ADR 004: Store resolved celebration snapshots](004-resolved-celebration-snapshots.md)
- [ADR 005: Support offline public use but require online editing](005-offline-public-online-editing.md)
- [ADR 006: Keep weekly lyrics as explicit full-text copies](006-weekly-lyrics-copies.md)
- [ADR 007: Use one shared choir identity for read-only lyric access](007-shared-choir-lyric-access.md)

An accepted decision may be superseded by a later ADR, but should not be silently
rewritten after the implementation or its tradeoffs change.
