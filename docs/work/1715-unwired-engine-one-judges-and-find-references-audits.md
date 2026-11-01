---
kind: tooling
status: open
updated: 2026-10-31
priority: P2
area: tooling
plan: unwired-code
---

# Unwired engine one judges and find-references audits one way: homeWritten from direct writes, a key per union option, serviceReflectedReads deleted, reflected memoized, linked deduped (lands with 1697)

## What

The change, in a sentence.

## Why

The symptom or the ruling behind it.

## Done when

The observable bar a verifier can check.

## Evidence

Analysis that fixed this change, from a `pnpm unwired fields` run and a `--cross-check` run (byte-identical reports) and probes that called each engine on one world at a time. Proven means a run or a read of the cited code showed it. Inferred means the evidence points there and no run isolated it. Re-derive the rows with `pnpm unwired fields --cross-check`.

Which engine holds which side: `.disagreements[].found` is engine two's verdict (`tooling/src/unwired/fields.ts` computes and records it). Most rows are engine one `never-written` against engine two `wired` or `unreferenced`; the rest are `never-read`.

| Class | Cause | Right | Label |
| - | - | - | - |
| A1 | `envObjectSchema`. Both engines see the same reads and no writes. They differ on `homeWritten` (`fields.ts`): engine one counts the overlay writes in `resolveEnv` through the spread link in `packages/server/src/foundation/env/record/index.ts`. | Engine two: the values come from the host environment | proven |
| A2 | The same `homeWritten` gap on `portableImageryImageSchema` | Engine two; both engines miss the write itself | proven |
| B1 | A read on the domain params type reaches the schema key only through `{ principal, ...input }` in the router. Engine one links the spread. Find-references cannot. | Engine one: read exists, no production caller writes the key | proven |
| B2 | Same read path, and a production write exists in a form neither engine follows (see item 1697) | Neither: `never-written` is false | proven; the cursor row is inferred |
| C | Two schema union members share one field key. The tally keeps the first declaration but sums both members' sites. | Engine one's kind | proven |
| D | A member redeclares a base member. Find-references climbs to the base. | Engine one | proven |
| E | Kind only. Engine one credits a site to the wrong member of a contextual union or a schema `.extend` key. | Mixed | proven |
| F | A shorthand write in a literal returned through `.map` into `push(...)`. Engine two does not reach it. | Engine one | proven for the sites; the mechanism is inferred |
| G | Both engines miss a whole-object hand-off (`spiderPose(input, tracker)` passes the frame to `SpiderScene`). | Neither: `never-read` is false | proven |

Rows that stay false until item 1697 follows their forms: B2, A2 and G. Engine two found no genuine production use that engine one missed.

Program sets. Engine one, engine two and the checker walks load the same list: each `packages/*/tsconfig.json` that `tooling/src/unwired/worlds.ts` names, then `tsconfig.node.json` and `tsconfig.tests-dom.json`. `--cross-check` runs engine two on the TypeScript 6 language service. No scan loads `packages/server/tsconfig.router.json`, the three `packages/showcase-plugins/tsconfig.author-*.json` worlds, `tooling/tsconfig.json`, `tooling/src/codemods/tsconfig.json` or `tsconfig.tests-iso.json`.

The world suspicion fails, proven two ways. Every row is decidable in one program: a loaded world holds the declaration and every site either engine reported. The unloaded worlds hold no production site that a loaded world lacks; the only sites in files no scan loads are a spread read in `tooling/src/wire-tap/ops/sse.ts`, none of them a row and none production. The root `tsconfig.json` has `files: []` and does not see across worlds. Cross-world coverage comes from the union of per-world answers. Declaration keys are `path#index`, the same node in every world (`tooling/src/unwired/native.ts`).

TypeScript 7.1 API, read from `node_modules/@typescript/native/dist/api/` at the pinned beta:

- One session can hold every world (`openProjects` takes a list), and batches mix projects. `getReferencedSymbolsForNode` and `getSignatureUsage` batch but do not cross projects.
- The scans do not call `getSignatureUsage`.
- One session is the wrong trade. A sample of reference queries per world reached 8 GB with each checker barely touched, and the fully checked worlds sum to an upper bound of 34.5 GB. That is over the 16 GB bar. A merged program stays out for the reason at the top of `tooling/src/unwired/worlds.ts`.
- Keep the second process per world. One process reaches 8.2 GB against 5.0 GB split, for a gain of about 110 s.

Where the time goes (five worlds at load 32 to 50 on 24 cores). The suspicion that TypeScript 6 is the main cost fails.

| Phase | Share |
| - | - |
| Engine one `propertyIndex` | 41% |
| Engine two find-references, fresh process | 30% |
| TypeScript 6 `serviceReflectedReads` | 11% |
| TypeScript 6 program open | 6% |
| 7.1 program opens, both passes | 4% |
| Role classification (`rolesOf`) | 4% |
| Engine one `declarations` | 4% |

Porting the TypeScript 6 walks saves at most 17% of the attributed time and moves no peak memory. Two hot spots inside `propertyIndex` are larger per fix. In the ui world, `reflected` (`tooling/src/unwired/occurrences.ts`) spends 94% of the index reading every property of a library props type once per site. In the node world, `linked` took the Node process from 1.7 GB to 5.6 GB in one step by concatenating repeated site lists. The reported 7.9 GB peak is that Node process, not a compiler (inferred).

Not proven: the time the phases do not cover, and every budget after the change (run `/usr/bin/time -v pnpm unwired fields --out=reports/unwired/fields.json` on a quiet box after the change); that the 7.9 GB process is Node (the scan's own run was not sampled per process); why find-references misses class F; and the kinds of the class C keys outside the rows.

Retiring TypeScript 6:

- From `fields`: yes, by deletion. `params` already loads no TypeScript 6 program outside `--cross-check`.
- From the member scan, `unions` and `shapes`: not yet. `flows`, `builtByService` and `serviceConfirms` hold TypeScript 6 programs and need a port first.
- The `typescript` package stays. `tooling/src/unwired/classify.ts` parses alone, `worlds.ts` reads configs, and the 7.1 API has no parse-alone call. ESLint also uses it.
- Keep `--cross-check` until the other verbs show parity with it.

The trade this item accepts: it reports the rows that item 1697 owns as false findings now, where today they sit in the disagreement list. Landing evidence: filled at landing.
