# Booklet layout specification

This document is the normative description of how the folded lyrics booklet is laid
out. `src/domain/lyrics-booklet.js` implements it; where the two disagree, the code is
wrong unless this document is amended first. Physical printing instructions belong in
the README; the private-lyrics boundary governing *which* text may reach an export
belongs in [ADR 001](decisions/001-private-song-lyrics.md).

The booklet is eight A5 pages, imposed on two sheets of A4 and folded. It is sung from,
in a pew, at arm's length, in poor light, so the layout has a single goal: make the
songs as easy to read as possible in the space there is. Where the songs need fewer than
eight pages the remainder are blank, with a back cover last.

Two things make a page easy to sing from:

- **larger type**, which helps every line in the booklet;
- **unwrapped lines**, each carrying a whole phrase of the tune, so that what the singer
  reads matches what they hear and sing.

They pull against each other. Narrower columns make a song shorter, and a shorter song
can be set in larger type — but narrower columns also wrap more lines. And some lines
cannot be kept unwrapped at all, being too long for the full page width even at the
smallest type size. So §5 settles this with a cost that the search weighs, rather than
with a rule.

One thing is not traded: **a stanza sits in one column**, the only exception being a
stanza taller than any column at any type size (§4.3).

## 1. Geometry

Millimetres throughout. Points convert at `25.4 / 72`.

| Quantity | Value |
| --- | --- |
| Sheet | A4 landscape, 297 × 210 |
| Logical page | A5 portrait, 148.5 × 210 |
| Page padding | top 10, side 10, bottom 11 |
| Column gutter | 7 at two columns, 5 at three |
| Text width by column count | 128.5 · 60.75 · 39.5 |
| Usable text height | 189 |
| Lyric line height | 1.15 × type size |
| Logical pages | exactly 8 |

Pages are imposed on two duplex sheets. Numbering the pages from one, sheet *i*
(zero-based) carries `pages[7 - 2i] | pages[2i]` on the front and
`pages[1 + 2i] | pages[6 - 2i]` on the back. So the first sheet holds 8 and 1 on the
front, 2 and 7 on the back; the second holds 6 and 3, then 4 and 5. Folded and nested,
they read in order. Page count stays divisible by four.

Heights are carried in millimetres, so a page's capacity is just the usable height less
any masthead:

```
capacity = 189 - mastheadHeight
```

## 2. Content model

A song is a tree, and layout works on it directly, so stanza boundaries are available at
every stage:

```
Song
 └── Block            (audience section: ALL / CANTOR; may carry a label)
      └── Stanza      (separated in source by a blank line)
           └── Line   (one source line; either a lyric line or a role label)
```

A *line* is whatever the editor typed, of any length. A line that does not fit the
column it is laid into is rendered as two or more *visual lines*. Whether it wraps
depends on that column and that type size, so wrapping is a fact about a particular
layout rather than about the song.

A *label* is a line matching the role pattern (`Verse 2:`, `Refrain`, `Cantor:`,
`Chorus`, `Bridge`, `Coda`, `Repeat`, `All`, `Response`). Labels are set smaller and
bold-italic, and belong to the stanza they introduce.

A *stanza* is the atomic unit of layout — the unit a singer's eye tracks.

## 3. Measurement

Every width comes from the PDF engine's own `getTextWidth`, for the exact font, style,
and size being drawn. Times is proportional, so a character count is not a width. The
measuring function is injected rather than imported, which keeps the domain module pure:
production passes in the real document, tests pass in a deterministic stub.

Lines are broken here rather than by the engine's `splitTextToSize`, because a
continuation line is indented and so has less room than the line it continues — a
hanging indent the engine's own splitter cannot express.

Layout works out how tall everything will be, and the painter then draws it. If the two
disagree, text runs past the bottom of the page or leaves a gap in the middle of it. Two
rules keep them in step:

- **Measure once.** Layout decides where each line breaks, and the painter draws those
  breaks as given, never re-breaking the text. A second measurement can come out
  differently from the first, and then the space reserved no longer matches the space
  used.
- **Reserve what you paint.** The height layout reserves for an element comes from the
  same code the painter uses to advance down the page. Three cases make this easy to get
  wrong: label lines are set smaller than lyric lines; a wrapped continuation line is
  indented by `1.2 em`, so it has less room than the line it continues; and the gaps
  inside a song header are fixed millimetre values rather than multiples of the line
  height.

## 4. Song blocks

A song occupies a block: a full-width header above a body of one, two, or three columns.

### 4.1 Header

A part label (`RECESSIONAL`), the title, an attribution line, and a rule. Sizes derive
from the body size: label `max(7, size - 3.5)`, title `size + 3`, attribution
`max(7, size - 3)`. The header spans the full width at every column count.

### 4.2 Column count

Each extra column narrows the measure, so more lines wrap, and shortens the body in
exchange. The exchange rate can be calculated. Write `N` for the number of logical
lines, `S` for the number of stanzas, and `g` for the stanza gap. Write `a(c)` for the
mean number of visual lines each logical line needs at column width `w(c)`, so `a(1)` is
normally 1. Then:

```
height(c) ~= (N * a(c) + S * g) / c
```

So `c` columns shorten the body only while `a(c) < c`. At the boundary they stop being
worth anything: if halving the measure wraps every line, then `a(2) = 2`, and two
columns return only the halved stanza gaps — a fraction of a line per stanza — in
exchange for a wrapped phrase on every line in the song.

