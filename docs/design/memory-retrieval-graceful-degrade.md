---
kind: design
status: active
updated: 2026-08-20
---

# Memory retrieval controls and graceful rerank degradation

## Evidence and constraints

- The admin picker currently exposes the raw retrieval enum and a terse legend; its numeric hints use implementation vocabulary instead of consequences (`packages/client/src/features/user-admin/components/memory-tuning-section.tsx:35-46, 142-149`).
- `SelectOption.description` already provides the required per-option visible gloss while keeping the selected trigger single-line and the gloss in `aria-describedby`, not the option name (`packages/ui/src/primitives/select/select.tsx:26-42, 61-91`). No new picker primitive is needed.
- `digests` computes the CSLS/experimental-recency order, cuts it to `retrieveK`, then hands that already-retrieved array to `applyRerank` (`packages/server/src/domain/search/verbs/digests.ts:125-140`). `applyRerank` deliberately propagates a runner rejection for every other caller (`packages/server/src/domain/search/substrate/rerank.ts:1-3, 37-41`).
- A round-level recall is built once in gather and its `MemoryRecallInputs` object is reused by every scoped per-speaker engine recall (`packages/server/src/domain/chat/substrate/assemble-gather.ts:243-286`; `packages/server/src/domain/chat/engine/engine.ts:1260-1281`; `packages/server/src/domain/chat/engine/round.ts:104-132`). That existing shared object is the natural lifetime for once-per-turn/outage state.
- D41 requires a typed warning with a real domain emit site; the active `warning-code-coverage` gate scans `packages/server/src/domain/chat/**` for every `CHAT_WARNING_CODES` member (`docs/architecture/core/Core-Path-Registry.md:97`; `scripts/check/gates/warning-code-coverage.ts:23-42, 65-83`). The client warning mapper is exhaustive (`packages/client/src/features/chat/lib/warning-notice.ts:23-34, 75-79`).
- The #321 recency control is an experimental order-only probe applied before `retrieveK`; `recencyBias: 0` leaves CSLS ordering byte-identical. The UI must state that truth and must not present the current probe formula as production policy (`packages/server/src/domain/search/verbs/digests.ts:8-15, 45-68, 125-130`).

The structural search covered 3,747 TypeScript and 1,125 TSX files under `packages` and `tests`. It found one live property-read call to `searchDigests`, in recall; optional-chain and bracket-read forms had zero matches. A second literal sweep found the compose binding plus two evaluation harness bindings. Thus the callback seam below has four coupled callers/binders, not an unknown wider runtime graph.

## Chosen architecture

### 1. Teach the existing picker

Keep the canonical values in `MEMORY_RETRIEVAL_MODES`, but derive the select items through a total `Record<MemoryRetrievalMode, {label, description}>`. The trigger and deployment-floor copy use the human label; each open option uses the existing description slot for its benefit, cost, and appropriate-use guidance. No raw `mixA`/`mixB`/`mixC`/`tiered` value appears in rendered copy.

Rewrite the numeric hint strings in consequence-first language. In particular, recency says it is experimental, changes only candidate order before the recall limit, and zero preserves semantic ordering. The controls and persisted enum values do not change.

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

## Rejected alternatives

1. **Catch inside `applyRerank`.** Rejected because its documented and tested global contract is propagation; changing it would silently degrade unrelated search surfaces.
2. **Pre-flight the rerank engine.** Rejected by the owner ruling. It also creates a time-of-check/time-of-use race and a second provider call without improving the actual recall result.
3. **Return a new `{hits, degraded}` envelope from every digest search.** Rejected because the fallback notification is an exceptional side signal, while replacing the established array return fans churn through all search tests and evaluation harnesses. The optional observer expresses exactly the local event without duplicating hits or changing normal callers.
4. **Deduplicate in the client or in global server state.** Rejected because client coalescing is broader than one turn and global server state would leak episodes across turns/replicas. The already-shared round input is the exact ownership/lifetime boundary.
5. **Emit once per recall call.** Rejected because a scoped group round can recall once at gather and once per speaker; that is the duplicate-notice defect the owner explicitly ruled out.
6. **Keep raw enum labels and add a paragraph.** Rejected because the popup occludes field-level teaching at the moment of choice. The existing option-description rail was built for this exact interaction.

## Coupled-site inventory

Production sites:

1. Search contract and verb: `domain/search/contract/service.ts`, `domain/search/verbs/digests.ts`.
2. Chat search bridge and recall: `domain/chat/contract/context.ts`, `entry/compose/chat.ts`, `domain/chat/memory/recall/recall.ts`.
3. Episode lifetime and emit: `domain/chat/contract/memory.ts`, `domain/chat/substrate/assemble-gather.ts`, a focused recall episode module, and `domain/chat/engine/engine.ts`.
4. Typed warning and client rendering: `packages/contracts/src/chat/bus.ts`, `features/chat/lib/warning-notice.ts`.
5. Admin teaching: `features/user-admin/components/memory-tuning-section.tsx`; its existing CT story gains a narrow/coarse arm.
6. Shared popup containment: `packages/ui/src/primitives/select/variants.ts`; glossed Select popups retain natural growth but cap at Base UI's collision-boundary width.

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

## Owner forks

No unresolved owner fork remains. Option A and the server-side per-turn/outage interpretation are explicit in #332's owner comment and the dispatch brief. The mode labels explain behavior without changing persona prose, prompt defaults, origin pushes, or the experimental recency formula.

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
