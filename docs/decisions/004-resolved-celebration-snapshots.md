# ADR 004: Store resolved celebration snapshots

Status: Accepted

## Context

A parish may replace the computed Sunday celebration with another celebration from the
standard lectionary. Some celebrations offer alternative readings. Recomputing a stored
choice later from evolving catalogue logic could silently change the live Mass plan,
and storing only a celebration key would not say which alternatives the editor chose.

## Decision

When an editor selects a celebration, resolve every chosen reading alternative in the
browser and store a complete `celebration_override` snapshot. One database RPC replaces
the snapshot and clears individual reading overrides atomically.

Restoring the computed Sunday clears both the celebration snapshot and individual
overrides. Individual reading overrides may then be applied deliberately as a separate
fine-tuning layer.

## Consequences

- The live plan keeps the exact readings the editor reviewed and selected.
- Catalogue rebuilds do not silently rewrite existing celebration overrides.
- Snapshots duplicate derived celebration data in `plans`.
- Snapshot shape is an application/database contract and needs validation and migration
  care if it changes.
- Replacement and restoration must remain atomic so celebration and individual
  overrides cannot form an unintended mixed state.
