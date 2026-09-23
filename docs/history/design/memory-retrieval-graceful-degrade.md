---
kind: design
status: archived
updated: 2026-08-30
---

# Memory retrieval controls and graceful rerank degradation

## Evidence and constraints

- The admin picker currently exposes the raw retrieval enum and a terse legend; its numeric hints use implementation vocabulary instead of consequences (`packages/client/src/features/user-admin/components/memory-tuning-section.tsx:35-46, 142-149`).
- `SelectOption.description` already provides the required per-option visible gloss while keeping the selected trigger single-line and the gloss in `aria-describedby`, not the option name (`packages/ui/src/primitives/select/select.tsx:26-42, 61-91`). No new picker primitive is needed.
- `digests` computes the CSLS order, cuts it to `retrieveK`, then hands that already-retrieved array to `applyRerank` (`packages/server/src/domain/search/verbs/digests.ts:125-140`). `applyRerank` deliberately propagates a runner rejection for every other caller (`packages/server/src/domain/search/substrate/rerank.ts:1-3, 37-41`).
- A round-level recall is built once in gather and its `MemoryRecallInputs` object is reused by every scoped per-speaker engine recall (`packages/server/src/domain/chat/substrate/assemble-gather.ts:243-286`; `packages/server/src/domain/chat/engine/engine.ts:1260-1281`; `packages/server/src/domain/chat/engine/round.ts:104-132`). That existing shared object is the natural lifetime for once-per-turn/outage state.
- D41 requires a typed warning with a real domain emit site; the active `warning-code-coverage` gate scans `packages/server/src/domain/chat/**` for every `CHAT_WARNING_CODES` member (D41; `tooling/src/verify/gates/warning-code-coverage.ts:24-42, 73-83`). The client warning mapper is exhaustive (`packages/client/src/features/chat/lib/warning-notice.ts:23-34, 75-79`).
- DEAD CONSTRAINT (superseded 2026-08-22). This section previously required the UI to label the #321 recency control as an experimental order-only probe. The owner ran that probe on the real corpus 2026-08-20 (222-message conversation, biases 0…1) and measured no human-relevance gain — an identical mixC top three at every bias and a net loss at a smaller `retrieveK` — then ruled the knob REMOVED rather than blessed with a production blend. `recencyBias` no longer exists in `AppSettings.memoryDefaults`, on `MemoryQueryOptions`, in `digests`, or on the admin surface (AppSettings schema v7→v8 drops the stored key). There is no recency copy left to make honest; the honesty requirement is satisfied by the control's absence.

The structural search covered 3,747 TypeScript and 1,125 TSX files under `packages` and `tests`. It found one live property-read call to `searchDigests`, in recall; optional-chain and bracket-read forms had zero matches. A second literal sweep found the compose binding plus two evaluation harness bindings. Thus the callback seam below has four coupled callers/binders, not an unknown wider runtime graph.

## Chosen architecture

### 1. Teach the existing picker

Keep the canonical values in `MEMORY_RETRIEVAL_MODES`, but derive the select items through a total `Record<MemoryRetrievalMode, {label, description}>`. The trigger and deployment-floor copy use the human label; each open option uses the existing description slot for its benefit, cost, and appropriate-use guidance. No raw `mixA`/`mixB`/`mixC`/`tiered` value appears in rendered copy.

Rewrite the numeric hint strings in consequence-first language. (The recency hint this section once specified is gone with its control — see the dead-constraint bullet above.) The remaining controls and persisted enum values do not change.

### 2. Keep fallback local to digest recall

Extend only `SearchService.digests` with an optional, synchronous observer carrying `onRerankUnavailable`. In the `mixC` arm, catch only around `applyRerank`; on rejection, report through the observer and continue with the untouched `retrieved` array. The result shape remains the existing hit array, and `mixB` never calls the observer. `applyRerank` itself is unchanged, so corpus, segments, discover, images, and every other caller preserve propagation.

The chat compose bridge translates its neutral `onRerankUnavailable` callback into the memory episode reporter. Search neither imports a chat warning code nor owns a bus event.

### 3. One shared server-side warning episode per turn

Add a server-internal `MemoryRecallWarningEpisode` interface to chat's memory contract and implement it as a closure-backed object with two operations:

- `reportRerankUnavailable()` records that any recall in the episode degraded;
- `takeRerankUnavailable()` atomically returns true once, then false thereafter.

`gatherMemory` creates one episode for the initial round-level recall. When it is staging real turn inputs in its `out` sink, it places that same object in `MemoryRecallInputs`; preview/aux gathers have no engine consumer, so their short-lived episode can record a local degrade but cannot mint a durable chat notice.

The engine's existing `resolveSpeakerMemory` convergence emits `warning(memory_rerank_unavailable)` after the scoped recall, or immediately from the staged round-level state when no scoped rerun occurs. Every speaker receives the same episode by reference. Therefore:

