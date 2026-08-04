# ADR 008: Remove planner-sheet print exports

Status: Accepted

## Context

The planner offered separate actions for printing the music plan alone and the music
plan with full readings. In practice these documents were not useful enough to justify
their prominent controls, dedicated renderer, print-only stylesheet, and browser test
surface. The choir-facing lyric PowerPoint, slides PDF, and folded booklet serve a
different preparation need and remain useful.

## Decision

Remove both planner-sheet print actions and their dedicated A4 rendering workflow.
Continue showing the public plan and full readings in the browser. Keep all three
authorized lyric downloads unchanged.

This supersedes the print-export parts of ADR 005. Its offline public viewing and
online-only editing decisions remain in force.

## Consequences

- The first planner card is simpler, especially on mobile.
- There is no supported music-plan or music-plus-readings print layout.
- Offline coverage verifies cached viewing rather than printing.
- Lyric PDF exports and their printing instructions are unaffected.
