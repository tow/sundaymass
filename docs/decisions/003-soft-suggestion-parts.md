# ADR 003: Treat suggestion positions as soft filters

Status: Accepted

## Context

Most music has a normal liturgical position: a Psalm should not be automatically
recommended for Communion, and a Memorial Acclamation normally fits only that slot.
Exceptional pastoral choices still occur, so the application must not make these
categories hard eligibility rules.

## Decision

Store an editable `suggestion_parts` array on each song. Before semantic ranking, keep
only songs classified for the requested slot. Normalize `communion2` to the shared
`communion` suggestion class.

Use this array only for automatic suggestions. Alphabetical search and manual assignment
remain unrestricted. An explicitly empty array means “do not suggest this song” and is
preserved as empty.

## Consequences

- Suggestions are relevant without blocking exceptional choices.
- A song can be assigned to any Mass slot even if its classification differs or is
  empty.
- Editors are responsible for maintaining classifications as repertoire grows.
- Tests must distinguish suggestion filtering from assignment validation and preserve
  the exceptional cross-position path.
