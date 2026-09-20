---
kind: review
status: complete
updated: 2026-09-20
---

# Typed options conditional-spread census

## Scope and method

The closed corpus is every tracked `.ts` and `.tsx` file. Raw `ast-grep` runs searched TypeScript and TSX separately with `--selector spread_element` and the patterns `{ ...($COND ? { $$$B } : {}) }`, `{ ...($COND ? {} : { $$$B }) }`, and `{ ...($COND && { $$$B }) }`. The TypeScript run scanned 6,475 files and the TSX run scanned 1,461 files; a lane-local control containing misspelled-key ternary and logical-AND spreads was included in the same TypeScript invocations, and both controls were found. An independent TypeScript syntax walk over `rg --files -g '*.ts' -g '*.tsx'` scanned 7,806 tracked files and reproduced the same 1,787 repository occurrences. The `ast-grep` scanned-file denominator is larger because it reports every language-selected filesystem input before the tracked-file restriction; the candidate denominator agrees after the two planted controls are excluded and matches are deduplicated by file/range/text.

| surface | packages | tests | tooling | scripts | root | total | disposition |
| - | -: | -: | -: | -: | -: | -: | - |
| typed object literals | 1,032 | 219 | 174 | 4 | 4 | 1,433 | target population |
| JSX prop spreads | 307 | 47 | 0 | 0 | 0 | 354 | excluded: component-prop omission, not options/filter/params construction |
| total | 1,339 | 266 | 174 | 4 | 4 | 1,787 | closed |

The 1,433 object spreads divide without overlap:

| classification | count | verdict |
| - | -: | - |
| contextual closed object type; every conditional-arm key is declared | 1,233 | keep; no evidence of name drift |
| contextual closed object type; at least one key initially appears undeclared | 56 | manually classified below |
| contextual string-indexed/open object type | 84 | keep; arbitrary keys are the declared contract |
| no contextual target type | 52 | unavailable to excess-property hardening without inventing a target type |
| outside every configured TypeScript program | 8 | fenced tooling population; report only |
| total | 1,433 | closed |

The 56 apparent misses divide into 34 `unknown` contexts, 14 open-map or third-party union contexts whose string-index arm is not enumerable as a common property set, three `any`/`never` test contexts, one custom-reporter configuration seam, and four real production mirror/argument omissions. The first 51 retain their current omission spreads: converting them would add no closed declared-key check or would disturb `exactOptionalPropertyTypes` behavior without evidence of a defect.

The eight files outside configured programs are `tooling/src/review-mirror/cli.ts` (two occurrences), `tooling/src/mutation-probe/cli.ts`, `tooling/src/verify/gates/platform-spellings.ts`, `tooling/src/wire-tap/ops/sse.ts` (two occurrences), `tooling/src/wire-tap/ops/captures.ts`, and `tooling/src/wire-tap/ops/trpc.ts`. Tooling is fenced for this lane.

## Findings

| site | declared target receipt | runtime receipt | verdict |
| - | - | - | - |
| `packages/server/src/domain/chat/substrate/assemble-gather.ts` (`k`, `minScore`, `rerank`) | `GatherDatabankOp` in `domain/chat/contract/context.ts` omitted all three | `DatabankGatherParams` and `createGatherRetrieval` declare and consume all three | mirror omission; repaired and each nonempty arm checked with `satisfies Pick<...>` |
| `packages/server/src/domain/chat/verbs/generate-image.ts` (`size`) | `GeneratePictureOp` in `domain/chat/contract/context.ts` omitted `size` | imagery's `GeneratePictureParams` declares and consumes `size` | mirror omission; repaired and each nonempty arm checked with `satisfies Pick<...>` |
| `packages/server/src/domain/rpg/chat-ops/gather.ts` (`terminalTools`) | `RpgGatherResult` omitted `terminalTools` | the gather returns it and chat's `ChatRpgGatherResult` consumes it | return-contract omission; repaired and the nonempty arm checked with `satisfies Pick<...>` |
| `packages/server/src/entry/compose/chat.ts` (`signal`) | `ResolveTaskParams` and inference `ResolveArgs` omit `signal` | `createResolve` forwards task/principal/actor/connection only | ignored input; no resolver cancellation contract exists, so this review does not invent one |

The fenced custom-reporter seam is `playwright-ct.config.ts`: `slotDir` and `racing` are real `CtFlakyReporterOptions` consumed by `tooling/src/verify/ops/ct-flaky-reporter.ts`, while Playwright's built-in `ReporterDescription` union cannot describe a custom reporter's option type. Runtime behavior is intentional; tooling ownership decides whether to add an explicit custom-reporter tuple type.

## Hardening boundary

The three repaired mirrors already had behavioral coverage for the live values: `assemble-gather.int.test.ts` pins `k`/`minScore`/`rerank` present and omitted arms, `generate-image.int.test.ts` pins the image-size forward, and `rpg/chat-ops/gather.int.test.ts` pins `terminalTools` present and absent arms. The hardening changes only declared mirrors and fresh nonempty-arm checks. It preserves omission rather than writing `undefined`, so `exactOptionalPropertyTypes` behavior and wire bytes stay unchanged.

## Verification receipt

A planted mutation changed the checked `size` arm to `wrongSize`; the package compiler rejected it with TS2353 against `Pick<PictureParams, "size">`. The original file was then restored before the green run. After hardening, the independent syntax census reports 1,782 occurrences: 1,423 ternary object spreads, five logical-AND object spreads, and 354 JSX spreads. The five-occurrence reduction is syntactic: the repaired nonempty arms now contain parenthesized `satisfies Pick<...>` expressions, while their runtime omission behavior is unchanged. The type-program pass now reports 1,420 object candidates and no longer reports the three repaired mirror omissions; the unsupported resolver `signal` remains the one production declared-key miss.

`pnpm test:scoped tests/server/domain/chat/substrate/assemble-gather.int.test.ts tests/server/domain/chat/verbs/generate-image.int.test.ts tests/server/domain/rpg/chat-ops/gather.int.test.ts` passed 52 tests. `pnpm typecheck` passed all 13 runnable compiler programs. Scoped Biome, ESLint, documentation formatting, and `git diff --check` also passed.