- an initial round-level failure plus any number of scoped failures emits once;
- a later speaker failure after an initial success emits once;
- mixB reports nothing;
- a later independent turn gets a newly-created episode and can warn again.

The emit literal lives in `domain/chat/engine`, after `turnStarted`, satisfying D41's chat-warning ownership and coverage gate without crossing the engine's documented memory-subsystem boundary. The client uses the existing bus reducer and `warningNotice` toast path; there is no client-global coalescing.

### 4. Rejected first-open-only design and investigation history (#374)

This section records the evidence path that led to the initial first-mount proposal. It is not the
current architecture: the clean-host repeat corpus below refuted its central premise, and the owner's
superseding Select-entrance ruling replaces it in full.

The first-open red is not caused by the Admin page's inactive sections. `SettingsShell` mounts only
the active category, but the Admin category's `sections` renderer eagerly mounts all 15 registered
section bodies. The resulting live surface is large (1,553 Settings-dialog descendants, 212
interactive nodes, and a 4,261px scroll body), yet removing the other 14 Admin sections did not make
the first open pass. More decisively, the exact production CT fixture remains red in a tiny isolated
tree: a first open creates a 71–85ms long animation frame with 20–34ms blocking and style/layout work.

Profiles locate the continuous work in Base UI Select's React 19 external-store lifecycle. Opening
mounts the portal and then synchronously publishes `open`/`mounted`/transition state, popup interaction
props, list and positioner refs, Floating UI reference/floating refs, popup side, and focus-driven
`forceMount`. Floating UI's first position calculation does call `getComputedStyle` through `isRTL`,
but returning static coordinates still leaves a 95ms frame: positioning is one participant, not the
root cause. The installed `@base-ui/react` 1.7.0 source contains no supported direction cache or
positioning mode that removes this lifecycle (`node_modules/@base-ui/react/select/root/SelectRoot.mjs`,
`positioner/SelectPositioner.mjs`, `trigger/SelectTrigger.mjs`). Upstream issue mui/base-ui#5358
independently reports Select's React 19 external-store restart loop under CPU load; it is open with no
linked fix.

Controlled alternatives establish the lower bound:

- Base UI's supported knobs (`modal={false}`, fixed positioning, disabled anchor tracking, no
  collision middleware, explicit direction, and their combinations) all remain red.
- Removing the large Admin sibling DOM remains red, so section virtualization would improve initial
  Settings cost but would not fix this defect.
- A minified Radix Select is red in five of five 4x samples (58.8–118.1ms, all with style/layout), and
  a minified Base UI Menu is red in five of five (60.6–75.3ms, all with style/layout). Swapping one
  generic headless popup engine for another is not a solution.
- Applying Base UI's own `fastComponent` subscription batching to every Select part remains red
  (72.4ms with style/layout). Collapsing the portal's `mounted || forceMount` subscription remains red.
- Disabling animation, making position calculation static, scheduling the open as a transition, or
  splitting it across timers either remains red or only moves/slices the same work. Those arms are
  rejected by the observer contract.
- A minified one-state React portal that reads its anchor once and mounts three options produces no
  long-animation-frame entry in five of five 4x samples. The budget is achievable by removing the
  multi-store lifecycle, not by weakening or moving the measurement.

The evidence changes the motion-audit input, not its budget. The chosen architecture classifies the
single LoAF that contains a control's **first anchored-portal mount** as measured library
initialization. `motion-stats.ts` already owns browser-evidence classification (its virtual-row CLS
split is the precedent), so it will observe the house float anatomy rather than receive a call-site
flag. A qualifying mount must:

1. add one of the six sealed anchored positioners (`select`, `menu`, `popover`, `tooltip`,
   `autocomplete`, or `combobox`);
2. contain an element controlled/described by the matching sealed trigger; and
3. belong to a trigger that has not mounted an anchored portal before in this page lifetime.

The observer correlates that mutation timestamp with the first LoAF that ends after the mount and begins
within the anchored overlay's 200ms transition window, then adds an attributed `firstAnchoredPortal`
record. This bound covers Chrome's observed mutation-before-reporting-frame ordering without allowing an
old mount to tag later work; the positioner must still be connected. The seen-trigger `WeakSet`
deliberately survives evidence resets: reach can clear old samples, but it cannot turn a reopen into a
first open. No Select prop, feature marker, or test-only data attribute participates.

`motion-audit` will print raw, classified, and budgeted LoAF totals. For the one classified frame it
subtracts a 120ms blocking allowance before applying the unchanged 50ms blocking ceiling. That
allowance is the rounded 4x-CPU excess above the existing budget measured in the worst stabilized dev
control (159ms blocking, hence 109ms excess); the production controls require less. Any remaining
blocking still faces the same 50ms ceiling. Style/layout is excluded only for that exact classified
frame; every other style/layout LoAF remains an unconditional failure. CLS, dirty animations, and
dropped frames remain independent OR arms and are never adjusted.

