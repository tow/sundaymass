# Data model and authorization

Supabase Postgres is the shared source of truth for plans and repertoire. This document
describes the current logical schema and access rules after every tracked migration has
been applied. The migrations themselves remain the executable authority.

## Relationships

```text
auth.users
   |
   +--< editors
   |
   +-- audit references from mutable records

plans (one row per Sunday with shared data)
   |
   +--< plan_songs >-- songs --0..1-- song_lyrics
                              |
                              +--0..1-- song_embeddings

reading_embeddings (one row per canonical citation)
```

A calendar Sunday and its computed readings do not need a database row. A `plans` row
is created when an editor first persists shared data for that date.

## Tables

### `plans`

| Field | Meaning |
|---|---|
| `sunday` | Primary-key calendar date |
| `reading_overrides` | Object keyed by `first`, `psalm`, `second`, or `gospel` |
| `celebration_override` | Optional complete resolved celebration snapshot |
| `updated_at`, `updated_by` | Last-write audit data |

The former free-form `choices` JSON column no longer exists. Music assignments are
normalized into `plan_songs`.

An individual reading override has this application-owned shape:

```json
{
  "citation": "Acts 4:32-35",
  "book": "Acts",
  "segments": [
    {
      "startChapter": 4,
      "startVerse": "32",
      "endChapter": 4,
      "endVerse": "35"
    }
  ],
  "origin": "lectionary-catalog",
  "translation": "World English Bible",
  "textVersion": "embedded-2026-07",
  "checkedAgainstOrdo": true
}
```

Postgres bounds the object size and requires a citation, book, and non-empty structured
segments. The browser additionally validates that the citation belongs to the selected
reading role and has usable embedded full text.

A celebration override records the selected celebration's identity, name, normal
calendar date, rank, season, cycle, lectionary number, provenance, explicit reading
citations, and Ordo-check flag. `first`, `psalm`, and `gospel` are required; `second` is
present when the celebration requires or offers one. It is a resolved snapshot, not
merely a reference to a generated catalogue entry.

### `editors`

| Field | Meaning |
|---|---|
| `user_id` | Auth user permitted to change shared data |
| `created_at` | Membership creation time |

Authentication and authorization are separate. A valid Supabase session identifies a
user; a matching `editors` row authorizes writes. An authenticated user can select only
their own membership row.

### `songs`

| Field | Meaning |
|---|---|
| `id` | UUID identity |
| `title` | Required display title; deliberately non-unique |
| `youtube_video_id` | Optional validated 11-character YouTube video identifier |
| `authors` | Optional author/composer attribution |
| `copyright_owner` | Optional owner or publisher |
| `copyright_year` | Optional text, not a number; values such as `1975, 2016` are valid |
| `source` | Optional source or collection |
| `in_repertoire` | Whether the choir currently knows and uses the song |
| `suggestion_parts` | Soft allow-list for automatic recommendations |
| audit fields | Creator and last editor/time |

Only `title` is required. Duplicate titles represent distinct UUID records and are
disambiguated in editing interfaces with author information.

Editors paste a recognised HTTPS YouTube video link, but only its video ID is stored.
Public watch links and privacy-enhanced embed URLs are derived from that ID, so share
and tracking parameters are not persisted.

Songs with `in_repertoire = false` are complete canonical song records in the extended
library, not drafts or a second entity type. They can be searched and assigned normally,
but the distinction prevents a candidate from being presented as a song already known
to the choir. Assigning one to a Mass does not silently promote it into the repertoire;
an editor changes the membership flag explicitly.

The suggestion array accepts the normal classes `entrance`, `kyrie`, `gloria`, `psalm`,
`acclamation`, `offertory`, `sanctus`, `memorial`, `amen`, `lordPrayer`, `agnus`,
`communion`, and `recessional`. Both Communion plan slots use the single `communion`
class. An empty array means that the song remains searchable and assignable but is not
automatically suggested.

Anonymous and authenticated users may execute the bounded
`suggest_songs_for_readings` function. It is a security-definer boundary over the
private embedding tables and returns at most three rows containing public song
metadata only. Song search, assignment, creation, editing, lyrics, and direct vector
access retain their existing editor-only permissions.

### `song_lyrics`

| Field | Meaning |
|---|---|
| `song_id` | Primary key and foreign key to `songs` |
| `lyrics` | Optional private full text, up to the database limit |
| `updated_at`, `updated_by` | Last-write audit data |

