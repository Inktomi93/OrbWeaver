---
kind: spec
status: active
updated: 2026-07-03
---

# 03 — `@orb/kit/chunk`: the pure recursive splitter (full spec)

> **Status: COMMITTED (D49 item 5) — prescriptive design.** A pure ENGINE in the `kit/macro` /
> `kit/regex` class: zero I/O, zero domain deps, isomorphic (the Phase-6 client chunk-count preview
> imports the same function). Gate: `kit-purity` + `test-determinism`. ST evidence:
> `utils.js:1156 splitRecursive` + `vectors/index.js:740 overlapChunks` (one-line cites; the
> algorithm below is the spec, not the port).

---

## 1. Surface

```ts
// @orb/kit/chunk/index.ts

/** Chunking parameters. The zod wire twin lives in @orb/contracts/databank
 *  (chunkParamsSchema) and is pinned to this shape by a `satisfies` check THERE —
 *  kit stays zod-free and dependency-bottom. */
export interface ChunkParams {
  /** Max chunk length in UTF-16 code units (chars). Default 2500 (ST chunk_size_db). */
  chunkSize: number;
  /** Overlap carried from the previous chunk, as a percent of chunkSize (0–50). Default 0. */
  overlapPercent: number;
  /** text.length <= this ⇒ return the whole text as one chunk. Default 5120 (ST: files
   *  ≤5 KB embed whole — kept; a short doc chunked to fragments retrieves WORSE than whole). */
  wholeFileThreshold: number;
}

export interface TextChunk {
  /** Reading order. 0-based, contiguous. THE retrieval restore key (doc 05 §3.4). */
  idx: number;
  /** The slice handed to the embedder: the [start,end) span, PREFIXED by the overlap
   *  tail of the previous chunk when overlapPercent > 0. */
  content: string;
  /** Char offset (inclusive) of the NON-overlap span in the input text. */
  start: number;
  /** Char offset (exclusive). The [start,end) spans of all chunks PARTITION the input. */
  end: number;
}

/** The separator hierarchy, coarsest → finest. "" = hard per-char split (last resort). */
export const CHUNK_SEPARATORS = ["\n\n", "\n", " ", ""] as const;

/** Pure, deterministic, total. Never throws on any string input. */
export function chunkText(text: string, params: ChunkParams): TextChunk[];
```

**Why char-based sizing, not tokens (decision):** token counting needs a tokenizer, which is
model-coupled and heavier than kit allows for this job; ST's char contract (2500 chars ≈ 600–700
tokens) is field-proven for embedding inputs, and the embed model's window is far above any sane
`chunkSize`. REJECTED: `@orb/kit/tokens`-based sizing — couples the chunk layout (and therefore
`contentHash` staleness of every chunk) to tokenizer choice; a tokenizer swap would spuriously
reindex every document.

**Why `wholeFileThreshold` is measured on EXTRACTED TEXT chars, not source-file bytes (decision):**
the chunker is pure over text and never sees the file; embedding quality depends on text length,
not container size (a 2 MB PDF can hold 3 KB of text). ST's "5 KB file" rule measures the
normalized `.txt` it stores — which IS the extracted text, so the semantics match. REJECTED:
thresholding on `documents.byteSize` (wrong axis for scanned/bloated containers).

---

## 2. Algorithm (normative)

```
chunkText(text, p):
  1. if text.length === 0            → []
  2. if text.length <= p.wholeFileThreshold
                                     → [{ idx:0, content:text, start:0, end:text.length }]
  3. spans = splitRecursive(text, 0, p.chunkSize, separatorLevel=0)
  4. number spans 0..n-1 as idx; start/end from the recursion (exact offsets)
  5. if p.overlapPercent > 0:
       o = floor(p.chunkSize * p.overlapPercent / 100)
       for idx >= 1: content = text.slice(max(prev.end - o, prev.start), end)
       (start/end stay the non-overlap span — the partition property survives)
  6. return chunks

splitRecursive(text, offset, size, level):
  sep = CHUNK_SEPARATORS[level]
  if sep === "":                       // last resort: hard split
    emit consecutive [i, i+size) spans; never split a surrogate pair — if text[cut-1]
    is a high surrogate, move the cut back by 1 (the pair rides the next span)
  parts = text.split(sep)              // keep separator accounting: a part's span includes
                                       // its TRAILING separator (offsets stay exact + lossless)
  greedy re-merge: accumulate parts (with separators) into a span while
    span.length + next.length <= size
  any single part with part.length > size → recurse at level+1 on that part
  emit spans in order
```

