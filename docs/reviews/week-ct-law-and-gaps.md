# Weekly CT law and gap audit

## Outcome and scope

Read **187/187 current CT files in full**. Two confirmed test-proof defects, followed by bounded missing-case recommendations. No product defect, passing runtime verdict, or complete visual review is claimed.

The independently reproduced Git window is `--since=2026-10-20 00:00:00 -0600` through initial HEAD `31dff00d46eea8fe8110db9cb02cc1ad4eb7f99f`: 756 historical CT paths, 187 existing files, 569 absent paths. The absent paths are deletion/restoration history, **not 569 missing tests**. Initial current-file volume: 25,780 lines. Final reconciliation at `6a1f9caf2f4e7fe59da813cb3d6188ef151f1c19`: the same 187 files, 25,784 lines. The four changed CTs were read in their repaired form and their final delta checked: Document pinned strip, diverged warning, settings composition, export library. The shared settings story now uses the testkit browser door. These already-owned boundary repairs are not new findings.

The local evidence packet at `reports/stickler/week-ct-law-and-gaps/` contains `inventory.json` and `read-ledger.json`, which enumerate the exact population and completed reads. Large/truncated output batches were completed with explicit missing-range reads; a truncated batch was not counted as a full read. This is a read ledger, not runtime qualification.

Read in full: AGENTS, lane/review skills, browser/node test rules, `tests/support/README.md`, `docs/law/Spine-Testing.md`, `docs/plans/test-foundation/design.md`, and `docs/plans/restoration-register/design.md`. Follow-up full reads included the surface census stories/harness, settle/geometry helpers, production-backed CT provider door, room and character stories, reading-room helper, shared settings story, native runner config, scripted-chat E2E, chat-persistence E2E, and live start-chat E2E. Other E2E follow-up was selected excerpts/title census, **not** a full E2E or server-integration audit. No historical deleted CT bodies were compared.

No source edit, browser/native/compiler run, board transition, or commit was performed. The parent owns checks and the subsequent deep Characters/Chat visual audit. The parent reviewed the findings against the census harness and settlement helper before publishing this report. Runtime verification remains separate.

## Confirmed findings

### F1 — P2: the broad surface censuses can finish on an unloaded surface

**Defect:** `tests/support/browser/settle-surface.ts:8` treats twenty mutation-free animation frames as data completion, while census cases assert only an empty findings list without witnessing their target content.

**Failure scenario:** a section's request remains pending longer than twenty frames, or its feature body stops mounting. Static chrome/skeletons become quiet; the name/form/density checks inspect that smaller tree and can pass without inspecting the intended controls. The helper's comment calls this a lifecycle signal, but it observes neither query completion nor the required rendered state.

**Evidence:** `accessible-name-quality.suite.ct.tsx:67`, `form-identity.suite.ct.tsx:88`, and `surface-census.suite.ct.tsx:99` mount a section and ask for no findings. The corresponding group/modal loops have the same pattern. The helper at `settle-surface.ts:12` resets only for DOM mutations and resolves at line 20. `form-identity.ts:50` returns an empty findings array when no fields exist. `_surface-harness.ts:88`/`:127` even keeps `search.spaceStatus` held for the entire case, so quiescence is deliberately possible with unfinished data. The selected loaded-preset/Admin/About cases already demonstrate the better pattern by asserting a real heading/control/version before auditing.

**Law:** Spine-Testing §7, line 183: “Timing samples are measurements, not completion barriers. Use actual lifecycle signals and settled rendered state.” §3 line 74 requires non-vacuity; testkit README “What review must establish” requires a valid positive control/completed operation. This is an assertion defect, not a claim that current recorded runs failed.

**Correction:** retain mutation/animation settlement only after a subject-specific positive witness (and expected loaded/error/empty state). Add one held-read control proving the census cannot finish while its subject is absent, then release and prove a planted missing label is caught. Do not demand zero global in-flight requests: long-lived streams and deliberately held unrelated reads exist.

### F2 — P2: fabricated capture inputs let the census render impossible filtered/page states

**Defect:** `tests/client/features/app-shell/_surface-harness.ts:11` stamps new request inputs onto the first capture without executing those requests or changing their output.

**Failure scenario:** a starred-only or limited Characters read receives the complete unstarred library. Geometry and empty-state audits then judge a population the requested production read cannot return; a changed filter/limit can remain green because the fake capture says it was captured.

