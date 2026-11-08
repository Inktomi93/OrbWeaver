---
kind: tooling
status: open
updated: 2026-11-07
priority: P3
area: testing
plan: test-foundation
---

# Spike mutation testing through Playwright component tests

## What

Stryker's Vitest runner cannot run our CTs, so client files proven mostly by CT report no coverage. Try stryker-playwright-runner and its JSX mutators from github.com/LayZeeDK/lz-playwright-test on one CT-covered file, transcript-window\.tsx, after pnpm test:mutation lands. It uses mutant switching through a context init script, one instrumented build and per-test coverage. It relies on undocumented Playwright internals, and our CT serves a production preview build.

## Why

The hottest client files are proven by CT, so mutation testing cannot grade them today, and a no-coverage result there reads as no tests.

## Done when

A run on one CT-covered file reports real kills and survivors, a hand-checked sample of survivors is true, and the record says adopt, vendor or drop with the reason.

## Evidence

Ruling: drop. The runner works and its kills are real, but the cost per mutant rules out routine use, and the package does not exist on npm.

What ran. Upstream commit `a1fdca193cfd4d86dfb3641163c31317cd2a4e99` was loaded by path from a gitignored folder, with no install. The runner was `lz-playwright` with `perTest` coverage, concurrency 1, no checker, the JSX mutators and the `arid` ignorer. The run used a scrubbed env and the shipped CT build (`playwright-ct.config.ts`, Playwright 1.64.1, Stryker 10.1.1, `@babel/core` 8.0.10). Every spike file is deleted.

| Run | Population | Tests | Result | Wall | Anon peak |
| - | - | - | - | - | - |
| Whole file | 329 mutants | CTs whose stories render a chat room | stopped at 86 tested: 7 survived, 8 timed out | 4 h with about 9.5 h left | 10.3 GB |
| Pager ranges, lines 113-118 and 147-149 | 28 mutants | the history pager, pagination and retry CTs | 18 killed, 1 timeout, 9 survived | 130 min | 8.3 GB |

Cost. A mutant takes 2.5 to 4.2 min: each mutant run starts Playwright and its workers again and runs every covering test. Most chat CTs mount the whole room, so most mutants have many covering tests. The CT build and preview start once per run and take about 2 min. The dry run takes 8 to 12 min. One CT-covered file costs about 13 h. The memory peak stays under the 16 GB per-run bar.

Survivor hand-check, pager-range run. Kills on the same lines show the mutants reach the page. Each survivor ran every covering test to completion.

| Site | Mutant | Verdict | Evidence |
| - | - | - | - |
| 113 | `failure !== null` to `false` | equivalent | every path that sets a failure also sets `reported`, which makes `available` true (`packages/client/src/features/chat/lib/history-failures.ts`) |
| 118 | `data-keep-in-view` value `""` to text | equivalent | the message list reads the attribute's presence only (`packages/ui/src/primitives/message-list/message-list.tsx`) |
| 147 | `role="status"` removed | true gap | the end statement loses its live region; the CTs find it by id, never by role |
| 147 | `voice` `gloss` to `""` | equivalent | that branch applies only while the text is `sr-only`, so no style shows |
| 148 | description `""` while older pages remain | true gap | no CT reads the accessible description of Earlier messages |
| 148 | end-of-history text `""` | true gap | the end-of-history CTs check the box and font size, never the text |
| 149 | count never shown | true gap | no CT reads the messages-loaded count |
| 149 | text added while nothing is loaded | true gap | no CT reads the whole status text |
| 149 | count emptied after a page | true gap | as above |

The timeout, `loaded !== null`, counts as detected: its sibling `false` mutant dies on the same tests. No survivor is a runner fault. No component in the file has a destructured default parameter, so the Babel 8 compiler skip does not touch it. The whole-file run was stopped, so it wrote no report and its survivors have no names.

Fit with our CT build. These hold for any Stryker run that builds the CT gallery in a sandbox:

- The webServer's pnpm runs its deps check in the sandbox, installs there, and writes through the linked `node_modules` entries into the real checkout's `.bin` shims. `npm_config_verify_deps_before_run=false` stops it.
- The sandbox has no `.git`, so Tailwind ignores `.gitignore`. The build took 97 s at 30.7 GB anon, against 36 s at 2.9 GB outside it. `git init` in the sandbox restores the normal cost.
- The gallery output folder sits under `packages/client/node_modules`, so a sandbox build writes into the real checkout.
- Instrumented code makes the React Compiler skip most of the file.
- Under the runner, two app-shell CTs that pass on the unmutated tree failed in the dry run. One needed a retry to pass.

Upstream. `@layzee/stryker-playwright-runner` and `@layzee/stryker-jsx-mutators` are private `0.0.0` packages, so adopt is not possible. The repository is days old and changes many times a day. The runner probes Playwright internals (`TestRunner`, `_instrumentation`, `TestInfo._timeoutManager`, `Suite._parallelMode`) and fails loudly when they change. They match our pinned 1.64.1. Vendor would copy the runner and the mutators into `tooling/` and still leave the cost per mutant.
