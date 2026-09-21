# Brand boundary audit — merged tree 5438cf0e4f5e

This is a TypeScript-checker audit, not a regex census. It used one native tsconfig project per process through `pnpm exec node`, resolved unique-symbol brand properties and declarations, compared assignability, classified Zod input/output types, and then used real ast-grep over 6457 TS + 1409 TSX files as independent structural corroboration. `rg` only located source for reading.

## Denominator

- All nine package programs: 3,428 memberships / 3,428 physical files.
- Tooling, Node tests, DOM tests, ISO tests, scripts, and Playwright: 4,459 memberships.
- Combined, deduplicated: 7,847 physical files. There are 40 cross-world duplicate memberships.
- Explicit remainder: root-owned top-level TypeScript config files. The all-root retry was stopped because it duplicated the already-covered corpora; the old zero-file artifact is refused.

The discarded first bootstrap is not evidence that the repo is too large. It used the wrong legacy synthetic-project path and bare `node` (4,192 MiB heap), bypassing the workspace's `pnpm exec node` policy (16,480 MiB). The successful scans used native configs sequentially and exited between them.

## Confirmed findings

1. **High — TypeID schemas are systematically under-validating.** The checker resolved 338 production `brandedId<T>()` calls: **307 target `TypeIdOf` aliases** even though the helper's own contract says those must use `typeIdSchema`; 31 are legitimate prefixless brands. The current no-raw-id gate explicitly accepts either helper, so it preserves the defect. A wrong-prefix or malformed nonempty string crosses the wire carrying the stronger entity brand. The repair is a checker-resolved gate split plus bounded domain migrations and wrong-prefix tests.

2. **High — inference §5.3c remains incomplete.** Seven model/provider columns are plain text: `user_connections.model`, `message_variants.model/provider`, `model_stats.model/provider`, and `imagery_generations.model/provider`. ST import forwards arbitrary file strings into the variant writer. A `$type<>`-only patch would lie; producer validation, ruled unknown mapping, schema brands, and one negative test per column must land together.

3. **Medium — workload dependency authority is already broken.** `workloads.start` accepts caller-authored `dependsOn`, persists it, and the scheduler reads dependency statuses without owner scope. User A can make A's row wait/run/fail based on a known User-B workload id; absent/malformed ids poison A's row. The waiver's stated end condition has already occurred.

4. **Medium — three inference streams manufacture `'' as ChatId`.** The request contract independently makes `chatId` and `onDelta` optional. OpenAI-compatible, Anthropic, and agent-sdk paths therefore emit a branded empty id when a callback is present without chatId.

5. **Low — fake brand sentinels remain.** Client disabled-query/inert-row paths manufacture empty ChatId/MessageId/PresetId values; invite preview manufactures an empty Handle on a supposedly unreachable host absence. Use conditional query construction/nullable inert shapes and fail the host invariant.

6. **Low — BroadcastChannel Handle parsing is weaker than its return type.** Any string becomes `Handle`. Current consumers compare/reload only, so no privilege escalation was confirmed.

## Closed semantic populations

- 78 checker-resolved brand-bearing aliases: 2 primitives, 62 concrete TypeIDs, 13 concrete prefixless brands, and 2 derived aliases (see JSON sites).
- 383 relevant production assertions; 90 are non-assignable source→brand target; 48 are double assertions. Zero brand-bearing non-null assertions and zero production `@ts-*` directives were found.
- 350 Drizzle `$type<T>` calls: 254 direct brands, 10 brand-bearing containers, 86 unbranded.
- 569 Zod semantic operators; 347 have checker-non-equivalent input/output and 13 produce brand-bearing output.
- 145 production `safeParse`/`safeParseAsync` calls and 157 type predicates were captured with checker types; no assertion functions were found.
- tRPC: 367 input validators and 423 terminal procedures (252 mutation / 169 query / 2 subscription), with **zero runtime output validators**. The client has one intended type-only AppRouter bridge over JSON HTTP/SSE and structural ast-grep finds 193 `inferOutput` plus 179 `inferInput` projections. This is a coverage gap pending a high-consequence output inventory, not a confirmed defect by itself.

## Bounded next work

The JSON report contains every brandedId site and classification, every relevant assertion, all 350 Drizzle sites, every Zod operator with checker input/output, safeParse access facts, predicates, per-program denominators, raw artifact hashes, and exact repair groups. Two investigations remain explicit: a table-symbol producer/read graph for all 264 brand-bearing Drizzle sites, and business-intent review of the 347 Zod input/output-different sites. Root-only config files are also outside this tranche.
