# TanStack Virtual — full-surface mine for the virtua-swap decision

**Source:** shallow clone of `github.com/TanStack/virtual` @ HEAD (commit `d73a538`, 2026-06-26).
**Versions at HEAD:** `@tanstack/virtual-core` **3.17.2**, `@tanstack/react-virtual` **3.14.4**.
**Read in full:** all of `docs/` (`api/virtualizer.md`, `api/virtual-item.md`, `framework/react/react-virtual.md`, `chat.md`, `introduction.md`, `installation.md`, `pretext.md`) + example source for `chat`, `dynamic`, `variable`, `infinite-scroll`, `sticky`, `smooth-scroll`, `scroll-padding`, `padding`, `window`, `table`, `pretext` + the `react-compiler` E2E app/spec + both CHANGELOGs.

## TL;DR — the two reasons that drove the virtua swap are BOTH now obsolete/refuted

1. **"Headless → you hand-wire stick-to-bottom/anchoring, hence neo's 387-line surface."**
   FALSE as of TanStack Virtual today. `virtual-core` **3.16.0** added **first-class end-anchored chat support**: `anchorTo: 'end'`, `followOnAppend`, `scrollEndThreshold`, `scrollToEnd()`, `isAtEnd()`, `getDistanceFromEnd()`, plus an automatic streaming-bottom-pin and prepend-stability engine. There's a dedicated `docs/chat.md` guide and a `examples/react/chat` whose *entire* virtualizer wiring is ~15 lines. neo's 387 lines were a function of neo's **vintage** of the library (pre-3.16), not of TanStack's headless model.

2. **"React-Compiler-incompatible → needs `"use no memo"`."**
   Substantially refuted. The repo now ships a released, supported, **React-19-Compiler-tested** path: `directDomUpdates` + `containerRef` (react-virtual **3.14.0**, refined in **3.14.3**). There is a Playwright E2E suite (`packages/react-virtual/e2e/app/test/react-compiler.spec.ts`) running the lib under `babel-plugin-react-compiler@^1.0.0` `target:'19'` that proves it. No `"use no memo"` needed when you use `directDomUpdates`. The chat example itself sets `directDomUpdates: true`.

The swap was justified on two technical grounds that **no longer hold**. Detail + verdict below.

---

## A. Full capability surface

### A.1 `useVirtualizer` / `Virtualizer` — required options
*(`docs/api/virtualizer.md`)*
- `count: number` — total items to virtualize.
- `getScrollElement: () => TScrollElement` — returns the scroll container (may return null pre-mount).
- `estimateSize: (index) => number` — initial size per item (axis-dependent); est. the *largest* comfortable size when dynamically measuring for accurate initial offsets.

