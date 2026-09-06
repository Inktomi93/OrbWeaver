---
kind: review
status: active
updated: 2026-09-05
---

# Ordinary-waiver source migration and atomic cutover manifest

Parent program: [#1584](https://github.com/Inktomi93/orbweaver/issues/1584). This is a closed migration manifest, not a second runtime registry and not authority to edit the marker corpus piecemeal.

## Verdict

The premise in [exception-authority-census.md](exception-authority-census.md) survives with a two-site current-tree delta on `codex/1584-final-ordinary-waiver` at `2800f78b63e702fb98c117d2ce810c843901d25f`: the tracked authored `.ts`/`.tsx` source contains exactly **633** central `@orb-gate-ignore` comment-openers and exactly **158** openers across the 11 custom verifier grammars. The per-grammar vector remains `70, 2, 24, 20, 31, 0, 0, 8, 2, 1, 0` in the table order below. Relative to the prior 631-site census, `packages/server/src/domain/chat/memory/build/digests.ts:84,98` adds two central candidates. `.mts`, `.cts`, `.mjs`, `.cjs`, CSS, and all other non-code resources are excluded from this source universe by owner ruling; resource policy populations are separate.

The final parser recognizes exactly one vocabulary, with these carrier spellings:

```text
// @orb-waive <policy-id>(<position>): <reason>
/* @orb-waive <policy-id>(<position>): <reason> */
{/* @orb-waive <policy-id>(<position>): <reason> */}
```

It **does not support any legacy spelling**. `@orb-gate-ignore` and all 11 custom spellings are legacy. None is an alias. A legacy opener left at cutover is inert source and therefore a cutover blocker, not a compatibility case.

No source marker was changed for this report. Do not bulk-edit the 633 central candidates or 158 custom candidates before the policy owners and central authority engine land together.

The atomic source outcome is closed: **767 authored sites must be translated** to `@orb-waive` (all 633 `@orb-gate-ignore` sites plus 134 surviving custom-policy sites), **24 `@finding-overload-ok` sites must be deleted** with their obsolete policy, and the three empty custom grammars contribute no authored sites. All 767 translations are cutover-blocking until their final policy id and mandatory position are re-attested.

## Exact central grammar and carrier contract

The fresh `@orb-waive` vocabulary replaces the current one-home grammar at `tooling/src/verify/lib/gate-ignore.ts:13-33`; the old parser is migration evidence only.

- A marker is a real line or block comment whose own content begins with `@orb-waive` after comment-local whitespace. The three authored carriers above cover line comments, ordinary block comments, and JSX comment containers. A spelling inside a string, template, JSX text, regular expression, or later in explanatory prose is a mention, not a marker.
- `<policy-id>` is the exact loaded final policy id. It is not a family name and is not inferred from a filename alias.
- `(<position>)` is mandatory and nonempty. It names the exact reported policy position/token; empty or omitted parentheses are malformed. A position that matches no live finding is stale.
- `: <reason>` is mandatory and nonempty. The reason states why this occurrence is allowed and what ends the waiver. Missing colon/reason is malformed and suppresses nothing.
- One marker may consume exactly one occurrence. More than one match is over-broad and suppresses none, even when repeated findings share the same token.
- A node finding binds to leading comment trivia on the reported node or its ancestors up to and including the enclosing statement, then clears. It is block-scoped, never file-scoped (`gate-ignore.ts:181-228`).
- A file/resource finding binds only to the marker on the line immediately above the reported 1-based line. Blank or intervening lines break the binding. Findings at line 0 or 1 are unsuppressible because there is no preceding source line (`gate-ignore.ts:159-179`).
- Consumption is reconciled only after every selected ordinary owner completed its full effective population. Malformed, unused/dead-position, unknown-policy, and over-broad markers are authority findings. An incomplete, failed, empty, or unresolved owner withholds liveness rather than calling its markers stale.
- Hard and reviewed-grant policies never consult this parser. A source marker naming either authority suppresses nothing.

The final homes are `tooling/src/verify/contract/ordinary-waiver.ts` (parsed/authored shapes) and `tooling/src/verify/lib/ordinary-waiver.ts` (parser, carrier binding, consumption and reconciliation), with focused tests at `tests/tooling/verify/lib/ordinary-waiver.test.ts`. `tooling/src/verify/lib/gate-authority.ts` centrally instantiates the engine and consumes only its waiver identity/alarms; policy modules receive neither parser nor waiver table.

The full loader-derived policy roster now closes the adjacent reviewed-grant seam too. A reviewed grant naming no loaded policy is a tool error; a grant targeting a loaded hard or ordinary policy is a tool error; and a valid grant for a loaded but unselected reviewed-grant policy remains unjudged rather than being called stale, because that owner did not run. The real pass/planner tests pin all three outcomes. This uses the same roster already required to distinguish an unknown ordinary-waiver policy id from a known but unselected owner, so it adds no registry or second validation path.

## Closed 11-grammar disposition

“Centralize” means translate each live opener to the central spelling using the final policy id and the policy's reported position identity, then delete the gate-owned parser, local consumption/stale state, and local marker self-proofs. “Delete” means remove the obsolete vocabulary without translating it into a waiver. Zero-candidate grammars still lose their parser and proof corpus at atomic cutover.

| Legacy grammar | Openers | Exact current authored form and carrier | Parser/owner and proof seams | Cutover disposition |
| - | -: | - | - | - |
| `@foreign-id-ok` | 73 current (70 at census) | `// @foreign-id-ok(<positionName>): <reason>`; same line or a contiguous leading comment block, resolving to the first code line; position required | `brand-in-name-position.ts:78-81,164-204,257-266`; embedded `mustFlag`/`mustPass` at `:334-485` | **CENTRALIZED** as `@orb-waive brand-in-name-position(<reported token>): <reason>`; both regexes and both local marker arms are removed |
| `@sub-floor-ok` | 2 | `// @sub-floor-ok: <reason>` or JSX comment opener immediately above the `CollapsibleTrigger`; one line, one trigger | `sub-floor-disclosure.ts:22-25,55-81,116-139`; `comment-spans.ts`; embedded proofs `:162-215`; `tests/tooling/ui-audit/index.test.ts` | **CENTRALIZE** to `@orb-waive sub-floor-disclosure(<reported position>): <reason>`; remove local line table/reconciliation |
| `@finding-overload-ok` | 24 | `// @finding-overload-ok: <reason>` in leading trivia of the Finding literal/statement; no position vocabulary | `finding-overload-provenance.ts:37-39,159-267`; embedded proofs `:327-411` | **DELETE WITH OBSOLETE GATE**. Do not translate. The final `report.node`/`report.file` API makes raw-Finding provenance policing obsolete; delete the gate and all 24 markers together |
| `@owner-scope-ok` | 20 | `// @owner-scope-ok: <reason>` in the nearest enclosing function's leading comments or its variable statement | `owner-scoped-reads.ts:23-26,260-281`; shared `tenancy-read.ts:176-225`; embedded proofs `owner-scoped-reads.ts:294-450` | **CENTRALIZE** to `@orb-waive owner-scoped-reads(<reported token>): <reason>`; delete local marker regex/maps/stale sweep and tenancy marker helpers once all three owners migrate |
| `@owner-scope-write-ok` | 31 | `// @owner-scope-write-ok: <reason>` on the same function carrier as the read grammar | `owner-scoped-writes.ts:36-42,137-179`; shared `tenancy-read.ts:176-225`; embedded proofs `owner-scoped-writes.ts:191-405` | **CENTRALIZE** to `@orb-waive owner-scoped-writes(<reported token>): <reason>`; delete local marker machinery |
| `@owner-scope-upsert-ok` | 0 | `// @owner-scope-upsert-ok: <reason>` on the same function carrier | `owner-scoped-upserts.ts:30-35,150-184`; shared `tenancy-read.ts:176-225`; embedded proofs `owner-scoped-upserts.ts:196-420` | **DELETE EMPTY LEGACY GRAMMAR**. The converted ordinary policy still uses the central plane for any future waiver, but there is no source occurrence to translate |
| `@first-boot-only` | 0 | `// @first-boot-only: <reason>` or JSX comment opener immediately above one static-count `SkeletonRows` boundary | `query-boundary-reservation.ts:27-30,122-151,176-204`; `comment-spans.ts`; embedded proofs `:242-311` | **DELETE EMPTY LEGACY GRAMMAR**. The unreserved-boundary policy remains ordinary and gains only the central plane; no source occurrence migrates |
| `@swallowed-ok` | 8 | Verifier form: `// @swallowed-ok(<position>): <reason>` on the guarded statement line or contiguous comment block; position required. AST-lens form: `// @swallowed-ok: <reason>` on an exported declaration | `detached-work-traced.ts:69-74,362-395,507-542`; embedded proofs `:653-843`; separate lens parser `tooling/src/ast/ops/swallowed.ts:32-43,149-193`; `tests/tooling/ast/index.test.ts:597-604` | **CENTRALIZE the 8 verifier openers** to `@orb-waive detached-work-traced(<reported position>): <reason>`. The separate candidate-lens consumer must migrate explicitly or retire; it is not an alias |
| `@surface-focus-elsewhere` | 2 | `// @surface-focus-elsewhere(<owner>): <reason>` as a file-level comment opener; owner and reason required | `surface-a11y-focus.ts:39-49,55-98`; embedded proofs `:121-206`; `tests/tooling/ui-audit/index.test.ts` | **CENTRALIZE** to `@orb-waive surface-a11y-focus(<stable focus-owner position>): <reason>`; delete whole-file regex/parser and local stale arm |
| `@nullable-cmp-ok` | 1 | `// @nullable-cmp-ok[(Table.column)]: <reason>` in the enclosing block or contiguous leading comment block; position required when the block contains multiple inequalities | `nullable-column-inequality.ts:27-31,180-275,305`; embedded proofs `:329-463` | **CENTRALIZE** to `@orb-waive nullable-column-inequality(<Table.column token>): <reason>`; delete block-window parser and local reconciliation |
| `@over-art-plate-ok` | 0 | CSS block comment `/* @over-art-plate-ok[(selector subject)]: <reason> */` attached to one parsed CSS rule | `lib/over-art-plate.ts:15-18,131-216,311-319`; `over-art-plate-arm.ts`; embedded proofs plus `tests/tooling/verify/gates/over-art-plate-arm.int.test.ts` | **DELETE EMPTY LEGACY GRAMMAR**. The four live plate findings become `workItem: 626` warning debt; CSS gets no compatibility parser and no waiver translation |

The custom candidate file sets are closed as follows; these are the files an atomic source translation must diff, not permission to translate them early.

- `@foreign-id-ok` (18 files): `packages/contracts/src/plugin/{bridge,host-v1}.ts`; `packages/server/src/domain/plugin/contract/{errors,ops}.ts`; `packages/server/src/domain/plugin/substrate/bridge.ts`; `packages/server/src/entry/compose/automation-plugin.ts`; `packages/server/src/infra/providers/backends/agent-sdk/{log,runner,types}.ts`; `packages/server/src/infra/providers/backends/agent-sdk/session/{frames,store}.ts`; `packages/server/src/infra/providers/backends/local-light/{embed,image-embed,model-cache}.ts`; `packages/server/src/infra/providers/contract/errors.ts`; `tests/server/domain/plugin/substrate/bridge.test.ts`; `tests/server/infra/plugin-host/membrane.test.ts`; `tests/server/infra/providers/backends/agent-sdk/session/frames.test.ts`.
- `@sub-floor-ok` (2 files): `packages/client/src/features/rpg/components/{rpg-beat-row,turn-tool-calls-disclosure}.tsx`.
- `@finding-overload-ok` (14 files): `tooling/src/verify/gates/{baseui-derives-not-respells,css-var-defined,d-citation-integrity,dangling-doc-cite,gate-ignore-inventory,integer-line-boxes,pd-citation-integrity,query-boundary-reservation,rest-transform-grid,schema-banned-shapes,seed-theme-ink-contrast,sub-floor-disclosure,tooling-shared-plumbing}.ts`; `tooling/src/verify/lib/css-family-census.ts`.
- `@owner-scope-ok` (13 files): `packages/server/src/domain/assets/persistence/queries.ts`; `domain/automation/persistence/{canon-reads,rules}.ts`; `domain/character/persistence/{card,queries}.ts`; `domain/chat/persistence/{background-write,identity}.ts`; `domain/databank/persistence/queries.ts`; `domain/export/verbs/{export-chat-bundle,export-chat}.ts`; `domain/workloads/persistence/{queries,schedule-queries}.ts`; `foundation/observability/debug/inspect/config.ts` (all paths after the first are under `packages/server/src/`).
- `@owner-scope-write-ok` (8 files under `packages/server/src`): `domain/automation/persistence/rules.ts`; `domain/credentials/persistence/queries.ts`; `domain/databank/ingest/index.ts`; `domain/discovery/themes/generate.ts`; `domain/plugin/persistence/plugins.ts`; `domain/workloads/persistence/{queries,schedule-queries}.ts`; `domain/world-info/persistence/import-write.ts`.
- `@swallowed-ok` (6 files): `packages/db/src/schema/relations.ts`; `packages/server/src/domain/automation/substrate/serial-lanes.ts`; `packages/server/src/domain/chat/engine/engine.ts`; `packages/server/src/infra/providers/backends/local-light/model-cache.ts`; `packages/server/src/transport/rate-limit.ts`; `tests/tooling/ast/index.test.ts`.
- `@surface-focus-elsewhere` (2 files): `packages/client/src/features/chat/surfaces/new-chat-picker-surface.tsx`; `packages/client/src/features/discovery/surfaces/corpus-home-surface.tsx`.
- `@nullable-cmp-ok` (1 file): `packages/server/src/domain/discovery/persistence/embed-store-reads.ts`.
- `@owner-scope-upsert-ok`, `@first-boot-only`, and `@over-art-plate-ok`: no live opener files.

## Remaining source and cutover seams

All rows below are required in the same atomic cutover. A source/parser deletion without its consumer/test half is incomplete.

| Seam | Current source | Required cutover action |
| - | - | - |
| Central legacy parser | `tooling/src/verify/lib/gate-ignore.ts` | Replace with `contract/ordinary-waiver.ts` + `lib/ordinary-waiver.ts` and the fresh `@orb-waive <policy-id>(<position>): <reason>` syntax; recognize neither old grammar nor any legacy alias |
| Legacy marker shape | `tooling/src/verify/contract/pass.ts:140-151` (`GateIgnoreMarker`) | Move/replace with the final ordinary-waiver contract; remove the legacy pass contract export |
| Dispatcher suppression and global accounting | `tooling/src/verify/lib/pass.ts:19,192-260,367` | Delete `findGateIgnore*`, `gateIgnoreUses`, finalize-order tripwire, and `markerImmune` branching when the old pass retires; central post-processing owns lookup/consumption/liveness after owners complete |
| Public exports | `tooling/src/verify/index.ts:37,97` | Stop exporting legacy `GateIgnoreMarker`, `findGateIgnoreMarkers`, and `parseGateIgnoreMarker`; export only the intended final parser contract if it is genuinely public |
| Legacy descriptor door | `tooling/src/verify/contract/gate.ts:181-194` (`markerImmune`) | Delete with `GateDescriptor`; authority is required data on `GatePolicy`, so hard policies have no parser door by construction |
| Legacy auditor | `tooling/src/verify/gates/gate-ignore-inventory.ts` | **RETIRE/DELETE at cutover**, after its malformed/unknown/stale/dead-position/over-broad/finalize-order corpus is transplanted into `ordinary-waiver.test.ts`. Do not delete the behavior corpus merely because the policy module is obsolete |
| Raw-Finding provenance policy | `tooling/src/verify/gates/finding-overload-provenance.ts` | **RETIRE/DELETE at cutover**, remove all 24 `@finding-overload-ok` source markers, and preserve its node-vs-file provenance cases as final report-sink/authority tests. Do not translate the markers and do not discard the counterexamples |
| Duplicate central parser | `tooling/src/verify/gates/no-legacy-react-api.ts:31-68,145-167` | Delete `MARKER_TEXT`, `MARKER_RE`, `markerSites`, `usedMarkerSites`, `guardingMarkerLines`, and its local stale arm; its ordinary converted policy reports stable tokens and relies on the central parser |
| Three tenancy parsers | `owner-scoped-{reads,writes,upserts}.ts` plus `lib/tenancy-read.ts:176-225` | Delete all three regexes, marked/used maps, final stale loops, and `markedFunctions`/`markerKeyFor` after the last policy converts; keep unrelated table/predicate readers until their shared-query migration owns them |
| Line-table parsers | `sub-floor-disclosure.ts` and `query-boundary-reservation.ts`, both using `comment-spans.ts` | Delete marker-specific line tables/judges. Keep `comment-spans.ts` for code/comment facts used by other policies; it is not itself waiver authority |
| Named block resolvers | `brand-in-name-position.ts`, `detached-work-traced.ts`, `nullable-column-inequality.ts` | Delete local block traversal, parse, consumption, malformed/stale/ambiguous arms after translating live source markers |
| File-level focus parser | `surface-a11y-focus.ts` | Delete its whole-file marker opener/well-formed regexes and stale logic; preserve the focus detector and its comment-safe posture |
| CSS marker parser | `lib/over-art-plate.ts` + `over-art-plate-arm.ts` | Delete marker extraction/judgment and its empty grammar proofs; retain CSS comment blanking and plate detection. Convert the four findings to warning debt, not waivers |
| Caught-failure census generator | `tooling/src/verify/ops/gen/caught-failure-population.ts:15,34-57` | Stop importing/parsing legacy central markers; consume final authority output/identity or retire this coupling with its owning migration. A second parser is forbidden |
| Legacy central tests | `tests/tooling/verify/lib/gate-ignore.test.ts`; `tests/tooling/gate-ignore-grammar.int.test.ts`; `gate-ignore-inventory.ts` self-proofs; `tests/tooling/check-gates.int.test.ts` fixtures | Transplant into `ordinary-waiver.test.ts`/final policy conformance: unmarked, valid mandatory-position exact match on line/block/JSX carriers, omitted/empty/wrong/dead position, missing reason, mention fence, node block scope, file-line adjacency, line 0/1, unknown policy, stale, over-broad (including duplicate same-token consumption), hard/reviewed refusal, incomplete-owner withholding, and deterministic order |
| Custom grammar proofs | Each owner module's embedded `mustFlag`/`mustPass`; `tests/tooling/verify/gates/over-art-plate-arm.int.test.ts`; `tests/tooling/ast/index.test.ts`; `tests/tooling/ui-audit/index.test.ts` | Convert policy behavior proofs to the central marker. Delete only tests whose policy/grammar is obsolete; preserve the behavior as central authority/report-sink cases where it guards a class rather than a filename |

`gate-ignore-inventory` and `finding-overload-provenance` are therefore **retired policy modules, not discarded proof populations**. Their old module-local self-proofs cease to be authoritative only after the central tests exercise the same behaviors through the final policy dispatcher.

## Explicit non-migrations

- `tooling/src/verify/gates/suppressions.ts` and `no-blanket-suppression.ts` remain distinct resource facts. Their Biome, ESLint, and TypeScript directives are native-tool syntax, not Orb ordinary waivers. `suppressions.ts:22-35,300-390` owns directive parsing across leading/trailing/JSX trivia; `no-blanket-suppression.ts` consumes the same reader and `comment-spans.ts` carriers. Do not route those 572 parsed sites through `ordinary-waiver.ts`.
- `tooling/src/verify/lib/comment-spans.ts` remains the one comment/trivia substrate for source and resource readers. It may be used underneath the central parser, but it must not own policy ids, waiver consumption, or liveness.
- `tooling/src/ast/ops/swallowed.ts` is an on-demand candidate-lens consumer outside the Orb gate runtime. Its `@swallowed-ok: <reason>` vocabulary is not made an alias for the final gate parser. Resolve it explicitly as a lens migration/retention decision; otherwise translating the shared six source files can silently change the lens verdict.
- Push-tier `@public` markers remain outside this migration as recorded by the exception census. They are hard semantic facts for `orphan-export-ratchet`, not ordinary Orb waivers.
- All 633 existing `@orb-gate-ignore` opener candidates require authored translation to `@orb-waive` and re-attestation against the converted owner. None retains its text, and the old parser is absent. Do not mechanically assume a legacy gate filename equals a final split policy id; every translated site needs the final policy id and mandatory reported position.

## Atomic cutover checklist

1. Freeze the marker candidate manifest and converted policy roster on one SHA. Refuse if the counts or candidate file sets differ from this report without a reviewed delta.
2. Land the central parser/reconciler and full transplanted proof corpus first in the cutover diff, but do not expose it through a production adapter.
3. Convert every ordinary policy to emit stable policy id and position token. Split legacy multi-authority modules before translating their markers.
4. Translate all **767** surviving sites: the 134 live custom markers that survive (`158 - 24 @finding-overload-ok`; the other delete grammars are empty) plus all 633 `@orb-gate-ignore` sites. Delete the 24 provenance markers. Re-attest every translation against final policy id and mandatory position; no old spelling is accepted.
5. Delete every custom parser/local consumption/stale arm listed above. A literal sweep for all 11 legacy names must return zero in authored comments and parser code; fixture/doc mentions may remain only when explicitly testing rejection of legacy spellings.
6. Delete the legacy central parser/pass accounting, `markerImmune`, `gate-ignore-inventory`, and `finding-overload-provenance` only after final authority owns their behavior. Remove their loader/catalog/check-gates coupled sites in the same change.
7. Run final conformance plus the real policy pass over the full effective population. Reconciliation must run after every owner and must withhold on failed/incomplete/empty/unresolved owners.
8. Run the frozen-corpus old/new differential. Expected deltas are only the classified grammar translations/deletions and deliberate policy-id/token changes; any other finding/population delta blocks cutover.
9. Prove no compatibility door: plant each of the 11 legacy spellings above a live ordinary finding and require the finding to remain effective while the legacy opener is reported/rejected as unsupported source.

## Re-attestation receipts

### Closed authored-site manifest (791 sites)

Every current legacy comment-opener in the tracked authored `.ts`/`.tsx` universe is named below as `path:line`. Cutover translates 767 and deletes the 24 provenance sites as classified above.

- `tests/client/lib/_ct-stories.tsx:16`

- `tooling/src/motion-audit/lib/verdicts.ts:119`

- `packages/server/src/transport/rate-limit.ts:86`

- `tooling/src/motion-audit/ops/trace.ts:36`

- `tooling/src/motion-audit/ops/trace.ts:54`

- `tooling/src/motion-audit/ops/drive.ts:47`

- `packages/server/src/transport/trpc/subscriptions.ts:31`

- `packages/kit/src/macro/evaluator.ts:111`

- `packages/kit/src/macro/evaluator.ts:164`

- `packages/kit/src/macro/registry.ts:351`

- `packages/kit/src/png-card-chunk/index.ts:213`

- `packages/kit/src/png-card-chunk/index.ts:344`

- `packages/kit/src/png-card-chunk/index.ts:391`

- `packages/kit/src/png-card-chunk/index.ts:395`

- `packages/kit/src/png-card-chunk/index.ts:401`

- `tooling/src/snap/lib/run-bundle-files.ts:78`

- `tooling/src/snap/lib/run-bundle-files.ts:117`

- `tooling/src/snap/lib/rate-posture.ts:41`

- `tooling/src/snap/lib/run-finding-browser.ts:285`

- `tooling/src/snap/lib/run-finding-browser.ts:354`

- `packages/kit/src/regex/index.ts:372`

- `packages/server/src/transport/trpc/routers/connection.ts:54`

- `tooling/src/verify/lib/grant-liveness.ts:215`

- `tooling/src/verify/lib/grant-liveness.ts:235`

- `packages/kit/src/cel/index.ts:112`

- `packages/kit/src/time/index.ts:48`

- `packages/kit/src/time/index.ts:55`

- `packages/kit/src/time/index.ts:68`

- `packages/kit/src/time/index.ts:138`

- `packages/kit/src/time/index.ts:161`

- `packages/server/src/transport/trpc/routers/tag.ts:65`

- `packages/server/src/transport/trpc/routers/tag.ts:85`

- `packages/server/src/transport/trpc/routers/tag.ts:103`

- `tooling/src/snap/lib/run-finding-analyzers.ts:55`

- `tooling/src/snap/lib/run-finding-analyzers.ts:77`

- `tooling/src/snap/lib/run-finding-analyzers.ts:116`

- `tooling/src/verify/lib/history.ts:45`

- `tooling/src/verify/lib/history.ts:57`

- `tooling/src/verify/lib/pass.ts:277`

- `tooling/src/snap/lib/har-redaction.ts:134`

- `tooling/src/snap/lib/har-redaction.ts:245`

- `tooling/src/snap/lib/har-redaction.ts:340`

- `tooling/src/snap/lib/har-redaction.ts:427`

- `packages/kit/src/json-schema/lift.ts:124`

- `tooling/src/snap/lib/cascade-source.ts:40`

- `packages/kit/src/world-info/index.ts:186`

- `packages/kit/src/world-info/index.ts:264`

- `tooling/src/snap/lib/heap-devtools.ts:220`

- `packages/kit/src/ids/index.ts:316`

- `packages/server/src/transport/trpc/router.ts:59`

- `packages/server/src/transport/trpc/router.ts:98`

- `tooling/src/snap/lib/session-wire.ts:25`

- `tooling/src/snap/lib/react-profile-trace.ts:92`

- `tooling/src/snap/lib/react-profile-trace.ts:123`

- `tooling/src/snap/lib/react-profile-trace.ts:154`

- `tooling/src/snap/lib/browser-evidence-redaction.ts:120`

- `tooling/src/snap/lib/browser-evidence-redaction.ts:216`

- `tooling/src/snap/lib/browser-evidence-redaction.ts:248`

- `tooling/src/snap/lib/browser-evidence-redaction.ts:266`

- `tooling/src/snap/lib/browser-evidence-redaction.ts:289`

- `tooling/src/verify/lib/css-family-census.ts:235`

- `packages/server/src/transport/trpc/stream/socket.ts:97`

- `tooling/src/snap/ops/session-admin.ts:41`

- `tooling/src/snap/ops/session-admin.ts:125`

- `tooling/src/snap/ops/session-client.ts:109`

- `tooling/src/snap/ops/session-client.ts:120`

- `tooling/src/snap/ops/session-client.ts:226`

- `tooling/src/verify/lib/ct-runner-lock.ts:47`

- `tooling/src/verify/lib/ct-runner-lock.ts:73`

- `tooling/src/verify/lib/ct-runner-lock.ts:115`

- `tooling/src/snap/ops/session-registry.ts:131`

- `tooling/src/snap/ops/session-registry.ts:148`

- `tooling/src/verify/lib/program-routing.ts:300`

- `tooling/src/model-ab/lib/verify.ts:100`

- `tooling/src/model-ab/lib/verify.ts:110`

- `tooling/src/verify/ops/db-baseline-parity.ts:118`

- `tooling/src/verify/ops/db-baseline-parity.ts:148`

- `tooling/src/verify/ops/orphan-export-ratchet.ts:245`

- `tooling/src/verify/ops/ct-unfed-ratchet.ts:115`

- `tooling/src/model-ab/ops/probe.ts:28`

- `tooling/src/model-ab/ops/serve.ts:77`

- `tooling/src/model-ab/ops/serve.ts:140`

- `tooling/src/wire-tap/ops/trpc.ts:85`

- `tooling/src/verify/ops/boot-chunk-ratchet.ts:163`

- `tooling/src/verify/ops/boot-chunk-ratchet.ts:180`

- `tooling/src/verify/ops/boot-chunk-ratchet.ts:208`

- `tooling/src/verify/ops/debt.ts:173`

- `tooling/src/snap/ops/session-daemon.ts:193`

- `tooling/src/snap/ops/session-daemon.ts:220`

- `tooling/src/snap/ops/materialize-devtools.ts:76`

- `tooling/src/snap/ops/materialize-devtools.ts:148`

- `tooling/src/snap/ops/materialize-devtools.ts:150`

- `tooling/src/snap/ops/materialize-devtools.ts:190`

- `tooling/src/snap/ops/stage-source.ts:105`

- `packages/server/src/entry/boot/seed-assets/index.ts:27`

- `packages/server/src/entry/boot/seed-assets/index.ts:69`

- `packages/server/src/entry/boot/seed-assets/index.ts:96`

- `packages/server/src/entry/boot/seed-assets/index.ts:135`

- `packages/server/src/entry/boot/seed-assets/index.ts:155`

- `tooling/src/codemod/lib/diagnostics.ts:77`

- `tooling/src/snap/ops/guards.ts:109`

- `tooling/src/snap/ops/stage-status.ts:192`

- `tooling/src/snap/ops/session-call-watchdog.ts:30`

- `tooling/src/snap/ops/session-call-watchdog.ts:32`

- `tooling/src/snap/ops/session-call-watchdog.ts:49`

- `tooling/src/snap/ops/session-call-watchdog.ts:69`

- `tooling/src/snap/ops/matrix.ts:377`

- `tooling/src/snap/ops/matrix.ts:385`

- `tooling/src/snap/ops/heap-capture.ts:47`

- `tooling/src/snap/ops/heap-capture.ts:75`

- `tooling/src/snap/ops/heap-capture.ts:81`

- `tooling/src/snap/ops/heap-capture.ts:89`

- `tooling/src/snap/ops/watch.ts:22`

- `tooling/src/snap/ops/design-audit-walk.ts:212`

- `tooling/src/snap/ops/design-audit-walk.ts:223`

- `tooling/src/snap/ops/run-report.ts:136`

- `tooling/src/snap/ops/run-report.ts:152`

- `tooling/src/snap/ops/run-report.ts:175`

- `tooling/src/snap/ops/fixture.ts:71`

- `tooling/src/snap/ops/fixture.ts:90`

- `packages/server/src/entry/http/import-tree.ts:302`

- `tooling/src/ast/cli.ts:123`

- `tooling/src/snap/ops/run-report-render.ts:156`

- `packages/server/src/entry/http/plugin-ui.ts:68`

- `tooling/src/snap/ops/stage-marker.ts:134`

- `tooling/src/snap/ops/stage-marker.ts:156`

- `tooling/src/snap/ops/stage-marker.ts:261`

- `tooling/src/snap/ops/stage-marker.ts:296`

- `tooling/src/snap/ops/session-daemon-request.ts:98`

- `tooling/src/snap/ops/session-daemon-request.ts:149`

- `tooling/src/snap/ops/drive.ts:40`

- `tooling/src/snap/ops/drive.ts:47`

- `tooling/src/snap/ops/drive.ts:210`

- `tooling/src/snap/ops/drive.ts:221`

- `tooling/src/snap/ops/drive.ts:239`

- `tooling/src/snap/ops/drive.ts:245`

- `tooling/src/snap/ops/drive.ts:247`

- `tooling/src/snap/ops/drive.ts:376`

- `tooling/src/snap/ops/arms/heap.ts:118`

- `tooling/src/snap/ops/arms/heap.ts:272`

- `tooling/src/snap/ops/arms/heap.ts:280`

- `tooling/src/snap/ops/arms/heap.ts:288`

- `tooling/src/snap/ops/arms/heap.ts:319`

- `tooling/src/snap/ops/arms/heap.ts:334`

- `tooling/src/snap/ops/arms/heap.ts:349`

- `tooling/src/snap/ops/arms/contrast.ts:75`

- `tooling/src/snap/ops/arms/assert.ts:115`

- `tooling/src/snap/ops/arms/assert.ts:129`

- `tooling/src/verify/gates/no-nul-bytes-in-source.ts:40`

- `tooling/src/snap/ops/arms/eval.ts:27`

- `tooling/src/verify/gates/gate-ignore-inventory.ts:123`

- `tooling/src/verify/gates/gate-ignore-inventory.ts:128`

- `tooling/src/snap/ops/arms/cascade.ts:157`

- `tooling/src/snap/ops/arms/shot.ts:52`

- `tooling/src/snap/ops/arms/lighthouse.ts:99`

- `tooling/src/verify/gates/schema-banned-shapes.ts:212`

- `tooling/src/verify/gates/schema-banned-shapes.ts:238`

- `tooling/src/verify/gates/schema-banned-shapes.ts:257`

- `tooling/src/snap/ops/arms/boot-trace.ts:61`

- `tooling/src/snap/ops/arms/boot-trace.ts:85`

- `tooling/src/snap/ops/arms/boot-trace.ts:105`

- `tooling/src/snap/ops/arms/profile.ts:119`

- `tooling/src/snap/ops/arms/profile.ts:140`

- `tooling/src/snap/ops/arms/profile.ts:147`

- `tooling/src/snap/ops/arms/perf.ts:36`

- `tooling/src/snap/ops/arms/cpu-profile.ts:80`

- `tooling/src/snap/ops/arms/cpu-profile.ts:100`

- `tooling/src/snap/ops/arms/cpu-profile.ts:116`

- `tooling/src/snap/ops/arms/motion.ts:84`

- `tooling/src/snap/ops/arms/motion.ts:134`

- `tooling/src/verify/gates/d-citation-integrity.ts:86`

- `tooling/src/snap/ops/arms/map.ts:27`

- `tooling/src/snap/ops/arms/map.ts:33`

- `tooling/src/snap/ops/arms/map.ts:38`

- `tooling/src/snap/ops/arms/map.ts:90`

- `tooling/src/snap/ops/arms/map.ts:102`

- `tooling/src/snap/ops/arms/map.ts:109`

- `tooling/src/snap/ops/filmstrip-capture.ts:226`

- `tooling/src/snap/ops/capture.ts:82`

- `tooling/src/snap/ops/capture.ts:144`

- `tooling/src/verify/gates/seed-theme-ink-contrast.ts:133`

- `tooling/src/snap/ops/request-ring.ts:271`

- `tooling/src/snap/ops/request-ring.ts:285`

- `tooling/src/verify/gates/depcruise-grant-liveness.ts:180`

- `tooling/src/verify/gates/tooling-shared-plumbing.ts:391`

- `tooling/src/verify/gates/tooling-shared-plumbing.ts:404`

- `tooling/src/verify/gates/tooling-shared-plumbing.ts:459`

- `tooling/src/verify/gates/tooling-shared-plumbing.ts:472`

- `tooling/src/verify/gates/tooling-shared-plumbing.ts:484`

- `tooling/src/_shared/run-retention.ts:25`

- `tooling/src/_shared/run-retention.ts:74`

- `tooling/src/_shared/run-retention.ts:94`

- `tooling/src/_shared/appearance.ts:83`

- `tooling/src/_shared/appearance.ts:93`

- `tooling/src/_shared/appearance.ts:136`

- `tooling/src/_shared/appearance.ts:207`

- `tooling/src/_shared/appearance.ts:258`

- `tooling/src/_shared/appearance.ts:342`

- `tooling/src/_shared/proc.ts:25`

- `tooling/src/_shared/proc.ts:258`

- `tooling/src/_shared/browser-request-url.ts:11`

- `tooling/src/verify/gates/integer-line-boxes.ts:115`

- `tooling/src/verify/gates/integer-line-boxes.ts:284`

- `tooling/src/verify/gates/integer-line-boxes.ts:295`

- `tooling/src/verify/gates/integer-line-boxes.ts:304`

- `tooling/src/_shared/browser.ts:91`

- `tooling/src/_shared/browser.ts:219`

- `tooling/src/_shared/rated-theme-fixture.ts:126`

- `tooling/src/_shared/panel-flags.ts:45`

- `tooling/src/verify/gates/query-boundary-reservation.ts:109`

- `tooling/src/verify/gates/query-boundary-reservation.ts:139`

- `tooling/src/verify/gates/pd-citation-integrity.ts:59`

- `tooling/src/verify/gates/dangling-doc-cite.ts:225`

- `tooling/src/verify/gates/rest-transform-grid.ts:336`

- `tooling/src/verify/gates/sub-floor-disclosure.ts:76`

- `tooling/src/verify/gates/css-var-defined.ts:58`

- `tooling/src/verify/gates/tsconfig-routing-parity.ts:54`

- `tooling/src/verify/gates/devtools-frontend-assets.ts:100`

- `tooling/src/verify/gates/monotonic-tests.ts:109`

- `tooling/src/verify/gates/monotonic-tests.ts:115`

- `tooling/src/verify/gates/baseui-derives-not-respells.ts:209`

- `tooling/src/doc-catalog/ops/tree.ts:67`

- `tooling/src/doc-catalog/ops/tree.ts:76`

- `packages/server/src/entry/import/run-profile-import.ts:114`

- `tooling/src/verify/gates/bus-payload-allowlist.ts:424`

- `packages/server/src/entry/import/run-profile-dir-import.ts:462`

- `packages/server/src/entry/import/run-profile-dir-import.ts:768`

- `packages/server/src/entry/import/run-profile-dir-import.ts:904`

- `packages/server/src/entry/import/run-bundle-import.ts:122`

- `tooling/src/verify/gates/ratchet-row-integrity.ts:47`

- `packages/server/src/foundation/observability/debug/wire-capture.ts:263`

- `packages/server/src/foundation/observability/debug/wire-capture.ts:271`

- `packages/server/src/foundation/observability/debug/wire-capture.ts:278`

- `packages/server/src/foundation/observability/debug/routes.ts:88`

- `packages/server/src/foundation/observability/debug/routes.ts:281`

- `packages/server/src/entry/compose/automation-plugin.ts:161`

- `packages/server/src/entry/compose/automation-plugin.ts:169`

- `packages/server/src/entry/compose/automation-plugin.ts:173`

- `packages/server/src/entry/compose/automation-plugin.ts:530`

- `packages/server/src/entry/compose/automation-plugin.ts:549`

- `packages/server/src/entry/compose/automation-plugin.ts:564`

- `packages/server/src/entry/compose/automation-plugin.ts:715`

- `packages/server/src/foundation/observability/debug/log-ring-read.ts:51`

- `packages/server/src/foundation/observability/debug/bug-report.ts:73`

- `packages/server/src/entry/compose/services.ts:439`

- `packages/server/src/entry/compose/emit-chat-changed.ts:21`

- `packages/server/src/entry/compose/chat.ts:727`

- `packages/server/src/entry/compose/chat.ts:806`

- `packages/server/src/entry/compose/chat.ts:1017`

- `packages/server/src/entry/compose/chat.ts:1043`

- `packages/server/src/entry/compose/chat.ts:1083`

- `packages/server/src/foundation/observability/debug/inspect/config.ts:312`

- `packages/server/src/foundation/env/posture.ts:13`

- `packages/server/src/foundation/env/diagnostics.ts:95`

- `packages/server/src/entry/compose/rpg.ts:786`

- `packages/server/src/entry/compose/rpg.ts:1027`

- `packages/server/src/entry/compose/rpg.ts:1244`

- `packages/server/src/foundation/env/index.ts:177`

- `tooling/src/mutation-probe/ops/probe.ts:44`

- `packages/server/src/infra/extraction/loaders/pdf.ts:55`

- `tests/server/entry/lifecycle.test.ts:23`

- `packages/server/src/infra/auth/password.ts:101`

- `tooling/src/cpu-profile/ops/boot-trace.ts:85`

- `tooling/src/cpu-profile/ops/boot-trace.ts:93`

- `packages/server/src/infra/auth/config.ts:37`

- `packages/db/src/schema/relations.ts:20`

- `packages/server/src/domain/tool-use/verbs/execute-tool-calls.ts:39`

- `packages/server/src/entry/http/auth-routes.ts:256`

- `packages/server/src/domain/tool-use/verbs/register.ts:50`

- `tooling/src/render-trace/ops/fire.ts:92`

- `tooling/src/render-trace/ops/fire.ts:206`

- `tests/server/entry/compose/chat.int.test.ts:122`

- `tests/server/entry/compose/chat.int.test.ts:130`

- `packages/server/src/domain/admin/guard.ts:76`

- `packages/server/src/entry/http/card-frame.ts:145`

- `packages/server/src/entry/http/card-frame.ts:192`

- `packages/server/src/infra/providers/backends/agent-sdk/env.ts:228`

- `packages/server/src/entry/http/plugin-frame.ts:138`

- `packages/server/src/entry/http/plugin-frame.ts:150`

- `packages/server/src/infra/providers/backends/agent-sdk/runner.ts:232`

- `packages/server/src/infra/providers/backends/agent-sdk/runner.ts:364`

- `tooling/src/stack/lib/dev-process-identity.ts:19`

- `tooling/src/stack/lib/dev-process-identity.ts:46`

- `packages/server/src/entry/http/blob.ts:118`

- `packages/server/src/infra/providers/backends/agent-sdk/terminal-tools.ts:72`

- `tooling/src/stack/lib/port-health.ts:20`

- `packages/server/src/infra/providers/backends/agent-sdk/agent-runner.ts:130`

- `tooling/src/stack/lib/prod-record.ts:14`

- `packages/server/src/infra/providers/backends/agent-sdk/log.ts:19`

- `packages/server/src/infra/providers/backends/agent-sdk/log.ts:47`

- `tooling/src/stack/lib/spawn-lock.ts:90`

- `tooling/src/stack/lib/spawn-lock.ts:108`

- `tooling/src/stack/lib/spawn-lock.ts:121`

- `packages/server/src/infra/providers/backends/agent-sdk/types.ts:55`

- `packages/server/src/entry/auth/seam.ts:123`

- `packages/server/src/infra/providers/backends/agent-sdk/verify-auth.ts:127`

- `packages/server/src/infra/providers/backends/agent-sdk/host-token.ts:65`

- `packages/server/src/infra/providers/backends/agent-sdk/host-token.ts:71`

- `tooling/src/_shared/entrypoint.ts:14`

- `tooling/src/stack/ops/served-probe.ts:57`

- `tooling/src/stack/ops/served-probe.ts:67`

- `tooling/src/_shared/nav.ts:119`

- `tooling/src/stack/ops/dev-identity-entry.ts:73`

- `packages/server/src/infra/providers/backends/agent-sdk/session/store.ts:51`

- `packages/server/src/infra/providers/backends/agent-sdk/session/store.ts:194`

- `packages/server/src/infra/providers/backends/agent-sdk/session/store.ts:277`

- `tooling/src/_shared/artifacts.ts:100`

- `tooling/src/_shared/artifacts.ts:155`

- `tooling/src/_shared/artifacts.ts:164`

- `tooling/src/_shared/artifacts.ts:215`

- `tooling/src/_shared/artifacts.ts:222`

- `tooling/src/_shared/artifacts.ts:246`

- `tooling/src/_shared/artifacts.ts:282`

- `tooling/src/_shared/artifacts.ts:294`

- `tooling/src/_shared/artifacts.ts:315`

- `tooling/src/_shared/artifacts.ts:333`

- `tooling/src/stack/ops/prod-state.ts:76`

- `tooling/src/stack/ops/prod-state.ts:105`

- `packages/server/src/infra/providers/backends/agent-sdk/session/frames.ts:56`

- `packages/server/src/infra/providers/backends/agent-sdk/session/frames.ts:96`

- `tooling/src/_shared/browser-capture.ts:188`

- `tooling/src/_shared/browser-diagnostics.ts:315`

- `tooling/src/stack/ops/prod-support.ts:79`

- `tooling/src/stack/ops/prod-support.ts:112`

- `tooling/src/stack/ops/prod-support.ts:127`

- `tooling/src/stack/ops/prod-support.ts:136`

- `tooling/src/stack/ops/prod-down.ts:52`

- `tooling/src/stack/ops/prod-down.ts:68`

- `tooling/src/_shared/scoped-run-paths.ts:106`

- `tooling/src/_shared/appearance-flags.ts:45`

- `tooling/src/stack/ops/engines-ctl.ts:75`

- `packages/server/src/domain/settings/context.ts:17`

- `packages/server/src/domain/settings/context.ts:21`

- `packages/server/src/infra/providers/backends/custom-byo/runners/chat.ts:451`

- `packages/server/src/infra/providers/backends/custom-byo/inspect.ts:116`

- `tooling/src/_shared/run-tool.ts:46`

- `tooling/src/_shared/debugging-endpoint.ts:42`

- `tooling/src/_shared/devtools-runtime.ts:391`

- `tooling/src/_shared/devtools-runtime.ts:397`

- `tooling/src/_shared/devtools-runtime.ts:411`

- `tooling/src/_shared/devtools-runtime.ts:414`

- `tooling/src/_shared/upload.ts:139`

- `tooling/src/_shared/upload.ts:204`

- `packages/server/src/domain/settings/verbs/app-settings.ts:80`

- `packages/server/src/domain/settings/verbs/app-settings.ts:87`

- `packages/server/src/infra/providers/backends/openrouter/runners/chat/responses.ts:497`

- `tooling/src/_shared/browser-network.ts:136`

- `tooling/src/_shared/browser-network.ts:162`

- `tooling/src/_shared/browser-network.ts:214`

- `packages/server/src/domain/settings/verbs/add-external-background.ts:17`

- `packages/server/src/infra/providers/backends/openrouter/runners/chat/chat-completions.ts:332`

- `packages/server/src/infra/providers/backends/openrouter/probe.ts:28`

- `packages/server/src/infra/providers/backends/kit/error-classify.ts:141`

- `tooling/src/ui-audit/ops/hover.ts:335`

- `packages/server/src/domain/credentials/persistence/queries.ts:65`

- `packages/server/src/infra/providers/backends/kit/retry.ts:116`

- `packages/server/src/domain/credentials/verbs/test-health.ts:119`

- `packages/server/src/infra/providers/backends/local-light/image-embed.ts:43`

- `packages/server/src/infra/providers/backends/local-light/image-embed.ts:62`

- `packages/server/src/infra/providers/backends/local-light/image-embed.ts:91`

- `packages/server/src/infra/providers/backends/local-light/embed.ts:47`

- `packages/server/src/infra/providers/backends/local-light/model-cache.ts:43`

- `packages/server/src/infra/providers/backends/local-light/model-cache.ts:45`

- `packages/server/src/infra/providers/backends/local-light/model-cache.ts:47`

- `packages/server/src/infra/providers/backends/local-light/model-cache.ts:49`

- `packages/server/src/infra/providers/backends/local-light/model-cache.ts:55`

- `packages/server/src/infra/providers/backends/local-light/model-cache.ts:104`

- `packages/server/src/infra/providers/backends/local-light/model-cache.ts:213`

- `packages/server/src/infra/providers/backends/local-light/model-cache.ts:226`

- `packages/server/src/infra/providers/backends/local-light/model-cache.ts:327`

- `packages/server/src/domain/discovery/themes/generate.ts:240`

- `tooling/src/review-mirror/ops/generate.ts:100`

- `packages/db/src/client/index.ts:171`

- `packages/db/src/client/index.ts:682`

- `tooling/src/bug-reports/lib/read.ts:154`

- `tooling/src/bug-reports/lib/read.ts:166`

- `tooling/src/bug-reports/lib/read.ts:182`

- `packages/client/src/lib/probe-mode.ts:12`

- `packages/client/src/lib/bug-report-capture.ts:204`

- `packages/client/src/lib/app-ready-signal.ts:92`

- `packages/client/src/lib/app-ready-signal.ts:97`

- `packages/client/src/lib/app-ready-signal.ts:128`

- `packages/client/src/lib/trpc-devlog.ts:58`

- `packages/client/src/data/use-session-recovery.ts:90`

- `packages/client/src/data/http-error.ts:10`

- `packages/client/src/data/stale-session.ts:170`

- `packages/client/src/data/stale-session.ts:187`

- `packages/client/src/data/stale-session.ts:195`

- `packages/client/src/data/session-freshness.ts:78`

- `packages/client/src/data/bus/room-registry.ts:248`

- `packages/client/src/data/bus/room-registry.ts:293`

- `packages/client/src/data/use-card-frame.ts:60`

- `packages/client/src/data/use-card-frame.ts:102`

- `packages/client/src/data/auth-bootstrap.ts:70`

- `packages/client/src/data/auth-bootstrap.ts:90`

- `packages/client/src/data/auth-bootstrap.ts:131`

- `packages/client/src/data/use-plugin-frame.ts:65`

- `packages/client/src/data/use-plugin-frame.ts:100`

- `packages/ui/src/primitives/drawer/drawer.tsx:126`

- `tests/tooling/ast/index.test.ts:600`

- `tests/tooling/ast/index.test.ts:602`

- `packages/client/src/data/session-resume.ts:33`

- `packages/client/src/data/session-resume.ts:48`

- `packages/client/src/data/session-resume.ts:58`

- `packages/client/src/data/invalidation.ts:407`

- `packages/ui/src/primitives/background-video/background-video.tsx:65`

- `packages/client/src/forms/create-saved-entity-form.ts:129`

- `packages/client/src/forms/create-saved-entity-form.ts:130`

- `packages/client/src/forms/create-saved-entity-form.ts:163`

- `packages/client/src/forms/create-saved-entity-form.ts:164`

- `packages/client/src/forms/create-autosave-entity-form.tsx:232`

- `packages/client/src/forms/create-autosave-entity-form.tsx:289`

- `packages/client/src/forms/create-autosave-entity-form.tsx:290`

- `packages/client/src/forms/create-autosave-entity-form.tsx:315`

- `packages/client/src/forms/create-autosave-entity-form.tsx:329`

- `packages/ui/src/primitives/select/select.tsx:140`

- `packages/client/src/forms/bound-fields/avatar-upload-field.tsx:56`

- `packages/ui/src/primitives/media-grid/media-grid.tsx:30`

- `packages/client/src/components/regex-script-picker.tsx:296`

- `packages/ui/src/primitives/tooltip/tooltip.tsx:28`

- `packages/ui/src/primitives/toast/toast.tsx:40`

- `packages/server/src/domain/discovery/persistence/embed-store-reads.ts:558`

- `packages/ui/src/primitives/autocomplete/autocomplete.tsx:45`

- `packages/ui/src/primitives/autocomplete/autocomplete.tsx:60`

- `packages/ui/src/primitives/autocomplete/autocomplete.tsx:62`

- `packages/server/src/domain/discovery/verbs/distill.ts:293`

- `packages/server/src/domain/discovery/verbs/distill.ts:320`

- `packages/server/src/domain/discovery/verbs/analyze.ts:74`

- `packages/server/src/domain/discovery/verbs/analyze.ts:131`

- `packages/server/src/domain/plugin/substrate/plugin-macros.ts:66`

- `packages/server/src/domain/plugin/substrate/bridge.ts:197`

- `packages/server/src/domain/plugin/persistence/plugins.ts:166`

- `packages/server/src/domain/plugin/persistence/plugins.ts:218`

- `packages/server/src/domain/plugin/persistence/plugins.ts:245`

- `packages/server/src/domain/plugin/persistence/plugins.ts:288`

- `packages/server/src/domain/plugin/persistence/plugins.ts:303`

- `packages/server/src/domain/plugin/persistence/plugins.ts:312`

- `packages/server/src/domain/plugin/persistence/plugins.ts:322`

- `packages/server/src/domain/plugin/contract/ops.ts:159`

- `packages/server/src/domain/plugin/contract/ops.ts:179`

- `packages/server/src/domain/plugin/contract/ops.ts:270`

- `packages/server/src/domain/plugin/contract/ops.ts:354`

- `packages/server/src/domain/plugin/contract/ops.ts:372`

- `packages/server/src/domain/plugin/contract/ops.ts:382`

- `packages/server/src/domain/plugin/contract/ops.ts:386`

- `packages/server/src/domain/plugin/contract/ops.ts:403`

- `packages/server/src/domain/plugin/contract/ops.ts:417`

- `packages/server/src/domain/plugin/contract/errors.ts:56`

- `packages/server/src/domain/plugin/contract/errors.ts:131`

- `packages/server/src/domain/plugin/verbs/transform-for-display.ts:48`

- `packages/server/src/domain/chat/substrate/prompt-transforms.ts:67`

- `packages/server/src/domain/chat/engine/smart-arbitrate.ts:111`

- `packages/server/src/domain/chat/engine/engine.ts:903`

- `packages/server/src/domain/chat/engine/engine.ts:1839`

- `packages/server/src/domain/chat/engine/engine.ts:1862`

- `packages/server/src/domain/chat/engine/engine.ts:1970`

- `packages/server/src/domain/chat/memory/build/digests.ts:84`

- `packages/server/src/domain/chat/memory/build/digests.ts:98`

- `packages/server/src/domain/chat/memory/persistence/queries.ts:97`

- `packages/server/src/domain/chat/memory/persistence/queries.ts:114`

- `packages/server/src/domain/chat/memory/persistence/queries.ts:151`

- `packages/server/src/domain/chat/memory/persistence/queries.ts:198`

- `packages/server/src/domain/chat/persistence/queries.ts:460`

- `packages/server/src/domain/chat/persistence/queries.ts:488`

- `packages/server/src/domain/chat/persistence/queries.ts:515`

- `packages/server/src/domain/chat/persistence/queries.ts:543`

- `packages/server/src/domain/chat/persistence/roster.ts:57`

- `packages/server/src/domain/chat/persistence/background-write.ts:24`

- `packages/server/src/domain/chat/persistence/import-write.ts:27`

- `packages/server/src/domain/chat/persistence/import-write.ts:54`

- `packages/server/src/domain/chat/persistence/import-write.ts:79`

- `packages/server/src/domain/chat/persistence/import-write.ts:96`

- `packages/server/src/domain/chat/persistence/import-write.ts:398`

- `packages/server/src/domain/chat/persistence/import-write.ts:621`

- `packages/server/src/domain/chat/persistence/identity.ts:66`

- `packages/server/src/domain/chat/persistence/identity.ts:91`

- `packages/server/src/domain/chat/bus.ts:107`

- `packages/server/src/domain/chat/bus.ts:181`

- `packages/server/src/domain/chat/bus.ts:214`

- `tooling/src/workboard/ops/gh.ts:25`

- `packages/ui/src/charts/meter/variants.ts:307`

- `packages/ui/src/charts/meter/variants.ts:309`

- `packages/ui/src/charts/meter/variants.ts:311`

- `packages/ui/src/content/message-media/message-media.tsx:38`

- `packages/ui/src/markdown/dialogue-paragraph.tsx:12`

- `packages/ui/src/markdown/shiki-plugin.ts:220`

- `packages/ui/src/markdown/markdown.tsx:254`

- `packages/ui/src/markdown/policy.ts:87`

- `packages/server/src/domain/connection/verbs/get-models-for-source.ts:110`

- `packages/ui/src/primitives/tool-call-block/tool-call-block.tsx:43`

- `packages/client/src/agent-seed/retry-attempt.ts:49`

- `packages/client/src/agent-seed/retry-attempt.ts:54`

- `packages/server/src/domain/character/persistence/queries.ts:523`

- `packages/server/src/domain/character/persistence/queries.ts:658`

- `packages/contracts/src/settings/index.ts:567`

- `packages/contracts/src/settings/index.ts:574`

- `packages/contracts/src/settings/index.ts:576`

- `packages/contracts/src/settings/index.ts:578`

- `packages/contracts/src/settings/index.ts:580`

- `packages/contracts/src/settings/index.ts:835`

- `packages/contracts/src/settings/appearance.ts:96`

- `packages/contracts/src/settings/appearance.ts:175`

- `packages/contracts/src/settings/appearance.ts:186`

- `packages/contracts/src/theme/background.ts:35`

- `packages/contracts/src/theme/background.ts:46`

- `packages/contracts/src/plugin/bridge.ts:84`

- `packages/contracts/src/plugin/bridge.ts:99`

- `packages/contracts/src/plugin/bridge.ts:108`

- `packages/contracts/src/plugin/bridge.ts:237`

- `packages/contracts/src/plugin/bridge.ts:247`

- `packages/contracts/src/plugin/bridge.ts:257`

- `packages/contracts/src/plugin/bridge.ts:258`

- `packages/contracts/src/plugin/bridge.ts:270`

- `packages/contracts/src/plugin/bridge.ts:277`

- `packages/contracts/src/plugin/host-v1.ts:37`

- `packages/contracts/src/plugin/host-v1.ts:125`

- `packages/contracts/src/plugin/host-v1.ts:249`

- `packages/contracts/src/plugin/host-v1.ts:312`

- `packages/contracts/src/plugin/host-v1.ts:359`

- `packages/contracts/src/plugin/host-v1.ts:376`

- `packages/contracts/src/plugin/host-v1.ts:393`

- `packages/contracts/src/plugin/host-v1.ts:394`

- `packages/contracts/src/plugin/host-v1.ts:414`

- `packages/contracts/src/plugin/host-v1.ts:421`

- `packages/contracts/src/plugin/host-v1.ts:477`

- `packages/contracts/src/plugin/host-v1.ts:496`

- `packages/contracts/src/plugin/host-v1.ts:497`

- `packages/contracts/src/plugin/host-v1.ts:551`

- `packages/contracts/src/chat/messages.ts:158`

- `packages/client/src/lib/view-transition.ts:108`

- `packages/client/src/lib/console-error-ring.ts:73`

- `packages/client/src/lib/error-boundary.tsx:29`

- `packages/client/src/lib/perf-marks.ts:14`

- `packages/client/src/lib/perf-marks.ts:24`

- `packages/contracts/src/rpg/extraction.ts:433`

- `packages/client/src/lib/long-task-tracer.ts:107`

- `packages/contracts/src/preset/index.ts:3101`

- `packages/server/src/infra/providers/vllm/engine/gen-window.ts:28`

- `packages/server/src/infra/providers/vllm/engine/gen-window.ts:37`

- `packages/server/src/infra/providers/vllm/engine/gpu.ts:12`

- `packages/server/src/infra/providers/vllm/engine/gpu.ts:27`

- `packages/server/src/infra/providers/vllm/engine/wake-budget.ts:93`

- `tooling/src/workboard/ops/project.ts:41`

- `packages/server/src/infra/providers/contract/errors.ts:68`

- `packages/server/src/infra/providers/contract/errors.ts:90`

- `packages/server/src/infra/providers/vllm/engine/spawn-engine.ts:48`

- `packages/server/src/infra/providers/vllm/engine/client.ts:96`

- `packages/server/src/infra/providers/vllm/engine/process-identity.ts:127`

- `packages/server/src/infra/providers/vllm/engine/process-identity.ts:164`

- `packages/server/src/infra/providers/vllm/engine/process-identity.ts:174`

- `packages/server/src/infra/providers/vllm/engine/process-identity.ts:261`

- `packages/server/src/infra/providers/vllm/engine/supervisor.ts:205`

- `packages/server/src/infra/providers/vllm/engine/supervisor.ts:219`

- `packages/server/src/infra/providers/vllm/engine/fleet-control.ts:55`

- `packages/server/src/infra/providers/vllm/engine/fleet-control.ts:85`

- `packages/server/src/infra/providers/vllm/engine/fleet-control.ts:143`

- `packages/server/src/infra/providers/vllm/engine/fleet-control.ts:270`

- `packages/server/src/infra/providers/vllm/engine/fleet-control.ts:358`

- `packages/server/src/infra/providers/vllm/engine/fleet-control.ts:374`

- `packages/server/src/infra/plugin-host/sandbox.ts:712`

- `packages/server/src/infra/plugin-host/membrane.ts:590`

- `packages/server/src/infra/plugin-host/membrane.ts:1814`

- `packages/server/src/infra/plugin-host/membrane.ts:1818`

- `packages/server/src/domain/automation/substrate/serial-lanes.ts:58`

- `packages/server/src/domain/automation/substrate/serial-lanes.ts:65`

- `packages/server/src/infra/plugin-host/port.ts:368`

- `packages/server/src/domain/automation/substrate/enabled-index.ts:47`

- `packages/server/src/infra/crypto/key.ts:37`

- `packages/server/src/infra/crypto/key.ts:63`

- `packages/server/src/infra/storage/cas.ts:196`

- `packages/server/src/domain/automation/substrate/authority.ts:37`

- `packages/server/src/infra/storage/variant-cache.ts:64`

- `packages/server/src/domain/automation/substrate/plugin-subscribers.ts:159`

- `packages/server/src/infra/network/egress.ts:109`

- `packages/server/src/infra/network/egress.ts:398`

- `packages/server/src/infra/network/openai-models.ts:81`

- `packages/server/src/infra/network/openai-models.ts:144`

- `packages/client/src/agent-nav/index.ts:107`

- `packages/client/src/agent-nav/index.ts:131`

- `packages/client/src/agent-nav/index.ts:403`

- `packages/client/src/agent-nav/index.ts:412`

- `packages/server/src/domain/automation/engine/prompt-transforms.ts:184`

- `packages/server/src/domain/automation/persistence/canon-reads.ts:85`

- `tests/server/infra/providers/backends/agent-sdk/session/frames.test.ts:31`

- `packages/server/src/domain/sessions/verbs/revoke.ts:41`

- `packages/server/src/domain/sessions/verbs/link-external-id.ts:64`

- `packages/client/src/features/credentials/lib/add-credential-form-model.ts:48`

- `packages/ui/src/primitives/combobox/combobox.tsx:41`

- `packages/ui/src/primitives/combobox/combobox.tsx:50`

- `packages/ui/src/primitives/combobox/combobox.tsx:53`

- `packages/client/src/features/credentials/components/endpoint-inspector-dialog.tsx:36`

- `packages/client/src/features/credentials/components/add-credential-dialog.tsx:284`

- `packages/client/src/features/credentials/components/role-slot-row.tsx:334`

- `packages/client/src/features/roster-preset/components/roster-picker.tsx:264`

- `packages/client/src/features/roster-preset/surfaces/roster-member-surface.tsx:134`

- `packages/server/src/domain/export/verbs/export-chat.ts:49`

- `packages/server/src/domain/export/verbs/export-chat.ts:139`

- `packages/server/src/domain/export/verbs/export-chat-bundle.ts:92`

- `tests/tooling/vitest-supervised.test.ts:41`

- `packages/client/src/features/character/lib/character-chat-intents.ts:30`

- `packages/client/src/features/character/components/character-actions-menu.tsx:85`

- `packages/server/src/domain/workloads/engine/runner.ts:101`

- `packages/server/src/domain/workloads/engine/runner.ts:113`

- `packages/server/src/domain/workloads/engine/runner.ts:310`

- `packages/server/src/domain/workloads/engine/runner.ts:333`

- `packages/server/src/domain/workloads/engine/runner.ts:339`

- `packages/server/src/domain/workloads/engine/runner.ts:350`

- `packages/server/src/domain/character/persistence/card.ts:42`

- `packages/server/src/domain/character/persistence/card.ts:172`

- `packages/server/src/domain/character/persistence/handoff-copy-write.ts:84`

- `packages/server/src/domain/character/persistence/handoff-copy-write.ts:87`

- `packages/server/src/domain/character/persistence/handoff-copy-write.ts:99`

- `packages/server/src/domain/workloads/persistence/queries.ts:44`

- `packages/server/src/domain/workloads/persistence/queries.ts:143`

- `packages/server/src/domain/workloads/persistence/queries.ts:219`

- `packages/server/src/domain/workloads/persistence/queries.ts:236`

- `packages/server/src/domain/workloads/persistence/queries.ts:254`

- `packages/server/src/domain/workloads/persistence/queries.ts:284`

- `packages/server/src/domain/workloads/persistence/queries.ts:294`

- `packages/server/src/domain/workloads/persistence/queries.ts:297`

- `packages/server/src/domain/workloads/persistence/queries.ts:323`

- `packages/server/src/domain/workloads/persistence/queries.ts:340`

- `packages/server/src/domain/workloads/persistence/queries.ts:353`

- `packages/server/src/domain/workloads/persistence/queries.ts:501`

- `packages/client/src/features/character/surfaces/character-library-surface.tsx:217`

- `packages/server/src/domain/workloads/persistence/schedule-queries.ts:85`

- `packages/server/src/domain/workloads/persistence/schedule-queries.ts:116`

- `packages/server/src/domain/workloads/persistence/schedule-queries.ts:136`

- `packages/server/src/domain/workloads/persistence/schedule-queries.ts:145`

- `packages/server/src/domain/workloads/persistence/schedule-queries.ts:162`

- `tests/server/infra/plugin-host/escape.suite.test.ts:54`

- `tests/server/infra/plugin-host/escape.suite.test.ts:819`

- `packages/server/src/domain/character/seeder/seed.ts:99`

- `tests/server/infra/plugin-host/membrane.test.ts:59`

- `tests/server/infra/plugin-host/membrane.test.ts:73`

- `tests/server/infra/plugin-host/membrane.test.ts:845`

- `tests/server/infra/plugin-host/sandbox.test.ts:52`

- `tests/server/infra/plugin-host/sandbox.test.ts:172`

- `tests/server/infra/plugin-host/sandbox.test.ts:231`

- `tests/server/infra/plugin-host/sandbox.test.ts:405`

- `tests/server/infra/plugin-host/realm.test.ts:180`

- `packages/server/src/domain/workloads/verbs/start.ts:62`

- `packages/client/src/features/preset/lib/custom-parameters-model.ts:38`

- `packages/client/src/features/preset/hooks/use-preset-autosave.ts:202`

- `packages/client/src/features/auth/lib/route-guards.ts:29`

- `packages/client/src/features/preset/components/preset-import-dialog.tsx:102`

- `packages/server/src/domain/refinery/substrate/schema-forge.ts:164`

- `packages/client/src/features/preset/components/params-limits.tsx:432`

- `packages/server/src/domain/refinery/persistence/queries.ts:137`

- `packages/server/src/domain/refinery/persistence/queries.ts:245`

- `packages/server/src/domain/world-info/persistence/import-write.ts:153`

- `packages/server/src/domain/world-info/persistence/import-write.ts:173`

- `packages/server/src/domain/world-info/persistence/import-write.ts:258`

- `packages/server/src/domain/world-info/persistence/import-write.ts:302`

- `packages/server/src/domain/world-info/persistence/link-carried-books.ts:58`

- `packages/server/src/domain/world-info/persistence/handoff-copy-write.ts:57`

- `packages/server/src/domain/world-info/persistence/handoff-copy-write.ts:77`

- `packages/server/src/domain/world-info/persistence/handoff-copy-write.ts:124`

- `packages/server/src/domain/world-info/persistence/handoff-copy-write.ts:137`

- `packages/server/src/domain/refinery/verbs/score-sweep.ts:283`

- `tooling/src/seed/ops/demo.ts:124`

- `tooling/src/seed/ops/demo.ts:304`

- `packages/client/src/features/app-shell/hooks/use-is-mobile-viewport.ts:119`

- `packages/server/src/domain/databank/ingest/index.ts:129`

- `packages/server/src/domain/databank/ingest/index.ts:192`

- `packages/server/src/domain/search/persistence/display.ts:71`

- `packages/server/src/domain/search/persistence/display.ts:162`

- `packages/server/src/domain/databank/persistence/queries.ts:109`

- `packages/server/src/domain/databank/persistence/queries.ts:242`

- `packages/client/src/features/discovery/hooks/use-understanding-pass.ts:210`

- `packages/server/src/domain/databank/verbs/scrape/scrape-youtube.ts:43`

- `packages/server/src/domain/chat/verbs/claim-chat.ts:182`

- `packages/server/src/domain/chat/verbs/turn.ts:1208`

- `packages/server/src/domain/chat/verbs/turn.ts:2258`

- `packages/server/src/domain/chat/verbs/turn.ts:2504`

- `packages/server/src/domain/assets/persistence/queries.ts:39`

- `packages/server/src/domain/assets/persistence/asset-refs.ts:93`

- `packages/server/src/domain/assets/persistence/asset-refs.ts:157`

- `packages/server/src/domain/assets/persistence/asset-refs.ts:188`

- `packages/server/src/domain/assets/persistence/asset-refs.ts:219`

- `packages/server/src/domain/assets/persistence/asset-refs.ts:241`

- `packages/server/src/domain/assets/persistence/asset-refs.ts:273`

- `packages/server/src/kit/serde/lib/index.ts:120`

- `packages/server/src/kit/serde/lib/index.ts:129`

- `packages/server/src/domain/rpg/substrate/delta.ts:496`

- `packages/server/src/kit/serde/chat/index.ts:708`

- `packages/server/src/domain/automation/verbs/confirm-suggestion.ts:153`

- `packages/client/src/features/notifications/components/notification-bell.tsx:245`

- `packages/server/src/domain/rpg/persistence/portability-write.ts:82`

- `packages/server/src/domain/rpg/persistence/portability-write.ts:228`

- `packages/server/src/domain/automation/verbs/resolve-stream-authority.ts:24`

- `packages/server/src/domain/rpg/snapshot-edit.ts:59`

- `packages/server/src/domain/rpg/snapshot-edit.ts:63`

- `packages/server/src/kit/structured-turn/index.ts:147`

- `packages/server/src/domain/rpg/flush-barrier.ts:112`

- `packages/server/src/domain/import/substrate/group.ts:38`

- `packages/server/src/domain/import/substrate/card.ts:132`

- `packages/server/src/domain/import/verbs/import-presets.ts:53`

- `packages/server/src/domain/rpg/chat-ops/gather.ts:53`

- `packages/server/src/domain/import/substrate/world.ts:80`

- `packages/server/src/domain/import/workload-contributions.ts:128`

- `packages/server/src/domain/import/substrate/preset.ts:111`

- `packages/client/src/features/persona/components/persona-list.tsx:48`

- `packages/server/src/domain/import/loader/collect.ts:406`

- `packages/server/src/domain/import/loader/collect.ts:439`

- `packages/server/src/domain/import/loader/collect.ts:502`

- `packages/server/src/domain/import/loader/collect.ts:525`

- `packages/server/src/domain/import/loader/collect.ts:554`

- `packages/server/src/domain/import/loader/collect.ts:650`

- `packages/server/src/domain/import/loader/collect.ts:665`

- `packages/server/src/domain/import/loader/collect.ts:680`

- `packages/server/src/domain/stats/persistence/latency.ts:103`

- `packages/server/src/domain/stats/persistence/latency.ts:119`

- `packages/server/src/domain/stats/persistence/activity.ts:79`

- `packages/client/src/features/user-admin/components/admin-link-sso-dialog.tsx:54`

- `packages/client/src/features/user-admin/components/admin-reset-password-dialog.tsx:55`

- `packages/client/src/features/imagery/components/image-detail-body.tsx:70`

- `packages/client/src/features/imagery/components/image-edit-body.tsx:91`

- `packages/client/src/features/workloads/hooks/use-library-import.ts:120`

- `packages/client/src/features/workloads/hooks/use-library-import.ts:131`

- `packages/client/src/features/workloads/hooks/use-library-import.ts:145`

- `packages/client/src/features/workloads/components/bundle-workload-tracker.tsx:116`

- `packages/client/src/features/plugin/lib/plugin-tool-card-state.ts:17`

- `packages/client/src/features/plugin/lib/ui-guest/ui-guest.worker.ts:83`

- `packages/client/src/features/plugin/lib/ui-guest/ui-guest.worker.ts:183`

- `packages/client/src/features/plugin/lib/ui-guest/ui-guest.worker.ts:191`

- `packages/client/src/features/plugin/lib/ui-guest/plugin-ui-guest-host.ts:120`

- `packages/client/src/features/plugin/lib/ui-guest/plugin-ui-guest-host.ts:145`

- `packages/client/src/features/plugin/lib/ui-guest/plugin-ui-guest-host.ts:180`

- `packages/client/src/features/plugin/lib/ui-guest/ui-guest-realm.ts:277`

- `packages/client/src/features/plugin/lib/ui-guest/ui-guest-realm.ts:300`

- `packages/client/src/features/plugin/hooks/use-plugin-commands.ts:66`

- `packages/client/src/features/refinery/components/refusal-note.tsx:14`

- `packages/client/src/features/discovery/surfaces/corpus-home-surface.tsx:110`

- `packages/client/src/features/refinery/components/schema-editor-dialog.tsx:97`

- `packages/client/src/features/refinery/components/refinery-start-pane.tsx:42`

- `packages/client/src/features/plugin/components/plugin-surface-renderer.tsx:257`

- `packages/client/src/features/plugin/components/plugin-row-leaves.tsx:54`

- `packages/client/src/features/plugin/components/plugin-row-leaves.tsx:77`

- `packages/client/src/features/plugin/components/plugin-row-leaves.tsx:102`

- `packages/client/src/features/plugin/components/plugin-row-leaves.tsx:117`

- `packages/client/src/features/plugin/components/plugin-distribute-section.tsx:106`

- `packages/client/src/features/plugin/components/plugin-distribute-section.tsx:209`

- `packages/client/src/features/plugin/components/plugin-row.tsx:101`

- `packages/client/src/features/refinery/surfaces/refinery-list-surface.tsx:152`

- `packages/client/src/features/plugin/components/snippet-console.tsx:69`

- `packages/client/src/features/plugin/components/plugin-scripted-surface.tsx:125`

- `packages/client/src/features/chat/surfaces/new-chat-picker-surface.tsx:39`

- `packages/client/src/features/chat/surfaces/new-chat-picker-surface.tsx:170`

- `packages/client/src/features/plugin/components/plugin-frame.tsx:108`

- `packages/client/src/features/plugin/components/plugin-install-card.tsx:120`

- `packages/client/src/features/plugin/components/plugin-install-card.tsx:240`

- `tests/server/domain/plugin/substrate/bridge.test.ts:679`

- `tests/server/domain/plugin/substrate/bridge.test.ts:681`

- `tests/server/domain/plugin/substrate/bridge.test.ts:684`

- `tests/server/domain/plugin/substrate/bridge.test.ts:686`

- `tests/server/domain/plugin/substrate/bridge.test.ts:751`

- `tests/server/domain/plugin/substrate/bridge.test.ts:760`

- `packages/client/src/features/rpg/components/rpg-game-tab.tsx:319`

- `packages/client/src/features/rpg/components/rpg-game-tab.tsx:358`

- `packages/client/src/features/rpg/components/turn-tool-calls-disclosure.tsx:89`

- `packages/client/src/features/chat/hooks/use-guided-actions.ts:342`

- `packages/client/src/features/rpg/components/rpg-dice-tool-card.tsx:39`

- `packages/client/src/features/rpg/components/rpg-populate-control.tsx:59`

- `packages/client/src/features/rpg/components/rpg-populate-control.tsx:84`

- `packages/client/src/features/chat/lib/join-token.ts:22`

- `packages/client/src/features/rpg/components/rpg-beat-row.tsx:179`

- `packages/client/src/features/chat/components/chat-list-row-menu.tsx:63`

- `packages/client/src/features/chat/components/chat-documents-section.tsx:164`

- `packages/client/src/features/chat/components/message-actions-row.tsx:279`

- `packages/client/src/features/chat/components/home-quick-picks-tile-body.tsx:46`

- `packages/client/src/features/chat/components/message-edit-textarea.tsx:69`

- `packages/client/src/features/chat/components/message-edit-textarea.tsx:90`

- `packages/client/src/state/durable-local.ts:121`

- `packages/client/src/state/durable-local.ts:133`

- `packages/client/src/state/durable-local.ts:143`

- `packages/client/src/state/durable-local.ts:162`

- `packages/client/src/state/durable-local.ts:328`

- `packages/server/src/domain/automation/persistence/rules.ts:150`

- `packages/server/src/domain/automation/persistence/rules.ts:164`

- `packages/server/src/domain/automation/persistence/rules.ts:185`

- `packages/server/src/domain/automation/persistence/rules.ts:196`

- `packages/server/src/domain/automation/persistence/rules.ts:208`

- `packages/server/src/domain/automation/persistence/rules.ts:216`

- `packages/server/src/domain/automation/persistence/rules.ts:284`

- `packages/server/src/domain/automation/persistence/rules.ts:304`

- `packages/server/src/domain/automation/persistence/rules.ts:323`

- `packages/server/src/domain/automation/persistence/rules.ts:338`

- `packages/server/src/domain/automation/persistence/rules.ts:348`

- `packages/client/src/main.tsx:84`

- `packages/server/src/domain/assets/substrate/mime.ts:99`

- Exact candidate counts, same invocation and same opener fence for all grammars:

  ```bash
  for marker in foreign-id-ok sub-floor-ok finding-overload-ok owner-scope-ok owner-scope-write-ok owner-scope-upsert-ok first-boot-only swallowed-ok surface-focus-elsewhere nullable-cmp-ok over-art-plate-ok; do
    git ls-files -z 'packages/**/*.ts' 'packages/**/*.tsx' 'tests/**/*.ts' 'tests/**/*.tsx' 'tooling/**/*.ts' 'tooling/**/*.tsx' |
      xargs -0 rg -o '^\s*(?://|/\*+|\*|\{?\s*/\*+)\s*@'"$marker" | wc -l
  done
  # 70 2 24 20 31 0 0 8 2 1 0
  ```

  The zero rows are instrument-controlled by the positive rows in the same invocation; `@foreign-id-ok` returned 70 and every search shared the identical roots/globs/opener expression.

- Central opener partition and total:

  ```bash
  git ls-files -z 'packages/**/*.ts' 'packages/**/*.tsx' 'tests/**/*.ts' 'tests/**/*.tsx' 'tooling/**/*.ts' 'tooling/**/*.tsx' |
    xargs -0 rg -o '^\s*(?://|/\*+|\*|\{?\s*/\*+)\s*@orb-gate-ignore'
  # packages=396, tests=12, tooling=225, total=633
  ```

- Closed-universe control: `git ls-files` selected 6,981 tracked `.ts`/`.tsx` files. Comparing its sorted `path:line` output byte-for-byte with this appendix produced no delta. No `.mts`, `.cts`, `.mjs`, `.cjs`, CSS, JSON, Markdown, generated, vendor, or untracked file participates in this source manifest.

- Structural parser-owner scan:

  ```bash
  pnpm exec ast-grep run -p 'const $A = $B' -l ts --inspect summary <19 fully-read owner/helper files> --json=stream
  # scannedFileCount=19, skippedFileCount=0, 630 declaration matches
  ```

  The planted structural control was `const MARKER = "@over-art-plate-ok"` in `lib/over-art-plate.ts`; the same run found every marker regex/constant inspected for this manifest.

- Symbol-aware importer proof for the legacy central parser:

  ```bash
  pnpm ast importers tooling/src/verify/lib/gate-ignore.ts --max 200
  # scanned=7011, skipped=0, matches=4, status=complete
  ```

  The four live importers were `gate-ignore-inventory.ts`, `verify/index.ts`, `lib/pass.ts`, and `ops/gen/caught-failure-population.ts`.

- Symbol-aware comment substrate proof:

  ```bash
  pnpm ast importers tooling/src/verify/lib/comment-spans.ts --max 200
  # scanned=7011, skipped=0, matches=29, status=complete
  ```

  This is the receipt for retaining `comment-spans.ts`: it is a shared source/resource fact with 29 importers, not dead marker plumbing.

- Regex-construction corroboration:

  ```bash
  pnpm exec ast-grep run -p 'new RegExp($A, $B)' -l ts --inspect summary tooling/src/verify/gates tooling/src/verify/lib tooling/src/ast/ops tests/tooling
  # scannedFileCount=692, skippedFileCount=0
  ```

  It found the assembled central parser in `gate-ignore.ts`, the duplicate `no-legacy-react-api` parser, the provenance parser, and the native-suppression readers. Literal `rg` over the same owners supplied the exact authored spellings and candidate counts.

No tests or gates were run: this lane changed review evidence only and was forbidden to edit or exercise shared gate/runtime sources while implementation lanes were active.

Documentation verification: `pnpm check:docs -- docs/reviews/gate-runtime/ordinary-waiver-source-migration.md` first refused the extra `--` with exit 3; the corrected `pnpm check:docs docs/reviews/gate-runtime/ordinary-waiver-source-migration.md` found formatting drift, `pnpm format:docs docs/reviews/gate-runtime/ordinary-waiver-source-migration.md` repaired only this file, and the corrected check then passed (`check:docs — 1 file(s) formatted`). `git diff --check -- docs/reviews/gate-runtime/ordinary-waiver-source-migration.md` was clean. The current tracked `.ts`/`.tsx` re-attestation expanded the closed appendix from 789 to 791 unique `path:line` rows by adding `packages/server/src/domain/chat/memory/build/digests.ts:84,98`.
