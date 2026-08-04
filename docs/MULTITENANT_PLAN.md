# Multi-parish and internationalization plan

## Status

Proposed implementation plan. This document defines the intended product and technical
direction; it is not yet an architecture decision or implementation contract.

## Summary

Turn the St James Mass Planner into one application that can serve multiple independent
Catholic parishes and multiple recurring Mass communities within each parish.

The durable tenant boundary is a **planning space**, not a parish. A parish may have
several choirs, languages, rites, and Mass times, each with an independent plan and
repertoire.

The current Finnish calendar, English planning text, St James identity, and St James
titular solemnity become explicit configuration. Finland is the first supported
liturgical package, not the platform default or the intended market boundary.

The recommended implementation keeps one web application and one Supabase project.
Postgres Row Level Security isolates tenant data. The native iOS and Android apps, if
added, use one generic product identity while applying parish branding inside the app.

## Goals

- Preserve the current St James experience and data through the migration.
- Support several parishes in one deployed application.
- Support several planning spaces within a parish, including two spaces planning the
  same date independently.
- Give each parish a coherent identity: names, links, logo, colours, typography,
  language, help text, exports, and liturgical context.
- Support country-, diocese-, language-, and parish-specific calendars and
  lectionaries without embedding Finnish assumptions in the application shell.
- Keep plans, repertoire, lyrics, memberships, caches, suggestions, and Realtime
  events isolated by planning space.
- Allow one person to belong to and switch between several planning spaces.
- Keep the application useful when only citations, rather than licensed full reading
  texts, are available for a territory.
- Retain the existing mobile-first, offline-capable public planning experience.

## Non-goals for the first release

- Billing, subscriptions, and automated commercial provisioning.
- A globally editable shared hymn database.
- Separate near-identical App Store applications for every parish.
- Arbitrary tenant-provided CSS or HTML.
- Immediate support for every country, rite, language, or official Bible translation.
- Automatic scraping and publication of copyrighted lectionary or hymn text.

## Product hierarchy

```text
Platform
└── Parish
    ├── Parish owners and administrators
    └── Planning space
        ├── Mass/choir identity and schedule
        ├── Calendar and lectionary configuration
        ├── Editors and choir members
        ├── Repertoire and lyrics
        └── Date-specific Mass plans
```

Examples of planning spaces within one parish could include Sunday 18:00 English Mass,
Sunday 10:30 Finnish Mass, a youth choir, or another recurring liturgical community.

## Configuration model

Configuration exists at four levels.

| Level | Examples |
|---|---|
| Platform | Product name, App Store icon, privacy policy, structural UI |
| Parish | Official and short names, website, logo, palette, diocese |
| Planning space | Mass name, choir name, language, schedule, visibility |
| Liturgical | Rite, territory, calendar layers, lectionary, text source |

### Parish identity

The parish record should support at least:

```text
official_name
display_name
short_name
slug
website_url
website_link_label
address
city
country
timezone
diocese_name
contact_email
default_locale
logo_asset
compact_logo_asset
```

The full name is used in legal and help contexts. The display and short names are used
in normal and narrow mobile navigation respectively.

### Planning-space identity

Each space should support:

```text
display_name
short_name
choir_name
language
schedule_label
public_title
public_description
visibility
```

For the current community, these might be `Sunday 6pm English Mass`, `6pm Mass`, and
`6pm Mass music planner`.

### Theme system

Replace the duplicated St James CSS values with a shared semantic theme:

```text
primary
primary_hover
primary_soft
page_background
surface
text
text_muted
border
focus
success
warning
danger
heading_font
body_font
corner_style
logo_variant
```

The application owns layout, interaction design, breakpoints, accessibility, and
component behavior. A parish can select a validated palette, approved fonts, and
branding assets. It cannot inject arbitrary CSS or HTML.

The configuration UI must preview mobile and desktop presentation and reject or repair
inaccessible colour combinations.

### Branding assets

Parish assets live in a tenant-scoped Supabase Storage bucket. Uploads require MIME,
size, and dimension validation. Public branding is readable only where deliberately
published; administrative or draft assets remain private.

The current generated chapel icon is St James-specific. A multi-parish native app
therefore needs a generic product icon and name. Parish branding begins inside the
application. A separately branded web manifest per parish can be considered later if
hosting supports tenant-specific manifests and icons.

