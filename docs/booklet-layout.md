# Booklet layout specification

This document is the normative description of how the folded lyrics booklet is laid
out. `src/domain/lyrics-booklet.js` implements it; where the two disagree, the code is
wrong unless this document is amended first. Physical printing instructions belong in
the README; the private-lyrics boundary governing *which* text may reach an export
belongs in [ADR 001](decisions/001-private-song-lyrics.md).

The booklet is sung from, in a pew, at arm's length, in poor light. Legibility is the
only thing the layout optimises, and it optimises within a fixed budget: **the booklet
is always eight pages**, padded with blank pages and a back cover whenever the songs
need fewer.

Pages are therefore never saved and never spent. Page count is not an objective
anywhere in this document, and a rule that looks like it trades against page count is
really trading against the capacity those eight pages provide.

One rule stands outside the optimisation:

> **A stanza sits in one column.** The only escape is a stanza taller than any column at
> any permitted type size (§4.3).

Everything else is a single trade, and both sides of it serve legibility:

- **larger type** helps every line in the booklet;
- **an unwrapped phrase** keeps one printed line matching one phrase of the tune.

These compete directly, because narrow columns wrap phrases but buy height, and height
buys type size. Neither wins by precedence. §5 resolves the trade by price, because a
long enough line fits no column at any size: wrapping cannot be forbidden, only made
expensive enough that it happens when the alternative is worse and not otherwise.

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

Eight logical pages are imposed on two duplex sheets. With pages numbered from one,
sheet *i* (zero-based) carries `pages[7 - 2i] | pages[2i]` on the front and
`pages[1 + 2i] | pages[6 - 2i]` on the back, which folds and nests into reading order.
Page count must stay divisible by four; the fixed eight-page booklet satisfies this by
padding with blank pages and a final back cover.

Page capacity is **derived, never constant** — the usable height less any masthead, in
lyric lines at the chosen size:

```
capacity(size) = (189 - mastheadHeight) / (size * 1.15 * 25.4 / 72)
```

A hard-coded line budget silently changes meaning whenever padding, line height, or the
footer changes, and drifts conservative at the cost of type size on every page.

## 2. Content model

A song is consumed as a tree, and **must not** be flattened before columns are chosen:

```
Song
 └── Block            (audience section: ALL / CANTOR; may carry a label)
      └── Stanza      (separated in source by a blank line)
           └── Line   (one source line; either a lyric line or a role label)
```

A *line* is whatever the editor typed. It is not capped in length and is never
pre-wrapped at parse time. If it does not fit the column it is being laid into it is
*rendered* as two or more visual lines — a property of that line in that column at that
size, not a property of the song.

A *label* is a line matching the role pattern (`Verse 2:`, `Refrain`, `Cantor:`,
`Chorus`, `Bridge`, `Coda`, `Repeat`, `All`, `Response`). Labels are set smaller and
bold-italic, and bind to the stanza they introduce.

A *stanza* is the atomic unit of layout — the unit a singer's eye tracks, and the unit
whose integrity the rest of this document protects.

## 3. Measurement

Line breaking and height estimation **must** use measured text width for the actual
font, style, and size, from the PDF engine (`getTextWidth` / `splitTextToSize`). The
measuring function is injected, so the domain module stays pure: production supplies the
real document, tests a deterministic stub.

Character counts **must not** stand in for width. Times is proportional, and a character
budget mis-measures by a wide, size-dependent margin — against representative English
hymn text a 68-character budget fills about 60% of a 128.5 mm column, and a
38-character budget about 75% of a 60.75 mm column. Under-measurement is not the safe
direction: it inflates every song's height, which buys extra columns nothing was gained
by and drives the whole booklet down the type ladder.

Two rules follow:

- **Reserve equals paint.** Height reserved during layout must equal height consumed by
  the painter, computed by the same code path. This binds label lines (set smaller than
  lyric lines), wrapped continuation lines (indented `1.2 em`, so narrower than their
  first line), and song headers (whose inter-element gaps are millimetre constants, not
  multiples of the line height).
- **Break once.** The breaks decided during layout are the breaks painted. The painter
  must not re-break text: a second, differently-measured break can disagree with the
  height already reserved.

## 4. Song blocks

A song occupies a block: a full-width header above a body of one, two, or three
columns.

### 4.1 Header

A part label (`RECESSIONAL`), the title, an attribution line, and a rule. Sizes derive
from the body size: label `max(7, size - 3.5)`, title `size + 3`, attribution
`max(7, size - 3)`. The header spans the full width at every column count.

### 4.2 Column count

