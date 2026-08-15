// @orb/kit/chunk/split — the recursive separator-hierarchy splitter (internal to the chunk engine).
// Pure, deterministic, total. Produces absolute `[start, end)` spans that PARTITION the input losslessly
// (concatenating `text.slice(start, end)` in order reproduces the input byte-for-byte). Overlap lives only
// on the caller-assembled `content`, never in these spans.
//
// The hierarchy (coarsest → finest) preserves the strongest available semantic boundary at every size
// violation, degrading to a hard per-char split ("") as the last resort. A part longer than `size` recurses
// one level finer; the "" level always makes progress (bounded stride) so recursion terminates.

/** The separator hierarchy, coarsest → finest. `""` = hard per-char split (last resort). */
export const CHUNK_SEPARATORS = ["\n\n", "\n", " ", ""] as const;

const HIGH_SURROGATE_MIN = 0xd8_00;
const HIGH_SURROGATE_MAX = 0xdb_ff;

/** An absolute half-open span into the original input text. Spans returned by {@link splitRecursive} are
 *  contiguous (`spans[i].end === spans[i+1].start`) and cover the whole slice they were asked to split. */
export interface Span {
  readonly start: number;
  readonly end: number;
}

/** Hard split `[baseOffset, baseOffset + sub.length)` into consecutive `<= size` spans. Never cuts a
 *  surrogate pair: if the cut would fall between a high + low surrogate AND pulling back one still makes
 *  progress, the pair rides the next span. Progress is guaranteed (`cut > pos` always). */
function hardSplit(sub: string, baseOffset: number, size: number): Span[] {
  const out: Span[] = [];
  let pos = 0;
  while (pos < sub.length) {
    let cut = Math.min(pos + size, sub.length);
    // Only apply the surrogate guard when it still advances past `pos` (else totality beats the pair).
    if (cut < sub.length && cut - 1 > pos) {
      const code = sub.charCodeAt(cut - 1);
      if (code >= HIGH_SURROGATE_MIN && code <= HIGH_SURROGATE_MAX) {
        cut -= 1;
      }
    }
    out.push({ start: baseOffset + pos, end: baseOffset + cut });
    pos = cut;
  }
  return out;
}

/** Break `sub` at `sep`, keeping each part's TRAILING separator so the spans stay exact + lossless. The
 *  last part carries no separator. Empty (zero-length) parts are dropped — they place no offsets. */
function toSegments(sub: string, baseOffset: number, sep: string): Span[] {
  const parts = sub.split(sep);
  const segs: Span[] = [];
  let cursor = baseOffset;
  for (let i = 0; i < parts.length; i += 1) {
    const withSep = (parts[i] ?? "").length + (i < parts.length - 1 ? sep.length : 0);
    if (withSep > 0) {
      segs.push({ start: cursor, end: cursor + withSep });
    }
    cursor += withSep;
  }
  return segs;
}

/** Greedy re-merge: accumulate contiguous `segs` into `<= size` spans; a segment longer than `size` alone
 *  is handed to `recurse` (one separator level finer). Contiguity + losslessness are preserved. */
function mergeSegments(segs: readonly Span[], size: number, recurse: (seg: Span) => Span[]): Span[] {
  const out: Span[] = [];
  let acc: Span | null = null;
  const flush = (): void => {
    if (acc !== null) {
      out.push(acc);
      acc = null;
    }
  };
  for (const seg of segs) {
    const segLen = seg.end - seg.start;
    if (segLen > size) {
      flush();
      out.push(...recurse(seg));
    } else if (acc === null) {
      acc = seg;
    } else if (acc.end - acc.start + segLen <= size) {
      acc = { start: acc.start, end: seg.end };
    } else {
      flush();
      acc = seg;
    }
  }
  flush();
  return out;
}

/** Split `sub` (which occupies `[baseOffset, baseOffset + sub.length)` in the original text) into `<= size`
 *  spans at separator `level`, recursing one level finer for any single part that alone exceeds `size`. */
export function splitRecursive(sub: string, baseOffset: number, size: number, level: number): Span[] {
  const sep = CHUNK_SEPARATORS[level] ?? "";
  if (sep === "") {
    return hardSplit(sub, baseOffset, size);
  }
  const segs = toSegments(sub, baseOffset, sep);
  return mergeSegments(segs, size, (seg) => splitRecursive(sub.slice(seg.start - baseOffset, seg.end - baseOffset), seg.start, size, level + 1));
}