### A.2 Optional options
- `enabled?: boolean` — kill switch; resets state + detaches scroll observers.
- `debug?: boolean` — debug logs.
- `initialRect?: Rect` — seed scrollElement rect for SSR.
- `onChange?: (instance, sync) => void` — fires on internal state change; `sync=true` while actively scrolling. **The headless escape hatch** — used to do manual DOM writes (see `dynamic` "experimental" variant).
- `overscan?: number` — extra rows rendered above/below viewport. Default **1**.
- `horizontal?: boolean` — horizontal orientation (combine two for grids).
- `paddingStart? / paddingEnd?: number` — px padding at list start/end (used for header spacers / ChatGPT-style pin-prompt spacer).
- `scrollPaddingStart? / scrollPaddingEnd?: number` — padding honored when *scrolling to* an element (e.g. keep rows clear of a sticky thead — see `scroll-padding` example).
- `initialOffset?: number | (() => number)` — scroll position on first render (SSR / conditional mount / chat restore).
- `getItemKey?: (index) => Key` — stable per-item key; **required for chat prepend stability** (id, not index). Memoize it.
- `rangeExtractor?: (range) => number[]` — override which indexes render; inject sticky headers/footers. Default exported as `defaultRangeExtractor`. (Used in `sticky` example to keep an active section header mounted.)
- `scrollToFn?: (offset, {adjustments, behavior}, instance) => void` — custom scroll impl (e.g. custom easing — see `smooth-scroll`). Built-ins `elementScroll` / `windowScroll`.
- `observeElementRect` / `observeElementOffset` — injectable measurement strategies for the scroll element's rect/offset. Built-ins `observeElementRect`/`observeWindowRect`, `observeElementOffset`/`observeWindowOffset`. **This is the non-DOM/headless seam** — you can virtualize over arbitrary scroll sources.
- `measureElement?: (el, entry, instance) => number` — custom dynamic-measure fn (default uses `getBoundingClientRect()`); `instance.options.horizontal` picks axis.
- `scrollMargin?: number` — where scroll offset originates; the gap between scroll-element start and list start. **For nested containers / a header preceding a window virtualizer / multiple virtualizers in one scroller.** Must subtract it in the item transform: `translateY(start - scrollMargin)`.
- `gap?: number` — px spacing between items (no manual margins).
- `lanes: number` — columns (vertical) / rows (horizontal); items go to shortest lane → **masonry/grid**.
- `laneAssignmentMode?: 'estimate' | 'measured'` — when lane assignment caches (default `estimate` = no jumping; `measured` = optimal-but-after-measure).
- `anchorTo?: 'start' | 'end'` — **stable anchor side on data change.** `'end'` = chat/logs/reverse: keeps visible item stable on prepend + keeps end-pinned viewport pinned while last item grows. Default `'start'`.
- `followOnAppend?: boolean | 'auto' | 'smooth' | 'instant'` — with `anchorTo:'end'`, scroll to end after append **only if already within `scrollEndThreshold` of end** (does not yank a scrolled-up reader; does not follow prepends). Default `false`.
- `scrollEndThreshold?: number` — px window that counts as "pinned" for `isAtEnd()`/`followOnAppend`. Default **1**.
- `isScrollingResetDelay: number` — ms after last scroll before clearing `isScrolling`. Default 150.
- `useScrollendEvent: boolean` — use native `scrollend` vs debounced fallback. Default false.
- `isRtl: boolean` — invert horizontal scroll for RTL.
- `initialMeasurementsCache: VirtualItem[]` — seed measured sizes from a prior `takeSnapshot()` (scroll restoration). Consumed once on first `getMeasurements()`.
- `useAnimationFrameWithResizeObserver: boolean` — defer RO processing to rAF. Default false; docs say **don't enable** unless you've measured a need.
- `useCachedMeasurements?: boolean` — default `measureElement` returns cached size instead of measuring; for `display:none`-hidden lists (avoids RO firing size 0). Default false.

### A.3 React-adapter-specific options *(`docs/framework/react/react-virtual.md`)*
- `useFlushSync?: boolean` (default **true**) — use `react-dom` `flushSync` for synchronous scroll updates. **Set `false` on React 19** to kill the `flushSync was called from inside a lifecycle method` warning and to batch naturally / improve perf.
- `directDomUpdates?: boolean` (default **false**) — **skip React re-renders for scroll-only updates**; the virtualizer writes item `top`/`left`/`transform` and container `height`/`width` straight to the DOM, re-rendering only when the visible index *range* or `isScrolling` changes. Requires `containerRef` on the inner sizer; items must be `position:absolute` (and `top:0/left:0` in transform mode) and must NOT set the main-axis position themselves. **This is the React-Compiler-safe path.** Set once at mount (toggling leaves stale styles). If you omit `containerRef`, it makes *no* DOM writes but still skips re-renders (you own positioning, e.g. in `onChange`).
- `directDomUpdatesMode?: 'position' | 'transform'` (default `'transform'`) — `transform` = `translate3d` (own compositor layer, smoother, but new stacking context / can break `position:fixed` descendants — relevant to our iframe/media rows); `position` = `top`/`left`.

