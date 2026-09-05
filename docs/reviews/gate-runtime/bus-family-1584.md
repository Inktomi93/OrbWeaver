---
kind: review
status: active
updated: 2026-09-05
---

# Bus family conversion for #1584

## Shared bus fact design

Problem: the legacy bus helper accepts raw `Project` and scans every source itself, uses regex/string/path identity, narrow local alias handling, and returns ordinary violations (`tooling/src/verify/lib/bus-coverage.ts:14-18,29-47,50-80`). This conflicts with the final boundary: policies may only consume delivered nodes/files and shared readers; unsupported shapes must refuse (`docs/design/gate-runtime-standardization.md:96-111`).

Chosen API: `createBusFactQuery(ctx: GatePolicyContext) -> { visitors, finish }`. A policy constructs exactly one collector in its own `create(ctx)` closure, returns its visitors to the dispatcher, and calls idempotent `finish()` in `evaluate`. The dispatcher creates `GatePolicyContext` once per selected policy (`tooling/src/verify/lib/policy-pass.ts:283-305`) and merges all policy visitors into the one physical source walk (`:308-347`), so the collector has one policy-invocation lifetime and does no secondary repository walk/recomputation. The report must call this one collector *per policy invocation*, not one memo shared among sibling policies in a pass; the current context has no shared-query host—only files/resources/checker/report/receipt (`tooling/src/verify/contract/policy.ts:58-68`). Sharing one instance pass-wide would require a new `policy.ts`/pass capability outside this lane and is rejected absent evidence it is required.

Contract: `BusFact` status is ready/missing/empty/unresolved. Ready records contain canonical union, belt, member, emitter, coverage-policy and consumer identities with live Node anchors; a semantic absence (`belt: null`, no matching emitter/consumer/coverage policy) remains ready and is policy-reportable. Non-ready facts carry at least one refusal with detail and optional live anchor plus optional expected identity; `finish()` records `population:bus-fact`, and non-ready means `unresolved > 0`, making receipt reconciliation withhold the owner. No fake path/node anchors exist for missing files.

Mechanics: visitor-fed collection only. Static object/tuple members use `readStaticAuthoredValue`; normalized call/member/import/re-export/destructure/computed/wrapper identity uses final reference facts. Dynamic/write/cycle/ambiguous/missing reader results append refusals. No raw `Project`, `getSourceFiles`, descendant walk, parser, module state or cache. Exact repo-relative path plus exported/member/call identity replaces regex/path-substring identity.

Rejected alternative: adding `ctx.readers.bus`. `GatePolicyContext` has no reader-injection field (`policy.ts:58-68`); adding one fans into `policy.ts`, `makePolicyContext`, context-surface tests and pass-wide lifecycle. The local factory uses the existing sanctioned shared-reader boundary without widening runtime foundations. A module/global `WeakMap` cache is also rejected because it violates invocation isolation and re-entry law.

Tests: composed aliases, namespace/re-export, destructure, computed keys, wrappers, shadow/write/cycle/dynamic; missing/empty/unresolved; exact source/member/call identities; finish idempotence and reused-Project re-entry. Fact tests prove non-ready receipt refusal through `runPolicyPass`, not fabricated ordinary findings.

## Conversion manifest

The pre-edit legacy baseline is six policies, 7,011 admitted source files each, zero tool errors, and zero current-corpus findings.

| Legacy id | Final disposition | Authority/severity | Population |
| - | - | - | - |
| `automation-bus-coverage` | converted: ready-state missing-emitter policy | ordinary/error | authored TS/TSX, entire population |
| `bus-coverage` | converted: ready-state missing-emitter policy | ordinary/error | authored TS/TSX, entire population |
| `domain-events-coverage` | converted: ready-state missing-emitter policy | ordinary/error | authored TS/TSX, entire population |
| `rpg-bus-coverage` | converted: ready-state missing-emitter policy | ordinary/error | authored TS/TSX, entire population |
| `user-bus-coverage` | blocked: `connectionsChanged` is unresolved warning debt with no positive work-item identity | unchanged legacy | unchanged legacy |
| `bus-definition-belts` | blocked with the user policy: the final fact recognizes only direct `defineGate` coverage descriptors, so converting it while user coverage stays legacy creates a false missing-policy finding | unchanged legacy | unchanged legacy |

`bus-fact-health` is the separate hard/error fact-health id under family `bus-fact`. It reports a missing, empty, or unresolved shared fact on its own live module path; ordinary policies call `recordReadyBusFact`, so selecting one alone still refuses a non-ready fact and withholds waiver reconciliation.

The final population expression is `{ in: ["@authored"], ext: ["ts", "tsx"] }`. Legacy `harnessGlobs()` already admits only authored TS/TSX, so the frozen old/final sets are byte-identical at 7,011/7,011. The separate `searchGlobs()` arm adds `.mts`; neither old gate execution nor the final descriptor admits it. The post-edit equality count is recorded below after all new tracked TS files settle.

The four converted producer policies have no current deferred rows. No reviewed grant or warning arm is needed for them, and no local table survives. `user-bus-coverage` cannot be partially split without overlapping its legacy detector or changing the unresolved member from blocking error to unowned warning. No legacy descriptor recognition, local exclusion, reviewed permission, or invented issue number was added. `bus-definition-belts` cannot convert independently because its producer-policy arm would see the deliberately unconverted user policy as absent; teaching the fact reader the legacy shape would be the prohibited adapter.

## Verification

Pending final shared-fact implementation, fixture/current-corpus differential, scoped checks, and exact diff receipts. Catalog and receipt files are excluded by parent scope and remain untouched.
