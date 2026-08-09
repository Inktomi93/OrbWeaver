---
kind: design
status: active
updated: 2026-08-09
---

# #42 — Streaming reveal: measured root causes + the fix design

Owner symptoms (three, one system): (1) streaming is "real fucking ugly — choppy and odd feeling"
EVEN with smooth streaming on; (2) the blinking caret renders on a NEW LINE instead of trailing the
last character; (3) text "just appears — blam!" with no per-token fade (owner's reference bar: the
Claude app's per-chunk fade-in).

All measurements below were taken 2026-08-09 against a live streamed turn (vLLM Qwen3-VL-8B on
:8703, chat role pointed at `source:"vllm"` for the drive) driven through the real composer in a
worktree vite (`:5183`, `VITE_API_TARGET=:8788` — the main server). Raw data:
`stream-probe-smooth-{off,on}.json` (session scratchpad); gif receipts:
`reports/recordings/forge-42-before-smooth-{off,on}.gif`.

## 1. Measured mechanisms (phase-1 receipts)

### D1 — the fade is a DEAD KNOB: Streamdown's animation CSS is never loaded
`@orb/ui/markdown` passes `animated={{ animation:"fadeIn", sep:"word" }}` + `isAnimating` — and
Streamdown dutifully wraps EVERY word in a `<span data-sd-animate style="--sd-animation:sd-fadeIn;
--sd-duration:150ms;…">` (690 spans measured at end of one turn). But the ONLY consumer of those
vars is `streamdown/styles.css` (`[data-sd-animate]{animation:var(--sd-animation)…}` +
`@keyframes sd-fadeIn`), and NOTHING imports that file. Probe receipt (live styleSheets walk):
`sdRule:false, sdKeyframes:false` in both runs. Every word pays the span-wrapping cost and renders
with `animation-name: none` → hard pop → "blam". This is the headline root cause of symptom 3 and
most of 1.

### D2 — the caret ::after attaches one level too shallow
We pass `dir="auto"`, so Streamdown wraps every block in `<div dir="ltr" style="display:contents">`.
Both Streamdown's own caret (`[&>*:last-child]:after:…` on the root) and our globals.css retint
(`[data-slot="ghost-stream-body"][data-streaming] > * > *:last-child > *:last-child::after`) resolve
to that WRAPPER, not the `<p>` inside it. An inline-block `::after` whose previous sibling box is a
block `<p>` lands in an anonymous block BELOW the paragraph → the caret renders on its own line.
DOM receipt (mid-stream evaluate): level-3 element = `div[dir=ltr][display:contents]`,
`lastChildTag:"p"`, our `content:""` applied there; screenshot `caret-midstream.png` shows the bar
on a fresh line under "…their crests breaking". The existing CT
(`tests/client/features/chat/components/ghost-message-row.ct.tsx`) pins the caret at the WRONG node
— it asserts the border paints, not where.

### D3 — even if the CSS were loaded, the fade cannot play at our cadence
Streamdown's animate plugin re-runs per commit and rewrites every previously-revealed word's span to
`--sd-duration:0` (`prevContentLength` machinery, `fill both`) and re-staggers new words
(`newIndex*40ms`, reset per render). Measured commit cadence: **17ms median (smooth off,
rAF-batched store) / 33ms median (smooth on, `MIN_TICK_MS=30`)** — vs a 150ms fade. Every commit
truncates the previous commit's fades to one tick and snaps still-delayed (invisible,
`fill both`) words straight to opaque. The knob is not just unwired — at this cadence its design
cannot produce the owner's target even when wired.

### D4 — smooth-stream mode is measurably JANKIER than raw mode
Per pacer tick the whole ghost pipeline re-runs over the FULL accumulated text: macro render
(`renderMessageForDisplay`) + speaker strips + `scanGhostContent` + Streamdown's `remend` repair +
`Lexer.lex` re-blocking + full remark→rehype for the tail block + reconcile of hundreds of word
spans — and with `animated` set, Streamdown commits block updates SYNCHRONOUSLY (its
`useTransition` arm is explicitly bypassed when an animate plugin exists). Receipts (smooth-on run):
**79 over-budget React commits in `region:content` (worst 78ms)**, 18 layout-bearing LoAFs
(`flushAll@chat-stream.ts` up to 48ms blocking), worst rAF gap 133ms, 10 gaps >50ms. Smooth-off
run on the same rig: zero LoAF, worst gap 33ms, 10 slow commits. The scroll follow adds a discrete
**12px scrollTop step ~9-10×/s** (ResizeObserver → instant `scrollToEnd`) in both modes.

## 2. The Streamdown 2.5.0 option surface (owner-ordered ast survey)

Source: `packages/ui/node_modules/streamdown/dist/index.d.ts` (492 lines, read whole) + the
prettified dist chunk. Wired = passed by `@orb/ui/markdown` today.

