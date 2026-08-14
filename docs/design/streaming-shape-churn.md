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

`--eval` output is capped at \~2000 chars (truncation is announced on its own line) — split a long
signature list across two `--eval`s rather than trusting one.

### Two traps this probe already paid for

- **A `display:contents` wrapper reads height 0.** `[data-slot=ghost-stream-body]`'s own
  `getBoundingClientRect().height` was 0 in both runs; measure the ROW, or the leaf blocks, never the
  body wrapper.
- **`snap --eval` needs the BARE async arrow.** An arrow IIFE `(()=>{…})()` is double-invoked by the
  harness's auto-invoke regex.
- **A probe prompt may not start with `/`.** The M4 arm's first attempt opened with `/think …`; the
  composer parsed it as a slash command and swallowed the turn — zero `chat.send` in the console, the
  ghost never mounted, and the probe read as "generation failed". Reworded without the prefix, it sent.
- **Track row HEIGHT, not just `left`/`width`.** §1's "the row's geometry changed exactly ONCE" is true
  and misleading: the sampler recorded only `left`/`width`, which are genuinely constant. Height is not,
  and the height series is where M5 lives.

## 5. PROBE RESULTS 2026-08-14

Five live turns against the running dev stack (`:5173` → `:8788`, vLLM fleet, app defaults untouched —
no connection, preset or setting was changed). Chat: "Example — The Ashen Spire" (11 existing rows, 4
members). Sampler as §4, extended to also record row height, tail-block tag+rect, and the prose top
measured RELATIVE to the ghost row top (`firstBlock.top − ghostRow.top`) so autoscroll cannot confound
the shift measurement.

**VERDICT: both M1 and a new M5 reproduce; M5 is the better match for the owner's sentence. M4 is NOT
EXERCISED — not cleared.** M1 is real but is a ONE-TIME settle per ambiguous block. M5 — a code-block
container born 94px too tall and collapsing \~20-100ms later — is an overshoot-and-snap-back, which is
literally "adjusts size and fluctuates, then settles". Ranked for symptom-match: **M5 > M1 > M4**.

### Arm 1 — the structure-forcing prompt (M1): REPRODUCED, slower than §1

| run | `P,PRE,P` | `P,PRE,TABLE` | flip window |
| - | - | - | - |
| §1 run A (08-14 am) | 14662 | 14765 | 103ms |
| §1 run B (08-14 am) | 12521 | 12682 | 161ms |
| **§5 run A** | **9656** | **10021** | **365ms** |
| **§5 run B** | **9550** | **9850** | **300ms** |

The tail block flips `P:534×23` → `TABLE:530×48` (run A) / `TABLE:530×23` then `530×48` 100ms later (run
B) — the tail loses 4px of width and gains 25px of height at the promotion. Full run-A signature series:
`6986 P` → `8672 P,PRE` → `9656 P,PRE,P` → `10021 P,PRE,TABLE` → `10871 …,UL` → `12438 …,UL,P`.

The window is **2-3× wider than §1 measured**, so M1 is if anything more visible today than when it was
first characterised. §1's `left`/`width` finding holds exactly: 484 / 1424, unchanged across every frame
of both runs.

Arm 2 additionally caught the same promotion at the HEAD block, not just the tail: `6515 UL` → `6549 P`,
a 34ms flip. M1's mechanism is per-ambiguous-block, not per-message-tail.

### Arm 2 — reasoning + tool call in one turn (M4): NOT EXERCISED

Prompt forced step-by-step reasoning and offered tools. The turn generated normally (two consecutive
speaker turns — the room is a group chat), but neither M4 constituent appeared:

- **No reasoning block.** `[data-slot=collapsible-panel]` was absent for the entire turn (the sampler
  logged `panelH=none` once and never changed) — the connection emitted no reasoning tokens, so
  `ghost-message-row.tsx`'s `reasoning.length > 0` arm never mounted.
- **No tool chip.** The settled row carried zero `tool*`/`collapsible*`/`reason*` slots, and
  `rpg.listTurnToolCalls` returned 0 rows.
- **The prose never shifted.** `proseTopInRow` was **constant at 8px** for the whole turn — one sample,
  never changed. Nothing mounted above the prose.

So M4 stays **UNMEASURED**, exactly as §1 left it. It cannot be exercised from the app's current
defaults: it needs a connection pointed at a model that emits reasoning tokens and a tool armed for the
room, and this probe was scoped not to change settings. A structural note that survives regardless:
`ghost-message-row.tsx` renders `<ReasoningBlock>` ABOVE `<GhostBubbleBody>`, and the block is
force-open while `thinking` then auto-collapses on the first answer token (`reasoning-block.tsx`,
`expanded = override ?? thinking`) — so when M4 does fire, the predicted churn is not the mount but the
COLLAPSE, which drops the whole prose column by the trace's rendered height in one frame. That is the
shape to measure when a reasoning-capable connection is configured.

One unranked observation: a `dialogue` `data-slot` mounts mid-stream inside the ghost body (t=10353 turn
one, t=32016 turn two). It did NOT shift the prose top, so it is not an M4-class reflow.

### M5 — code-block container overshoot-and-collapse (MEASURED, NEW)

The instant a fenced code block mounts, the ghost row jumps to **265px**, then collapses to **170px**.
Reproduced **5 runs out of 5**, at exactly those two values every time:

| run | overshoot t | collapse t | window |
| - | - | - | - |
| arm1 A | 8672 | 8769 | 97ms |
| arm1 B | 7884 | 7905 | 21ms |
| arm1c | 9272 | 9372 | 100ms |
| arm1d | 8020 | 8041 | 21ms |
| arm1e | 9559 | 9579 | 20ms |

