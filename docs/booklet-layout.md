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

Two things make a page easy to sing from, and they compete:

- **larger type** helps every line in the booklet;
- **an unwrapped line** carries a whole phrase of the tune, matching what the singer
  hears and sings.

Narrow columns buy height, and height buys type size, but they wrap lines. A line can
also be longer than the full measure at the smallest type size, so an unwrapped line is
not something the layout can guarantee. §5 therefore settles this trade by price rather
than by rule.

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

Pages are imposed on two duplex sheets. Numbering pages from one, sheet *i*
(zero-based) carries `pages[7 - 2i] | pages[2i]` on the front and
`pages[1 + 2i] | pages[6 - 2i]` on the back, which folds and nests into reading order.
Page count stays divisible by four.

A page's capacity follows from the geometry — the usable height less any masthead, in
lyric lines at the chosen size:

```
capacity(size) = (189 - mastheadHeight) / (size * 1.15 * 25.4 / 72)
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

A *line* is whatever the editor typed, of any length. Where it does not fit the column
it is laid into, it is *rendered* as two or more visual lines — a property of that line
in that column at that size, not a property of the song.

A *label* is a line matching the role pattern (`Verse 2:`, `Refrain`, `Cantor:`,
`Chorus`, `Bridge`, `Coda`, `Repeat`, `All`, `Response`). Labels are set smaller and
bold-italic, and belong to the stanza they introduce.

A *stanza* is the atomic unit of layout — the unit a singer's eye tracks.

## 3. Measurement

Line breaking and height estimation use measured text width for the actual font, style,
and size, from the PDF engine (`getTextWidth` / `splitTextToSize`). Times is
proportional, so a character count is not a width. The measuring function is injected,
keeping the domain module pure: production supplies the real document, tests a
deterministic stub.

Two rules keep measurement honest:

- **Reserve equals paint.** Height reserved during layout equals height consumed by the
  painter, computed by the same code path. This binds label lines (set smaller than
  lyric lines), wrapped continuation lines (indented `1.2 em`, so narrower than their
  first line), and song headers (whose inter-element gaps are millimetre constants
  rather than multiples of the line height).
- **Break once.** The breaks decided during layout are the breaks painted. A second,
  differently-measured break could disagree with the height already reserved.

## 4. Song blocks

A song occupies a block: a full-width header above a body of one, two, or three columns.

### 4.1 Header

A part label (`RECESSIONAL`), the title, an attribution line, and a rule. Sizes derive
from the body size: label `max(7, size - 3.5)`, title `size + 3`, attribution
`max(7, size - 3)`. The header spans the full width at every column count.

### 4.2 Column count

An extra column halves the measure and so wraps lines, and buys height in exchange. The
exchange rate is calculable. With `N` logical lines, `S` stanzas, stanza gap `g`, and
`a(c)` the mean visual lines per logical line at column width `w(c)`, so that `a(1)` is
normally 1:

```
height(c) ~= (N * a(c) + S * g) / c
```

So `c` columns reduce height only while `a(c) < c`. The boundary case is worth seeing:
if halving the measure wraps every line then `a(2) = 2`, and two columns return only the
halved stanza gaps — a fraction of a line per stanza — for a wrapped phrase on every
line in the song.

Every admissible count is offered to the search (§5), which prices it. A count is
admissible when it does not exceed the stanza count, since stanzas are atomic, and when
every column receives content.

Three columns suit songs whose lines are naturally short — litanies, ostinati,
short-metre chants, psalm responses. They need no special handling: the price admits
them and excludes ordinary hymn metres on its own.

### 4.3 Dividing a song into columns

A `c`-column body partitions the song's stanzas, in reading order, into `c` contiguous
non-empty groups, dividing only at the boundaries between stanzas. A label moves with
the stanza it introduces, so no column ends with one.

The chosen partition **minimises the tallest column**, since a block occupies its header
plus its tallest column, and that is what the page pays for it. Ties go to fuller
earlier columns, so a song reads down the page and finishes in the last column.

This is the linear partition problem — an ordered sequence into `c` contiguous parts
minimising the largest part sum — solved exactly by dynamic programming in
`O(S^2 * c)`. At a handful of stanzas and at most three columns the exact solution is
cheap enough to require.

At `c = 2` this is equivalent to balancing the columns: the two hold the whole song, so
their heights sum to a constant `T` and `max(L, R) = (T + |L - R|) / 2`, making the two
expressions rank every partition identically. The equivalence is particular to two
parts. For `c >= 3` the tallest column is not a function of the spread, and the tallest
column is what governs.

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

- **Wrap cost** — the visual lines a layout adds by wrapping, measured against the same
  song set in one column, times a single weight:

  ```
  wrapCost = weight * sum over lines of max(0, visual(line, c) - visual(line, 1))
  ```

  The weight is the only tuning constant in this document. Its meaning is *how many
  lines of saved height one wrapped phrase is worth*.

  The one-column baseline is what makes this fair to a long line. A line too long for
  the full measure wraps at every column count, so it enters every candidate equally and
  cannot move the ranking; a layout pays only for the wrapping its own narrowness
  caused. Measuring added visual lines rather than counting wrapped lines keeps the cost
  proportionate, so a line broken in four costs more than one broken in two.

- **Page-fill cost** — for each completed page, quadratic in the unused height.

  This separates layouts the wrap cost leaves tied. Type size is already settled by the
  ladder below, so the white space it recovers cannot be spent on anything; its only job
  is to keep content from piling onto early pages above a nearly empty last one. It
  stays small enough that it never outranks the wrap cost.

Ties beyond that go to fewer columns.

Only layouts occupying exactly the target page count are accepted, the target being
`min(8, number of songs)` plus any reserved masthead page. Since a song is never divided
across pages, `S` songs can occupy at most `S` pages, so the target is every page the
lyrics can reach. Spreading to all of them gives each song the most room, and room is
what admits a larger type size; it costs nothing, because a song that fits a shared page
fits a page of its own. A song that will not fit one page whole at the current size
disqualifies that size.

Type size is chosen by descending ladder from 14 pt to 8.5 pt in half-point steps, the
first size admitting a complete layout winning. At each size the layout is attempted
twice: first with lyrics flowing beneath the masthead on page one, then with page one
given over to the masthead alone. The second leaves one fewer page carrying lyrics, in
exchange for the first song no longer having to fit beneath the masthead — where the
songs have capacity to spare, that buys type size, so it is tried before the ladder
descends.

The masthead is a spaced eyebrow line, the celebration title, a meta line, and a rule.

## 6. Continuation fallback

Where no type size admits a complete layout — normally one unusually long song that
cannot fit a page whole — the booklet falls back to a fixed 8.5 pt, single-column,
greedy paginator that may continue a song onto the next page under a `(continued)`
header, so an over-long song degrades gracefully rather than failing the export.

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
6. Column count never exceeds the stanza count, and every column receives content.
7. A line too long for the full measure adds no wrap cost at any column count, so a song
   containing one is not thereby forced into a single column.
8. The chosen partition minimises the tallest column, verified against brute force on
   small inputs.
9. Songs appear in Mass order, and the contents list agrees with each song's page.
10. Public plan requests and rendered pages never contain lyrics (ADR 001); the booklet
    is generated in the browser from authorised text and never round-trips through a
    public surface.

Invariants 1–6 and 9–10 hold at any wrap weight. One further property depends on the
weight and is a calibration check rather than a structural guarantee: a song whose lines
would all wrap at `c` columns should not be set in `c` columns, since that buys only the
halved stanza gaps.

## Appendix A: deviations in the current implementation

Temporary, and comparative by nature: each row is a defect against the sections above,
and the appendix should shrink to nothing and then be deleted.

| § | Deviation |
| --- | --- |
| 1 | Capacity is the constant `PAGE_CAPACITY = 48` lines at 8.5 pt (165.5 mm) against 189 mm usable, so about 12% of every page is unreachable. |
| 2 | `bookletStanzas` wraps at parse time and `flowTokens` flattens stanzas into one token list, so stanza boundaries are gone before columns are chosen. |
| 3 | Line breaking uses character budgets (`LINE_LENGTH`, `NARROW_LINE_LENGTH`, scaled by `8.5 / size`) rather than measured width. Against representative English hymn text a 68-character budget fills about 60% of a 128.5 mm column and a 38-character budget about 75% of a 60.75 mm column, so every song measures far taller than it sets. |
| 3 | Label lines reserve a full lyric line but paint at `max(8, size - 1.5)`; continuation lines are indented but budgeted at full width. |
| 3 | Header height reserves one lyric line for 4.2 mm of fixed gaps, under-reserving below about 10.4 pt and over-reserving above. |
| 3 | The continuation paginator budgets header titles by character count but repaints them measured, so the two can disagree. |
| 4.2 | Only one or two columns exist, so short-lined songs cannot use the width they have. |
| 4.2 | Column count is governed by three constants — a standing penalty, a 14-line floor, a 3-line minimum saving — instead of the wrap cost, and all three are computed from character budgets, so they misfire together. |
| 4.3 | `splitTokens` divides before any line rather than only between stanzas, so verses are cut in half. Its `max * 10 + abs(difference)` scoring reduces to `5T + 6 * abs(difference)`, which ranks partitions the same way §4.3 does; the candidate set is the whole of the defect. |
| 4.3 | Division is a scan over split points, not an exact linear partition, and does not generalise past two columns. |

Order of work: **§4.3 first** — stanza atomicity fixes the visible fault on its own.
Then **§1 and §3**, which buy back type size across the booklet and, by measuring true
heights, should reduce how often a second column is reached for at all. **§4.2 last**,
since the wrap cost is meaningless without measured width and three columns are
unreachable while line breaking over-estimates.