### Language and terminology

Use a versioned translation catalogue for application strings, with narrowly scoped
parish overrides. Configurable terms include the planner title, Repertoire/Songs,
member-role wording, parish links, Ordo confirmation, date formatting, help copy, and
Mass-part labels.

Do not store the entire interface as uncontrolled per-parish copy.

## Proposed tenant data model

| Entity | Responsibility |
|---|---|
| `parishes` | Organization identity, geography, defaults, and branding |
| `planning_spaces` | A particular Mass or choir within a parish |
| `parish_memberships` | Parish owners and administrators |
| `space_memberships` | Editors and choir members for a planning space |
| `plans` | One plan per space and date |
| `songs` | Space-owned canonical song records |
| `song_lyrics` | Space-owned private canonical lyrics |
| `plan_songs` | Space/date/part assignments |
| `plan_song_lyrics` | Space-specific weekly lyric copies |
| `song_embeddings` | Space-scoped semantic index |
| `reading_embeddings` | Shared derived data for compatible reading texts |

The principal plan keys become:

```text
plans
  primary key (space_id, sunday)

plan_songs
  primary key (space_id, sunday, part)

plan_song_lyrics
  primary key (space_id, sunday, part)
```

Every tenant-owned table should carry `space_id` directly, even where it could be
inferred through a join. Direct tenant keys simplify and speed up RLS and allow
composite foreign keys to prevent cross-space references.

The first release keeps songs space-owned. Editors cannot change another parish's
canonical record, local repertoire status has an unambiguous meaning, and lyric rights
remain local. A later curated catalogue may offer public-domain or licensed metadata
that a parish explicitly copies into its own repertoire.

## Roles and authorization

| Role | Capabilities |
|---|---|
| Public | Read deliberately public plans and public song metadata |
| Choir | Additionally read lyrics and create congregation-facing exports |
| Editor | Additionally edit plans, readings, songs, and lyrics |
| Admin | Additionally configure the space and manage its members |
| Owner | Manage the parish, planning spaces, and parish administrators |

Authorization remains in Postgres, not only in the interface. Indexed helper functions
should answer whether the current user can view a space or has one of a bounded set of
roles. Every tenant-aware mutation RPC accepts `space_id` and repeats its authorization
check.

The current shared choir identity should not become a global multi-parish identity.
Use individual accounts and invitations. Email magic links or passwords may both be
supported. Trusted invitation and membership operations belong in Supabase Edge
Functions because Auth administration secrets must never reach the static client.

## International liturgical model

Country selection alone is insufficient. A planning space must select compatible
calendar, lectionary, text, and language profiles independently. An English Mass in
Finland can require the Finnish national calendar, Helsinki diocesan additions, an
English UI, and an English text source.

### Calendar layers

```text
Universal Roman calendar
          ↓
National calendar
          ↓
Diocesan calendar
          ↓
Parish/local calendar
          ↓
Planning-space override
```

The existing general Roman behavior becomes the base. Finnish transfers and Saint
Henry become a Finland layer. Helsinki-specific entries become a diocesan layer. The
Saint James titular solemnity becomes a local St James layer.

### Liturgical entities

| Entity | Responsibility |
|---|---|
| `rites` | Initially Roman Rite; avoids making it an invisible assumption |
| `calendar_profiles` | Universal, national, and diocesan rules |
| `calendar_layers` | Additions, transfers, ranks, and local propers |
| `lectionary_profiles` | Reading cycles, sequences, and citation choices |
| `scripture_text_profiles` | Translation, language, licensing, and text access |
| `language_packs` | Application and liturgical terminology |
| `liturgical_packages` | Tested compatible combinations of the profiles above |

The application consumes a stable package interface rather than importing a Finnish
calendar directly:

```js
resolveDate(date)
scheduledCelebration(date)
availableCelebrations(date)
readingOptions(celebration)
normalizeCitation(citation)
getReadingText(citation)
```

### Package versioning

Published packages are immutable and versioned, for example:

```text
roman-fi-calendar@2026.1
roman-fi-en-lectionary@2026.1
web-en-text@2026.07
```

Each package version records its territory, language, effective dates, provenance,
licensing status, integrity hash, and superseded version. Plans record the relevant
package versions so an update does not silently change previously prepared Masses.

### Reading-text capability

