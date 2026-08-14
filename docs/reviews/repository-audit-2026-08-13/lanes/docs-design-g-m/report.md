# Repository audit — docs-design-g-m

## Lane identity

- Lane: `docs-design-g-m`
- Scope: five assigned `docs/design` records only; this is a cold audit, not an implementation lane.
- Snapshot requested: `41e18afe74afa570b67a3e670a1a38863c486a00`
- Receipt HEAD: `875ec3b087b3775876093bc6cc0e08a3e973eacd`
- Audit status: complete; no source, test, configuration, or assigned-document edits.

## Read receipt

- Assigned documents: 5/5 (100%).
- Assigned document content: 2,234/2,234 lines and 192,108/192,108 bytes (100%).
- Dirty assigned documents at receipt and close: 0.
- Hashes and per-file sizes: [`read-receipt.tsv`](read-receipt.tsv).

## Architecture observed

- The ignore-marker design is landed in the grammar home: `parseGateIgnoreMarker` is start-anchored and `findGateIgnoreMarkers` admits only actual line-comment openers outside literal spans ([`scripts/check/pass.ts:127`](../../../../../scripts/check/pass.ts:127), [`scripts/check/pass.ts:197`](../../../../../scripts/check/pass.ts:197)). The inventory gate imports that shared reader and covers `scripts/check/gates` ([`scripts/check/gates/gate-ignore-inventory.ts:35`](../../../../../scripts/check/gates/gate-ignore-inventory.ts:35)).
- HOME still has a deterministic static `(order, id)` sort ([`packages/client/src/features/home/lib/order-home-tiles.ts:9`](../../../../../packages/client/src/features/home/lib/order-home-tiles.ts:9)); the proposed query-driven promotion does not exist, matching the record's open/refused status.
- The character list projection is shipped as chat-owned `ChatsWithCharacterPane`, composed from `main.tsx`; it uses the paged `chat.listChats` collection with `characterId` and server search ([`packages/client/src/features/chat/components/chats-with-character-pane.tsx:57`](../../../../../packages/client/src/features/chat/components/chats-with-character-pane.tsx:57), [`packages/client/src/main.tsx:243`](../../../../../packages/client/src/main.tsx:243)).
- Lite RPG is a live domain, not a future carve: `createGame("lite")` mints through `mintLiteGame`, while full is deliberately still a typed PHASE refusal ([`packages/server/src/domain/rpg/verbs/game/create-game.ts:17`](../../../../../packages/server/src/domain/rpg/verbs/game/create-game.ts:17)). Its delivered config defaults `extractionMode` to `folded` ([`packages/contracts/src/rpg/config.ts:176`](../../../../../packages/contracts/src/rpg/config.ts:176)).
- Login/boot web-weave is live. `BootVeil` now holds a mounted fast boot for 1,000ms before it may exit ([`packages/client/src/features/app-shell/components/boot-veil.tsx:55`](../../../../../packages/client/src/features/app-shell/components/boot-veil.tsx:55)); `WebSpinner` is exported from `spinner.tsx`, not `web-spinner.tsx` ([`packages/ui/src/primitives/spinner/spinner.tsx:39`](../../../../../packages/ui/src/primitives/spinner/spinner.tsx:39)).

## Subsystem scorecards