The element is **Streamdown's code-block container, `div.my-4.flex`** — born 202px, settles to 108px, a
**−94px** self-collapse. Every child it contains is byte-identical in geometry across the collapse:

```text
t=9559 h=265  div.flex.flex-col=249 div.space-y-0=249 p=47 div.my-4.flex=202
              div.flex.h-8=23 … div.language-javascript.overflow-x-auto=25 pre=23
t=9579 h=170  div.flex.flex-col=154 div.space-y-0=154 p=47 div.my-4.flex=108
              div.flex.h-8=23 … div.language-javascript.overflow-x-auto=25 pre=23
```

The preceding `<p>` (47), the header bar (23), the scroller (25) and the `<pre>` (23) are unchanged. The
94px is entirely in the CONTAINER's own box, not in its content — which is why §1's tail-block sampler
could not see it (the tail read `PRE:530×23` on both frames) and why the `<pre>`-never-churns finding in
§1 is correct AND incomplete: the `<pre>` does not churn, the box around it does.

Two leads, neither proven, both with a console receipt from the same window:

1. `[frame] long frame 254ms · @ shiki-plugin.ts 251ms` fires inside the collapse window — consistent
   with the async highlighter resolving and replacing a reserved placeholder, but correlation only.
2. Streamdown's own utility classes on that subtree are DEAD in our CSS — `[css] dead class — no rule
   defines it … .my-4 on [data-slot=message-bubble]`, and likewise `.h-8`, `.p-1`, `.rounded-lg`,
   `.text-sm`. If the container's settled box depends on a Streamdown utility our seal never defines,
   the pre-collapse height may be the UNSTYLED box. Worth one read of the seal before any fix.

M5 slots into §3 as a cheaper target than M1: it needs no change to block-type decidability and no
change to the repair layer the caret and the #42 reveal ride on. It is one container's height, and the
content that container ends up holding is already known at mount.

## 6. BUILT 2026-08-14 — M5 root-caused, M1 shipped as a seal pre-pass

Owner ruling: build both. Both landed in the `@orb/ui` markdown seal; `parseIncompleteMarkdown` (remend)
was not patched or vendored.

### M5 — the mechanism, and why BOTH §5 leads were wrong

**Root cause (source-pinned):** Streamdown's code-block container hardcodes, on its own element,

```js
// node_modules/streamdown/dist/chunk-BO2N2NFS.js — component `ot`, the div[data-streamdown="code-block"]
style: { contentVisibility: "auto", containIntrinsicSize: "auto 200px", ...o }
```

A `content-visibility: auto` element is SKIPPED on its very first layout — relevance-to-the-user is not
known until after that layout — so the browser sizes it from `contain-intrinsic-size`: **200px content +
the 1px border pair = the measured 202px birth box**, re-laid out at its real height one frame later.
That is the −94px self-collapse, and it explains the detail §5 flagged as strange: every child was
"byte-identical in geometry across the jump" because on the first frame the children were **not laid out
at all**.

Both recorded leads are dead. Lead 1 (the 254ms shiki-plugin long frame) is a coincident cost of the
same first render — the highlighter swap does not change the container's box. Lead 2 (Streamdown's dead
`.my-4`/`.p-1` utilities) is true but not causal: the 202 comes from an INLINE style, not a class, and
the dead `p-2` is only why the birth box is 202 rather than 218.

**Fix:** `[data-streamdown="code-block"] { content-visibility: visible !important }` in
`packages/ui/src/styles/globals.css`. `!important` is not a shortcut here — the container is internal to
Streamdown (`CodeBlock` forwards neither `style` nor `className` to it), so CSS is the only seam and an
inline style is only beatable this way. With no size containment, `contain-intrinsic-size` goes inert.
Priced cost: offscreen code blocks are now laid out. Shiki tokenizes at mount regardless of visibility,
the transcript is not virtualized, and the seal already owns the pathological-input policy
(`MAX_RENDER_LENGTH`) — so the skip was buying offscreen layout and charging a 94px snap on the first
render of every code block, mid-stream AND on scroll-in.

**Proof (`tests/ui/markdown/markdown.ct.tsx`):** a mount-frame rAF sampler (max height minus settled
height ≤ 4px) and a deterministic offscreen pin. Against the pre-fix tree the offscreen pin read exactly
**202** and the sampler measured a **48px** overshoot; both green after.

### M1 — `packages/ui/src/markdown/tail-hold.ts`, arm 1 as a pre-pass

`holdAmbiguousTail(source)` runs on the STREAMING input only and returns the longest **prefix** whose
trailing block type is already decidable — a truncation, never a rewrite, so this layer cannot corrupt
content. Withheld while undecidable: a trailing pipe run (released once its second line is
newline-terminated — GFM only accepts the delimiter row on line two, so the block's type is settled from
that point), and a final in-progress line that is nothing but an ambiguous block marker (`-`/`*`/`+`/`_`
runs, which also covers the setext-underline candidate, and a bare `1.`/`1)`). Two hard floors: it stands
down inside an open fence, and it never returns a blank body (the ghost bubble must not collapse and the
caret must have a leaf block to attach to). Accepted cost, as §3 arm 1 priced it: a table's first row
appears one line later.

**Scope verdict on §5's head-block flip:** COVERED for free. The `UL → P` 34ms flip is a bare `*`/`-`
marker line, which the marker rule holds wherever it sits — the rule is per-ambiguous-line, not
per-message-tail.

**Residual:** M4 (reasoning block / tool chip) stays UNMEASURED and unfixed — it still needs a
reasoning-capable connection and an armed tool, which no probe has configured. M3 (commit cadence)
untouched, deliberately — re-tuning `MIN_TICK_MS` is an owner call (§3 arm 3).