| Option / export | Wired? | Notes |
| - | - | - |
| `mode` ("static"\|"streaming") | ✓ | required by the seal |
| `parseIncompleteMarkdown` (remend) | ✓ | streaming only |
| `remend?: RemendOptions` | — | fine-tune the repair; defaults fine |
| `dir` ("auto"\|"ltr"\|"rtl") | ✓ "auto" | the source of the D2 wrapper div |
| `remarkPlugins` | ✓ | gfm re-pinned `singleTilde:false` |
| `rehypePlugins` | — | **replaces** default [raw, sanitize, harden]; `allowedTags` schema-merge is identity-gated on the default reference (policy.ts documents it) — the fix injects here for untrusted-streaming only |
| `components` | ✓ (colorQuotes) | `DIALOGUE_COMPONENTS.p` |
| `plugins.code` (shiki) | ✓ | token-sourced themes |
| `plugins.math` (katex) | ✓ | |
| `plugins.mermaid` | ✓ trusted-only | |
| `plugins.cjk` | — | CJK emphasis/autolink remark set |
| `plugins.renderers` (CustomRenderer per language) | — | per-fence custom components |
| `allowedElements` / `urlTransform` | ✓ untrusted | Tier-A allowlist |
| `allowedTags` / `literalTagContent` | ✓ trusted | `<speaker>` passthrough |
| `isAnimating` + `animated` (AnimateOptions: animation fadeIn/blurIn/slideUp/custom · duration · easing · sep word/char · stagger) | ✓ but DEAD (D1) | plugin wraps words; CSS never loaded; being REPLACED by our reveal plugin |
| `createAnimatePlugin` (standalone) | — | same machinery, callable directly |
| `onAnimationStart/End` | — | isAnimating edge callbacks |
| `caret` ("block"\|"circle") | ✓ "block" | glyph via `--streamdown-caret` content on root's last child — same D2 depth bug upstream; being dropped (we own the caret) |
| `BlockComponent` / `parseMarkdownIntoBlocksFn` | — | block-splitting overrides |
| `normalizeHtmlIndentation` | — | 4-space-indented HTML → not code |
| `shikiTheme` | — (via plugins.code) | |
| `controls` (table/code/mermaid copy/download/fullscreen) | — (default true) | |
| `linkSafety` (enabled/onLinkCheck/renderModal) | — (default enabled) | |
| `translations` / `icons` / `prefix` / `lineNumbers` | — | i18n/skin knobs |
| exports: `parseMarkdownIntoBlocks`, `detectTextDirection`, `normalizeHtmlIndentation`, `defaultRehypePlugins`, `defaultRemarkPlugins`, CodeBlock*/Table* parts, `useIsCodeFenceIncomplete` | `defaultRemarkPlugins` only | `defaultRehypePlugins` becomes wired by the fix |

