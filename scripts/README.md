# `scripts/` — the research zone (explicitly throwaway)

> The durable tool fleet LEFT this tree. Every standing instrument, checker, codemod, launcher, and
> operator CLI now lives in `tooling/` as `@orb/tooling` (`docs/design/tooling-package.md`; the
> constitution's tooling-tree law is `docs/architecture/core/Core-0-Architecture-and-Structure.md` §9).
> What remains here is deliberately throwaway: probe rigs, one-shot lenses, launcher shims, and
> operator scripts. **Nothing here is law, and nothing here is a fleet instrument.**

## The zone's rules

- **KISS/YAGNI apply here and only here.** The constitution suspends them for the architecture
  (`AGENTS.md` §0.1 tripwire 2); this tree is the named exception — a probe is allowed to be a
  400-line straight line with hardcoded paths.
- **No five-slot template, no size cap, no front-door gate.** The five `tooling-*` gates scan
  `tooling/src/` only. A file here answers to biome's blanket relaxations (`biome.json` — the
  `scripts/**` override) and nothing else.
- **This zone MAY import `@orb/tooling`.** Plumbing reuse beats respelling: a probe imports
  `@orb/tooling/_shared/browser` rather than re-minting a Playwright bootstrap. The one-way glass is
  `packages/** ⇏ tooling/**` (the `packages-no-tooling` cruiser stanza), never `scripts/ ⇏ tooling/`.
- **A file here is never a `pnpm check` dependency.** If something in this tree becomes load-bearing
  for verification, it is not research any more — promote it into `tooling/src/<tool>/` under the
  five-slot template and delete the original (no compat stub).
- **knip entry-globs the whole tree** (`knip.ts`), so nothing here is analysed for unused exports.
  That is deliberate for a research zone and is exactly what the promotion to `tooling/` reverses.

## What stays, and why

### Research-keep, recent use

| path | why |
| - | - |
| `probes/st-goldens/` | the SillyTavern parity rig; carries a gitignored captured runtime, fenced in biome/knip/stryker/tsconfig by its own path |
| `probes/rpg-extraction/` | the RPG structured-extraction probe corpus + committed `SPEC*.md` verdicts |
| `probes/impersonate/` | the impersonation-quality rig with committed `RESULTS.md` + `results.jsonl` |
| `probes/openrouter/` | seven standing OpenRouter wire probes with committed `RESULTS.md` + `results/*.jsonl` |

### Reference / instrument value despite idleness

| path | why it is not deletable |
| - | - |
| `probes/sdk-behavior-probe.ts` `sdk-cache-probe.ts` `sdk-dynamic-content-probe.ts` `sdk-injection-cache-probe.ts` `sdk-session-probe.ts` | the five aliased agent-sdk probes (`pnpm sdk:*-probe`) that GROUND the Tier-3b agent-sdk behavioral claims — `Tier-3b-Providers.md` cites `sdk-cache-probe` as the reproduction for the cache matrix, re-run after every SDK bump |
| `probes/sdk-hook-wire-probe.ts` | the family's only WIRE-LEVEL member: a loopback capture server reading the real `/v1/messages` body, exercising the real credential-firewall exports (`dynamicContextOptions`/`firewallBase`). Hand-run by design; no alias, needs none |
| `probes/transcript-census.ts` | the census half of the tool-guard tuning rig — named in `SELF_TOOL_RELPATHS` in `.claude/hooks/tool-guard.mjs`, and the source of the doctrine's Bash-call census. Its header is also the only record of the reverse-engineered transcript JSONL shape |
| `probes/guard-replay.ts` | the guard rig's other half (same `SELF_TOOL_RELPATHS` constant) |

### Root-shim survivors (launchers, not tools)

| path | why it did not move |
| - | - |
| `ts7.cjs` | the TS7 wrapper. `package.json`'s three `typecheck*` rows, the verify registry, and every brief's `types:graph` spelling depend on this exact path; it is a `.cjs` launcher, not a tool |
| `worktree-bootstrap.sh` | `pnpm worktree:bootstrap`'s target |

### Operator one-offs

`dev/sandbox.sh` (`pnpm sandbox`) · `dev/vllm-setup.sh` · `dev/oracle-steady-clone.sh` ·
`dev/multi-user-fixture.sh` · `probes/history-system-rows.ts` (`pnpm probe:history-system-rows`, the
D69 capability measurement) · `mutation/arid-ignorer.ts` (the Stryker `PluginKind.Ignore` plugin —
`Spine-Testing.md` §"An ARID mutant is not a test failure").

### Server runtime data that lives here for a reason

`dev/qwen3_gen_thinking_serve.jinja` · `dev/qwen3_vl_embedding_serve.jinja` ·
`dev/qwen3_vl_reranker_serve.jinja` — these are `packages/server` RUNTIME data, not tool data:
`infra/providers/vllm/engine/build-argv.ts` resolves them by path and the `Dockerfile` bakes them into
the prod image. No tool reads one. Moving them into `tooling/` would make the cake read a runtime file
out of the tool tree through an unguarded path string. Their right long-term home is a server-owned
data dir — an owner decision, not the tooling program's.

## Deleted here, with no successor

`probes/useless-fragments.ts` — deleted 2026-08-22 by orchestrator ruling. Biome's `noUselessFragments`
is already on at `error` and covers the element-nested class; the script's residual return-position
single-child cases are style-tier, and `GATE-AUTHORING.md` §10 bans mirroring an enabled native rule.
**No replacement gate exists or should be built** (`docs/design/tooling-package.md` §7 carries the
measured receipt).

## PENDING OWNER — flagged for delete, not deleted

Zero invocations in any visible transcript window; each is a one-shot lens whose output was consumed
when it ran. **Git preserves every one of them** — deletion costs nothing but the `git log` hop.
Nothing has been removed; this table is the ruling request.

| path | class | coupled site that dies with it | git preserves |
| - | - | - | - |
| `probes/find-react-element-casts.ts` | one-shot lens (a cast census, consumed) | none (no pnpm alias) | yes |
| `probes/find-shitty-casts.ts` | one-shot lens (a cast census, consumed) | none (no pnpm alias) | yes |
| `lens/kit-candidates.ts` | one-shot lens (kit-promotion candidates, consumed) | the `lens:kit-candidates` pnpm alias dies with it | yes |
| `audit/build-repository-audit-manifest.mjs` | one-shot generator for the 2026-08-13 repository audit (its output is committed under `docs/reviews/repository-audit-2026-08-13/`) | none (no pnpm alias) | yes |
