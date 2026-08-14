---
kind: design
status: active
updated: 2026-08-14
---

# Streaming message SHAPE CHURN — measured mechanism + the ranked fix plan

Owner symptom (dogfood 2026-08-13): during generation the message **"changes shapes and kind of goes
wonky, then settles into its final shape once streaming completes."** Disorienting.

This is the DIAGNOSIS deliverable, not a fix. A wrong reflow fix in the markdown seal costs more than
a plan: the seal's `rehypePlugins` arm is identity-gated on Streamdown's default reference (an
`allowedTags` schema-merge whose policy is documented in `packages/ui/src/markdown/policy.ts`), and
the #42 reveal plugin already rides that same slot. Nothing here should be built without the owner
seeing the ranking.

Prior art this supersedes nothing of: [`streaming-reveal-42.md`](streaming-reveal-42.md) fixed the
per-word REVEAL (the "blam") and the caret depth. Churn is a different axis — REVEAL is about how a
word appears, CHURN is about the block it appears in changing type underneath it. The 08-09
`smoothStream` default→true ruling is also untouched by this: churn happens at both cadences (the
pacer changes WHEN text commits, never WHAT block it parses into).

## 1. What was measured

Two independent live turns, 2026-08-14, against the running dev stack (`:5173` → `:8788`, vLLM
Qwen3-VL-8B fleet adopted). Instrument: a rAF sampler installed through `pnpm snap --eval` that
records, on every change, (a) the ghost body's block-tag signature, (b) the ghost ROW's left/width,
(c) the set of `data-slot`s inside the ghost row. Full probe in §4.

Prompt (deliberately structure-forcing): *"Reply with EXACTLY this structure and nothing else: one
short sentence; then a fenced javascript code block containing a five-line function; then a markdown
table with a header row and two data rows; then a bulleted list of three items; then one closing
sentence."*

Run A (ms since page load):

| t | block signature |
| - | - |
| 13390 | `P` |
| 14007 | `P,PRE` |
| 14662 | `P,PRE,P` |
| **14765** | **`P,PRE,TABLE`** |
| 15838 | `P,PRE,TABLE,UL` |
| 16860 | `P,PRE,TABLE,UL,P` |

Run B reproduced it identically: `P,PRE,P` at 12521 → `P,PRE,TABLE` at 12682.

**The finding: the tail block is rendered as a `<p>` first and REPLACED by a `<table>` 103ms (run A) /
161ms (run B) later.** A paragraph and a table have unrelated intrinsic heights, borders and column
widths, so the message visibly reshapes and then settles — exactly the owner's sentence.

### What did NOT churn (do not chase these)

- **The row's geometry** — `left`/`width` changed exactly ONCE (at first paint: left 484, width 1424)
  across the whole turn. The bubble does not resize itself; the churn is entirely inside the body.
- **The code fence.** `P → P,PRE` at 14007 is an APPEND, not a replacement: Streamdown's
  `parseIncompleteMarkdown` (remend) recognises an unterminated fence immediately, so a code block is
  born a `<pre>` and never passes through a paragraph. The repair layer already solves this class for
  fences — it simply does not cover tables.
- **Reasoning block mount/unmount** and **tool-chip insertion** — both were listed as candidates in the
  brief; neither was EXERCISED by these turns. The ghost row's `data-slot` set was constant for the
  whole turn (`avatar-image, avatar-root, ghost-message-row, ghost-stream-body, message-bubble,
  message-content-column, message-row-body, theme-scope`). They remain UNMEASURED, not cleared — §4
  says how to exercise them.

## 2. Mechanism ranking

**M1 — late block-type promotion at the tail block (MEASURED, the headline).** Markdown's block
grammar is not decidable from a prefix. `| a | b |` on its own is a paragraph; it only becomes a table
once the delimiter row `| --- | --- |` arrives on the next line. Every re-parse of the accumulated text
re-runs `Lexer.lex`, so the tail block flips type the instant the disambiguating line lands. The same
prefix ambiguity exists for setext headings (`text` → `<h2>` when the following line is `---`),
ordered/unordered lists whose first line reads as a paragraph, and blockquote continuation. Tables are
the loudest because the height and the column layout both jump.

**M2 — remend covers fences and inline marks, not block promotion.** The repair layer is why PRE never
churned. It is also the natural home for a fix: it already owns "this prefix is not finished, render it
as the thing it is becoming."

**M3 — the tail block re-parses per commit at 12-30 commits/s** (`streaming-reveal-42.md` §D3/§D4).
This does not by itself change shapes, but it sets how many frames a wrong shape is visible for and it
is why the wrong shape is legible rather than a one-frame flash.

**M4 — reasoning block / tool chip mount (UNMEASURED).** A block appearing above the prose would shift
everything below it. Ranked last only because two turns did not produce one; a turn that does is a
one-line prompt change away (§4).

## 3. Candidate fixes, with what each costs

Ranked by confidence, not by effort. None of these is authorised by this document.

