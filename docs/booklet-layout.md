# Booklet layout specification

This document is the normative description of how the folded lyrics booklet is laid
out. `src/domain/lyrics-booklet.js` implements it and should be read alongside it;
where the two disagree, the code is wrong unless this document is amended first.
Physical printing instructions belong in the README; the private-lyrics boundary that
governs *which* text may reach an export belongs in
[ADR 001](decisions/001-private-song-lyrics.md).

The booklet is sung from, in a pew, at arm's length, in poor light. Every rule below
resolves in favour of legibility: the layout spends spare space on type size, and
spends type size only to avoid breaking the sung structure of a song.

## 1. Physical geometry

All internal measurements are millimetres unless stated. Point sizes convert at
`25.4 / 72` mm per point.

| Quantity | Value |
| --- | --- |
| Sheet | A4 landscape, 297 × 210 |
| Logical page | A5 portrait, 148.5 × 210 |
| Page padding | top 10, side 10, bottom 11 |
| Column gutter | 7 at two columns, 5 at three |
| Text width, one column | 128.5 |
| Text width, two columns | 60.75 each |
| Text width, three columns | 39.5 each |
| Usable text height | 189 |
| Lyric line height | 1.15 × type size |
| Logical pages | exactly 8 |

Eight logical pages are imposed on two duplex sheets. With pages numbered from one,
sheet *i* (zero-based) carries `pages[7 - 2i] | pages[2i]` on the front and
`pages[1 + 2i] | pages[6 - 2i]` on the back, which folds and nests into reading order.
Page count must remain divisible by four; the fixed eight-page booklet satisfies this
by padding with blank pages and a final back cover.

### 1.1 Vertical capacity is derived, not constant

A page's capacity is the usable text height less any masthead, expressed in lyric
lines at the chosen type size:

```
capacity(size) = (189 - mastheadHeight) / (size * 1.15 * 25.4 / 72)
```

Capacity **must** be derived from the geometry above. A hard-coded line budget silently
changes meaning whenever padding, line height, or the footer changes, and it is the kind
of constant that drifts conservative and costs type size on every page.

## 2. Content model

The layout consumes a song as a tree, and **must not** flatten it before column
assignment:

```
Song
 └── Block            (audience section: ALL / CANTOR; may carry a label)
      └── Stanza      (separated in source by a blank line)
           └── Line   (one source line; either a lyric line or a role label)
```

A *line* is a logical line of the song — whatever the editor typed. It is not capped in
length and is never pre-wrapped at parse time. If a line does not fit the column it is
being laid into, it is *rendered* as two or more visual lines; that is a property of the
line in a particular column at a particular size, not a property of the song.

A *label* is a line matching the role pattern (`Verse 2:`, `Refrain`, `Cantor:`,
`Chorus`, `Bridge`, `Coda`, `Repeat`, `All`, `Response`). Labels are set smaller and
bold-italic, and bind to the stanza that follows them.

A stanza is the **atomic unit of layout**. It is the unit a singer's eye tracks, and the
unit whose integrity the rest of this document protects.

## 3. Measurement

Line breaking and height estimation **must** use measured text width for the actual
font, style, and size, obtained from the PDF engine (`getTextWidth` /
`splitTextToSize`). A measuring function is injected into layout so that the domain
module stays pure and testable; production supplies the real document, tests supply a
deterministic stub.

Character counts **must not** be used as a proxy for width. Times is proportional, and a
character budget mis-measures by a wide and size-dependent margin — measured against
representative English hymn text, a 68-character budget consumes about 60% of a 128.5 mm
column, and a 38-character budget about 75% of a 60.75 mm column. Under-measurement is
not a safe error: it inflates every song's height, which pushes songs into two columns
that do not need them and drives the whole booklet down the type ladder.

Two consequences follow and are binding:

- **Reserve equals paint.** The height reserved for any element during pagination must
  equal the height the painter later consumes for it, computed by the same code path.
  This applies to label lines (set smaller than lyric lines), to wrapped continuation
  lines (indented by `1.2 em`, so narrower than the first line of their logical line),
  and to song headers (whose fixed inter-element gaps are millimetre constants, not
  multiples of the lyric line height).
- **Break once.** The line breaks decided during layout are the breaks that are painted.
  The painter must not re-break text, because a second, differently-measured break can
  disagree with the reserved height.

## 4. Song layout

A song occupies a *block*: a full-width header followed by a body of one or two columns.

### 4.1 Header

The header is a part label (`RECESSIONAL`), the title, an attribution line, and a rule.
Sizes derive from the body type size: label `max(7, size - 3.5)`, title `size + 3`,
attribution `max(7, size - 3)`. Header text spans the full page width even when the body
is set in two columns.

### 4.2 Column count

A body may be set in one, two, or three columns. Column width follows from the gutters
in §1: 128.5, 60.75, and 39.5 mm.

