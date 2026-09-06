---
kind: review
status: active
updated: 2026-09-05
---

# Gate-runtime emergency fold checkpoint

Parent program: [#1584](https://github.com/Inktomi93/orbweaver/issues/1584). Integration branch: `codex/gate-tsmorph-standardization`. Emergency fold tip: `b32797507`; current implementation tip after local resource and bus conversion work: `90905786b`. Every active Codex task and its subagents stopped, committed useful bytes, removed scratch artifacts, and returned a clean task worktree. No checkpoint was pushed or merged to `main`.

This checkpoint deliberately preserves incomplete and red work. A committed WIP is not conversion credit or verification evidence.

## Stable integrated checkpoint before the emergency fold

- One final policy contract, loader, pass, hermetic conformance runtime, authority coordinator, six-kind scope resolver, planner/executor, ResourceHost foundation, shared reference/static-value readers, and temporary `gate:contract` census.
- Fourteen gate modules are final `defineGate` policies. Their 89 proofs pass, old/new populations match over the frozen 7,006-file TS/TSX corpus, and current-corpus findings remain 0/0.
- The verified pre-WIP migration census is 1,447 findings across 255 modules.
- Final source policy is `.ts`/`.tsx` only. JSON/JSONC, CSS, Markdown, SQL, and other non-source formats enter through closed ResourceHost facts. `.mts/.cts/.mjs/.cjs` remain cleanup work.
- Integrated checkpoint Stickler found one HIGH orphan-grant defect; the waiver checkpoint below includes the full-roster repair but its final cold review was interrupted.

## Folded lane checkpoints

| Lane | Source checkpoint | Folded commit(s) | Preserved state | Not complete |
| - | - | - | - | - |
| Resource declarations and hybrid identity | `4fb132463` | `2f3f070c6` | Required closed `resources` descriptors, ResourceHost-derived planner paths, same-path source/resource membership, TS/TSX source filter, `resources: []` on the 14 converted policies. Last coherent runs: planner 33/33; pass/conformance 41/41. | Final lint/types/cold review; graph remains red at legacy/final harness callers. |
| Resource layout eligibility | `1f41b0080`, `782e4738d` | `a7cdadda3`, `6baa8a46a` | Durable 53 -> 13 -> 0 report and cold review, 89/89 foundation replay, exact 1,447 census. | No gates converted. Re-derive eligibility after the resource-declaration seam; the report distinguishes current behavior from destination law. |
| Ordinary waiver control plane | `46ec3d91c` | `213e50d0a` | One `@orb-waive <policy-id>(<position>): <reason>` engine, exact TS/TSX marker universe, planner/pass integration, loaded-descriptor identity check, full-roster grant/waiver validation, and a 791-site migration manifest: 767 translate, 24 delete. Last focused run: 91/91. | Final-delta ESLint and cold review. No legacy marker source was rewritten or deleted. |
| Schema facts | `10b367434`, `2946a9437` | `678f98858`, `484df3d66` | Invocation-scoped schema query with canonical table/column/FK/index/JSON identities, TS/TSX boundary, 10/10 focused tests, and live counts: 97 tables, 849 columns, 162 FKs, 178 indexes. | Second cold review interrupted; no schema gates converted or differentially checked. |
| Bus facts and policy drafts | `bd5a0cb01`, `372e673b9` | `f287dc6db`, `83d6cf316` | Shared bus fact WIP, four converted coverage-gate drafts, hard fact-health draft, tests and handoff. Frozen legacy baseline: 7,011 TS/TSX files per gate, zero tool errors/findings. | `emitterSink()` is not wired into direct emitter collection; callable provenance, producer-scope equivalence, synthesized chat yields, all behavioral tests, proofs, formatting, differential, and cold review. `user-bus-coverage` lacks a real work item; `bus-definition-belts` remains blocked. |
| Registry facts | `5f965d4a4`, `4d3833b5c` | `88f52081c`, `5c55b1d9c` | Shared registry and tuple-vocabulary facts, 11 focused tests, and durable resume handoff. | Final Biome rerun, current-corpus differential, gate census, cold review, and all gate conversions. |
| CSS and static-class facts | `687b26956` | `b32797507` | ResourceHost CSS facts, static-class facts, CSS parser tests, and a draft `no-raw-color-in-css` final policy. Earlier focused receipts: CSS 15/15 plus one nested-parser control; static-class 5/5. CSS corpus: five files and 2,973 facts. | The draft policy lacks final rerun. Static-class parity is refuted: 242 legacy tokens lost and four new false positives; other 22 CSS/style policies remain legacy. No final type/lint/cold/differential/gate-census report. |

## Conflict rulings applied during the fold

- `policy-source-candidate.ts` is the one TS/TSX predicate. The waiver engine consumes it; no duplicate extension predicate survives.
- Descriptor-derived ResourceHost declarations and same-path hybrid membership win over the older external `resourcePathsByPolicy` input.
- `runPolicyPass` retains exact loaded-descriptor identity and the loader-derived full roster before any hook runs.
- CSS inventory access is bound through the existing `authored-css` or `product-css` declaration identity, so the WIP cannot bypass declared-resource accounting.
- Resource proof mode may contain TS/TSX files when a closed resource declaration classifies them; source/types proof modes remain TS/TSX-only.

## Post-fold integration repair

Commit `00017c0bf` repaired the mechanical conflicts after all checkpoints were folded: one canonical TS/TSX predicate, explicit `resources: []` on the five bus drafts, an `authored-css` declaration and valid regexes on the CSS draft, and the three incomplete-return paths in bus/static-class facts. Commit `b240cc66a` then added closed waiver carriers for declared CSS, Markdown, JSONC, JSON, and SQL resources and repaired the static-class integration test without weakening the nonempty-policy contract. `pnpm exec tsc -p tooling/tsconfig.json --noEmit --pretty false` passes on the combined worktree. The six-file CSS/ResourceHost/static-class slice passes 19/19; the broader resource-waiver run passed 101 focused tests. Plain JSON supplies finding coordinates but has no comment grammar.

Cold review then refuted missing-resource waiver collection, Markdown multi-comment/adjacency, bare node-report tokens, and schema mutation tracking. Commits `49b797e9f`, `7a1139846`, and `2797b1c17` repair those seams centrally. Fresh independent rechecks confirm the resource declaration slice at 119/119, the waiver slice at 121/121, and all fourteen converted policies at 89/89 proofs. The final shared `Object.assign` plus exact array/object destructuring repair is locally green at 36/36 reference/schema tests and tooling TypeScript; it has not received another independent review after the owner restricted further agent use.

Commit `96e103fe4` re-derived and converted `feature-owns-definition` and `package-layout` from the formerly blocked resource family. Direct feature directories and definition owners match 25/25; package loose-module subjects match exactly at zero; current legacy/final findings are 0/0 for both. The sixteen credited final policies pass 95/95 proofs. Structural permissions use hard or exact reviewed-grant authority rather than inline path exclusions.

Commits `05e595f33`, `d59803f7f`, and `70a944751` convert `ui-exports-map-complete`, `server-layout`, and the two component-size policies. The resource-family total is six converted legacy policies; the overall credited total before bus work is twenty policies with 112/112 proofs. Exact populations and differentials are in `resource-layout-size-inventory.md`.

Commit `bb6c76fde` adds a pass-local shared-fact registry: one object-keyed collector per exact effective population, population-mismatch refusal, and fresh state on re-entry. Commit `90905786b` repairs and shares the bus producer fact, converts four legacy producer policies, and adds the hard fact-health policy. The four policies have 15/15 final proofs, their legacy replay agrees on every fixture, and the current differential is 1,570 exact contracts/server files with 0/0 findings and zero tool errors. The shared fact reports 66 members and zero unresolved identities. The isolated final command measured 22.32 s wall and 3.01 GB peak RSS versus legacy 9.37 s and 1.67 GB; composed runtime performance remains open. The credited legacy-policy total is now twenty-four with 127/127 proofs, plus two support-policy proofs.

## Resume order

1. Continue re-deriving the eleven remaining layout/size/resource candidates against the folded resource declarations; convert only complete rows.
2. Convert `bus-definition-belts` without its hand-maintained exemption/reach/coverage-file tables, then resolve `user-bus-coverage` through a real warning work item or exact reviewed grant.
3. Finish registry fact tests/review, then convert its closed gate set.
4. Repair static-class parity before converting any additional class/style gate; `no-raw-color-in-css` still needs old/new population and finding differentials before conversion credit.
5. After all WIP is coherent, regenerate the test baseline and document catalog once, then resume the remaining policy-family waves and final atomic loader/report/scaffold cutover.

## Known red state

- Legacy all-corpus gate tests and graph sites still assume every module is a `GateDescriptor`; no compatibility adapter exists.
- The four bus producer conversions are verified; `user-bus-coverage` and `bus-definition-belts` remain legacy, and composed bus performance is still open. CSS/static-class checkpoint code remains WIP.
- Global test-baseline and documentation-catalog surfaces are stale by design and were not regenerated during the fold.
- No full structure, broad test, performance/RSS acceptance, or final old/new differential applies to checkpoint tip `b32797507`.