Smooth-streaming layer knobs (ours): `useSmoothText` — `cps` floor (user pref 15-300, default 80),
`BACKLOG_DRAIN_PER_SEC=3`, `MIN_TICK_MS=30`, `MAX_FRAME_DT_SEC`, word-boundary + grapheme snapping,
reduced-motion passthrough, hidden-tab flush. Store layer: rAF-batched delta coalescing
(`chat-stream.ts` task #20).

## 3. The fix (chosen architecture)

One system, four moves — all in the streaming render path; settled rows stay byte-identical.

### 3.1 Reveal-time-anchored word fade (fixes D1+D3, the "blam")
A NEW rehype plugin owned by the seal: `packages/ui/src/markdown/reveal-plugin.ts`.
Per instance (one per streaming `<Markdown>` mount) it keeps `{lastCount, revealLog}` and on each
run over the (only re-rendering, memo-protected) tail block:
- walks text nodes (hand-rolled walker; skip ancestors `code/pre/svg/math/annotation` and any
  `math`/`katex` class — the pre-katex guard Streamdown needs but only gets by plugin ORDER);
- splits words (whitespace runs stay bare text — Streamdown's own `sep:"word"` semantics);
- wraps EVERY word in `<span data-orb-reveal style="animation-delay:-<age>ms">` where
  `age = now − revealedAt(charOffset)`, clamped to a constant cap (≥ the fade duration, so an
  aged span's animation is instantly finished under `fill both`).

The CSS (ui `globals.css`, tokens only):
`@keyframes orb-word-reveal { from { opacity: 0 } }` +
`[data-orb-reveal] { animation: orb-word-reveal var(--motion-base) var(--ease-out-expo) both; }`.

Why reveal-time anchoring is the load-bearing idea: fade PROGRESS derives from when the character
was revealed, not from the animation's own lifetime. A span whose DOM node is reused keeps its
running animation (styles for old words are constant); a span whose node gets REPLACED (remend
repairing `**torn` into `<em>`, dialogue re-splits, block reshuffles) resumes mid-fade via the
negative delay instead of restarting from transparent or snapping to opaque. That is what makes the
fade robust at ANY commit cadence — the property Streamdown's `duration:0` machinery structurally
cannot give (D3).

Wiring (markdown.tsx): streaming + untrusted + !reducedMotion →
`rehypePlugins={[...Object.values(defaultRehypePlugins), reveal.rehypePlugin]}` (stable identity
per mount — Streamdown's Block memo compares by reference). `animated`/`isAnimating`/
`STREAMING_ANIMATION` are DELETED — bonus: without an animate plugin Streamdown routes streaming
block updates through `useTransition` (time-sliced commits, D4 relief). Trusted+streaming (no
consumer today) keeps the default pipeline (the `allowedTags` identity gate stays intact) and
simply gets no fade — stated in the seal docblock. Reduced-motion = REMOVE (guide §3.9): no plugin
injected, plus the global animation floor as second cover, plus `useSmoothText` passthrough.

### 3.2 The caret becomes fully ours, attached at the true tail (fixes D2)
Drop Streamdown's `caret` prop (its glyph paints at the same wrong depth). globals.css targets the
leaf block through the dir wrapper:
`…[data-streaming] > * > *:last-child > [dir]:last-child > *:last-child::after` — same 2px
`--color-primary` bar + blink. One owner, one rule; the `content:""`-override dance against
Streamdown's glyph goes away.

### 3.3 Pacer cadence matched to the fade (D4)
`MIN_TICK_MS` 30 → 85: commits at ~12/s reveal 1-3 words each, whose 220ms fades overlap and
bridge the gaps — the Claude-app mechanism (chunk commits + per-chunk fade), while cutting the
per-tick O(fullText) re-parse work ~2.5×. The fade rides `mode="streaming"` — NOT the
`smoothStream` pref — so BOTH paths get the fade; the pref keeps meaning "pace the reveal", exactly as
before. **Because that made the knob purely pacing, the owner flipped its default ON (2026-08-09):
`UserSettings.chat.smoothStream` ships `true` — the old "smooth is jankier" objection was measured dead
on this build (over-budget commits 205→55, LoAFs 18→11). Off is still raw network-chunk cadence, faded.**

### 3.4 Dialogue tint carries the reveal through (coupled seam)
`dialogue-paragraph.tsx` reads `data-sd-animate` to treat word spans as splittable text and
REPLACES them with plain tint spans — which would strip the fade off quoted speech (roleplay's
hottest path). It switches to `data-orb-reveal` and copies the reveal attr + youngest
`animation-delay` onto the tint spans it mints, so a quote run mid-fade keeps fading.

## 4. Rejected alternatives
- **Just import `streamdown/styles.css`** (make the existing knob live): rejected on D3 — measured
  17-33ms commits truncate every 150ms fade to one tick and snap stagger-delayed words from
  invisible to opaque; also keeps the animate plugin's synchronous (non-transition) commit path,
  un-tokened durations (guide §3.5), and per-render span-style churn.
- **Slow the pacer until the stock fade fits** (tick ≈ duration): still snaps every fade at the
  next commit, adds 150ms+ of reveal latency per word batch, and does nothing for the raw-chunk
  default path.
- **DOM-side fader (MutationObserver + WAAPI on added nodes)**: fights React reconciliation
  (replaced nodes lose their animation mid-flight — the exact churn remend/dialogue produce),
  imperative animation against the house CSS-first law, and needs its own reduced-motion plumbing.
- **Keep Streamdown's caret and only deepen our override**: leaves their glyph's ::after painting
  at the wrong depth underneath ours (two owners, `content` override races); owning the caret is
  strictly simpler and the presence condition (`data-streaming`) already lives on our wrapper.
- **Fix the scroll stepping in the same lane** (smooth scrollToEnd / CSS scroll-behavior): the
  virtualizer's programmatic-scroll detector reads `el.scrollTop` synchronously after `scrollTo`
  — smooth behavior desyncs it and breaks follow intent. Deliberately DEFERRED; re-evaluate after
  the fade lands (the fade covers most of the perceived stepping).

## 5. Coupled sites + test plan
Sites: `ui/src/markdown/markdown.tsx` (seal) · NEW `ui/src/markdown/reveal-plugin.ts` ·
`ui/src/markdown/dialogue-paragraph.tsx` · `ui/src/styles/globals.css` (keyframes + caret rule) ·
`ui/src/stream/use-smooth-text.ts` (tick) · docs truth-repair: `motion-and-animation-guide.md`
(§4.3 "don't animate streaming text" bullet superseded by owner order; §4.2 inventory) ·
`ghost-message-row.tsx` + globals.css comments naming "Streamdown's caret".

Tests: NEW `tests/ui/markdown/reveal-plugin.test.ts` (unit: wrap/skip/age/reset semantics) ·
`tests/ui/markdown/markdown.ct.tsx` + streaming-reveal CT asserting a word span's COMPUTED
`animation-name` is `orb-word-reveal` (the fence that would have caught D1 — a green-by-absence
is impossible: it asserts the resolved animation, not the attr) · caret CTs in
`tests/client/features/chat/components/ghost-message-row.ct.tsx` re-targeted to the leaf block and
asserting the carrier IS the last `<p>` (RED on pre-fix source — the old rule paints nothing at
that depth) · reasoning-block/stream-text pacing CTs re-run against the new tick.