| Subsystem / current state | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Evidence |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Gate-ignore mention fence — shipped | 4 | 4 | 4 | 4 | 2 | high | R4: shared grammar/inventory implementation plus real-tree probe assertions ([`tests/tooling/gate-ignore-grammar.int.test.ts:1`](../../../../../tests/tooling/gate-ignore-grammar.int.test.ts:1)). |
| Conditional HOME promotion — intentionally not shipped | 0 | 0 | 0 | 0 | 0 | high | R3: open document status and current static-only ordering contract. |
| Character chats list-pane projection — shipped, paged server projection | 4 | 4 | 4 | 3 | 2 | high | R4: composition plus CT exercises server narrowing, empty state, actions, and focus ([`tests/client/features/character/components/characters-list-pane.ct.tsx:1`](../../../../../tests/client/features/character/components/characters-list-pane.ct.tsx:1)). |
| Lite RPG substrate — shipped; full mode still phased | 4 | 4 | 5 | 4 | 3 | high | R5: fresh 8-test integration run; create/full boundary assertions ([`tests/server/domain/rpg/verbs/game/create-game.int.test.ts:24`](../../../../../tests/server/domain/rpg/verbs/game/create-game.int.test.ts:24)). |
| Login/loading web-weave — shipped, with stale as-built record details | 4 | 4 | 4 | 4 | 3 | high | R4: source and CT assertions for spinner, veil, weave, and login arms. |

`0` means the evaluated proposed mechanism is absent; it is not a claim that the surrounding HOME surface is unimplemented. `N/A` means the unbuilt proposal has no live operational surface to score.

## Findings

### `DOCS-DESIGN-G-M-01` — List-pane projection record is stale

- Severity: P2
- Class: law-drift
- Confidence: high
- Evidence rung: R4
- Scope denominator: one assigned design record, its Arm A current-state claims, and the one current production-path CT for the shipped pane.
- Receipts: `docs/design/list-pane-projection-proposal.md:9,67,89`; `packages/client/src/features/chat/components/chats-with-character-pane.tsx:11,57`; `packages/client/src/main.tsx:240`; `tests/client/features/character/components/characters-list-pane.ct.tsx:7`.

`docs/design/list-pane-projection-proposal.md` still calls Arm A a draft with “nothing ... built” and specifies an unpaged client-side predicate/no server character parameter ([`docs/design/list-pane-projection-proposal.md:9`](../../../../design/list-pane-projection-proposal.md:9), [`docs/design/list-pane-projection-proposal.md:67`](../../../../design/list-pane-projection-proposal.md:67), [`docs/design/list-pane-projection-proposal.md:89`](../../../../design/list-pane-projection-proposal.md:89)). The current shipped pane says the opposite: it calls `useChatListCollection` with `characterId` and `search`, is paged and virtualized, and is composed into the real character section ([`packages/client/src/features/chat/components/chats-with-character-pane.tsx:11`](../../../../../packages/client/src/features/chat/components/chats-with-character-pane.tsx:11), [`packages/client/src/features/chat/components/chats-with-character-pane.tsx:57`](../../../../../packages/client/src/features/chat/components/chats-with-character-pane.tsx:57), [`packages/client/src/main.tsx:240`](../../../../../packages/client/src/main.tsx:240)). The production-path CT explicitly asserts server-side narrowing ([`tests/client/features/character/components/characters-list-pane.ct.tsx:7`](../../../../../tests/client/features/character/components/characters-list-pane.ct.tsx:7)).

Impact: a reader following the draft would rebuild a deleted client-cache architecture and may regress pagination. The draft/historical label does not make its current-state sections safe as an implementation reference. Refresh the record into a historical/as-built state or replace its architecture/status claims with the landed server-projection design.

### `DOCS-DESIGN-G-M-02` — Lite substrate record has stale delivery/configuration state

- Severity: P2
- Class: law-drift
- Confidence: high
- Evidence rung: R5
- Scope denominator: one assigned Lite substrate record, one live contract default, and two current integration files / 8 tests.
- Receipts: `docs/design/lite-plus-guided-substrate-spec.md:41,47`; `packages/contracts/src/rpg/config.ts:176,202`; `tests/server/domain/rpg/verbs/game/create-game.int.test.ts:24,42`; current 8-test integration receipt in `commands.md`.