The measured-click target and hit point must be resolved before the checkpoint and trace begin. The
current Playwright `locator.click()` performs actionability geometry inside the observation window,
which can create measurement-owned style/layout work. The measured window uses the already-resolved
hit point with a real mouse click; it does not defer or pre-mount product work. Browser observers start
after settlement (or reset their rings at that point), take pending records, and disconnect before any
visibility/computed-style inspection.

The stabilized dev probe exposed a second measurement-owned cost after that correction: the classified
Base UI frame was followed by one or two zero-blocking style/layout LoAFs. CDP attribution and the
flagger's own documented cost identify two `motion-flaggers.ts` paths: the `[drop]` loop calls
`document.getAnimations()` every animation frame, and the portal mutation starts `[css]`'s idle callback,
which re-reads every stylesheet and every element in the 1,553-node Settings surface. Production and the
isolated observer do not install these dev-only loops. Broadening the portal classification to their tail
frames would hide ordinary style work, so that arm is rejected.

The instrument fix keeps the `[drop]` evidence but removes the global animation-tree read. Start/end/
cancel events maintain a counted set of live CSS animation targets. The app also ships one Web Animations
API path: dnd-kit's sortable drop settle calls `Element.animate()`, which emits none of those CSS events.
The dev-only install therefore wraps that existing platform boundary, registers the returned animation's
effect target, and retires it on `finish`/`cancel`; it does not poll an animation tree or change the
animation's arguments, return value, or lifecycle. Counts, rather than a plain set, preserve overlapping
effects on one element.

A controlled dev comparison then found that the remaining continuous rAF sampler was itself enough to
produce later 50–53ms style/layout LoAFs: the full flagger and animation-plus-drop arms were red, while an
animation-only arm and a no-flagger arm had only the classified portal frame. The replacement therefore
uses the **existing** `motion-stats.ts` LoAF observer as the rendered-frame clock. That observer publishes
each already-filtered LoAF to an in-module subscriber; the drop ledger correlates it with live or just-
ended CSS/WAAPI lifetimes and raises `[drop]` when the overlapping frame exceeds the same 50ms budget.
There is no second PerformanceObserver and no self-sustaining rAF. A checkpoint clears live/recent
lifetimes, while `motion-stats`' timestamp floor excludes a frame that began before the checkpoint. Dirty-
animation classification continues at start, and dropped-frame verdicts retain the same budget.
Red-first browser controls must prove blocked frames during both a real CSS transition and a real
`element.animate()` effect still raise `[drop]`, a checkpoint suppresses an older transition, reduced
motion stays silent, finish/cancel retire WAAPI targets, and no arm reintroduces
`document.getAnimations()`. This removes auditor-caused layout work rather than waiving it.

The `[css]` flagger retains one initial full census, then uses its MutationObserver records as the work
queue: a class mutation scans that element, an insertion scans only the added subtree, and a stylesheet
insertion invalidates the cached rule-token set. The trailing-edge throttle remains unchanged. A planted
control adds a real undefined class after the initial census and proves it is still flagged without a
second document-wide `querySelectorAll("*")`. This is the same verdict with work proportional to the
mutation, not the whole Admin DOM.

The stabilized rerun found one last instrument cost inside that narrower rail: the portal's mutation-
subtree scan still ran as one idle callback. Under 4x throttling Chrome attributed 9ms of script from
that callback inside a 53ms style/layout LoAF. Mutation scope fixed the amount of work but not its
scheduling shape. The completed design therefore traverses each pending subtree lazily with a
`TreeWalker`, processing at most 32 elements per idle callback and yielding sooner when the idle
deadline is exhausted. A timed-out callback still makes bounded progress, and the no-idle-callback
fallback uses the same cap. Mutations that arrive during a scan remain pending for the throttle's next
trailing run. A planted control gives the callback an artificially short deadline, inserts a subtree
whose undefined class is beyond the first batch, and proves both that several callbacks ran and that the
deep class was still reported. This is cooperative scheduling of the existing diagnostic, not a portal
allowance or product-work deferral.

Because `requestIdleCallback` may legitimately postpone the one initial census until the first portal
mutation, the dev bridge exposes its completion promise and `motion-audit` awaits it before resolving
the measured hit point/checkpoint. That full census still runs and remains visible to the dev console;
it is merely settled with the rest of the harness outside the product interaction window. The browser
observer's timestamp floor continues to exclude every frame that began before the later checkpoint.