Every admissible count is offered to the search (§5), which prices it. One rule bounds
the choice: **every column must receive content.** That is what limits the count in
practice, since a body divides into as many pieces as it has stanzas — or slightly more,
where an oversized stanza had to be divided (§4.3) — and no more columns than there are
pieces can be filled.

Three columns suit songs whose lines are naturally short — litanies, ostinati,
short-metre chants, psalm responses. They need no special handling: the price admits
them and excludes ordinary hymn metres on its own.

### 4.3 Dividing a song into columns

A `c`-column body partitions the song's stanzas, in reading order, into `c` contiguous
non-empty groups, dividing only at the boundaries between stanzas. A label moves with
the stanza it introduces, so no column ends with one.

The chosen partition **minimises the tallest column**. A block occupies its header plus
its tallest column, so that is the height a page has to find for it. Ties go to fuller
earlier columns, so a song reads down the page and finishes in the last column.

This is the linear partition problem — divide an ordered sequence into `c` contiguous
parts so that the largest part sum is as small as possible — and dynamic programming
solves it exactly in `O(S^2 * c)`. With a handful of stanzas and at most three columns
that is cheap, so the exact solution is used rather than a greedy fill.

At `c = 2`, minimising the tallest column is the same thing as balancing the two
columns. The pair holds the whole song, so their heights always sum to the same total
`T`, which makes `max(L, R) = (T + |L - R|) / 2` — larger exactly when the difference
between them is larger. Both rules therefore rank every partition the same way. This
holds only for two parts: at `c >= 3` the tallest column is not fixed by how spread out
the heights are, and it is the tallest column that governs.

**Mid-stanza division is a last resort**, reached only when a single stanza is by itself
taller than the column, so that no stanza-boundary partition fits it. Then: divide
within that stanza alone, leaving every other stanza intact; prefer a couplet boundary,
then an even line count; and never leave one line of it alone in a column.

A song that no type size can lay out under these rules goes to the continuation
paginator (§6).

## 5. Choosing a layout

Songs are placed in Mass order, which is never rearranged. A beam search runs over
partial layouts: at each song, each surviving state may append the song to the current
page or begin a new one, at any admissible column count. States are deduplicated by
shape — page count and current fill — and the best retained.

Two costs, and nothing else, separate the candidates:

- **Wrap cost** — the visual lines the body occupies at the chosen column count, times a
  single weight:

  ```
  wrapCost = weight * sum over lines of visual(line, c)
  ```

  A line that fits its column contributes 1; a line that wraps into four contributes 4.
  The weight is the only tuning constant in this document, and its meaning is *how many
  lines of saved height one wrapped phrase is worth*.

  Every candidate lays out the same songs, so only differences between candidates
  matter, and those differences are exactly the extra visual lines a narrower measure
  introduces. Wrapping that no layout could have avoided — a line too long for the full
  page width — is therefore counted identically in every candidate and has no influence
  on the choice.

- **Page-fill cost** — for each completed page, quadratic in the unused height.

  Many layouts have the same wrap cost, and this separates them. The type size is
  already fixed by the ladder below, so the white space this recovers cannot be spent on
  anything; its only job is to stop content piling onto the early pages above a nearly
  empty last one. It stays small enough that it never outweighs the wrap cost.

Ties beyond that go to fewer columns.

Only layouts occupying exactly the target page count are accepted. The target is
`min(8, number of songs)`, plus a masthead page where one is reserved.

Since a song is never divided across pages, `S` songs can fill at most `S` pages, so
that target is simply every page the lyrics can reach. Using all of them gives each song
the most room, and room is what allows a larger type size. It cannot cost anything: a
song that fits on a shared page will also fit on a page of its own. A song that will not
fit one page whole at the current size disqualifies that size.

Type size is chosen by a descending ladder from 14 pt to 8.5 pt in half-point steps, and
the first size that admits a complete layout wins.

At each size the layout is attempted twice. The first attempt runs lyrics beneath the
masthead on page one; the second gives page one over to the masthead alone. The second
leaves one fewer page carrying lyrics, but frees the first song from having to fit
underneath the masthead. Where the songs have capacity to spare that buys type size, so
both are tried before the ladder descends.

The masthead is a spaced eyebrow line, the celebration title, a meta line, and a rule.

## 6. Continuation fallback

Sometimes no type size admits a complete layout, normally because one unusually long
song cannot fit a page whole. The booklet then falls back to a fixed 8.5 pt,
single-column, greedy paginator, which may continue a song onto the next page under a
`(continued)` header. An over-long song degrades gracefully rather than failing the
export.

The fallback keeps a stanza whole where it fits, never breaks immediately after a label,
and never leaves a single line of a divided stanza behind.

## 7. Invariants

Properties worth asserting in `tests/lyrics-booklet.test.js`:

1. The booklet is exactly 8 logical pages on 2 sheets, and page count is divisible by
   four.
2. No painted element extends below the usable text height on any page.
3. Reserved height equals painted height for every header, label line, lyric line, and
   gap, at every type size.
4. Every stanza lies wholly within one column, unless that stanza alone exceeds the
   column height.
5. No column ends with a label, and no division leaves a single line alone in a column.
6. Every column receives content, so the column count never exceeds the number of
   pieces the body divides into.
7. A line too long for the full page width is laid out, wrapped, at every column count.
   It never fails a song or sends one to the fallback.
8. The chosen partition minimises the tallest column, verified against brute force on
   small inputs.
9. Songs appear in Mass order, and the contents list agrees with each song's page.

All of these hold at any wrap weight. One further property depends on the weight and is
a calibration check rather than a structural guarantee: a song whose lines would all
wrap at `c` columns should not be set in `c` columns, since that buys only the halved
stanza gaps.