The Lite substrate record says the delivery model is “COMMITTED (not yet built)” and defines `extractionMode` as `"reliable" | "cheap"`, default `"reliable"` ([`docs/design/lite-plus-guided-substrate-spec.md:41`](../../../../design/lite-plus-guided-substrate-spec.md:41), [`docs/design/lite-plus-guided-substrate-spec.md:47`](../../../../design/lite-plus-guided-substrate-spec.md:47)). Current contracts instead default the live knob to `folded` ([`packages/contracts/src/rpg/config.ts:176`](../../../../../packages/contracts/src/rpg/config.ts:176), [`packages/contracts/src/rpg/config.ts:202`](../../../../../packages/contracts/src/rpg/config.ts:202)); creation tests pin that default while independently proving the still-future `full` refusal ([`tests/server/domain/rpg/verbs/game/create-game.int.test.ts:24`](../../../../../tests/server/domain/rpg/verbs/game/create-game.int.test.ts:24), [`tests/server/domain/rpg/verbs/game/create-game.int.test.ts:42`](../../../../../tests/server/domain/rpg/verbs/game/create-game.int.test.ts:42)). Those tests passed in this audit (8 tests across two integration files).

Impact: this is not merely a status date; it presents an obsolete public configuration contract as the build plan. Keep the important distinction: Lite is shipped, while full remains unbuilt. Mark the design historical and point readers to the current contract/domain sources, or update the stated live vocabulary and default.

### `DOCS-DESIGN-G-M-03` — Login as-built record omits the boot-floor behavior

- Severity: P2
- Class: law-drift
- Confidence: high
- Evidence rung: R4
- Scope denominator: one assigned login/loading record, the one `BootVeil` exit policy, and its targeted fast-ready CT.
- Receipts: `docs/design/login-loading-screen.md:330,347`; `packages/client/src/features/app-shell/components/boot-veil.tsx:55,69`; `tests/client/features/app-shell/components/boot-veil.ct.tsx:52`.

The login as-built record says `data-app-ready` makes the boot veil dissolve “the instant” it appears and that there is “no minimum-beat hold” ([`docs/design/login-loading-screen.md:330`](../../../../design/login-loading-screen.md:330), [`docs/design/login-loading-screen.md:347`](../../../../design/login-loading-screen.md:347)). `BootVeil` now deliberately gates exit on both readiness and a 1,000ms minimum-display floor ([`packages/client/src/features/app-shell/components/boot-veil.tsx:55`](../../../../../packages/client/src/features/app-shell/components/boot-veil.tsx:55), [`packages/client/src/features/app-shell/components/boot-veil.tsx:69`](../../../../../packages/client/src/features/app-shell/components/boot-veil.tsx:69)). Its CT has a dedicated fast-ready assertion ([`tests/client/features/app-shell/components/boot-veil.ct.tsx:52`](../../../../../tests/client/features/app-shell/components/boot-veil.ct.tsx:52)).

Impact: the as-built doc tells a maintainer to remove a deliberate anti-flash behavior. Update §9.3/§9.4 to state the ready-plus-floor exit, including the reduced-motion exception.

### `DOCS-DESIGN-G-M-04` — Login as-built record names stale source and test paths

- Severity: P3
- Class: law-drift
- Confidence: high
- Evidence rung: R2
- Scope denominator: three stale path references in one assigned record; two current replacement source/test paths.
- Receipts: `docs/design/login-loading-screen.md:322,386,403`; `packages/ui/src/primitives/spinner/spinner.tsx:39`; `tests/ui/primitives/spinner/spinner.ct.tsx:1`; scoped file inventory and literal search in `commands.md`.

The same login record names non-existent `web-spinner.tsx` source and test paths ([`docs/design/login-loading-screen.md:322`](../../../../design/login-loading-screen.md:322), [`docs/design/login-loading-screen.md:386`](../../../../design/login-loading-screen.md:386), [`docs/design/login-loading-screen.md:403`](../../../../design/login-loading-screen.md:403)). The implementation and current CT are `packages/ui/src/primitives/spinner/spinner.tsx` and `tests/ui/primitives/spinner/spinner.ct.tsx` ([`packages/ui/src/primitives/spinner/spinner.tsx:39`](../../../../../packages/ui/src/primitives/spinner/spinner.tsx:39), [`tests/ui/primitives/spinner/spinner.ct.tsx:1`](../../../../../tests/ui/primitives/spinner/spinner.ct.tsx:1)).