**Evidence:** `sameOutputFor` returns `{ ...first, input }` at line 16. Its calls at lines 108–114 reuse the same result for limits 5/6/12/24/30, including `starred: true`; lines 99–102 do the equivalent for Chat pages. Read-only JSON inspection of the committed corpus finds 38 items in its first `character.list` output, all 38 unstarred, and 27 items in its first `chat.listChats` output. `hydrateCorpusWire` at `tests/support/iso/corpus.ts:333` wraps/parses those captures; it does not execute the invented requests. Thus the request-aware responder's exact-match check is bypassed by manufacturing matching inputs. The actual `character.list`/`chat.listChats` production operations are bypassed for those extra requests, even though the helper already receives a real caller.

**Law:** Spine-Testing §7 line 179 requires request-aware UI responses and states that fixed arrays do not prove filtering; §9 requires real production behavior and production-derived inputs. Testkit README's route-map contract says the map answers the request it receives. This does not forbid deliberately named controlled-state CTs; these records are presented as exact corpus captures rather than an explicit synthetic state.

**Correction:** serve these procedures through the existing caller, or capture each exact input through it. Do not copy filtering/paging into test code. A discriminating control uses a populated unstarred library and a starred-only query, plus a limit smaller than the population; the rendered cohort must match each actual operation.

## Missing cases ranked by the supplied pain points

These are gaps in the **audited CT proof** or unestablished cross-layer coverage, not blanket claims of repository-wide absence. Add only the named distinction after checking the existing owner work item. No per-file quota or duplicate matrix is proposed.

### G1 — High priority: composed Characters/Chat adoption at actual pane budgets

- **Risk:** individually correct controls can still combine into crushed text, duplicate identity, inaccessible subitems, or inconsistent action hierarchy when LIST and CONTEXT reduce CONTENT width.
- **Existing proof:** shell panels tests cover real tracks, primacy and Characters band doors (`app-shell-panels.ct.tsx:324`); topbar covers painted title ownership; context-header-navigation chooses the last Chat tab and exercises manual activation (`:14`). The census only opens section landing states. Character-specific CTs cover greeting/example/filter cases, not all editor/context subitems in a loaded shell. These are useful pieces, not an all-tabs review.
- **Lowest layer:** CT for loaded-state geometry and focus, through `CtClientProviders → CtShellRoom/AppShell` and the production Character section; E2E only for one representative cross-pane journey and reload.
- **Case:** derive the live tab/contribution roster, explicitly open each user-facing subsection needed by Characters and Chat, and assert a subject witness plus layout/focus invariants. Compare one actual squeezed both-docked desktop with neither panel, and phone portrait/short landscape where the shell changes ownership. Use long valid names, metadata-rich rows, real populated/empty states and an enabled installed plugin/game contribution only where that surface actually changes.
- **Red:** constrain one content title/control sibling or reintroduce the duplicated body title and show the same assertion fails; do not use an imported skin record as the sole semantic oracle. Judge semantic component/size-family choice in the live review, then pin the specific behavioral failure at its shared owner. No blanket screenshot baseline.
- **E2E caution:** `corpus-shell.spec.ts` already contains phone push/Back, draft/scroll retention and new-member focus cases. `scripted-chat.spec.ts` already proves two sends, incremental streaming, Stop and exact canon after reload. Reuse these rather than proposing another generic chat smoke.

### G2 — High priority: Document user-role strip and actual touch reading

- **Risk:** the asymmetric user header can leave partially covered prose even when the assistant strip is correct; synthetic scroll offsets do not prove native touch input hands control away from tail following.
- **Existing proof:** `platform-document-pinned-strip.suite.ct.tsx:29` explicitly selects an assistant reply only; `chat-style-skins.ct.tsx:567` skips Document's pinned-identity assertions, and that file is not WebKit-selected. Tide's dedicated suite does cover both long roles (`platform-tide-reading-strip.suite.ct.tsx:35`), so do not duplicate it. `platform-transcript-identity` covers both roles except Document, and focuses containment on Ripple.
- **Lowest layer/composition:** extend the existing real-room CT using persisted long user and assistant messages. Add the Document user row to the dedicated strip contract, keeping its no-identity policy. Use portrait and short landscape, at-rest → mid-prose → row-end; assert full reading-width opaque backing and menu/focus containment for both roles.
- **Red:** narrow only the user strip or remove its backing, while assistant remains healthy; the user assertion must fail. Add one true touch-scroll path over a real short room, not another DOM `scrollTop` matrix. Keep the existing deterministic DOM positioning for exact geometry.

### G3 — High priority: late media changes must preserve reading position and reserved geometry