**A printed line should carry one sung phrase.** This is the reason the layout leans
towards fewer columns, and it is a structural reason rather than a matter of taste. A
line of a hymn is a phrase of the tune. Narrowing the measure makes lines wrap, and a
wrapped line is read as a continuation — precisely the distinction a singer must not
confuse with the start of the next phrase. Every additional column buys height by
risking that confusion.

The size of the risk is measurable. Let a song have `N` logical lines and `S` stanzas,
let `g` be the stanza gap, and let `a(c)` be the mean number of printed lines a logical
line occupies at column width `w(c)`, so that `a(1)` is normally 1:

```
height(c) ~= (N * a(c) + S * g) / c
```

`c` columns therefore reduce height only while `a(c) < c`. The limiting case governs
the rule: if halving the measure wraps every line, `a(2) = 2` and two columns save
nothing but the halved stanza gaps — a fraction of a line per stanza — while breaking a
phrase on every line in the song. That trade must never be taken.

Column count is not fixed per song by a threshold. Every permitted count is offered to
the page packer (§6), which pays for each in its score:

- **the wrap cost**: the number of logical lines that wrap at `c` columns but do not
  wrap at one, weighted by a single tuning constant whose meaning is *how many lines of
  saved height one broken phrase is worth*;
- **a small standing cost per additional column**, for the eye's return journey to the
  top of the page.

No other penalty is permitted. In particular there must be no threshold on song length
and no minimum height saving: both are proxies for the wrap cost, and a proxy computed
from anything other than measured width (§3) will misfire.

Three structural rules bound the choice:

1. `c` may not exceed the number of stanzas, since stanzas are atomic (§5).
2. Every column must receive content.
3. Every column must be at least as tall as the block's own header. A body shorter than
   the header above it reads as a mistake at any column count.

Three columns will in practice be reached only by songs whose lines are naturally short
— litanies, ostinati, short-metre chants, psalm responses. Nothing special-cases them;
the wrap cost admits them and excludes ordinary hymn metres on its own.

## 5. Column division

This section is the heart of the specification.

**Stanzas are atomic.** A `c`-column body is formed by partitioning the song's stanzas,
in reading order, into `c` contiguous non-empty groups. Candidate division points are
the boundaries *between* stanzas, and no others. A label belongs to the stanza it
introduces and moves with it; a division may never leave a label as the last element of
a column.

Among candidate partitions, choose the one that **minimises the height of the tallest
column**, since a block occupies its header plus its tallest column and that is the
only column cost the page actually pays. Break ties in favour of fuller earlier
columns, so that a song reads down the page and finishes in the last column.

This is the linear partition problem — divide an ordered sequence into `c` contiguous
parts minimising the largest part sum — and it has an exact solution by dynamic
programming in `O(S^2 * c)` for `S` stanzas. No heuristic or greedy fill is permitted;
at the sizes involved, a handful of stanzas and at most three columns, the exact
solution is free.

At `c = 2` this objective balances the columns, and that is intended. The two columns
hold the whole song between them, so their heights sum to a constant `T` wherever the
division falls, and `max(L, R) = (T + |L - R|) / 2`. Minimising the taller column is an
increasing affine function of the difference between the columns: the two expressions
rank every candidate division identically, ties included. They are not competing
objectives that happen to agree, and no input distinguishes them.

That identity is particular to two parts and **must not be generalised**. For `c >= 3`
the tallest column is not a function of the spread of the column heights, and the two
objectives come apart. The tallest column is the one to keep, because it is the one the
page pays for.

The specification names the tallest column, at every `c`, because that is the quantity
the page pays for — not because it differs in effect, at `c = 2`, from naming the
difference.

**The constraint that matters is therefore the candidate set, not the objective.**
Balancing is harmless when the only places a division may fall are stanza boundaries,
and harmful when it may fall between any two lines: in the second case the arithmetic
lands wherever it lands, and on a song with uneven stanzas that is the middle of a
verse. A reader tempted to repair the current behaviour by adjusting its scoring cannot
succeed, and does not need to test the idea to know it — the current
`max(L, R) * 10 + |L - R|` reduces to `5T + 6|L - R|`, so it already ranks divisions
identically to every other balance measure. Restricting the candidates to stanza
boundaries is the whole of the fix.

**Mid-stanza division is a last resort.** A stanza may be divided across columns only
when that single stanza is by itself taller than the available column, so that no
stanza-boundary division can fit it. In that case:

- divide within the offending stanza only, leaving all other stanzas intact;
- prefer a break at a couplet boundary, then at an even line count;
- never leave a single line of the stanza alone in either column.

If a song cannot be laid out under these rules at any permitted type size, it goes to
the continuation paginator (§8) rather than being torn to fit.

## 6. Page packing

Songs are placed on pages in Mass order; the order is never rearranged. Packing is a
beam search over partial layouts. At each song, each surviving state may either append
the song to the current page or begin a new page, in either permitted column mode.
States are deduplicated by shape — page count and current fill — and the best are
retained.

A candidate is scored by accumulated penalties, lowest total winning:

