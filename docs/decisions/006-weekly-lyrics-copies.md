# ADR 006: Keep weekly lyrics as explicit full-text copies

Status: Accepted

## Context

Canonical song lyrics should normally improve every future use, but a particular Mass
may omit verses or need other local changes. Editors often want last week's treatment
again, but not always. A canonical/version/weekly three-layer model would create
linking and lifecycle choices that this installation does not need.

Responsorial Psalms add one presentational distinction: the assembly sings the response
and a cantor sings the verses. An omitted verse should remain obvious while editing but
must not appear in congregation-facing exports.

## Decision

Keep canonical lyrics on the song and at most one edited full-text copy on a Sunday
slot. “Reuse most recent edit” copies prior text into the current editor; it does not
link the weeks or create a reusable lyric-version entity.

Psalm editing derives response and verse sections from canonical text. The response is
always included. Verse inclusion is explicit, omitted verses remain visible as disabled
editor sections, and only included sections are serialized. Exports mark included
sections `ALL` or `CANTOR`.

## Consequences

- Canonical corrections continue to propagate unless a slot has an override.
- Reused edits can diverge independently after copying.
- Replacing a slot's song safely discards that slot's override.
- Historical overrides are private lyric data and cannot enter public plans or caches.
- The parser depends on blank-line stanza structure and standard response/verse labels;
  unstructured Psalms fall back to the normal full-text editor.