- **Risk:** final ratios can be correct while a delayed image/decode changes the row height, moves the reading anchor, or disrupts a pinned header/composer.
- **Existing proof:** `platform-plugin-image-aspect.suite.ct.tsx:110` covers all three declared ratios × loaded/missing/broken plus omitted-aspect natural ratio; loaded assertions wait for decode (`:60`). `media-lifetime` and `example-lifetime` cover retained zoom/consent versus replaced media. None of those asserts before/after delayed media geometry. `css-ownership.ct.tsx:61` changes a prop and checks paint, not actual late network/decode movement.
- **Lowest layer/composition:** one shared image-renderer CT for held image response and reserved frame; one real Chat room adoption case only for the distinct virtualized reading-anchor consequence. Keep actual CAS resolution and script only HTTP media delivery.
- **Red:** omit aspect reservation while response is held, then release a differently proportioned valid image; assert declared frame stability and final decoded ratio. For omitted aspect, assert natural ratio remains allowed, not that natural content is forced into a fixed box. For the room case plant a late tall image and break anchor preservation; record the same text witness's viewport position, header coverage and usable composer before/after. Add no arbitrary delay barrier.

### G4 — Medium priority: lower composer menu reach under actual contributions

- **Risk:** opening a menu and seeing its box inside the viewport does not establish that its last item is reachable when game/plugin contributions lengthen it or the keyboard reduces visible height.
- **Existing proof:** `composer-two-rows.ct.tsx` checks solo/group rows, menu viewport box, all declared composer actions, native guest command arguments/Undo, refusal and keyboard compression. `platform-plugin-presentation` proves the real Keepsake Snapshot menu item; RPG suites prove selected ability controls. The two-row test does not scroll a long lower menu to its final contribution.
- **Lowest layer:** CT through the existing real room/registry composition, installed guest plus seeded game. One short landscape case with the largest meaningful menu and emulated keyboard, one keyboard End/Tab route and one native touch reveal. Assert the last enabled item's accessible name, actual hit ownership, activation receipt and canonical focus return; do not generate a real image/model turn.
- **Red:** remove the popup's scroll reach or truncate its available-height calculation. The last item must become unreachable while the menu itself still opens. Retain the existing shared Menu clamp test; it tests a different lower-level contract.

### G5 — Medium priority: first-message read arrival must not replace the typing composer

- **Risk:** an initial `chat.listMessages` resolution remounts the composer and loses a freshly typed draft/caret.
- **Existing proof:** production `chat-room-surface.tsx:270` explicitly documents this prior failure and the stable `ComposerSlot` fix. The audited two-row CT types only after the mounted room's controls are ready; transcript retry tests scroller height/focus, not early typing. Scripted-chat E2E waits for the start response and checks completed sends, not a deliberately held first message read.
- **Lowest layer/composition:** controlled CT through the real room. Hold only the first listMessages response, type once into the already-visible composer, release it, assert exact text/caret/focus and node identity; switch to a different room as a positive reset control.
- **Red:** restore fallback/resolved separate Composer tree positions. The test must fail without retyping or helper retry. One viewport suffices: the defect is lifecycle, not a width matrix.

### G6 — Medium priority: remaining narrow editor/error adoption, not another autosave engine matrix

- **Risk:** a real conflict/failure state can be correct but unreadable or unreachable in the actual narrow member host.
- **Already covered:** tags have canonicalization, early own event/late response, clean/dirty external changes, failed retry, merge failure and dismissal flushes. Presets have nested-list ownership, stale draft refusal, pending newer edits, reset, failed status/Retry and selected-tab reveal. Roster member-save has successful own save, typing during save, external conflict, abandonment and non-metadata preservation (`platform-member-save.suite.ct.tsx:104/136/169`). These are not missing business cases.
- **Lowest layer:** extend the roster member's existing CT with one narrow/coarse conflict and failed-save/retry presentation in the production host; retain integration ownership of transactions and sibling preservation. For Characters, reuse the shared editor's known race suite where applicable and add only its real-surface adoption witness (draft/status/focus) through `CharacterEditorSurface`.
- **Red:** suppress the pending/error/conflict state or hide its recovery action inside the clipped host while the stored row stays unchanged. Assert the draft and actual recovery, not request count alone. E2E reload coverage for these specific editors was not exhaustively audited; confirm its owner before adding a new journey.

## Coverage that must not be misreported as missing