This one-to-one split exists solely for the hard permission boundary. Lyrics remain
part of the song domain model. See
[ADR 001](decisions/001-private-song-lyrics.md).

### `plan_songs`

| Field | Meaning |
|---|---|
| `sunday`, `part` | Composite primary key identifying one plan slot |
| `song_id` | Reference to the canonical song |
| `updated_at`, `updated_by` | Last-write audit data |

The 14 valid plan slots are `entrance`, `kyrie`, `gloria`, `psalm`, `acclamation`,
`offertory`, `sanctus`, `memorial`, `amen`, `lordPrayer`, `agnus`, `communion`,
`communion2`, and `recessional`.

There is deliberately no foreign-key or check constraint between a plan part and a
song's `suggestion_parts`. Manual assignment is unrestricted.

### Vector tables

`song_embeddings` stores one 384-dimensional vector and canonical content hash per
song; deleting its song cascades to the vector row. `reading_embeddings` stores one
vector and hash per citation without a foreign key to the checked-in reading catalogue.
Both record their last indexing time.

The hash represents only content that affects semantic meaning. Status checks compare
the current canonical input hash with the stored hash; timestamps alone do not decide
staleness.

## Access matrix

| Resource or operation | Anonymous | Signed-in non-editor | Editor browser | Service role |
|---|---:|---:|---:|---:|
| Read plans, assignments, song metadata | Yes | Yes | Yes | Yes |
| Read song lyrics | No | No | Yes | Yes |
| Read own editor membership | No | Yes, if present | Yes | Yes |
| Change plans, assignments, songs, lyrics | No | No | Yes | Yes |
| Read or write raw vector tables | No | No | No | Yes |
| Request semantic suggestions | No | No | Yes | Maintenance access |

Table privileges and Row Level Security are both intentional. RLS is not a substitute
for revoking broad table access to lyrics and vectors, and hiding editor controls is not
authorization.

The direct Supabase integration suite proves this matrix against a locally migrated
database. When permissions change, update the migration and the matrix test together.

## Mutation contracts

All shared browser mutations require an authenticated member of `public.editors`.
Security-invoker RPCs repeat the membership check when a policy-only denial could look
like a successful no-op.

| Operation | Contract |
|---|---|
| `assign_plan_song` | Create the plan if needed and upsert one existing song into one slot |
| `clear_plan_song` | Remove one slot assignment |
| `create_song` | Create an unassigned canonical song and optional private lyric row |
| `create_and_assign_song` | Atomically create a song and assign it to one plan slot |
| `update_song` | Replace canonical public fields, suggestion parts, and optional lyric row |
| `save_reading_override` | Add or replace one structured slot override |
| `clear_reading_override` | Clear one slot or all individual reading overrides |
| `save_celebration_override` | Save one complete snapshot and clear individual overrides |
| `clear_celebration_override` | Restore computed celebration and clear individual overrides |
| `suggest_songs_for_readings` | Rank classified songs, reserving two places for repertoire songs and one for an extended-library candidate |

Successful writes are live immediately. There is no draft/publish table or status.

## Public projections and caching

The planner's public Supabase query selects `plans`, `plan_songs`, and explicit public
columns from `songs`; it never joins `song_lyrics` or vector tables. The application
then maps rows through `src/domain/plan-music-data.js` before caching or rendering them.

The cached public value contains:

- canonical song metadata keyed by Mass part;
- individual reading override snapshots; and
- an optional celebration snapshot.

It contains no lyrics, raw vectors, tokens, sessions, or service-role credentials.

## Realtime behavior

The planner listens for changes to the current Sunday's `plans` and `plan_songs` rows
and for canonical `songs` updates. An event invalidates and reloads the public projection
rather than attempting to patch several representations independently. Changing Sunday
unsubscribes the previous date before subscribing to the next.

## Schema changes

- Add every production change as a forward migration under `supabase/migrations/`.
- Do not rewrite a migration that may already have reached production.
- Keep editor checks in database mutations even when the UI already checked them.
- Preserve title non-uniqueness and manual cross-position assignment.
- Treat JSON snapshot shapes and RPC parameter names as application/database contracts.
- Run `npm run test:integration` after resetting the local Supabase database whenever
  tables, grants, policies, or RPCs change.
