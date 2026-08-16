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
| Column gutter (two-column body) | 7 |
| Text width, one column | 128.5 |
| Text width, two columns | 60.75 each |
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

### 4.2 Body columns

The body is set in one column by default. Two columns are permitted only when all of the
following hold:

1. The song's single-column body is at least 14 lines tall. Short songs stay in one
   column; two short columns read as a mistake.
2. Two columns save at least 3 lines of height over one column.
3. Both columns receive content.

Two columns carry a standing cost in the page-packing score, so a song that merely
*could* be split is not split. Splitting is a response to a page that would otherwise
not hold the song, not a default treatment.

## 5. Column division

This section is the heart of the specification.

**Stanzas are atomic.** A two-column body is formed by partitioning the song's stanzas,
in order, into a left group and a right group. Candidate division points are the
boundaries *between* stanzas, and no others. A label belongs to the stanza it
introduces and moves with it; a division may never leave a label as the last element of
a column.

Among candidate divisions, choose the one that **minimises the height of the taller
column**, since a block's height is the taller of its two columns and that is the only
column cost the page actually pays. Break ties in favour of the fuller left column, so
that a song reads down the left and finishes on the right.

This objective balances the columns, and that is intended. As the division point moves
down the song the left column only grows and the right only shrinks, so the taller
column is shortest where the two heights meet: minimising the maximum and equalising
the heights are the same operation, differing only in how they break ties. The
specification asks for the taller column because that is the quantity the page pays
for, not because balance is to be avoided.

**The constraint that matters is the candidate set, not the objective.** Balancing is
harmless when the only places a division may fall are stanza boundaries, and harmful
when it may fall between any two lines — in the second case the arithmetic lands
wherever it lands, and on a song with uneven stanzas that is the middle of a verse.
A reader tempted to repair the current behaviour by adjusting the scoring should not:
over a line-boundary candidate set, minimising the taller column, minimising the
difference, and the two combined all select the same mid-verse division. Restricting
the candidates to stanza boundaries is the whole of the fix.

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
4. In a two-column song, every stanza lies wholly within one column, unless that stanza
   alone exceeds the column height.
5. No column ends with a label.
6. No stanza division leaves a single line alone in a column.
7. A song of fewer than 14 body lines is set in one column.
8. Songs appear in Mass order, and the contents list agrees with the page each song was
   placed on.
9. Public plan requests and rendered pages never contain lyrics (ADR 001); the booklet
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
| 5 | `splitTokens` considers a division before every line, not only between stanzas, so verses are routinely cut in half. Its `max(heights) * 10 + abs(difference)` scoring is not the fault and changing it changes nothing; the candidate set is. |

Section 5 is the user-visible fault and should be corrected first; sections 1.1 and 3
together are what will buy back type size across the whole booklet, and by making songs
measure their true height they should also reduce how often a second column is reached
for at all.
