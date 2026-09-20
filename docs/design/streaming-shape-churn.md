---
kind: design
status: active
updated: 2026-08-21
---

# Streaming message SHAPE CHURN — measured mechanism + the ranked fix plan

Owner symptom (dogfood 2026-08-13): during generation the message **"changes shapes and kind of goes
wonky, then settles into its final shape once streaming completes."** Disorienting.

This is the DIAGNOSIS deliverable, not a fix. A wrong reflow fix in the markdown seal costs more than
a plan: the seal's `rehypePlugins` arm is identity-gated on Streamdown's default reference (an
`allowedTags` schema-merge whose policy is documented in `packages/ui/src/markdown/policy.ts`), and
the #42 reveal plugin already rides that same slot. Nothing here should be built without the owner
seeing the ranking.

Prior art this supersedes nothing of: [`../history/design/streaming-reveal-42.md`](../history/design/streaming-reveal-42.md) fixed the
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

**M3 — the tail block re-parses per commit at 12-30 commits/s** (`../history/design/streaming-reveal-42.md` §D3/§D4).
This does not by itself change shapes, but it sets how many frames a wrong shape is visible for and it
is why the wrong shape is legible rather than a one-frame flash.

**M4 — reasoning block auto-COLLAPSE (MEASURED 2026-08-14 evening, §8 — now ranked FIRST).** Not the
mount: the disclosure is force-open while thinking and collapses to zero the instant the first answer
token lands, dropping the prose column by the whole trace height. Measured 3/3 on an OpenRouter
chat-completions reasoning model: **350–677px in ~300ms**, 4–7× M5. The tool-chip half of this arm is
still unexercised. Revised whole-document ranking: **M4 > M5 > M1**. (§2's original text ranked M4 last
because no turn had produced one; §7 then wrongly demoted it to unreachable — see §8.1.)

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
pnpm snap / --out churn --wide \
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
container born 94px too tall and collapsing ~20-100ms later — is an overshoot-and-snap-back, which is
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

## §7 M4 PROBE RESULTS 2026-08-14

> **AMENDED by §8 (owner correction, 2026-08-14 evening) — read §8 before acting on this section.** §7's
> verdict below ("M4 does NOT reproduce ... structurally unreachable") is WITHDRAWN. The measurements in
> §7.3 are correct and the §7.2 lever is correct; the CONCLUSION drawn from `reasoningChars:0` is not.
> Owner, verbatim: *"agent sdk cant report reasoning when using the sub — use the openrouter key and test
> that shit on chat completions."* On an OpenRouter chat-completions connection **M4 reproduces 3/3 and is
> the LARGEST churn in this document** (§8). What §7 measured was TRANSPORT OPACITY on the max-pro-sub
> agent-sdk wire, not a model that declined to think.

Seven live turns against the running dev stack, on a SCRATCH room the probe created and deleted
(`__orb.seed.game({profile:"d20"})` → a fresh chat + a fresh `orb-seed-hero` card; the owner's six
example chats were never opened). Reasoning was turned fully ON through the app's own API, scoped to
that one room via `rpg_games.gmPresetId`.

**VERDICT: M4 does NOT reproduce, and on today's defaults it CANNOT — the churn class is unreachable,
not merely unexercised.** With reasoning effort confirmed on the wire the model emitted ZERO reasoning
characters, so `ghost-message-row.tsx`'s `reasoning.length > 0` arm never mounted, no tool chip landed,
and the prose top never moved. The ranking stands unchanged: **M5 > M1 > M4**, with M4 now demoted from
"unmeasured" to "structurally unreachable on the default connection".

The probe did find a DIFFERENT, unrelated defect on the same path — a 110-second turn that dies as an
HTTP 500 while leaving both `/api/_debug` rings empty. That is §7.5 and it is the section worth acting
on.

### §7.1 The brief's premise died: the chat connection is NOT the local vLLM

`connection.resolveChatCapability` on the live stack returns:

```json
{ "api": "agent-sdk", "source": "max-pro-sub", "model": "claude-opus-4-8",
  "capability": { "reasoning": { "mode": "adaptive", "enabled": true,
    "effortLevels": ["low","medium","high","xhigh","max"],
    "displayModes": ["summarized","omitted"] } } }
```

