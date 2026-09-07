---
kind: spec
status: active
updated: 2026-09-06
---

# The type-world program: derivable test-program membership

> **COMMITTED (not yet built).** This document owns the durable shape; GitHub Project 1 owns lifecycle
> ([#1351](https://github.com/Inktomi93/orbweaver/issues/1351)). Provoked by an external architecture
> review of the TypeScript program layout. **Adopt the shape, not that proposal verbatim**: its phase
> order is inverted and two of its recommendations are refuted by measurement. Both are recorded below,
> because a lane handed the raw proposal will build the right destination in the wrong order and
> re-create the ledger inside a nicer config.

## Terminal state

Type-program membership is DERIVABLE from package + directory + suffix. No `tsconfig` contains a test
filename. `tests-type-membership` asserts each file is in the program the routing model PREDICTS, not
merely in at least one program.

Acceptance measure (today it reports 51 and exits 1; at close it must report 0):

```
node -e 'const fs=require("fs");const strip=s=>s.replace(/^\s*\/\/.*$/gm,"");
const g=strip(fs.readFileSync("tsconfig.json","utf8"));
const d=strip(fs.readFileSync("tsconfig.tests-dom.json","utf8"));
const re=/"(?:tests|scripts|playwright)\/[^"*]*\.(?:ts|tsx)"/g;
const a=g.match(re)||[], b=d.match(re)||[];
console.log("per-file test entries: tsconfig.json="+a.length+" tests-dom="+b.length);
process.exit(a.length+b.length>0?1:0)'
```

## Status 2026-09-06 — phase 1 landed, and the config half of phase 5 with it (branch `cb/type-worlds-bork`)

Measured first, on `main` at 7754c2405, by writing the two world programs BY RULE ONLY (no per-file entry
anywhere) and typechecking each: the browser world was clean (4,449 files, a planted control proved it could
red); the node world red 728 times — 567 in 76 `packages/{ui,client}/src` files pulled in transitively by
exactly FOUR node-side importers (`tests/support/browser/ct-config-groups.ts` through six client barrels, two
tooling tests through `@orb/ui/lib` for one pure constant each, one server test through `@orb/client/data/bus`),
142 in the 17 DOM-coupled `tests/support/ct` helpers' own bodies, 12 in the st-goldens rig script, 7 in four
tooling tests' in-page callbacks. Every one of those had an answer that is not a list:

- **Phase 1:** `tests/support/ct/` is gone; 24 helpers whose bodies need lib.dom live in `tests/support/browser/`,
  15 node-side ones in `tests/support/node/` (moved through the codemod kit; the split is the measured one,
  not a guess). Spelled `tests/support/{browser,node}` rather than `tests/_support/…` so every rule that already
  names `tests/support/` (test-layout's exemption, the CT changed-scope view, vitest's serial lane) kept
  working without a coupled-site sweep; the `iso/` directory is minted when a helper needs it.
- **Phase 5, the config half:** `tsconfig.json` (the node world) and `tsconfig.tests-dom.json` (the browser-tests
  world) carry directory + suffix rules only; `packages/{ui,client}/tsconfig.json` check nothing but their own
  src (every test `.tsx` and the CT mount are rooted by the browser-tests world). The acceptance measure above
  reports 0. The `scripts/probes/st-goldens` rig joined the browser-tests world as a DIRECTORY, on the
  `tests/e2e` precedent (a browser-driving rig whose scripts read page state inside `evaluate` callbacks).
- **The four barrel importers:** the two tooling tests and the server test import the pure LEAF module by
  relative path (`class-merge.ts`, `variant-attrs.ts`, `chat-event-seq-guard.ts`); `ct-config-groups.ts` is a
  browser helper and moved. Phase 3 (barrel homogeneity) remains the durable cure for the barrels themselves.
- **The four tooling tests:** three in-page callbacks became string-body `page.evaluate` calls (the
  appearance-invariant-runtime precedent — a node-world test cannot type an in-page callback, and a
  browser-world helper would drag lib.dom back in through the import; the import DIRECTION is the fence), and
  one `RequestInfo` became `Parameters<typeof fetch>[0]`.

Phase 0 (the vocabulary module + the predictive membership report) is still open (#1858); phases 3, 4 and 6 are
untouched. The routing algebra (`program-routing.ts`), the edit hook, eslint's parser map and biome moved in
the same commit.

## The diagnosis

Two mechanical causes make membership underivable, so it has to be enumerated instead.

**1. Test helpers do not declare their world by location.** `tests/support/ct/` is 31 files in one flat
directory spanning three type programs: node orchestration (`route-trpc.ts`), in-page DOM callbacks
(`pixel-contrast.ts`, `measure-clamp.ts`), browser components (`ct-providers.tsx`), a CT test
(`touch-floor.ct.tsx`), and a node test (`story-shot.test.ts`). A helper has no runner-bearing filename,
so nothing but its location could declare its world, and its location declares nothing. **13 of the 25
per-file `tsconfig.tests-dom.json` include entries come from this single directory.**

**2. Barrels are not world-homogeneous.** Inside `packages/client/src`, the package-internal aliases
resolve to the impure `index.ts`: `#lib` 368 import sites, `#state` 407, `#data` 424. A node test
reaching any client constant through a front door drags DOM-dependent source into a DOM-less program.

The repo already reached this diagnosis and deferred the cure. `tsconfig.json`'s #1243 note:

> every prior round of this section individually excluded ONE `tests/client/**` file at a time ... and
> EACH round exposed a fresh, still-growing layer of independent reachers into the SAME impure client
> chains (`#lib`/`#state`/`#data` package-internal aliases, which always resolve to the impure
> `index.ts`, never a `pure.ts` subpath) — the signature of a wrong unit of work, not a shrinking ledger.

Five rounds on `tests/client`, five more on `tests/ui`, then containment by wholesale directory glob.
`tests/ui`'s note states why the cure was skipped: "no `@orb/ui/lib/pure` surface exists (out of this
round's scope)."

**The `pure.ts` answer failed, and the files say so.** Three hand-maintained mirrors totalling 524 lines
whose headers state that #1262 measured every stated justification and refuted all three. The surface
re-exports `document`, `window`, `navigator`, `performance`, `BroadcastChannel` and seven React hooks, so
it is not pure. 55 consumers: 54 tests, all of which live in the DOM program anyway, and one production
import of one boolean. Deletion is [#1339](https://github.com/Inktomi93/orbweaver/issues/1339).

**The truth-teller is half-built and half-blind.** `tooling/src/verify/ops/tests-type-membership.ts`
unions program closures via `ts7 --listFilesOnly` and reds on any `tests/**` or `playwright/**` file in
ZERO programs. Two limits: it asks "at least one", never "the right one"; and its `PROGRAMS` constant is
hardcoded to 4 of the repo's 9 programs, omitting `tooling/tsconfig.json` and
`packages/{server,kit,contracts,db}`. Its sibling in the same tool states the law it violates.
`dangling-doc-cite.ts`: "The set is DERIVED from the tree, never a path list: a hard-coded file constant
dies silently on rename (GATE-AUTHORING.md §3)."

## Measured substrate

Taken against `main` on 2026-09-04. Recorded here so no lane re-derives them; re-measure before acting on
any single figure, since the tree moves.

| fact | value |
| - | - |
| per-file test entries in `tsconfig.json` exclude / `tsconfig.tests-dom.json` include | 26 / 25 |
| of those, from `tests/support/ct/` alone | 13 |
| tsconfig files on the tree / real programs | 10 / 9 |
| programs the membership stage checks | 4 |
| client impure-alias import sites (`#lib` + `#state` + `#data`) | 1,199 |
| `pure.ts` lines / consumers / production consumers | 524 / 55 / 1 |
| tracked test files | 2,616 |

Vocabulary restated by hand across the config surface: `.int.test` 10 homes, `__g_*` 9, `reset.d.ts` 8,
`platform.d.ts` 7, `.test-d` 7, `.ct.tsx` 6, `tests/support/ct` 6, `moduleResolution: bundler` 6,
`esnext.disposable` and `esnext.temporal` 4 each. TypeScript FORCES the tsconfig half: a child `lib` or
`include` overwrites the parent's, so every overriding program must restate them. The cross-tool half is
ours.

`tsconfig.base.json`'s own comment on the ambient pair says "three programs" and enumerates two;
`tooling/tsconfig.json` is the missing one. A hand-maintained list, a comment tracking that list, and the
comment already off by one.

## Phase order

**Ordered by what each phase DELETES.** No phase may land a new abstraction before the thing it
abstracts has been reduced.

| phase | does | deletes | enforces |
| - | - | - | - |
| 0 | `project-worlds.ts` vocabulary; DERIVE the membership stage's program list; add an actual-vs-predicted membership REPORT | nothing | nothing |
| 1 | `tests/_support/{node,browser,iso}/` helper world directories | 13 of 25 tests-dom entries + their exclude twins | |
| 2 | delete the three `pure.ts` mirrors (#1339) | 524 lines, 3 mirrors, 2 package.json keys | |
| 3 | **barrel homogeneity** for `#lib`/`#state`/`#data` and `@orb/ui/lib` | the wholesale `tests/client` and `tests/ui` globs | |
| 4 | reclassify tests by suffix; add `.ct-d.ts` | | |
| 5 | world configs; `files: []` on abstract templates; explicit ambient ownership and roots | the lib-array and ambient-pair duplication | |
| 6 | membership becomes PREDICTIVE | the ledger | yes |
| 7 | `pnpm typecheck --file <path>` router through the phase-0 model | | |

**Phase 0 enforces nothing deliberately.** It is the only instrument that can measure the rest, and the
current stage cannot, because "at least one program" cannot distinguish correct membership from
accidental membership. Every later phase's acceptance is that report's escapee count moving.

**Phase 3 before phase 4** is the external review's own strongest correction and it is right: "The runner
chooses the root world, but the entire imported closure must be compatible." A suffix cannot overrule a
dependency graph, so reclassification is illegal until closures are compatible.

**Phase 6 is the keystone and nobody proposed it.** Flipping the gate from "at least one" to "the
predicted one" is what converts the ledger from audited to structurally impossible: an escapee reds at
the moment it is created rather than being discovered and then enumerated. Without it, the program yields
a prettier config that re-accretes.

Hard ordering constraints: 0 before everything; 2 before 3; 3 before 4; 6 last among enforcing phases
(a predictive gate landed before phase 3 reds the tree).

## Corrections to the external review

**Its phase order is inverted.** It sequences config work first (its steps 1 through 6), barrel
homogeneity at 7, reclassification at 8. The barrel impurity is what created the ledger; restructuring
configs first means designing world templates around the same broken closures and carrying the escapee
list into the new shape, where it reads as a feature rather than as debt. The tiny leaf config is the
reward for the barrel work, not the setup for it.

**"Keep the four world configs hand-authored" protects the wrong half.** Its reasoning is that their
contents are "small, important, and should remain directly reviewable." But the lib array lives in 4
files and the ambient pair in 7 precisely because TypeScript makes a child overwrite the parent, and
hand-authoring those is what produced the off-by-one comment above. The rule this program adopts:
**generate the parts TypeScript forces you to restate; hand-author the parts that express intent.**

**Accepted without change:** `files: []` on abstract world templates (without it, a directly-invoked
template defaults `include` to `**/*` and sweeps the repo); explicit roots on the default Node project;
explicit ambient ownership, for which `tsconfig.base.json:112` already carries the mechanism
(`${configDir}/../../{reset,platform}.d.ts`) and documents the override hazard; helper world
directories; `.ct-d.ts` for browser type tests; the one file-to-program router; keeping `.spec.ts` for
e2e (29 files where directory plus suffix already name the harness world unambiguously); and its
narrowing of "no config contains a filename" to *type-world ownership* must be derivable, which leaves
explicit scheduling lists (mutation targets, serial lanes, package exports) legal.

**Rejected:** conditional or broad internal test exports, which it refuted itself on the Knip
entry-surface argument.

**A caution on its citations.** The review was produced against a comment-STRIPPED copy of the tree, so
its line numbers do not match this repo, and its report of a "broken orphan comment fragment" at
`.dependency-cruiser.cjs` line 659 is an artifact of that stripping rather than a defect. Treat its line
references as approximate and re-derive before acting.

## Forks

**`tests/` as a workspace package. Owner call, not a phase.** The review agrees with it in passing and
under-scopes the blast radius: there is no `tests/package.json` today and 2,616 test files, so creating
it gives Knip a new workspace, changes what dep-cruiser's `not-to-dev-dep` and package-cake rules see,
and makes biome's `noUndeclaredDependencies` re-evaluate every import in all of them. No phase depends on
it. **Default if unruled: skip it.** The terminal state does not need it.

## Non-goals

- Recalibrating any mutation threshold, or any change to `stryker*.config.json`.
- The runtime-lane ledgers (`SERIAL_INT`, `LIVE_DRIVE`) and the Stryker lane allowlist. Same disease, a
  hand-maintained list held true only by a comment, but a different file family and a different failure;
  it is [#1340](https://github.com/Inktomi93/orbweaver/issues/1340) and must not wait on this program.
- Repo-wide comment slimming (owner ruling 2026-09-04). The root-config reading-set entry is
  [#1337](https://github.com/Inktomi93/orbweaver/issues/1337).
- Extending doc-catalog receipts to non-Markdown files.
- Renaming `.spec.ts`.

## Child rows

Rows for phases 0, 1, 3, 4, 5, 6 and 7 are minted as the program activates, so each carries its own
re-derivation against the tree it actually lands on rather than against this document's baseline.