Keep citation selection separate from displayed Scripture text. A territory may offer:

1. Citations only.
2. Clearly labelled public-domain planning text.
3. Licensed official lectionary text.

The application must remain useful at level 1. Official vernacular lectionaries and
Bible translations must not be copied merely because their citations are known.

### Citation normalization

Internal Scripture identity must not depend on one territory's display string. Store a
normalized book, chapter, and verse representation alongside the package-specific
display citation. This is particularly important for Psalm and canticle numbering.

Psalm-song matching and semantic suggestions should use normalized Scripture identity
and the active lectionary profile rather than only a displayed Psalm number.

### Package delivery

Do not embed every international catalogue in the main application bundle. After the
active space is known, load its package manifest, calendar data, lectionary data, and
optional reading-text index. Cache previously used packages for offline access.

## Frontend and service changes

Every store operation becomes explicitly space-aware:

```js
getPlan(spaceId, date)
searchSongs(spaceId, query)
assignSong(spaceId, date, part, songId)
suggestSongs(spaceId, citations, part)
```

Required application changes include:

- Add active parish and planning-space context.
- Add a space switcher for users with several memberships.
- Include `spaceId` in all cache and local-storage keys.
- Filter every Supabase query and Realtime subscription by space.
- Replace hard-coded St James names, links, colours, and help copy.
- Convert the static About page into a configured template.
- Inject parish and space identity into PDFs, PowerPoints, booklets, metadata, and
  filenames.
- Scope repertoire search, suggestion status, embedding repair, and imports.
- Load the active liturgical package rather than embedding Finnish catalogues globally.

Public URLs can initially use query parameters compatible with GitHub Pages:

```text
/?space=st-james-6pm&date=2026-08-09
```

Clean path-based URLs can follow if hosting moves to a service with rewrite support.

## Semantic search changes

Every semantic request includes `spaceId`. The Edge Function verifies the caller's
access before using its service-role client and filters songs and embeddings to that
space. Status and repair are reported per space. Anonymous suggestions are allowed
only for spaces whose public configuration permits them.

Reading embeddings may be shared when the normalized citation and exact text-profile
version match. Song embeddings remain space-owned.

## Migration strategy

The migration must be additive so the existing deployed frontend remains usable during
rollout.

1. Create parish, planning-space, configuration, and membership tables.
2. Create the St James parish and Sunday 18:00 planning space.
3. Add nullable `space_id` columns to existing tenant-owned tables.
4. Backfill all existing records and memberships into the St James space.
5. Add tenant indexes and composite foreign keys.
6. Validate that no tenant-owned record remains unscoped.
7. Introduce tenant-aware versioned RPCs while retaining current RPCs temporarily.
8. Extract universal, Finland, Helsinki, and St James liturgical layers.
9. Deploy the space-aware frontend and semantic function.
10. Verify production data, authorization, exports, offline caches, and Realtime.
11. Make tenant keys non-null and remove compatibility functions in a later migration.

## Administration and operations

The maintenance CLI must require an explicit space for every tenant-owned operation:

```text
sundaymass list_spaces
sundaymass list_songs --space st-james-6pm
sundaymass assign_song --space st-james-6pm ...
```

A mutation without a space must fail rather than guess. Operations should also add
per-space exports, tenant-scoped audit events, offboarding/deletion procedures,
embedding quotas, invitation rate limits, and backup/restore verification.

## Testing requirements

### Tenant isolation

Create two hostile test tenants and prove that Parish A cannot read or mutate Parish B
through:

- Direct REST requests
- Nested Supabase selects
- RPC calls
- Guessed UUIDs
- Realtime subscriptions
- Semantic functions
- Lyrics and weekly lyric endpoints
- Offline cache keys
- Storage asset paths

### Configuration and branding

- Test short, long, accented, and multilingual parish names.
- Test several substantially different accessible themes.
- Test missing, replaced, oversized, and unauthorized branding assets.
- Verify identity in planner, repertoire, help, manifest fallback, and every export.
- Check mobile and desktop presentation for every reference theme.

### Liturgical packages

Reject a package unless:

- Every supported date resolves deterministically.
- Every required reading role is present.
- Layer precedence is deterministic.
- Citation normalization is valid and reversible where claimed.
- Every claimed full-text citation resolves.
- Provenance and licensing metadata are present.
- Package-specific oracle and boundary-date tests pass.