The remaining intermittent ordinary LoAF is not first-mount initialization: a natural Escape/reopen of
the same Retrieval mode Select produced an unclassified 72ms/22ms-blocking style/layout frame. On first
opens, lightweight event timestamps place the corresponding zero-script tail exactly at the popup's
`opacity`/`scale` transition boundary (within 0–6ms of `transitionend`). Removing Select entrance motion
would rebuild a shared UX contract to satisfy its instrument, and classifying the extra frame would
broaden the owner-ruled first-mount allowance; both are rejected.

The duplicate ownership is narrower. In an ordinary dev session, `[drop]` owns push diagnostics and
must account for CSS and WAAPI lifetimes. During `motion-audit`'s measured window, however, the probe's
CDP `PipelineReporter` trace already owns dropped-frame ground truth and the in-page lifetime observer is
a second instrument for the same verdict. The chosen completion adds one dev-bridge pause seam used only
around that CDP window. Pausing clears prior lifetime evidence and makes CSS start/stop handlers, the
`Element.animate()` boundary, and the LoAF subscriber return before any target lookup or map/report work;
resuming restores ordinary future-event tracking. It does not pause `[anim]`, the LoAF/CLS rings,
anchored-portal classification, `[css]`, or `[space]`, and it changes no product query parameter or
component marker. A `finally` resume keeps a failed probe from leaving the page's diagnostics disabled.

This historical path kept Base UI and the product UX unchanged, but its one-time-only classification was
refuted by the clean repeat evidence and must not be implemented.

### 5. Current Select-entrance calibration ruling

The clean-host corpus invalidated the remaining first-mount-only premise. Five official dev first
opens were red with 148–181ms raw blocking, 18.75–26.19% dropped frames, and ordinary style/layout in
four runs. More importantly, five natural Escape/reopens of the same Select were also red: blocking
stayed within the unchanged 50ms ceiling (27–42ms), but every run carried one to three style/layout
LoAFs and 19.51–23.68% dropped frames. The audit-only `[drop]` collector was suspended throughout and
the host was quiet. The repeat control therefore proves this is the sealed Select's normal entrance and
positioning shape, not initial portal setup, duplicate dev instrumentation, or host load.

The owner's superseding ruling keeps Base UI and the Select motion unchanged and calibrates the audit
only for a **confirmed sealed Select entrance**. A pointer activation or the Select's opening keyboard
keys on `[data-slot="select-trigger"]` create a provisional start. It becomes classifiable only when the
ARIA-related `[data-slot="select-positioner"]` mounts or reactivates from an exit-retained node. The
lifetime ends after the two measured presented frames following the popup's real `opacity`/`scale`
entrance transitions, or at a 300ms post-confirmation safety cap (the authored `--motion-fast` duration
is 130ms). A trigger action that does not mount its related Select never earns classification. Close
motion is not an entrance and does not reopen the same lifetime.

LoAFs are classified by interval overlap with that confirmed lifetime, so the trigger focus frame,
initial Positioner work, and transition-end tail can be named without exempting later observation-window
work. Every entrance records whether this is the trigger's first page-lifetime mount. Style/layout is
accepted only on overlapping confirmed Select-entrance LoAFs. The fixed first-open blocking allowance
is recalibrated to 140ms: the clean-host maximum was 181ms, or 131ms above the unchanged 50ms ceiling,
rounded to one stable 10ms rail. Repeats receive zero blocking allowance; their measured 27–42ms work
must continue to satisfy the ordinary 50ms budget.

A cold verifier found that the first implementation subtracted that 140ms from **every** LoAF carrying
the same first-entrance evidence. That made the allowance renewable: a primary Select initialization
frame plus a second 130ms app frame inside the same lifetime incorrectly passed. The repaired boundary
consumes the allowance once per first entrance, on its chronologically primary confirmed LoAF only.
Every later/concurrent LoAF receives zero subtraction and keeps the ordinary 50ms blocking verdict.

LoAF script attribution is a veto, never positive proof. When Chrome supplies a development URL that
identifies app source or an unrelated dependency, that LoAF receives neither the blocking allowance nor
the Select style/layout classification. Recognizable Base UI, Floating UI, React, and React DOM runtime
URLs are compatible with the measured library lifecycle. Empty attribution and production hashed bundle
URLs are explicitly unknown rather than falsely labeled library-owned; they gain no extra allowance
beyond the one primary-frame rule. This is intentionally conservative where the browser provides
identity and honest where production bundling erases it.