So a chat turn never touches the 27B vLLM gen engine, and `enable_thinking` / the fixed jinja template
are not on the path a turn takes. The vLLM arm is still real and is documented in §7.4, but it is
reachable only behind a GLOBAL chat-connection switch, which this probe was refused (orchestrator
ruling, arm B — scratch-scoped authorization does not extend to repointing the owner's live default).

### §7.2 The scratch-scoped lever that DID work (reproduce with this)

Reasoning is a PRESET knob (`PromptConfig.params.effort`, `userIntentSchema`), and an rpg game can
override the whole preset for ONE room — `rpg_games.gmPresetId`, born NULL, written by
`rpg.updateConfig({ chatId, gmPresetId })`. So no global setting has to move:

1. `preset.create({ name, kind:"user" })` → `preset.update({ id, config: { …config, params: { effort:"high" } } })`.
2. `__orb.seed.game({ profile:"d20" })` → a fresh chat + character.
3. `rpg.updateConfig({ chatId, gmPresetId: <the new preset> })`.
4. `chat.commitMessage({ chatId, content })` — REQUIRED. A freshly seeded room is a HUSK
   (`chats.started_at IS NULL`) and the husk lens in `chat/persistence/queries.ts:346` hides it from
   `listChats`, so `__orb.nav.openChat` refuses it with "no chat matches id-or-title". One
   non-generating post claims the room and makes it navigable.

Receipt that the knob reached the provider, from `/api/_debug/wire/outcomes`:

```json
{ "model": "claude-opus-4-8", "reasoningEffort": "high", "reasoningChars": 0,
  "contentChars": 1081, "tokensOut": 1161, "maxOutputTokens": 2048,
  "finishReason": "tool", "stopReason": "tool_use", "toolCalls": [] }
```

`reasoningEffort` is the funnel's resolved value (`resolve-chat.ts` `resolveReasoning`), and it is
non-null only when `reasoning.enabled` is true — which is also the exact condition
`agent-sdk/translate.ts:257` uses to set `disableThinking:false` (i.e. to NOT emit
`CLAUDE_CODE_DISABLE_THINKING=1`, `env.ts:116`). Thinking was engaged. The model declined it.

### §7.3 What the ghost actually did (the M4 measurements)

Sampler as §4/§5, extended to also track the reasoning disclosure: the ghost row's height, the
`[data-slot=collapsible-panel]` height (`-1` = absent), the trigger's label text, and
`proseTopInRow = firstBlock.top − ghostRow.top`.

Run A, `params:{effort:"high"}`, ms since page load:

| series | samples | value(s) |
| - | - | - |
| `collapsible-panel` height | 1 | `-1` at 5583 — ABSENT for the whole turn |
| trigger label | 1 | `"none"` at 5583 — no disclosure ever rendered |
| `proseTopInRow` | 2 | `-999` (no body) at 5583 → **`8` at 13248, then never again** |
| ghost row height | 16 | 32 → 39 → 63 → 86 → 109 → … → 365, strictly monotonic |
| `data-slot` set | 2 | `…,typing-dots` → `…,ghost-stream-body` (typing-dots swap only) |

**Nothing mounted above the prose and nothing collapsed.** `proseTopInRow` is one value, 8px, from the
first painted block to the end of the turn — the same constant §5 recorded. The 16 row-height samples
are pure appends (each step is one more line of prose); there is no overshoot-and-return anywhere in
the series, which is what an M4 collapse would look like.

The other four completed runs agree, and none produced a reasoning character:

| run | `params` | TTFT to first prose | row samples | panel | `reasoningChars` | `tokensOut` |
| - | - | - | - | - | - | - |
| A | `effort:high` | 7.7s | 16 | absent | 0 | 1161 |
| D | `effort:high` + `thinkingDisplay:summarized` | 33.2s | 17 | absent | 0 | 3012 |
| E | `effort:max` | 52.3s | 10 | absent | 0 | 4053 |
| F | `effort:high` + `temperature:0.11` | 10.2s | 12 | absent | 0 | 836 |

**Tool chips: also absent.** The room is rpg-lite with extraction armed, and every outcome reports
`finishReason:"tool"` / `stopReason:"tool_use"` with `toolCalls: []` — a folded tool-only completion
whose calls land no `ToolCallRecord` (the case `wire-capture.ts:161` documents). No `tool*` slot
appeared in the ghost's `data-slot` set on any run.

### §7.4 Why M4 did not fire, and the one line that would unblock it

The capability is `reasoning.mode:"adaptive"`, so `agent-sdk/translate.ts:180` builds
`thinking:{type:"adaptive", …}` — **the MODEL decides whether to think**, and `effort` only sets the
ceiling. Opus 4.8 declined on all four completed turns, including a deliberately hard one (a
three-dial constraint puzzle: sum 15, first = 2× third, second = first − 1, then narrate). There is no
user-reachable knob that forces `type:"enabled"`: `buildThinking` reads the mode straight off the
capability, and the capability comes from the daemon.

**The vLLM arm is real and one request field away — SOURCE-PINNED, and both prior guesses about it are
wrong.** The gen engine launches with
`--default-chat-template-kwargs {"enable_thinking": false, "preserve_thinking": true}`
(`build-argv.ts:286`). Two independent gates read that value:

- the CHAT TEMPLATE (`tooling/src/stack/lib/engine-fleet/templates/qwen3_gen_thinking_serve.jinja` `:6`/`:18`, prefill at `:324-329` — the fleet's templates moved out of the server on 2026-09-19, F1), and
- the REASONING PARSER: `vllm/parser/qwen3.py:226` —
  `self.thinking_enabled = chat_kwargs.get("enable_thinking", True)` — with `:252`
  `if not self.thinking_enabled: return None, model_output`.

The parser gate is the one that matters and it is invisible from our side. Live A/B on `:8703`
(`Huihui-ThinkingCap-Qwen3.6-27B-abliterated-W8A8`):

| request | reasoning chars | content chars |
| - | - | - |
| plain | 0 | 193 |
| `<\|think_on\|>` marker in the user text | 0 | 1259 |
| `chat_template_kwargs:{enable_thinking:true}` | 1385 | 0 |
| streaming + `<\|think_on\|>` marker | 0 (0 deltas) | 1426 (327 deltas) |

The jinja's `<|think_on|>` marker (`:25-29`) is a REAL lever on the TEMPLATE — a local render proves it
flips the prefill from `<think>\n\n</think>\n\n` to `<think>\n` and strips the marker from the rendered
user text — and it is USELESS on its own, because the parser stays in CONTENT state and the whole
thought lands in `content`. Do not reach for it.

So the working shape, app-side, is a preset carrying
`customParameters: { chat_template_kwargs: { enable_thinking: true } }` — `custom-byo`'s `buildBody`
deep-merges `customParameters` after the funnel (`runners/chat.ts:319`), and
`openai-compat/stream.ts:137` already maps `delta.reasoning` → `{kind:"reasoning"}`. **It requires the
chat-role connection to point at the local vLLM, which is a global setting.** That is the only thing
standing between this document and a measured M4, and it is an owner call.

### §7.5 NEW DEFECT — a 110s turn that 500s and leaves both debug rings empty

Reproduced **3 times out of 3** (runs B, C, H — H on a freshly reseeded database, so it is not a
one-database artifact). Trigger: **all three params together**,
`{effort:"max", thinkingDisplay:"summarized", temperature:0.11}`. Isolation matrix:

| `params` | outcome |
| - | - |
| `effort:high` | completes (7.7s) |
| `effort:high` + `thinkingDisplay:summarized` | completes (33.2s) |
| `effort:max` | completes (52.3s) |
| `effort:high` + `temperature:0.11` | completes (10.2s) |
| **all three** | **FAILS, 3/3** |

**No single knob reproduces it** — the failure needs the combination, and the tell across the passing
runs is that each added knob buys latency (7.7 → 10.2 → 33.2 → 52.3s), so the combination is plausibly
just the slowest arm rather than a semantic conflict between the three values.

The user-visible shape: the ghost row sits on typing-dots for ~110 seconds (6566 sampled frames on run
H), never gains a `ghost-stream-body`, then vanishes. No assistant message commits. No error toast is
recorded by the probe.

**Four-hop trace (run H), from `.cache/stack/server.log` + the debug rings:**

| hop | verdict | receipt |
| - | - | - |
| request built + sent | YES | `/api/_debug/wire/captures` holds the body (`api:"agent-sdk"`, the full prompt) |
| provider returned | YES, as an error | `provider.turn … terminalReason:"api_error", durationMs:109922, ttftMs:null, ok:false, usage.tokensOut:8192` |
| classified | YES, loudly, to PINO ONLY | `ERROR provider.error … "agent-sdk: result success-subtype flagged is_error", kind:"server", retryable:true` |
| surfaced to the debug rings | **NO** | `/api/_debug/wire/outcomes` → `{"count":0}`; `/api/_debug/errors` → `{"errors":[]}` |
| returned to the client | 500 | `POST /api/trpc/chat.send status:500 durationMs:110047` |

Two separate observability holes, both structural:

1. **`recordTurnOutcome` has exactly ONE call site** — `engine.ts:1055`, inside `captureTurnOutcome`,
   invoked only AFTER `runTurnPipeline` RESOLVES. A turn that throws inside the pipeline can therefore
   never leave a wire outcome, by construction. `wire-capture.ts:1050`'s own comment says the recorder
   is placed "BEFORE the empty-generation guard so a REFUSED turn still leaves the record that explains
   it" — that is true for a refusal and false for a FAULT, which is the case a reader will actually be
   hunting.
2. **`/api/_debug/errors` stayed empty through an ERROR-level pino log and an HTTP 500.** Whatever feeds
   that ring does not see a provider fault on the chat-send path, so the one panel an operator opens
   after "my turn just disappeared" is blank.

Note also `tokensOut: 8192` against a resolved `maxOutputTokens: 2048` (and 4053 on run E) — the
agent-sdk path is not honouring the funnel's output cap. Whether that is the same defect or a second
one is not settled here.

Not fixed in this lane, deliberately: the deliverable is the isolation receipt + the hop, and the fix
is the orchestrator's to board. The two candidate arms, unranked: move the outcome record into a
`finally` (or add a fault-side twin) so a thrown turn still leaves a row; and feed provider faults into
the `/api/_debug/errors` ring.

#### §7.5a FIXED 2026-08-14 (lane silent-500) — and the cap finding was a UNIT ERROR, not a cost bug

Both observability holes are closed, and the third finding did not survive contact.

**1. The outcome row (arm one of the two above, the fault-side TWIN — not the `finally`).** `engine.ts`
gained `captureTurnFault`, called first thing in `executeTurn`'s post-start catch. A `finally` was rejected:
the resolve arm and the fault arm can honestly report DIFFERENT field sets (a faulted turn produced no
`final` chunk, so its generation numbers are ABSENT, never zeroed), and one merged site would have had to
fabricate or branch anyway. `WireOutcome` grew `disposition` (`completed`|`error`|`user`|`stale` —
mirroring `TurnAbortReason`, enforced by assignability since foundation cannot import the domain union) and
`terminalReason`, threaded from `ProviderError.terminalReason` (falling back to `.kind`) via a `.cause`-chain
walk, never re-derived.

**2. `/api/_debug/errors` — the ring WRITE was never broken; the READ FILTER was.** `logger.ts` formats the
level as its string LABEL (`"level":"error"`), and both readers in `routes.ts` did
`Number(record["level"] ?? 0)`. `Number("error")` is **NaN**, and every NaN comparison is false — so
`collectErrors` (`NaN >= 50`) returned `[]` for EVERY input, and `collectLogs` (`NaN < minLevel`) excluded
NOTHING. One filter could never fire, the other never filtered, and both read as working. §7.5's "whatever
feeds that ring does not see a provider fault" was the wrong half of the seam. Fixed by `recordLevel()`
(label OR number).

Its sibling hole, found while proving it: an unmapped throw got a bare 500 with **no log line of its own**.
`classifyDomainError` returns null for anything that is not a `DomainError`, and `domainErrorMiddleware`
just returned the result. Every `INTERNAL_SERVER_ERROR` now logs one `trpc.unhandled` error line naming the
procedure (gate refusals stay unlogged — 401 noise would bury the faults).

**3. `tokensOut:8192` vs `maxOutputTokens:2048` — NOT a cap violation; the row was missing its
denominator.** The cap is passed (`translate.ts:255` → `env.ts:119` `CLAUDE_CODE_MAX_OUTPUT_TOKENS`), and
the env NAME is parity-pinned against the bundled runtime (`env.test.ts`, "bundled-runtime name parity").
The two numbers are **in different units**: `runner.ts` `accumulateUsage` SUMS `outputTokens` over every
entry of `message.modelUsage`, so `tokensOut` is a per-TURN aggregate across the agentic loop's model calls,
while `maxOutputTokens` is the PER-CALL ceiling. The probe's room was rpg-lite with terminal tools armed, so
`chatMaxTurns` allowed several calls; 8192 is exactly 4 × 2048, and run E's 4053 sits between 1× and 2×.

That is consistent with a cap that HELD, and it is not proof of one — a single call at a vendor default
could also land on 8192. **The lane therefore recorded the missing unit rather than guessing:**
`num_turns` now rides the `provider.turn` log line (the exact `ok:false` line this trace was read off) and
`modelCalls` rides the outcome row, threaded `numTurns` → `TurnEconomics.modelCalls` at the compose bridge.
Re-running the §7.2 repro settles it in one read: `modelCalls:4` ⇒ the cap held and there is no bug;
`modelCalls:1` ⇒ a real violation, and the next question is whether the bundled runtime applies
`CLAUDE_CODE_MAX_OUTPUT_TOKENS` as a per-request `max_tokens` at all.

**Not touched:** `DEFAULT_MAX_OUTPUT_TOKENS = 2048` itself. Raising it is the open `"LONGER OUTPUTS" LEVER`
row in `docs/history/retro-workboard-2026-08-14.md` — an owner decision with a battery attached, not a lane's call.

### §7.6 Scratch state — every change and its restore

| what | before | after the probe |
| - | - | - |
| preset `m4-probe-reasoning` | did not exist | `preset.remove` → gone; `preset.list` reads `["Default"]` |
| chat "m4-probe scratch" (+ its rpg game) | did not exist | `chat.delete` → gone (game CASCADEs) |
| character `orb-seed-hero` | did not exist | `character.remove` → gone |
| `rpg_games.gmPresetId` | n/a (new row) | died with the chat |
| the system `Default` preset | untouched | untouched — never written |
| the chat-role connection | agent-sdk / max-pro-sub | untouched — the global switch was refused |

Final `/api/_debug/db/stats`: `chats:6, characters:11, presets:2, messages:121` — the post-seed
baseline, no residue.

**Out-of-lane event worth recording:** at 13:29:24 the dev stack restarted and the database was
RESEEDED by something outside this probe (new `users.id`, all six example chats reminted, the
wire rings cleared). It destroyed the first scratch set mid-run and cost one confirmation run. If a
sibling lane or a harness step resets the dev DB, a live-drive probe cannot hold state across it.

**Free re-receipt on §6's M5 fix, partial:** the seal rule is live in the served CSS —
`[data-streamdown="code-block"] { content-visibility: visible !important; }` is present in the CSSOM and
a synthetic `div[data-streamdown="code-block"]` computes `contentVisibility: "visible"`. The 202→108
mid-stream snap was NOT re-measured: no probe turn in this lane produced a fenced code block (the arm
is narrative rpg prose), so the height series has nothing to say about it.

## §8 M4 MEASURED ON OPENROUTER CHAT-COMPLETIONS 2026-08-14 (evening)

**VERDICT: M4 REPRODUCES, 3 runs out of 3, exactly as §7.4 predicted — the churn is the auto-COLLAPSE on
the first answer token, not the mount. It is also the BIGGEST reflow this document has measured: the prose
column drops 350–677px in ~300ms, 4–7× M5's 94px. Revised symptom-match ranking: M4 > M5 > M1.**

M4 is no longer a tail-of-the-list "unmeasured" arm. On any reasoning-capable chat-completions connection
it is the dominant "changes shapes and goes wonky, then settles" event in a turn.

### §8.1 The §7 framing amendment — the sub does not REPORT reasoning, it did not DECLINE to

Owner correction, verbatim (2026-08-14 evening): *"agent sdk cant report reasoning when using the sub —
use the openrouter key and test that shit on chat completions."*

§7.2 read `reasoningChars: 0` off `/api/_debug/wire/outcomes` on a max-pro-sub agent-sdk turn and
concluded (§7.4) that *"the MODEL decides whether to think"* and *"Opus 4.8 declined on all four completed
turns"*. That is the wrong middle. `thinking:{type:"adaptive"}` was genuinely engaged — §7.2's
`reasoningEffort:"high"` receipt is real — but the max-pro-sub agent-sdk wire does not surface reasoning
bytes to us at all, so `reasoningChars:0` measures OUR VISIBILITY, not the model's behaviour. §7's
"structurally unreachable" demotion was therefore drawn from a transport blind spot.

What survives from §7 unchanged: every §7.3 number (the panel was genuinely absent on that path, so the
prose genuinely never moved), the §7.2 scratch-scoping recipe, the §7.5 silent-500 defect, and the §7.4
claim that the CHURN, when it fires, is the collapse rather than the mount. §7.4's proposed unblock (a
vLLM `chat_template_kwargs:{enable_thinking:true}` preset) is still a valid second path but was NOT the
one taken — OpenRouter chat-completions needed no custom parameter at all.

### §8.2 THE BLOCKER §7 HIT, source-pinned: there is no per-room CONNECTION scoping

§7 was refused a global connection flip and could reach only the PRESET per room. That was correct, and
the reason is structural — worth recording so no future probe re-derives it:

- `connection/verbs/resolve-chat.ts:19-27` — the only per-chat input is `routableChat:
  RouteChatAssignment`, forwarded as a `routeOverride` of `{api, source, model}`.
- `entry/compose/chat.ts:1142` and `entry/compose/rpg.ts:1652-1656` — BOTH derive that assignment as
  `meta.providerRouting !== undefined ? { providerRouting } : {}`. **`api`/`source`/`model` are never
  populated from the chat row**, and `contracts/src/chat/metadata.ts:243` confirms `providerRouting` is the
  only routing field chat metadata carries. `resolve-chat.ts:10-13` additionally states that the
  providerRouting hop is deliberately unwired.
- So the chat-role connection resolves ONLY from `UserSettings.routing.roleDefaults.chat`
  (`connection/verbs/resolve-role.ts:62-67`). A preset cannot move it (`db/src/schema/preset.ts:3`), and
  `rpg_games.gmPresetId` reaches generation params only.

The owner authorised the supervised flip of that per-user setting for this probe; §8.7 is its restore
receipt. **A future M4/connection probe has exactly two levers: the per-user role default, or a second
user — and a second user is a dead end, because `credentials/verbs/resolve.ts:23-33` gives OpenRouter no
host fallback (the env key is seeded onto the OWNER's credential row by `entry/boot/seed-credential.ts`).**

### §8.3 The connection, and the wire capture that qualified it

Model chosen by a raw-wire pre-check against OpenRouter before any app change (cheap, streams reasoning
deltas first and answer text second — the exact sequence M4 needs):

| model | reasoning deltas / chars | first reasoning | first content |
| - | - | - | - |
| `deepseek/deepseek-v4-flash` | 173 / 1205 | 660ms | 28131ms |
| `openai/gpt-oss-120b` | 697 / 2114 | 1247ms | never (hit the 700-token cap) |

Flip applied through the app's own API — `settings.updateUserSettingsSection({section:"routing", patch:
{roleDefaults:{chat:{api:"chat-completions", source:"openrouter", model:"deepseek/deepseek-v4-flash"}}}})`
— after which `connection.resolveChatCapability` returned
`chat-completions/openrouter/deepseek/deepseek-v4-flash` with
`reasoning:{mode:"effort", enabled:true, effortLevels:["xhigh","high"], defaultEffort:"high"}`. No preset
was needed: OR advertises `default_effort:"high"` with no `defaultEnabled:false`, so
`packages/inference/src/funnel/resolve-chat.ts`'s `effectiveEffort` (the providers tier's own resolve-chat when this was measured) fills the effort from the capability itself.

Wire receipts from `/api/_debug/wire/outcomes` on the measured turns — the thing §7 could not get:
`reasoningChars: 998` / `1280` against `contentChars: 305` / `299`. Reasoning bytes are on the wire and
the wire's stream reducer — `packages/inference/src/backends/v4/stream.ts` today, `backends/kit/openai-compat/stream.ts` when this was measured — maps them to `kind:"reasoning"` exactly as
predicted.

Room: a SCRATCH plain chat (`chat.startChat`, no rpg game — so no tool folding to confound §7.3's
`finishReason:"tool"` noise) with a scratch `mo-probe-narrator` character. Both deleted (§8.7).

### §8.4 The measurements — mount, growth, collapse

Sampler as §4/§5/§7.3, extended to record the `[data-slot=collapsible-panel]` height (`-1` = absent — Base
UI removes the panel from the DOM while closed, `ui/src/primitives/collapsible/collapsible.tsx:43-46`), the
disclosure label, the ghost row height, `proseTopInRow = firstBlock.top − ghostRow.top`, and the
`[data-streamdown=code-block]` height. `ghost-stream-body` is `display:contents`, so the CHILD is measured,
never the wrapper.

**Three phases, identical in all three runs:**

1. **Mount (a small step, not the churn).** The ghost mounts at row height **32** on typing dots. The first
   reasoning delta mounts `<ReasoningBlock>`: panel **30px**, row **32 → 86** (+54), label `Thinking… 0s`,
   with a one-frame `stream-shimmer` before the trace's first text. Nothing is below the block yet, so
   nothing is displaced — this is a grow, not a jump.
2. **Growth (slow, monotonic, legible).** The panel grows in ~23px line steps as the trace streams, ticking
   `Thinking… 1s … 9s`. Peak panel height 350–677px depending on how long the model thought.
3. **THE CHURN — collapse on the first answer token.** `useGhostThinking` flips false the instant answer
   text lands (`use-ghost-stream.ts:37-45`), `expanded = override ?? thinking` closes the Collapsible
   (`reasoning-block.tsx:70`), the label freezes to `Thought for Ns`, and the whole panel animates to zero
   and unmounts — dragging the prose column up by the full trace height.

| run | panel peak | prose top at first paint | settled prose top | **prose drop** | collapse window | label at flip |
| - | - | - | - | - | - | - |
| r1 | 677 | 709 | 32 | **677px** | 13985 → 14365 = 380ms | `Thought for 4s` |
| r2 | 350 | 382 | 32 | **350px** | 13812 → 14194 = 382ms | `Thought for 6s` |
| r4 | 525 | 557 | 32 | **525px** | 14445 → 14837 = 392ms | `Thought for 9s` |

**Run provenance, stated because the labels skip a number.** Five turns were fired; three are in the table.
r3 died to an `Execution context was destroyed` — the dev stack churned mid-run (an HMR + a server restart
window that also 502'd two later requests), so its DOM series is void. Its retry generated server-side but
the client's bus never attached through the 502s, so the ghost never mounted; that run contributes the
`reasoningChars:998` wire receipt in §8.3 and nothing else. r1/r2/r4 are three clean, independent turns.

The ghost ROW height agrees exactly: r1 741 → 64, r2 414 → 64, r4 589 → 64 — the same 677/350/525.
`proseTopInRow` settles at **32** in every run, which is the same constant §5 and §7.3 recorded for a
reasoning-free turn: the collapse returns the layout to precisely where a non-thinking turn starts.

Full r1 panel series (ms since load): `-1 @6902` → `30 @9332` → … → `512 @13883` → **`677 @13985`** →
`499 @14016` → `361` → `259` → `186` → `134` → `97` → `70` → `50` → `36` → `25` → `18` → `12` → `8` → `5`
→ `3` → `2` → `1` → `0 @14298` → `-1 @14365` (removed from the DOM). The collapse is ANIMATED, ~19 sampled
frames — so it is not a one-frame snap the eye can miss; it is a legible ~300ms slide of everything below.

Two secondary observations:

- **The prose is painted at its PRE-collapse position for one frame.** r1: `proseTopInRow` is first
  sampled at **709** (13999) — the first prose block renders below the still-open trace, then travels
  677px up. The reveal and the collapse are not coordinated.
- **The row then GROWS again** as the answer streams (r1 64 → 241; r4 64 → 311), so the settle is
  down-then-up, not a single settle. That is the "fluctuates, then settles" half of the owner's sentence.

### §8.5 BONUS re-receipts (M5 dead, M1 fence finding intact, ARM 8 unblocked)

**M5 birth-snap stays DEAD — re-measured, not inferred.** Runs r2 and r4 both produced a fenced javascript
block mid-stream. `[data-streamdown=code-block]` height series: r2 `-1 → 108 @14226 → 154 @14445`; r4
`-1 → 108 @15006 → 154 → 177 → 201 → 247`. **The container is BORN at 108 and only ever grows.** The
202→108 self-collapse §5 measured 5/5 does not occur — §6's `content-visibility: visible !important` seal
rule holds on the live tree, now with a mid-stream height series behind it rather than a CSSOM read.

**M1's fence finding holds on this path too.** r2's block signature series is `none → P @13825 → P,PRE
@14226` — an APPEND, never a promotion. No table/list prompt was run here, so §6's `tail-hold.ts` pre-pass
is untouched by this section.

**ARM 8 (the refinery structured-on-OpenRouter fact the refinery-e2e lane left BLOCKED): routing WORKS,
execution FAILS.** `structured` is not its own routing role — it rides the resolved `summarize` connection
(measured in the purged `entry/compose/role-clients.ts:121-123`; the binder is `entry/compose/services.ts` now and the lever is the principal's `summarize` binding, not a settings blob). With it pointed at
OpenRouter, one `refinery.generateSchema` produced a real capture:

```json
{ "api": "structured", "backend": "openrouter", "model": "deepseek/deepseek-v4-flash" }
```

— so the seam is wired end-to-end. The call itself failed: `openrouter structured item 0 failed: Response
validation failed`, HTTP 500 to the client, and `provider.structured-item` logged
`ok:false, errorKind:"unknown", durationMs:174`. Re-fired on `openai/gpt-oss-120b`: identical failure,
`durationMs:83`. **Not a reasoning×structured conflict** — the captured request body carries NO `reasoning`
field on either model. Both durations are far too short for a generation, so this is an upstream REJECT
our response schema then fails to parse. The captured body:

```json
{ "provider": { "require_parameters": true }, "max_completion_tokens": 2048, "temperature": 0.2,
  "stream": false, "response_format": { "type": "json_schema",
  "json_schema": { "name": …, "schema": …, "strict": true } } }