- a standing penalty for each two-column song, plus the short-song and weak-saving
  penalties of §4.2;
- for each completed page, a penalty quadratic in the unused height, so that content is
  distributed rather than crammed onto early pages leaving a gaping final page.

Only layouts that occupy exactly the target page count are accepted, the target being
`min(8, number of songs)` plus any reserved masthead page. Songs are never split across
pages by this path: a song that does not fit a whole page at the current type size
disqualifies that size.

## 7. Type size and the masthead

Page one carries a compact masthead — a spaced eyebrow line, the celebration title, a
meta line, and a rule — and then runs straight into lyrics, so that every logical page
can carry songs.

Type size is chosen by descending ladder from 14 pt to 8.5 pt in half-point steps. The
first size at which a complete layout exists wins. At each size, the layout is attempted
twice before the size is abandoned: first with lyrics flowing beneath the masthead on
page one, then with page one given over to the masthead alone. A masthead-only page
costs a page of lyrics but frees the first song from fitting beneath the masthead, and
that trade is worth making at a larger size — **page count is cheaper than legibility,
and legibility is cheaper than a broken verse.**

## 8. Continuation fallback

If no type size yields a complete layout — normally one unusually long song that cannot
fit a single page whole — the booklet falls back to a fixed 8.5 pt, single-column,
greedy paginator that may continue a song onto the next page under a `(continued)`
header. This path exists so that an over-long song degrades gracefully instead of
failing the export.

Within the fallback, a stanza is still kept whole where it fits, a page break is still
never taken immediately after a label, and a stanza divided across a page break never
leaves a single line behind.

## 9. Invariants

These are the properties worth asserting in `tests/lyrics-booklet.test.js`:

1. The booklet is exactly 8 logical pages, imposed on 2 sheets, and page count is
   divisible by four.
2. No painted element extends below the usable text height on any page.
3. Reserved height equals painted height for every header, label line, lyric line, and
   inter-element gap, at every permitted type size.
4. In a multi-column song, every stanza lies wholly within one column, unless that
   stanza alone exceeds the column height.
5. No column ends with a label.
6. No stanza division leaves a single line alone in a column.
7. Column count never exceeds the song's stanza count, every column receives content,
   and no column is shorter than the block's header.
8. A song whose every line wraps at `c` columns but not at one is never set in `c`
   columns, since that division breaks a phrase on every line to save only stanza gaps.
9. The chosen partition minimises the tallest column over all stanza-boundary
   partitions, verified against a brute-force search on small inputs.
10. Songs appear in Mass order, and the contents list agrees with the page each song was
    placed on.
11. Public plan requests and rendered pages never contain lyrics (ADR 001); the booklet
    is generated in the browser from authorised text and never round-trips through a
    public surface.

## 10. Known deviations

The current implementation predates this document and diverges from it as follows. Each
item is a defect against this specification, not a permitted variation.

| § | Deviation |
| --- | --- |
| 1.1 | Page capacity is the constant `PAGE_CAPACITY = 48` lines at 8.5 pt (165.5 mm), against 189 mm usable — about 12% of every page is unreachable. |
| 2 | `bookletStanzas` wraps lines at parse time, and `flowTokens` flattens stanzas into a single token list, so stanza boundaries are gone before columns are chosen. |
| 3 | Line breaking uses character budgets (`LINE_LENGTH = 68`, `NARROW_LINE_LENGTH = 38`, scaled by `8.5 / size`) rather than measured width. |
| 3 | Label lines reserve a full lyric line but paint at `max(8, size - 1.5)`; wrapped continuation lines are indented but budgeted at full width. |
| 3 | Header height reserves one lyric line for 4.2 mm of fixed gaps, under-reserving below about 10.4 pt and over-reserving above it. |
| 3 | The continuation paginator budgets header titles by character count but repaints them with measured `splitTextToSize`, so the two can disagree. |
| 4.2 | Column count is limited to one or two; three columns are not implemented, so short-lined songs cannot use the width they have. |
| 4.2 | The column-count decision is governed by three constants — a standing penalty of 3, a 14-line song floor, and a 3-line minimum saving — rather than by the wrap cost. All three are proxies for it, and all three are computed from character budgets, so they misfire in the same direction. |
| 5 | `splitTokens` considers a division before every line, not only between stanzas, so verses are routinely cut in half. Its scoring cannot be the fault: column heights sum to a constant, so `max * 10 + abs(difference)` reduces to `5T + 6 * abs(difference)` and ranks divisions identically to any other balance measure. The candidate set is the fault. |
| 5 | Division is a scan over split points rather than an exact linear partition, which does not generalise beyond two columns. |

Section 5 is the user-visible fault and should be corrected first; sections 1.1 and 3
together are what will buy back type size across the whole booklet, and by making songs
measure their true height they should also reduce how often a second column is reached
for at all. Section 4.2 depends on §3 and cannot be attempted before it: the wrap cost
is meaningless without measured width, and three columns are unreachable while line
breaking over-estimates by the margins recorded above.