The abstraction must be proven with a second, materially different territory. Testing
only Finland would leave hidden Finnish assumptions in the package interface.

## Delivery sequence and estimate

These are focused engineering estimates for the existing codebase and agent-assisted
workflow. Acquisition, verification, or licensing of a territory's liturgical data is
estimated separately.

| Workstream | Estimate |
|---|---:|
| Tenant schema, RLS, and St James backfill | 1–2 days |
| Space-aware stores, caches, Realtime, and CLI | 1–2 days |
| Parish identity, themes, assets, and exports | 1–2 days |
| Extract Finland into the liturgical package interface | 1–2 days |
| Membership administration and invitations | 1–2 days |
| Second territory package, given usable source data | 1–3 days |
| Cross-tenant security testing and pilot fixes | 1–2 days |

Expected outcomes:

- Working proof of concept: **2–4 focused days**.
- Production-capable two-parish web pilot: **7–12 focused working days**.
- Polished self-service product: approximately **3–5 weeks**, driven mostly by
  onboarding and data quality rather than the tenant refactor itself.

Native packaging and store submission are separate workstreams. The uncertain part of
international expansion is the acquisition, licensing, and validation of each
territory's calendar, lectionary, and full-text sources—not the package mechanism.

## Suggested implementation stages

### Stage 1: Working tenant boundary

- Add parish and planning-space records.
- Backfill St James.
- Make plans, songs, memberships, caches, and core RPCs space-aware.
- Prove two-tenant isolation in integration tests.

### Stage 2: Identity and configuration

- Consolidate the theme system.
- Replace St James hard-coding.
- Add parish/space settings, branding assets, and configured exports.
- Add a minimal settings and preview surface.

### Stage 3: Liturgical packages

- Extract universal Roman, Finland, Helsinki, and St James layers.
- Lazy-load the active package.
- Version package provenance and text capabilities.
- Add one contrasting synthetic or real second package.

### Stage 4: Real pilot

- Add invitations and membership administration.
- Onboard one real parish outside the current St James context.
- Fix configuration and package assumptions exposed by the pilot.
- Rehearse migration, rollback, export, and tenant-offboarding procedures.

### Stage 5: Controlled international expansion

- Select additional territories according to real parish demand, authoritative source
  availability, and licensing feasibility.
- Treat each territory as a maintained, tested data package rather than application
  code.
- Add native packaging after the multi-parish web experience is stable.

## MVP acceptance criteria

- St James retains its current identity, data, features, and Finnish behavior.
- Two planning spaces can plan the same date independently.
- A user can belong to and switch between several spaces.
- Tenant A cannot access Tenant B's private data or mutations through any supported
  API path.
- Public data is visible only for spaces configured as public.
- Search, suggestions, exports, caches, storage, and Realtime are tenant-scoped.
- A parish administrator can configure identity and invite an editor or choir member.
- Long names and distinct parish themes remain usable and accessible.
- Finland is selected explicitly as a liturgical package.
- At least one second package proves that calendar and lectionary behavior is not
  Finland-specific.
- The application works with citations only when full reading text is unavailable.
- Every operational mutation requires an explicit planning space.

## Product principles

1. Planning-space identity is mandatory at every tenant-owned boundary.
2. The platform owns interaction quality, accessibility, and structural consistency.
3. Each parish owns its naming, links, language, liturgical context, assets, and a
   bounded visual theme.
4. Calendars, lectionaries, and reading texts are separately versioned components.
5. Finland is one supported package, never an implicit global default.
6. Tenant-owned hymn records and lyrics are not silently shared across parishes.
7. Copyrighted liturgical or hymn text is included only with a documented basis.
8. International expansion follows real pilots and authoritative data, not a generic
   country dropdown backed by approximations.

## Open decisions

- Generic product name and native-app identity.
- First real pilot parish and second territory.
- Whether the first release supports Sundays only or general dated celebrations.
- Initial invitation method: password, magic link, or both.
- Which theme fonts are approved and how they are delivered.
- Whether public plans are enabled by default for new spaces.
- Whether a separately branded tenant PWA is worth dynamic hosting in the first
  release.
- Which territory provides the first licensed or public-domain non-Finnish reading
  text package.
- Whether planning spaces pin package versions manually or follow an approved update
  channel.