```

`provider.require_parameters:true` + `json_schema.strict:true` is the pairing to investigate first (it asks
OpenRouter to route only to endpoints supporting every parameter, and a no-endpoint answer is not a
completion shape). UNPROVEN — the ring stores requests, not responses; the next probe should capture the
upstream body. The same call on the restored vLLM connection succeeds in 7.1s (`ok:true, tokensOut:238`),
so the refinery path itself is healthy.

### §8.6 Ranked fix candidates for M4 — nothing built, the owner rules the arm

Ranked by symptom-match per pixel of churn removed, not by effort.

1. **Do not auto-collapse; freeze the trace open and let the answer render below it.** The disclosure
   already flips its label to `Thought for Ns`, which is the whole state change a reader needs — the height
   change is gratuitous. Cost: a long trace keeps eating vertical space until the user closes it, which is
   exactly what the auto-collapse was written to prevent. Cheapest possible edit (`expanded = override ??
   thinking` → `override ?? (thinking || neverCollapsed)` in `reasoning-block.tsx:70`), and it removes 100%
   of the measured churn.
2. **Collapse to a FIXED preview height instead of to zero.** Keep the first ~2 lines of the trace mounted
   after the flip. Cost: still a jump, just a bounded one (~677px → ~60px), and it needs a real design
   call about what the settled row shows. Preserves the auto-collapse intent.
3. **Anchor the scroll instead of the block** — let the collapse happen but compensate the message list's
   scrollTop by the delta in the same frame so the PROSE stays put and the transcript above moves instead.
   Cost: touches the autoscroll/keystone, the most contended surface in the chat client; and it fixes the
   perceived jump only while pinned to the bottom.
4. **Do nothing.** Defensible only if the owner reads the collapse as informative motion. It is 4–7× M5,
   which was judged worth fixing.

Not recommended: animating the collapse more slowly. It is ALREADY animated over ~300ms/19 frames — the
churn is the 677px of travel, not its abruptness.

### §8.7 Scratch state — every change and its restore receipt

| what | before | after |
| - | - | - |
| `routing.roleDefaults.chat` | `{}` (absent) → resolved `agent-sdk/max-pro-sub/claude-opus-4-8` | restored — resolves `agent-sdk/max-pro-sub/claude-opus-4-8` |
| `routing.roleDefaults.summarize` (= the `structured` role) | `{}` (absent) → vLLM | restored — a live structured call logs `backend:"vllm", ok:true, 7153ms` |
| chat `mo-probe scratch` | did not exist | `chat.delete` → gone; absent from `listChats` (6 chats) |
| character `mo-probe-narrator` | did not exist | `character.remove` → gone; absent from `character.list` (12 characters) |
| every other settings section | untouched | untouched — only the `routing` section was ever patched |
| owner chats / presets / the system Default preset | untouched | never read, never written |

**The restore is FUNCTIONAL, not byte-identical, and that is forced.** The stored blob now reads
`{"roleDefaults":{"chat":{"model":null},"summarize":{"model":null}}}` where it read `{"roleDefaults":{}}`.
A settings patch cannot DELETE a key: `deepMergePlain` treats `undefined` as "don't touch", and a `null`
role fails the whole-blob re-parse (`contracts/src/settings/index.ts:478` — `chat:
chatRoleConfigSchema.optional()`, no `.nullable()`, no `.catch()`), which `versioned-config/index.ts:68`
answers by returning `def.default`, i.e. **wiping every user setting**. That last step is READ FROM SOURCE,
deliberately not probed — nobody detonates a settings-wipe to confirm it. So the safe clear is per-leaf nulls, which
`chatRoleConfigSchema`'s `.catch(undefined)` heals to unset for `api`/`source` and keeps as `null` for
`model` — the exact value `resolve-role.ts:62-67` and `healToChatDefault(null)` already treat as "no pin".
The resolution receipt above is what proves equivalence. **Do not attempt a `{chat:null}` patch to get the
bytes back; it is a settings-wipe grenade.**