Narrowing the measure wraps lines, and a wrapped line reads as a continuation —
precisely what a singer must not confuse with the start of the next phrase. This is one
side of the trade set out in the preamble; the height an extra column buys, and the type
size that height admits, is the other. The cost of the first side is measurable. With `N` logical lines, `S` stanzas, stanza gap `g`, and `a(c)` the
mean printed lines per logical line at column width `w(c)`, so that `a(1)` is normally
1:

```
height(c) ~= (N * a(c) + S * g) / c
```

So `c` columns reduce height only while `a(c) < c`. The limiting case shows what the
price has to exclude: if halving the measure wraps every line then `a(2) = 2`, and two
columns save nothing but the halved stanza gaps — a fraction of a line per stanza —
while breaking a phrase on every line in the song. That trade should lose to every
alternative, and it is excluded by its cost rather than by any prohibition.

Column count is not fixed by a threshold. Every admissible count is offered to the
search (§5), which prices it. Only two rules bound admissibility: `c` may not exceed
the stanza count, since stanzas are atomic, and every column must receive content.

Three columns will in practice be reached only by songs whose lines are naturally short
— litanies, ostinati, short-metre chants, psalm responses. Nothing special-cases them:
the wrap cost admits them and excludes ordinary hymn metres on its own.

### 4.3 Dividing a song into columns

**Stanzas are atomic.** A `c`-column body partitions the song's stanzas, in reading
order, into `c` contiguous non-empty groups. Division points are the boundaries
*between* stanzas and nowhere else. A label moves with the stanza it introduces, so no
column can end with one.

Choose the partition **minimising the tallest column**, since a block occupies its
header plus its tallest column and that is the only column cost the page pays. Break
ties toward fuller earlier columns, so a song reads down the page and finishes in the
last column.

This is the linear partition problem — an ordered sequence into `c` contiguous parts
minimising the largest part sum — solved exactly by dynamic programming in
`O(S^2 * c)`. At a handful of stanzas and at most three columns the exact solution is
free, so no greedy fill or heuristic is permitted.

At `c = 2` this balances the columns, and that is intended: the columns hold the whole
song, so their heights sum to a constant `T` and `max(L, R) = (T + |L - R|) / 2`.
Minimising the taller column and minimising the difference are therefore the same
function, ranking every candidate identically. **The candidate set, not the objective,
is what keeps verses whole** — no scoring change can help if divisions may fall between
any two lines. The identity is particular to two parts and does not generalise: for
`c >= 3` the tallest column is not a function of the spread, and the tallest column is
the one to keep.

**Mid-stanza division is a last resort**, permitted only when a single stanza is by
itself taller than the column, so that no stanza-boundary partition can fit it. Then:
divide within that stanza alone, leaving every other stanza intact; prefer a couplet
boundary, then an even line count; and never leave one line of it alone in a column.

A song that cannot be laid out under these rules at any type size goes to the
continuation paginator (§6) rather than being torn to fit.

## 5. Choosing a layout

Songs are placed in Mass order, which is never rearranged. A beam search runs over
partial layouts: at each song, each surviving state may append the song to the current
page or begin a new one, at any admissible column count. States are deduplicated by
shape — page count and current fill — and the best retained.

Two costs are accumulated, and **no others are permitted**:

- **Wrap cost** — the visual lines a layout adds by wrapping, measured against the same
  song set in one column, times a single weight:

  ```
  wrapCost = weight * sum over lines of max(0, visual(line, c) - visual(line, 1))
  ```

  The weight is the only tuning constant in this document, and its meaning is *how many
  lines of saved height one broken phrase is worth*.

  Wrapping is never forbidden, and the layout must be able to wrap any line it is
  given: a phrase long enough fits no column at any type size. The one-column baseline
  is what makes the cost fair in that case. A line too long for the full measure wraps
  at every column count, so it enters every candidate equally and cannot shift the
  ranking — the layout is charged only for the wrapping its own narrowness caused, never
  for wrapping that was unavoidable. Counting wrapped lines rather than added visual
  lines would lose this: it would charge the same for a line broken in two as for one
  broken in four, and would let a 200-character line hide the difference entirely.
- **Page-fill cost** — for each completed page, quadratic in the unused height.

  This is a tie-break, not a value the booklet holds. Type size is settled by the ladder
  below before this cost is consulted, and many layouts at that size have identical wrap
  cost; without something to separate them the choice among them is arbitrary and tends
  to pile content onto early pages above a nearly empty last one. Even filling is not
  itself worth anything — at a fixed type size the recovered white space cannot be spent
  on anything — so this cost must never grow large enough to outrank the wrap cost.