CDP uses the same causal lifetime, not a second heuristic. The dev observer emits uniquely paired User
Timing start/confirmed/end marks; `motion-audit` includes `blink.user_timing` and pairs real
`PipelineReporter` begin/end records by trace id. Only frames whose trace interval overlaps a paired,
confirmed Select entrance are removed from the **budgeted** dropped-frame denominator and numerator.
Raw counts remain printed. Unpaired starts, other portal kinds, frames before/after the lifetime, and
the rest of the 2.5s window remain ordinary. Real Chrome controls prove User Timing and
`PipelineReporter` share the trace timestamp clock; paired `PipelineReporter` end events still carry
empty args and are not standalone frames (#389).

The trace exception remains exactly the measured two-`PRESENTED_PARTIAL`-frame handoff encoded by the
existing end mark; this repair does not add a frame or widen the window. Chrome cannot causally separate
unrelated work that lands in the identical browser frame. The owner accepts that bounded risk for those
two measured frames; the classifier does not claim perfect attribution. App work in a separate frame,
before/after the marked range, or in a LoAF with recognizable unrelated script attribution remains red.

The first calibrated batch then killed the original **pointer-start + 300ms** cap without changing the
architecture. On a clean first open, confirmation arrived 170ms after pointer intent because the Base UI
initial render itself occupied that interval; the trace then carried four additional smoothness-affecting
drops between 315ms and 399ms after intent. A 2.5s no-interaction trace on the same settled page was clean
(0/8 dropped), so those frames were not a headless baseline. The cap had simply charged the 130ms popup
transition against time already spent reaching confirmation. The corrected cap is 300ms **after ARIA
confirmation**, while the causal range still begins at the trusted intent. The presented-frame handoff
wins when earlier. Base UI's trace stays `PRESENTED_PARTIAL` for exactly two complete frames after transition
completion, with the same two frames reported dropped in four of five repeats, then becomes
`NO_UPDATE_DESIRED`. The range therefore closes at that measured presented-frame handoff. Frames beyond
it stay ordinary. This also covers the measured zero-script style LoAF whose frame began 10ms after
`transitionend`; waiting a fixed 100ms or extending the whole audit window was rejected because neither
is tied to library lifecycle.

This is the smallest honest calibration because the classifier is simultaneously sealed-anatomy,
ARIA-relation, real-open confirmation, interaction-causal, transition-lifetime-bounded, and
Select-specific. `has_compositor_animation` is reported but is not sufficient by itself: a planted
app animation could share that flag. The confirmation and time bounds are the fence. A blocking plant
inside the entrance must still fail through the residual 50ms rule; style/drop plants after the end,
and all non-Select plants, remain red.

Coupled implementation sites are fixed before construction:

1. `packages/client/src/lib/select-entrance-evidence.ts` owns sealed Select entrance evidence,
   trigger intent, mount confirmation, transition completion, trace marks, and reset/page-lifetime state.
2. `packages/client/src/lib/motion-stats.ts` attaches confirmed overlapping entrance evidence to every
   relevant LoAF rather than consuming one first-mount record.
3. `tooling/src/motion-audit` owns the 140ms first-only allowance, Select-entrance style verdict,
   paired User Timing/PipelineReporter trace classification, and raw/classified/budgeted reporting.
4. `tests/client/lib/motion-stats.ct.tsx` plants first + repeat entrance tails, a no-mount trigger, an
   after-lifetime style frame, and a non-Select portal control.
5. `tests/tooling/motion-audit.test.ts` plants first/repeat blocking boundaries, unconfirmed/non-Select/
   outside-lifetime style failures, a primary Select frame plus a second 130ms app block, concurrent
   app-owned style work, paired Select dropped frames, and ordinary dropped frames before and after the
   classified interval. The real CDP browser plant remains the #389 end-to-end control.
6. The production proof harness mirrors the same observer/trace grammar because production deliberately
   omits the dev bridge; it is receipt machinery, not shipped product code.

## Rejected alternatives

1. **Catch inside `applyRerank`.** Rejected because its documented and tested global contract is propagation; changing it would silently degrade unrelated search surfaces.
2. **Pre-flight the rerank engine.** Rejected by the owner ruling. It also creates a time-of-check/time-of-use race and a second provider call without improving the actual recall result.
3. **Return a new `{hits, degraded}` envelope from every digest search.** Rejected because the fallback notification is an exceptional side signal, while replacing the established array return fans churn through all search tests and evaluation harnesses. The optional observer expresses exactly the local event without duplicating hits or changing normal callers.
4. **Deduplicate in the client or in global server state.** Rejected because client coalescing is broader than one turn and global server state would leak episodes across turns/replicas. The already-shared round input is the exact ownership/lifetime boundary.
5. **Emit once per recall call.** Rejected because a scoped group round can recall once at gather and once per speaker; that is the duplicate-notice defect the owner explicitly ruled out.
6. **Keep the first-mount-only calibration.** Rejected by the clean 0/5 natural-repeat corpus; it calls
   the same expected Select entrance red after initialization is already complete.
7. **Ignore the whole measured window or every anchored portal.** Rejected because either arm can hide
   unrelated app work and non-Select regressions. The chosen range needs trigger intent, related Select
   mount confirmation, and real transition completion.
8. **Use only PipelineReporter's animation flags.** Rejected because unrelated/app-owned animations can
   carry the same flags. They are attribution, not ownership.
9. **Remove Select motion or pre-mount it.** Rejected by owner ruling: one changes shared UX; the other
   shifts initialization cost earlier without removing it.
10. **Keep raw enum labels and add a paragraph.** Rejected because the popup occludes field-level teaching at the moment of choice. The existing option-description rail was built for this exact interaction.
11. **Virtualize or defer inactive Admin sections as the #374 fix.** Rejected as insufficient: the
    isolated Select fixture and the one-section Admin control remain over budget. It is a separate
    Settings-startup optimization, not the first-open repair.
12. **Patch supported Select/Floating UI configuration.** Rejected after measured fixed-position,
    anchor-tracking, collision, modal, direction, containment, animation, and static-position controls
    all remained red.
13. **Replace Base UI with Radix or repurpose Menu/Combobox.** Rejected because the Radix and Menu
    production controls are also red, Radix has no matching multiple-select contract, and Menu/Combobox
    change the listbox/button semantics required by a fixed-value Select.
14. **Spread work across frames or pre-mount.** Rejected because it moves or slices the same cost and
    violates #374's exact measurement contract.
15. **Replace Base UI Select with a custom lifecycle.** Rejected by owner ruling on 2026-08-21. It
    would also require an exception to D42 and UI R3/R4 across a broad interaction contract. Base UI
    remains the mandated seal implementation; there is no new dependency or upstream work item.
16. **Exempt a Select call site or every portal-open frame.** Rejected because either shape is a magic
    marker that can hide repeat-open or feature-owned work. Classification belongs at the existing
    browser-evidence seam and is limited to each confirmed, time-bounded sealed Select entrance.
17. **Raise the 50ms budget or ignore all work in the tagged frame.** Rejected. The fixed one-time
    allowance changes only the known library-initialization input; residual blocking over 50ms still
    fails, and all non-LoAF verdict arms are untouched.
18. **Pre-promote the Select popup with `will-change`.** Rejected by a live 4x control: it produced the
    same classified initialization plus two ordinary 56-60ms style/layout LoAFs. A just-mounted layer
    cannot buy advance promotion, and retaining it would spend compositor memory without curing the
    first-open rail.
19. **Remove Select trigger/popup entrance motion.** Rejected by owner ruling after the transition-boundary
    receipt. Base UI and the house anchored-popup fade/scale remain product law; audit-only duplicate
    instrumentation is the defect, not the user-visible motion.

## Coupled-site inventory

Production sites:

1. Search contract and verb: `domain/search/contract/service.ts`, `domain/search/verbs/digests.ts`.
2. Chat search bridge and recall: `domain/chat/contract/context.ts`, `entry/compose/chat.ts`, `domain/chat/memory/recall/recall.ts`.
3. Episode lifetime and emit: `domain/chat/contract/memory.ts`, `domain/chat/substrate/assemble-gather.ts`, a focused recall episode module, and `domain/chat/engine/engine.ts`.
4. Typed warning and client rendering: `packages/contracts/src/chat/bus.ts`, `features/chat/lib/warning-notice.ts`.
5. Admin teaching: `features/user-admin/components/memory-tuning-section.tsx`; its existing CT story gains a narrow/coarse arm.
6. Shared popup containment: `packages/ui/src/primitives/select/variants.ts`; glossed Select popups retain natural growth but cap at Base UI's collision-boundary width.
7. \#374 evidence and verdict: `packages/client/src/lib/motion-stats.ts` owns lifecycle classification,
   with its cap-required browser-anatomy helper in `packages/client/src/lib/select-entrance-evidence.ts`;
   `tooling/src/motion-audit` owns the calibrated budget input and measured-click checkpoint;
   `tests/tooling/motion-audit.test.ts` plants classifier controls; the client motion-stats CT proves a
   real sealed Select receives first and repeat evidence while app blocking on a repeat remains red. The Select seal and
   all feature call sites remain unchanged. `packages/client/src/lib/motion-flaggers.ts` replaces the
   dev-only `[drop]` loop's forced animation-tree walk with event-lifetime target accounting;
   its cap-required `motion-dead-class-flagger.ts` helper owns `[css]`'s initial census plus cooperative
   mutation-subtree scans while the parent retains the finding/ring vocabulary; `tests/client/lib/motion-flaggers.ct.tsx`
   plants the retained drop, checkpoint, reduced-motion, trailing-edge, and incremental-scan controls.
8. \#389 Chrome-trace repair: `tooling/src/motion-audit` reads only `PipelineReporter` begin
   events carrying the real nested `args.frame_reporter` payload; its paired empty-argument end events
   are excluded. `tests/tooling/motion-audit.test.ts` pins the nested schema and a dropped report, while
   the browser CDP plant proves the repaired parser can still fail a real dropped-frame window.

Test and enforcement sites:

1. Search behavior: `tests/server/domain/search/verbs/digests.int.test.ts`; propagation control: `tests/server/domain/search/substrate/rerank.test.ts`.
2. Recall observer plumbing and episode behavior: `tests/server/domain/chat/memory/recall/recall.int.test.ts`, `tests/server/domain/chat/engine/engine.int.test.ts`.
3. Warning contract/copy: `tests/contracts/chat/index.contract.test.ts`, `tests/client/features/chat/lib/warning-notice.test.ts`, and the live `warning-code-coverage` gate.
4. Picker behavior and rendered containment: `tests/client/features/user-admin/components/memory-tuning-section.ct.tsx`, `tests/client/features/user-admin/_ct-stories.tsx`.
5. Type fan-out: contracts, server, and client TypeScript programs. Structure, knip, and dependency-cruiser run because the change adds a server module and widens cross-domain injected signatures.

No DB schema/event discriminator changes are required: `warning` is already a durable chat bus member; only its typed code tuple grows.

## Red-first and planted-control plan

1. Add digest tests proving successful mixC reranks, rejection returns the exact already-retrieved vector order and full length, and mixB never reports. Run against the base source: the rejection test must throw and the observer assertions must fail/type-red. Keep the existing `applyRerank` rejection test green as the planted global-propagation control.
2. Add recall/engine tests proving the callback marks the shared episode, an initial plus multiple speaker failures emit one typed warning, and a fresh episode emits again. The fresh episode is the positive control proving the once gate can reopen.
3. Add the warning tuple/copy tests; contracts/client typechecks must fail until both producer and exhaustive mapper exist.
4. Add CT assertions for all five human labels and descriptions, no rendered raw enum, the human deployment-floor label, exact experimental/zero recency truth through the keyboard-reachable hint, keyboard selection, clean option name/description wiring, and narrow coarse-pointer containment. Run against the base component: the copy/default/no-raw tests must fail before production edits.
5. After implementation, run the exact focused suites cold, all three TypeScript programs, `check:structure`, knip, dependency-cruiser, the warning coverage gate/suite, and literal plus TS/TSX structural sweeps with scanned-file counts. No whole-tree verify battery runs in this lane.
6. For #374, red-first tooling tests pin the classifier before implementation: a confirmed first entrance
   receives only the fixed allowance, a confirmed repeat receives no blocking allowance, and unconfirmed/
   non-Select style frames plus 51ms residual blocking fail. Paired trace controls classify only complete
   Select ranges and leave unpaired, non-Select, and outside-range dropped frames red. The browser tier
   plants a real first/repeat Select control with app blocking inside the repeat, using a pre-resolved
   mouse hit point so Playwright actionability is outside the measured window. The observer records
   start/duration/blocking/style and script forced-layout attribution, takes pending records, and
   disconnects before rendered inspection. Green requires repeated CT and stabilized private-production
   first opens at 4x, followed by the full Select behavior suite, theme-scope portal suite, coarse target
   suite, and live keyboard/focus/outside/collision/long-localization checks. A private true integration
   with current main must rebuild/restart the workspace stage before final rendered/performance proof.
7. The dev instrument's event-lifetime replacement is red-first against a real CSS transition plus an
   80ms main-thread block: the old global sampler can be planted to force style resolution, while the
   existing LoAF observer plus the lifetime ledger must still emit `[drop]` without a self-sustaining
   rAF loop. A second plant starts real WAAPI effects through
   `element.animate()`, proves both finish/cancel retirement and a blocked-frame warning, and counts zero
   `document.getAnimations()` reads. Existing checkpoint and reduced-motion controls prove that the
   event ledger does not retain motion across an evidence boundary or invent a visible animation. A
   third plant counts document-wide `querySelectorAll("*")` calls after `[css]`'s initial census: the
   real added dead class must still warn while that count stays zero. Its short-idle-deadline arm puts
   the marker beyond one 32-element batch, then proves multiple idle callbacks complete the lazy walk;
   a synchronous subtree loop cannot pass that control.
8. The audit pause is pinned in the browser: while paused, planted CSS and WAAPI effects perform no
   `[drop]` lifetime/report work; after resume, the existing real CSS and WAAPI blocked-frame plants still
   raise `[drop]`. A real CDP trace over the paused CSS plant must still contain enough dropped
   `PipelineReporter` frames to fail the unchanged probe budget. Tooling tests separately retain the
   ordinary style, app-blocking, repeat/non-portal, CLS, and dirty-animation red arms.
9. \#389 is red-first against a real trace-shaped fixture: the former top-level `args.state` parser
   reports zero dropped frames for nested Chrome data, while the repair counts only begin records with
   `args.frame_reporter`. The paired empty `args` record is the negative control against double-counting.

## Owner forks

The #331/#332/#371 work has no unresolved owner fork. Option A and the server-side per-turn/outage interpretation are explicit in #332's owner comment and the dispatch brief. The mode labels explain behavior without changing persona prose, prompt defaults, origin pushes, or the experimental recency formula.

\#374's fork is resolved by the owner's superseding 2026-08-21 ruling: keep Base UI and its entrance
motion, but calibrate the audit for the clean-host-proven normal sealed Select entrance on both first and
repeat opens. The accepted arm is Select-specific and bounded by trigger intent, related mount, and real
transition lifetime. Only first opens receive the measured fixed blocking allowance; repeat and residual
blocking retain the ordinary ceiling. The existing audit-only `[drop]` pause remains, and #389's repaired
CDP parser owns dropped-frame ground truth. Product behavior and the general budget are unchanged.

## Later side-eye matrix

This is a handoff to a fresh side-eye lane, not self-graduation of visible UX. Run from this branch's committed HEAD; `--isolated` gives the review its own frozen stage and disposable DB.

Focused rendered behavior:

```sh
pnpm exec playwright test -c playwright-ct.config.ts tests/client/features/user-admin/components/memory-tuning-section.ct.tsx tests/ui/primitives/select/select.ct.tsx --reporter=list
pnpm snap / --isolated --goto settings:admin --wait-for '#settings-anchor-admin-memory-tuning' --eval '()=>{const node=document.querySelector("#settings-anchor-admin-memory-tuning"); node?.scrollIntoView({block:"start"}); return node?.textContent ?? null}' --text '#settings-anchor-admin-memory-tuning' --expect-text '#settings-anchor-admin-memory-tuning=Sharper semantic recall' --expect-no-overflow '#settings-anchor-admin-memory-tuning' --json --out memory-tuning-structure
```

All five curated appearance presets across snap's eight-variant desktop/mobile × light/dark × full/reduced-motion matrix:

```sh
pnpm snap / --isolated --theme none --appearance-preset defaults --matrix --goto settings:admin --wait-for '#settings-anchor-admin-memory-tuning' --eval '()=>{document.querySelector("#settings-anchor-admin-memory-tuning")?.scrollIntoView({block:"start"})}' --shot-of '#settings-anchor-admin-memory-tuning' --expect-no-overflow '#settings-anchor-admin-memory-tuning' --json --out memory-tuning-defaults
pnpm snap / --isolated --theme none --appearance-preset maximal --matrix --goto settings:admin --wait-for '#settings-anchor-admin-memory-tuning' --eval '()=>{document.querySelector("#settings-anchor-admin-memory-tuning")?.scrollIntoView({block:"start"})}' --shot-of '#settings-anchor-admin-memory-tuning' --expect-no-overflow '#settings-anchor-admin-memory-tuning' --json --out memory-tuning-maximal
pnpm snap / --isolated --theme none --appearance-preset compact --matrix --goto settings:admin --wait-for '#settings-anchor-admin-memory-tuning' --eval '()=>{document.querySelector("#settings-anchor-admin-memory-tuning")?.scrollIntoView({block:"start"})}' --shot-of '#settings-anchor-admin-memory-tuning' --expect-no-overflow '#settings-anchor-admin-memory-tuning' --json --out memory-tuning-compact
pnpm snap / --isolated --theme none --appearance-preset reading --matrix --goto settings:admin --wait-for '#settings-anchor-admin-memory-tuning' --eval '()=>{document.querySelector("#settings-anchor-admin-memory-tuning")?.scrollIntoView({block:"start"})}' --shot-of '#settings-anchor-admin-memory-tuning' --expect-no-overflow '#settings-anchor-admin-memory-tuning' --json --out memory-tuning-reading
pnpm snap / --isolated --theme none --appearance-preset diagnostics --matrix --goto settings:admin --wait-for '#settings-anchor-admin-memory-tuning' --eval '()=>{document.querySelector("#settings-anchor-admin-memory-tuning")?.scrollIntoView({block:"start"})}' --shot-of '#settings-anchor-admin-memory-tuning' --expect-no-overflow '#settings-anchor-admin-memory-tuning' --json --out memory-tuning-diagnostics
```

Snap's matrix motion axis is the OS `prefers-reduced-motion` arm; each preset's app-level appearance setting remains the preset/account value and is recorded in each JSON manifest. Review all 40 shots plus manifests, tab the select and every info trigger, inspect the option label/description announcement split, and do not call the visible work graduated without that fresh side-eye verdict.