| Pain point | Existing evidence and precise boundary |
| - | - |
| Focused tab label/halo clipped by ancestor | `platform-focus-reveal.suite.ct.tsx` covers nearest clip, Home/End/arrows, disabled/manual/RTL, focus cancellation and outer scroll preservation; Preset header-budget has a real editor adoption case. This is covered source, not freshly executed proof. |
| Decorated duplicate AX controls and return focus | `platform-art-controls.suite.ct.tsx` proves one accessible image control per role for Echo/Whisper/Ripple, pointer alias focus refusal, canonical return and broken-art behavior for Echo/Whisper. |
| Genuine empty versus filtered miss | Character remaining-actions, Preset action-groups, config filter-recovery and Atlas browse-state contain real discriminating states. Do not replace them with empty-only mocks. |
| Destructive merge confirmation | Tag transaction/member suites cover inline Cancel/Escape/failure, pending merge/dismissal and real persisted outcomes. Their complete actual-shell z-order/hit behavior still belongs in the requested visual pass. |
| Semantic primitive recipe and sizing | Native parts, classname-drain, ramp-enforcement and platform-fields test shared recipes; many platform feature suites prove actual adopted controls and narrow hosts. Recipe parity alone cannot establish that every feature chose the appropriate recipe. |
| Full-stack transcript persistence | `tests/e2e/scripted-chat.spec.ts` uses an external scripted provider and real stack, compares IDs/roles/text/order, has corrupt-oracle controls and repeats after reload. This is stronger than declared corpus counts. |
| Plugin activation and state | Installed native guest tests exercise real plugin operations; Atlas explicitly distinguishes remounted settled state from continuous socket delivery. Do not call those remounts a continuous cross-device proof. |

## Engine selection and execution limits

`playwright-ct.config.ts:74` selects only `platform-*.suite.ct.tsx` plus `composer-two-rows.ct.tsx` for `webkit-iphone`. **60/187 audited files match that selection; 127 do not.** Merely naming a phone viewport or `hasTouch` does not select WebKit. Examples outside the selected set: `chat-style-skins`, `context-header-navigation`, `filter-rail-tag-edit`, `members-focus`, `context-panels`, `media-lifetime` and the main `app-shell-*` specs. Selected means eligible, not executed. Native WebKit here is WebKitGTK/WPE, not Safari; physical iOS keyboard/inset/gesture behavior remains a separate limitation.

The current runner builds the gallery and serves it statically (`playwright-ct.config.ts:56`), whereas Spine-Testing §7 still describes development React. This documentation/runtime discrepancy is noted but not adjudicated as a new finding: Vite/React build configuration was not fully reviewed. Do not copy the older development-mode claim into a verification receipt without resolving it.

## Unconfirmed concerns and exclusions

- Broad census helpers do not prove all deferred tab bodies, all scroll descendants or all semantic design decisions were visited. F1 establishes the missing completion/witness barrier; it does not assert that a particular historic run was empty.
- Imported skin/constants parity is legitimate for CSS/JS wiring under §9. It needs independent behavior expectations where the purpose is a user-visible policy; it is not automatically a defect or a reason to duplicate constants.
- The normal E2E helper's typing retries and `chat-persistence` keyboard bypass deserve their own owner review if they are used to claim one-shot typing or pointer usability. They are outside this CT population and were not promoted to CT findings.
- No claim about runtime pass/fail, mutation-control execution, whole-repo coverage, historical keep/drop equivalence, owner-data replay, or actual visual coherence is made. The 569 removed paths need restoration decisions, not reflex restoration.

## Evidence operations

Read-only operations: `git status --short`, `git rev-parse HEAD`, `git log --since=2026-10-20 00:00:00 -0600 --name-only --format= -- '*.ct.tsx'`, `git diff 31dff00d46..HEAD -- <four CT paths>`, filesystem existence/line-count comparison against `/tmp/orb-week-live-ct-paths.txt`, and numbered complete reads through `/tmp/week_ct_read.py` plus `sed -n` completion ranges. All 187 paths are in the adjacent ledger. `cat`/`sed` read the law and named follow-up files; `rg` located owner references/E2E cases; `ast-grep run --lang tsx --pattern 'await settleSurface($PAGE)'` confirmed the three census callers (three explicit nonzero files). CodeGraph was queried for mounting/settlement symbols; its broad results were treated as leads, not completeness proof. JSON-only corpus inspection counted 38 unstarred Characters and 27 Chats; no private imagery was opened. Missing guessed helper paths produced file-not-found errors and were corrected by `rg`; they are not negative evidence.

## Handoff

The current CT population contains substantial real-root regression coverage; the useful next work is not a larger pile of isolated controls. Repair the census's completion/non-vacuity and fabricated capture-input defects, then use the requested deep Characters/Chat pass to select narrowly discriminating composed-adoption cases: Document's user strip, late-media reading stability, lower-menu reach, and early typing across first-read arrival. Keep already-covered tag/preset/roster race semantics, use CT for controlled rendered behavior and E2E for actual wire/persistence journeys, and keep native execution receipts separate from this source audit.