1. **Hold the tail block until its type is decidable.** Render all COMPLETE blocks normally and buffer
   the trailing partial block until it ends in a blank line (or the stream ends), painting it with the
   type it currently parses as but re-using the same DOM node. Cheapest correct-feeling variant: keep
   painting the tail as-is, but suppress the ambiguous promotions by asking remend to treat a lone
   pipe-row as a not-yet-table. Cost: a table's first row appears one line later than it does today.
   Risk: touches the repair layer that the caret and the #42 reveal plugin both sit on.
2. **Reserve the shape instead of preventing it.** Let the promotion happen but keep the tail block's
   box from jumping — a min-height carried across the swap. Cost: does not fix the column-width jump a
   table brings, so it only half-addresses the measured case. Cheap and low-risk.
3. **Slow the tail-block commit cadence only** (M3). Cost: raises reveal latency, and the 08-09 ruling
   deliberately tuned `MIN_TICK_MS`; re-tuning it is an owner call, not a lane's.
4. **Do nothing for tables; fix only the UNMEASURED M4 arm if a drive finds it.** Legitimate outcome if
   the owner's "wonky" turns out to be the reasoning block rather than the table — which is exactly
   what §4's second probe settles.

## 4. The exact live probe an evening session runs

Prerequisites: `pnpm stack up dev` (adopts the running engines); a chat with at least one existing row
so the first `[data-slot=list-row-body]` opens a real transcript.

Write this to the session scratchpad and run it by absolute path (worktree Bash rejects the compound
form). It sends one structured turn, samples the ghost every frame, and prints the block-signature
transitions — a churn is any entry where a tag at an EXISTING position changed rather than a tag being
appended.

```bash
node scripts/probes/snap.ts / --out churn --wide \
  --eval 'async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    document.querySelector("[data-slot=list-row-body]")?.click();
    for (let i = 0; i < 150 && document.querySelector("[data-slot=message-list-scroll]") === null; i += 1) { await sleep(100); }
    await sleep(1200);
    const S = { sig: [], geo: [], slots: [] };
    window.__CHURN = S;
    let raf = 0;
    const tick = () => {
      const g = document.querySelector("[data-slot=ghost-stream-body]");
      const now = Math.round(performance.now());
      if (g !== null) {
        const s = [...g.querySelectorAll("p,ul,ol,pre,table,h1,h2,h3,blockquote,hr")].map((n) => n.tagName).join(",");
        const last = S.sig[S.sig.length - 1];
        if (last === undefined || last[1] !== s) S.sig.push([now, s]);
        const row = g.closest("[data-slot=message-list-row]") ?? g;
        const r = row.getBoundingClientRect();
        const lg = S.geo[S.geo.length - 1];
        if (lg === undefined || lg[1] !== Math.round(r.left) || lg[2] !== Math.round(r.width)) S.geo.push([now, Math.round(r.left), Math.round(r.width)]);
        const sl = [...new Set([...row.querySelectorAll("[data-slot]")].map((n) => n.getAttribute("data-slot")))].sort().join(",");
        const ls = S.slots[S.slots.length - 1];
        if (ls === undefined || ls[1] !== sl) S.slots.push([now, sl]);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const ta = document.querySelector("textarea");
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(ta, "<PROMPT>");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(300);
    [...document.querySelectorAll("button[aria-label]")].find((b) => b.getAttribute("aria-label") === "Send message")?.click();
    for (let i = 0; i < 300 && document.querySelector("[data-slot=ghost-stream-body]") === null; i += 1) { await sleep(100); }
    for (let i = 0; i < 400 && document.querySelector("[data-slot=ghost-stream-body]") !== null; i += 1) { await sleep(100); }
    cancelAnimationFrame(raf);
    return { sigChanges: S.sig.length, geoChanges: S.geo.length, slotChanges: S.slots.length };
  }' \
  --eval '() => window.__CHURN.sig.map(([t, s]) => t + ": " + s)' \
  --eval '() => ({ geo: window.__CHURN.geo, slots: window.__CHURN.slots.map(([t, s]) => t + ": " + s) })'
```

Two `<PROMPT>` values, run both:

- **The table/list arm (reproduces M1):** the structure-forcing prompt in §1.
- **The M4 arm (still unmeasured):** a prompt that forces a reasoning block and a tool call in the same
  turn — with the connection pointed at a reasoning-capable model and a tool enabled for the room. Watch
  the `slots` output, not `sig`: a reasoning block or a tool chip appears as a new `data-slot`, and the
  timestamp of that change is when the message reshaped.

`--eval` output is capped at ~2000 chars (truncation is announced on its own line) — split a long
signature list across two `--eval`s rather than trusting one.

### Two traps this probe already paid for

- **A `display:contents` wrapper reads height 0.** `[data-slot=ghost-stream-body]`'s own
  `getBoundingClientRect().height` was 0 in both runs; measure the ROW, or the leaf blocks, never the
  body wrapper.
- **`snap --eval` needs the BARE async arrow.** An arrow IIFE `(()=>{…})()` is double-invoked by the
  harness's auto-invoke regex.