### A.4 Instance properties/methods
- `options` (readonly), `scrollElement` (readonly), `scrollRect: Rect`, `scrollOffset: number`, `isScrolling: boolean`, `scrollDirection: 'forward'|'backward'|null`.
- `getVirtualItems(): VirtualItem[]`, `getVirtualIndexes(): number[]`, `getTotalSize(): number`.
- **Scroll methods:** `scrollToOffset(offset, {align, behavior})`, `scrollToIndex(index, {align, behavior})` (align `start|center|end|auto`, behavior `auto|smooth`), `scrollBy(delta, {behavior})`, `scrollToEnd({behavior: auto|smooth|instant})` ("jump to latest"), `getDistanceFromEnd(): number`, `isAtEnd(threshold?): boolean`.
- **Measurement:** `measureElement(el)` (attach as item `ref` + set `data-index`), `measure()` (reset all measurements), `resizeItem(index, size)` (manual size set; don't mix with `measureElement` on the same index), `takeSnapshot(): VirtualItem[]` (round-trip measured sizes into `initialMeasurementsCache`).
- `containerRef` — ref for the inner sizer when `directDomUpdates` is on (lib owns its height). *(Documented only in react-virtual.md / used in chat + dynamic examples; absent from the instance list in virtualizer.md — slight doc gap.)*
- `shouldAdjustScrollPositionOnItemSizeChange?: (item, delta, instance) => boolean` — **fine-grained control of the "above-viewport item resized → adjust scroll" correction.** Default: applies the correction only when **not** scrolling backward → this is *exactly* the native "items don't jump while scrolling up" belt. iOS WebKit defers scroll writes during touch/momentum/bounce and flushes once settled. Override only to change that default.

### A.5 `useWindowVirtualizer` *(react-virtual.md)*
Window-scroll virtualizer (`TScrollElement = Window`); `getScrollElement` auto-provided. Pairs with `scrollMargin` = the list's `offsetTop` so page content above the list is accounted for (see `window` + `dynamic`/grid examples).

### A.6 `VirtualItem` *(`docs/api/virtual-item.md`)*
`{ key, index, start, end, size, lane }`. `start`→`translateY`/`top`; `size`→height; `lane`→masonry column (0 for plain lists). `size` is the estimate until measured, then the measured value.

### A.7 Non-React surface
Adapters for Vue/Svelte/Solid/Lit/Angular + `@tanstack/virtual-core` framework-free. Pretext integration (`docs/pretext.md`) for canvas-based **pre-DOM text-height estimation** (chat/AI-stream rows) so offsets are right before the node exists — caches `prepare()` by text+style, reruns cheap `layout()` on width change, resets `measure()` after `document.fonts.ready`.

---

## B. The chat verdict — does TanStack actually handle the streaming-chat cluster?

**Read:** `docs/chat.md` (full), `examples/react/chat/src/main.tsx` (full), `examples/react/pretext/src/main.tsx` (full), CHANGELOG entries #1173/#1176/#1209.

**Bottom line: yes, natively and well — and recently.** The whole streaming-chat cluster orbweaver lists is now a documented first-class feature, not hand-rolled. Point by point:

- **Stick-to-bottom that respects scroll-up — NATIVE.** `followOnAppend: true` + `anchorTo: 'end'`: the follow fires "only if the viewport was already within `scrollEndThreshold` of the end before the append." A reader scrolled up into history is explicitly **not** pulled down (chat.md "Follow appended output only when pinned"). `isAtEnd(threshold)` drives the "Jump to latest" affordance; `scrollToEnd()` is the jump. This is the single biggest chunk of neo's hand-rolled `use-stream-scroll.ts` — now a config flag.

- **A message that grows every token mid-stream — RE-MEASURES CLEANLY, doesn't thrash.** chat.md "Keep streaming output pinned": in end-anchored mode, when the last item's measured size changes while pinned, the virtualizer "adjusts by the size delta and keeps the bottom stuck." This rides the normal `measureElement` path — no special code. There were two real streaming bugs (browser clamping the `scrollTop` write before the sizer grew → drift, #1209 in 3.17.2; and a one-frame prepend jump, #1176 in 3.17.0) — both **already fixed** in the version at HEAD. So it's not just present, it's been hardened through bug reports.

- **Dynamic variable-height rows — STANDARD WIRING, low.** `ref={virtualizer.measureElement}` + `data-index` on each absolutely-positioned row; `estimateSize` for the initial guess. Same pattern as every dynamic example. For text-heavy rows you can optionally bolt on Pretext to pre-compute heights and kill measurement-correction flicker.

- **Reverse/prepend (load older) — STABLE, native.** `anchorTo:'end'` captures the visible item before the data change, finds the same **keyed** item after the prepend, and corrects the offset so it stays put. Requires `getItemKey` by **id** (index keys break after a shift — doc is emphatic). The chat example does exactly this with a scroll-position `onScroll` trigger near the top. chat.md explicitly says you **do not need** `column-reverse`, inverted transforms, or manual `scrollTop += delta` — i.e. the exact hacks that bloated neo's list are now obsolete.

- **Row-recycle vs stateful children (our iframe/media concern) — PARTIALLY addressed, needs care.** TanStack keys rendered rows by `virtualItem.key` (= your `getItemKey` id), so a row for message X keeps a stable React identity across scroll → no forced remount of a sandboxed iframe as long as the id is stable and the element stays within the rendered window. Two real caveats: (1) once a row scrolls out of the overscan window it **unmounts** (true of any windowing lib, virtua included) — iframe/media state must be hoisted/persisted, not held in the row; (2) `directDomUpdatesMode:'transform'` creates a stacking context and "can interfere with `position:fixed` descendants" — for iframe/portal-heavy rows prefer `directDomUpdatesMode:'position'`. So: addressed at the keying level, but the "don't put unrecoverable state in a recycled/unmountable row" rule is on us regardless of library.

**Is the 387-line surface inherent to TanStack's headless model, or did neo just not use the chat APIs?** **The latter, decisively.** The chat APIs (`anchorTo:'end'`, `followOnAppend`, `scrollEndThreshold`, `scrollToEnd`, `isAtEnd`, `getDistanceFromEnd`, the backward-scroll anchor belt via `shouldAdjustScrollPositionOnItemSizeChange`) landed in **virtual-core 3.16.0**, recent relative to when neo was built. neo hand-rolled stick-to-bottom, anchor compensation, and prepend math because the version it used didn't have them. The reference `examples/react/chat` does the entire job — initial scroll-to-end, prepend-stable history, pinned streaming growth, follow-only-when-pinned, jump-to-latest, dynamic heights — in ~220 lines *including* the demo's fake streaming timers, toolbar, and history-loader; the actual virtualizer config is ~15 lines. **Swap reason #1 is obsolete: it was a property of neo's vintage, not of TanStack Virtual.**

---

## C. What we'd LOSE by switching to virtua

*(I audited only TanStack here; pricing virtua's exact equivalents needs a symmetric virtua read. These are the TanStack capabilities at risk — verify each against virtua before assuming parity. Several of these virtua genuinely lacks or models differently.)*

- **`rangeExtractor` — arbitrary injected/sticky indexes.** TanStack lets you force any index set to render (sticky section headers that stay mounted while their section is in view — `sticky` example). virtua's stickiness story is more constrained; this custom range-extraction primitive likely has **no direct equivalent**. Matters if libraries/history grow group headers.
- **Masonry / `lanes` with shortest-lane assignment + `laneAssignmentMode`.** TanStack does true variable-height masonry (`variable` example). virtua's grid (`VGrid`) is a uniform grid, **not** shortest-lane masonry. If any gallery/grid surface wants masonry, that's a loss.
- **`shouldAdjustScrollPositionOnItemSizeChange` — granular anchor-correction control** (per-item, per-delta override of the don't-jump-while-scrolling-up belt, with documented iOS-WebKit momentum handling). This level of imperative control over resize-compensation is a TanStack differentiator; unlikely to have a virtua equivalent.
- **Headless injection seams: `observeElementRect`/`observeElementOffset`/`scrollToFn`/`onChange`.** Lets you virtualize over **non-standard or non-DOM scroll sources**, custom easing (`smooth-scroll`), or take over all DOM writes yourself. virtua owns the DOM (component-based) → you give this up. Probably irrelevant to us, but it's the literal "100% control" the headless model buys.
- **`scrollMargin` for nested/multiple virtualizers in one scroll container** + `useWindowVirtualizer` (page-as-scroller). virtua *does* have `WindowVirtualizer` and a `startMargin`, so likely parity — but confirm the "multiple virtualizers sharing one scroller" case, which `scrollMargin` is explicitly built for.
- **Imperative surface: `resizeItem`, `takeSnapshot`/`initialMeasurementsCache` granular scroll-restoration, `getDistanceFromEnd`, `scrollBy`, `scrollToOffset` w/ align.** virtua has a handle with `scrollToIndex`/cache snapshot, but the exact granularity (manual single-item resize without remeasuring; snapshot→restore measured cache) may differ.
- **`directDomUpdates` re-render-skipping + `onChange` manual mode** — the perf escape hatch for scroll-heavy lists. (virtua's component model re-renders differently; not a like-for-like.)
- **`useCachedMeasurements` for `display:none`-hidden lists** (tabs/collapsed panels) — avoids RO-fires-size-0 reset. Niche but real if the chat is ever in a hidden tab.
- **Multi-framework core** (`virtual-core`) — irrelevant to a React SPA.

Net: the load-bearing losses are **`rangeExtractor` sticky headers**, **true masonry lanes**, and the **granular anchor/headless control**. Most else has plausible virtua equivalents (confirm).

---

## D. The React Compiler situation — UPDATE to our understanding

Our prior belief was "compiler-incompatible, needs `"use no memo"`, a compiler-safe version is *in alpha*." **That's stale. It's released and E2E-tested, and the fix is `directDomUpdates`, not a flag-disable.**

- **The root cause is real and named** (`packages/react-virtual/e2e/app/react-compiler/main.tsx`, issue #736): React Compiler caches `virtualizer.getVirtualItems()` because the virtualizer *reference* is stable, so virtual items never update on scroll — "only the initial batch of items ever renders." This is exactly the internal-mutability problem we knew about.
- **The shipped fix: `directDomUpdates: true` + `containerRef`** (react-virtual **3.14.0**, refined to a clean no-op-without-containerRef in **3.14.3**). With it, item positions and container size are written **directly to the DOM**, and React only re-renders when the visible index range changes — so the compiler caching `getVirtualItems()` no longer breaks scrolling, because scroll positioning doesn't depend on a React render. **No `"use no memo"` required.**
- **It's verified against React 19's compiler.** `packages/react-virtual/e2e/app/test/react-compiler.spec.ts` runs the lib built with `babel-plugin-react-compiler@^1.0.0` `{ target: '19' }` (`react-compiler-vite.config.ts`) and asserts the #736 regression is fixed in **both** `position` and `transform` modes — items render initially, item 500 appears after `scrollToIndex`, and incremental scroll positions items with **≤2 re-renders**.
- **The reference chat example uses it:** `directDomUpdates: true` is in the chat `useVirtualizer` config.
- **Nuance / honest caveat:** without `directDomUpdates`, the classic `getTotalSize()`/`getVirtualItems()`-in-render pattern is *still* compiler-broken (#736). So it's not "the whole lib is now magically compiler-clean" — it's "there is a released, supported, tested compiler-safe **mode**, and it's the one the chat docs/example tell you to use." On React 19 also set `useFlushSync: false` to kill the lifecycle `flushSync` warning. The docs themselves say nothing about `"use no memo"` — the answer they ship is `directDomUpdates`.

**Swap reason #2 is substantially refuted:** sealing TanStack Virtual behind `@orb/ui/virtual-list` with `directDomUpdates: true` gives a React-Compiler-compatible primitive with **no `"use no memo"`**, and it's tested against the exact target (React 19 compiler) we ship.

---

## E. The verdict on the swap

**Conclusion: (ii) — reconsider. Do NOT swap on the two stated grounds; they're both refuted. If forced to ship one, keeping TanStack Virtual (sealed, `directDomUpdates` + `anchorTo:'end'`) is now fully viable and lower-churn.**

Reasoning:
- Both technical justifications for the swap have evaporated. Reason #1 (headless hand-rolling → 387 lines) was neo's old version, not the model — TanStack now has native, hardened end-anchored chat (`anchorTo:'end'` + `followOnAppend` + `isAtEnd`/`scrollToEnd`) reducing the message-list config to ~15 lines. Reason #2 (compiler-incompatible) has a released, React-19-compiler-E2E-tested answer (`directDomUpdates`) that needs no `"use no memo"`.
- With both reasons gone, virtua's only remaining edge is "component-based = less code in the seal." But you write the seal **once**, behind `@orb/ui/virtual-list`, so that saving is a one-time ~tens-of-lines, against the cost of: rewriting working neo code, re-validating the streaming/stick-to-bottom/prepend cluster on a new lib, and **losing** `rangeExtractor` sticky headers, true masonry lanes, and the granular anchor/headless control (section C).
- The streaming-chat surface — the hardest one, the whole reason this matters — is arguably a **draw to slight-TanStack-edge**: virtua does chat well natively (its selling point), but TanStack now matches it *and* exposes more granular knobs (`shouldAdjustScrollPositionOnItemSizeChange`, `scrollEndThreshold`, `getDistanceFromEnd`, Pretext pre-measurement) that the stick-to-bottom-without-yank + token-growth + iframe-recycle cluster will actually want.

**What I'd do:** Stop treating the swap as decided. Re-run the decision on **ergonomics alone** (capability + compiler are now neutral), and weight it by the fact that one library is less dependency surface than two. My call: **don't swap** — seal TanStack Virtual with `directDomUpdates:true`, `useFlushSync:false`, `anchorTo:'end'`, `followOnAppend:'smooth'`, id-based `getItemKey` for the chat primitive, and the plain pattern for the generic primitive. Reserve **(iii) hybrid** only if a focused virtua spike proves its generic-list/grid seal is *dramatically* simpler — but note that adopting two virtualization libs doubles the surface the seal is meant to hide, which cuts against orbweaver's one-home ethos. The one thing you must NOT do is keep citing "headless = 387 lines" or "needs `use no memo`" as the reason — both are now false.

> Caveat for honesty: this audit only read TanStack. A symmetric, full read of virtua's docs/source (does it match `anchorTo` semantics exactly? masonry? sticky headers? compiler-clean under React 19 with its own E2E proof?) is required to *fully* close the decision. But the burden has flipped — the swap is no longer the safe default; it now needs its own fresh justification.

---

## F. Patterns to replicate in the seal regardless of which lib wins

1. **id-based `getItemKey`/keying for ghost→canonical swap + prepend stability.** Stable per-message id, never index. This is the load-bearing invariant for both prepend-anchoring and not-remounting stateful rows (our iframe concern). Non-negotiable in either lib.
2. **Follow-only-when-pinned, never absolute stick.** Compute "is the viewport within N px of the end" *before* the append, and only auto-scroll if so. TanStack gives `isAtEnd()`/`followOnAppend`; if we ever hand-roll on virtua, replicate this threshold check — it's the entire "don't yank a scrolled-up reader" contract.
3. **Backward-scroll resize-correction belt.** Apply above-viewport size corrections only when NOT scrolling backward (TanStack's default via `shouldAdjustScrollPositionOnItemSizeChange`). This is what stops "items jump while I scroll up." Whatever lib, the seal must guarantee this behavior.
4. **Pre-DOM text-height estimation for streaming rows (Pretext pattern).** Estimate row height from text+font+width+line-height *before* the node renders, so the growing-every-token message doesn't produce a drip of measurement corrections. Match canvas inputs to CSS exactly; reset measurement after `document.fonts.ready`. Worth replicating for the message list specifically.
5. **Hoist stateful/iframe/media state OUT of the recycled row.** Any windowing lib unmounts rows past overscan. The sandboxed-iframe/media-state requirement is satisfied by persisting that state above the row and rehydrating, not by trusting the row to stay mounted. Architectural rule for the chat primitive independent of library.
6. **`scrollToEnd()` / "jump to latest" affordance + distance-from-end readout.** Expose a jump-to-latest control and a "reading history" indicator driven by `isAtEnd()`/`getDistanceFromEnd()`. Bake into the chat primitive's API.
7. **For nested scroll containers, account for the start margin** (`scrollMargin`/`startMargin`) — the chat list lives inside a composed layout, so the offset origin must be measured (`getBoundingClientRect`/RO on the header), not assumed 0.
8. **Prefer `position` over `transform` direct-DOM mode for iframe/portal rows** — transform creates a stacking context that can break `position:fixed`/portaled descendants.

---

**Output written to:** `/tmp/claude-1000/-home-inktomi-inktomi-stack-development-orbweaver/e6fcdf37-c41d-4d38-a146-400504dab734/scratchpad/tanstack-virtual-docs-mine.md`