Ties are broken toward fewer columns. There is deliberately no threshold on song
length, no minimum height saving, and no standing charge per column: each is a proxy for
the wrap cost, and a proxy computed from anything but measured width will misfire.

Only layouts occupying exactly the target page count are accepted, the target being
`min(8, number of songs)` plus any reserved masthead page. Songs are never split across
pages here — a song that will not fit one page whole at the current size disqualifies
that size.

That target is **maximum spread, not evenness**. Since a song is never divided across
pages, `S` songs can occupy at most `S` pages, so `min(8, S)` is simply every page the
lyrics can reach. Spreading to all of them gives each song the most room, and more room
is what admits a larger type size. It can never cost type size either: a song that fits
a shared page at a given size certainly fits a page of its own, so requiring the spread
never rejects a size that would otherwise have succeeded.

Type size is chosen by descending ladder from 14 pt to 8.5 pt in half-point steps, the
first size admitting a complete layout winning. At each size the layout is attempted
twice before the size is abandoned: first with lyrics flowing beneath the masthead on
page one, then with page one given over to the masthead alone. Giving the masthead its
own page is not a page saved or lost — the booklet is eight pages either way — but one
fewer page carrying lyrics, in exchange for the first song no longer having to fit
beneath the masthead. Where the songs have the capacity to spare, that buys type size,
so it is tried at each size before the ladder descends.

The masthead itself is a spaced eyebrow line, the celebration title, a meta line, and a
rule.

## 6. Continuation fallback

If no type size admits a complete layout — normally one unusually long song that cannot
fit a page whole — the booklet falls back to a fixed 8.5 pt, single-column, greedy
paginator that may continue a song onto the next page under a `(continued)` header, so
that an over-long song degrades gracefully instead of failing the export.

The fallback still keeps a stanza whole where it fits, still never breaks immediately
after a label, and still never leaves a single line of a divided stanza behind.

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
7. A line too long for the full measure adds no wrap cost at any column count, so a
   song containing one is not thereby forced into a single column.
8. Under the configured weight, a song whose lines would all wrap at `c` columns is not
   set in `c` columns, since that buys only the halved stanza gaps. This is a
   calibration check on the weight, not a structural guarantee.
9. The chosen partition minimises the tallest column, verified against brute force on
   small inputs.
10. Songs appear in Mass order, and the contents list agrees with each song's page.
11. Public plan requests and rendered pages never contain lyrics (ADR 001); the booklet
    is generated in the browser from authorised text and never round-trips through a
    public surface.

## Appendix A: deviations in the current implementation

Temporary. Each row is a defect against this specification, and the appendix should
shrink to nothing and then be deleted.

| § | Deviation |
| --- | --- |
| 1 | Capacity is the constant `PAGE_CAPACITY = 48` lines at 8.5 pt (165.5 mm) against 189 mm usable — about 12% of every page is unreachable. |
| 2 | `bookletStanzas` wraps at parse time and `flowTokens` flattens stanzas into one token list, so stanza boundaries are gone before columns are chosen. |
| 3 | Line breaking uses character budgets (`LINE_LENGTH`, `NARROW_LINE_LENGTH`, scaled by `8.5 / size`) rather than measured width. |
| 3 | Label lines reserve a full lyric line but paint at `max(8, size - 1.5)`; continuation lines are indented but budgeted at full width. |
| 3 | Header height reserves one lyric line for 4.2 mm of fixed gaps, under-reserving below about 10.4 pt and over-reserving above. |
| 3 | The continuation paginator budgets header titles by character count but repaints them measured, so the two can disagree. |
| 4.2 | Only one or two columns exist; short-lined songs cannot use the width they have. |
| 4.2 | Column count is governed by three constants — a standing penalty, a 14-line floor, a 3-line minimum saving — instead of the wrap cost, and all three are computed from character budgets, so they misfire together. |
| 4.3 | `splitTokens` considers a division before every line rather than only between stanzas, so verses are cut in half. Its `max * 10 + abs(difference)` scoring reduces to `5T + 6 * abs(difference)` and cannot be the fault. |
| 4.3 | Division is a scan over split points, not an exact linear partition, and does not generalise past two columns. |

Order of work: **§4.3 first** — stanza atomicity fixes the visible fault on its own.
Then **§1 and §3**, which buy back type size across the booklet and, by measuring true
heights, should reduce how often a second column is reached for at all. **§4.2 last**,
since it cannot be attempted before §3: the wrap cost is meaningless without measured
width, and three columns are unreachable while line breaking over-estimates.
