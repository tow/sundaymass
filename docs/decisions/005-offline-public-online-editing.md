# ADR 005: Support offline public use but require online editing

Status: Accepted

## Context

The installed mobile app should remain useful in a church with unreliable connectivity.
Public viewing and printing can use deterministic checked-in readings plus a previously
cached plan. Shared edits cannot be trustworthy without reaching the central database.
Silently writing them to a local fallback would create divergent plans and false save
confirmation.

## Decision

Cache the application shell with a generated, content-addressed service worker and keep
the last public plan for each visited Sunday in browser storage. Permit offline viewing
and printing of that cached state.

Require a network connection for authentication and all shared mutations. Refuse an
offline edit before making a request and show an explicit unavailable/error state.
Restrict the fully local persistence adapter to `localhost` and `file:` development.

## Consequences

- A visited Sunday remains useful offline; an unvisited shared plan cannot be invented.
- Public cached data may be stale until connectivity returns and the subscription
  reloads it.
- Editors cannot queue changes for later synchronization.
- Offline browser tests must cover both a populated cached Sunday and a never-visited
  Sunday, as well as the absence of false successful-save feedback.