Impact: these are broken as-built receipts and make the promised test floor harder to locate. Correct the paths; no runtime behavior change is implicated.

## Proven strengths

- R4: The gate-ignore record accurately separates its landed behavior from its rationale. The start-anchored suppressor and opener-aware scanner share one implementation home; the real-tree test includes the original quoted-marker bypass and scripts-side corpus arms ([`scripts/check/pass.ts:127`](../../../../../scripts/check/pass.ts:127), [`tests/tooling/gate-ignore-grammar.int.test.ts:145`](../../../../../tests/tooling/gate-ignore-grammar.int.test.ts:145)).
- R4: The current login test surface is substantive: it checks actual canvas paint, reduced-motion behavior, palette invalidation, spinner semantics, and fast-ready boot-floor behavior rather than only component presence ([`tests/ui/art/web-weave/web-weave.ct.tsx:70`](../../../../../tests/ui/art/web-weave/web-weave.ct.tsx:70), [`tests/ui/primitives/spinner/spinner.ct.tsx:18`](../../../../../tests/ui/primitives/spinner/spinner.ct.tsx:18)).

## Declared versus completed

| Assigned record | Declared status | Current result |
| --- | --- | --- |
| Gate-ignore mention fence | Built | Accurate: landed grammar, inventory scan, and test evidence. |
| Conditional HOME promotion | Open / owner decision pending | Accurate: current ordering remains static; the proposed promotion is not shipped. |
| List-pane projection | Draft; only seams landed | Stale: the Arm A pane is shipped, server-narrowed, paged, virtualized, and CT-covered. |
| Lite + guided substrate | Design / committed not yet built | Stale for Lite and extraction delivery; full-mode PHASE is still accurately future. |
| Login/loading screen | Built as-built record | Broadly shipped, but its boot-exit behavior and spinner source/test paths have drifted. |

## Tests and gates

- Freshly run: `pnpm check:docs` passed (104 docs formatted).
- Freshly run: two RPG integration files passed, 8 tests total, with no type errors.
- Read but not run: the gate-ignore real-tree suite; its fixture cleanup mutates shared `packages/tests/scripts` probe paths, so running it was intentionally avoided in this concurrent audit worktree.
- Read evidence: 1 gate tooling integration suite; 1 HOME unit test and 1 HOME CT; 1 character-list CT; 2 RPG integration suites; 1 spinner CT; 1 boot-veil CT; 1 login-surface CT; 2 web-weave CTs; 1 web-weave geometry unit test.

## Cross-lane edges

- `docs-design-g-m` owns only the four documentation findings above. Implementation owners for the actual systems should not treat this as authorization to change source.
- The list-pane and login records cite UI law and current test surfaces; any UI-law or frontend-design lane should consider the two stale records before using them as architecture sources.
- The Lite record's full-mode statements are partly still true. Do not convert the P2 into “implement full mode”; the defect is stale Lite/delivery documentation.

## Tool receipts

- Full command results and cautions: [`commands.md`](commands.md).
- Native AST receipts: `ChatsWithCharacterPane` had 7 hits in 4 files; `WebWeave` had 8 hits in 5 files.
- The final document-format and RPG integration commands passed.

## Lane verdict

The lane is materially useful but not current enough to serve as a single design authority: 3 P2 stale architecture/behavior records and 1 P3 broken-path record. The gate-ignore and HOME records reconcile cleanly. Treat the list-pane, Lite, and login records as historical until their declared/current-state sections are repaired.