Properties the implementation MUST satisfy (these are the property tests, §4):

1. **Lossless partition** — concatenating `text.slice(start, end)` over all chunks in `idx` order
   reproduces the input byte-for-byte (overlap lives only in `content`, never in the spans).
2. **Bound** — `content.length <= chunkSize + floor(chunkSize * overlapPercent / 100)` for every
   chunk (the whole-file case exempt).
3. **Contiguity** — `idx` is 0..n-1 with no gaps; `chunks[i].end === chunks[i+1].start`.
4. **Determinism** — pure function of `(text, params)`: no clock, no RNG, no locale API, no
   environment read. Two invocations are deeply equal. (`Intl.Segmenter` is BANNED here —
   grapheme-aware splitting was REJECTED: locale-tabled behavior across runtimes would break
   golden stability for a cosmetic gain; the only unicode guarantee is the surrogate-pair guard.)
5. **Totality** — never throws: empty text, whitespace-only, a single 500 k-char unbroken line
   (falls through `"\n\n"→"\n"→" "` to the `""` hard split), CRLF text (treated as data —
   extraction normalizes newlines BEFORE the chunker, doc 04 §2; the chunker normalizes NOTHING
   because it must slice canon verbatim).

**Why recursive-split + greedy re-merge (decision):** it preserves the strongest available
semantic boundary (paragraph > line > word) at every size violation, degrades gracefully to a hard
split, and is offset-exact — all with zero dependencies. REJECTED: sentence-tokenizer chunking
(a language-model or rules dep in kit for marginal boundary quality; ST's hierarchy is proven at
exactly this job). REJECTED: fixed-stride windowing (ignores structure; splits mid-paragraph
always instead of rarely).

**Why overlap defaults to 0 (decision):** ST ships `overlap_percent_db: 0` and the reading-order
restore (doc 05 §3.4) already re-assembles adjacent context at retrieval time, which is overlap's
main job. Overlap also inflates storage and embed spend by its percent. The knob exists for users
whose documents have hard topic cuts. REJECTED: a 10–15% default (double-pays for what
reading-order restore gives free).

---

## 3. Placement + purity

- Home: `@orb/kit/chunk/` (`index.ts` + `split.ts` internal). No zod (contracts owns the wire
  schema and pins it with `satisfies` — doc 02 §4). No hashing — `contentHash` is
  `@orb/server/kit` (node-only-pure, D9); the ingest computes hashes over `content` server-side.
- Consumers: `domain/databank/ingest` (server) and the Phase-6 panel preview (client). One engine,
  two call sites, identical behavior — the `kit/macro` precedent.

---

## 4. Test plan (golden + property; `test-determinism` applies)

**Goldens** (committed fixture → committed expected-JSON pairs, byte-exact):

| fixture | exercises |
|---|---|
| `prose.md` (~20 KB markdown, headings + paragraphs) | paragraph-first splitting; re-merge packing |
| `single-paragraph.txt` (8 KB, no `\n\n`) | level-1 fallback (`\n` then `" "`) |
| `wall.txt` (12 KB, zero separators) | the `""` hard split + exact stride offsets |
| `unicode.txt` (CJK + emoji + combining marks) | surrogate-pair guard at hard-split cuts |
| `tiny.txt` (< threshold) | whole-file short-circuit |
| `boundary.txt` (length == threshold, and +1) | threshold edge exactness |
| `overlap.md` (run at overlapPercent 20) | overlap prefix content vs span invariance |

**Properties** (run over the fixtures + generated strings): the five normative properties of §2.
Plus the contracts pin test: `chunkParamsSchema.parse({})` defaults deep-equal the documented
defaults (2500 / 0 / 5120).

**Failure-mode pins:** `chunkSize` smaller than a single word → hard-split still bounds; params at
zod min/max extremes produce valid output (the schema, not the engine, rejects out-of-range).
