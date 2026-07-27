# ADR 002: Edit canonical songs live

Status: Accepted

## Context

The same song is used on multiple Sundays. The installation is small, its existing data
can be migrated wholesale, and editors need corrections to propagate without repairing
each historical plan. Keeping an immutable song snapshot on every assignment would add
version and reconciliation workflows that the current product does not need.

## Decision

Store songs as canonical entities with UUID identity. `plan_songs` references one song
from one Mass slot. Titles are deliberately non-unique, and authors and attribution
help editors disambiguate records.

Editing a song changes the canonical record immediately everywhere it is referenced.
There is no draft, publish, or historical song-version workflow.

## Consequences

- Corrections and new practice links appear on all associated Masses immediately.
- A historical printed plan may differ from the current canonical metadata.
- Editors must understand that “edit song details” is global, while “remove from this
  Mass” or changing a slot affects only that plan assignment.
- A future audit/history requirement would need a new versioning or snapshot decision,
  not an unnoticed change to this model.
