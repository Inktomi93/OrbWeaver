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
| `probes/rpg-extraction/` | the RPG structured-extraction probe rig — durable value is `docs/design/rpg-extraction-one-call-spike.md` + committed `SPEC*.md` verdicts, **not** a results artifact (its `out*/` dirs are gitignored) |
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

`dev/sandbox.sh` (`pnpm sandbox`) · `dev/oracle-steady-clone.sh` · `probes/history-system-rows.ts`
(`pnpm probe:history-system-rows`, the D69 capability measurement) · `mutation/arid-ignorer.ts` (the
Stryker `PluginKind.Ignore` plugin — `Spine-Testing.md` §"An ARID mutant is not a test failure").

Both survivors are HAND-RUN ONLY, re-derived 2026-08-22 (#421): `sandbox.sh` is reached solely by its
`pnpm sandbox` alias and runs on the HOST to launch `.devcontainer/`; `oracle-steady-clone.sh` is the
retired neo-parity campaign's capture rig — it needs an external neo-tavern working tree, no tool or
test executes it, and its only citations are the prose lines naming it as the regeneration procedure
for the committed `tests/support/fixtures/parity/neo-reference.json`
(`tests/support/parity-runner.ts:5`, the fixture's own `$comment`).

### `probes/rpg-extraction/` — 2026-08-22 disposition (#426)

Per `docs/reviews/tooling/2026-08-22-research-zone-assessment.md`'s deletion shortlist, six
harnesses were deleted 2026-08-22 (four self-declared `ARCHIVED 2026-08-02 — pre-R2R3 vocabulary …
do NOT run against the current contracts`, two superseded by `openrouter/f5-effort-translation.ts`'s
more rigorous, committed answer): `run.ts`, `run-coverage.ts`, `native-wire-probe.ts`,
`native-format-roundtrip.ts`, `effort-ladder-native-vs-or.ts`, `effort-reasoning-probe.ts`,
`replay-toolround.ts`. Recover any of them with `git log --diff-filter=D --oneline -- scripts/probes/rpg-extraction/<path>`
→ `git show <sha>^:scripts/probes/rpg-extraction/<path>`. Their value is preserved in
`docs/design/rpg-extraction-one-call-spike.md` (§2–§4) + `SPEC.md` + `SPEC-coverage.md`.

The three tracked capture JSONs those harnesses read — `real-cheap-toolround.json`,
`real-reliable-structured.json`, `real-narrative-turn.json` — are KEPT despite losing every reader
in this tree: `docs/design/rpg-extraction-one-call-spike.md:1255-1256` still cites them by name as
the frozen wire-shape record behind the spike's findings. They are a standing evidence artifact, not
live fixtures — do not treat their presence as a signal that a harness still runs them.

`steer-probe.ts` was assessed as a delete-candidate (superseded by `steer-probe-real.ts`) but kept —
weak row, 172 lines, costs nothing to keep; see the assessment doc for the full call.

Contrast `openrouter/`, where the "committed RESULTS" claim IS true: `results/*.jsonl` are git-tracked
and re-included by that dir's own `.gitignore` negation.

## Tool dependencies that LEFT this zone

`dev/multi-user-fixture.sh` and `dev/vllm-setup.sh` moved to `tooling/src/stack/` on 2026-08-22
(#421). Neither was research: `engines.sh` CALLS `vllm-setup.sh` (first-run venv bootstrap, and the
gpu image copies it), and `multi-user-fixture.sh` is contract-referenced by the stack tool, the seed
tool's `multi-user` verb (its env contract) and snap's fixture door — tooling reaching UP into
`scripts/` is the inversion the zone split exists to forbid. Their front door is now
`pnpm fixture <verb>` and `pnpm engines` (never a path).

### Server runtime data that USED to live here

`dev/qwen3_gen_thinking_serve.jinja` · `dev/qwen3_vl_embedding_serve.jinja` ·
`dev/qwen3_vl_reranker_serve.jinja` moved to
`packages/server/src/infra/providers/vllm/engine/templates/` on 2026-08-22 (#415). They were always
`packages/server` RUNTIME data, not tool data — `infra/providers/vllm/engine/build-argv.ts` is their
only consumer and the prod image serves with them — and the #393 P5 fork deliberately took the
reversible arm of leaving them here. The durable home is the package that owns them; nothing under
`scripts/` reads or ships a chat template any more.

## Deleted here, with no successor

`probes/useless-fragments.ts` — deleted 2026-08-22 by orchestrator ruling. Biome's `noUselessFragments`
is already on at `error` and covers the element-nested class; the script's residual return-position
single-child cases are style-tier, and `GATE-AUTHORING.md` §10 bans mirroring an enabled native rule.
**No replacement gate exists or should be built** (`docs/design/tooling-package.md` §7 carries the
measured receipt).

## Deleted by owner ruling (2026-08-22) — git history preserves them

Four one-shot lenses with zero invocations in any visible transcript window, each with its output
consumed when it ran: `probes/find-react-element-casts.ts`, `probes/find-shitty-casts.ts`,
`lens/kit-candidates.ts` (+ its `lens:kit-candidates` pnpm alias), and
`audit/build-repository-audit-manifest.mjs` (its output is committed under
`docs/reviews/repository-audit-2026-08-13/`). Recover any of them with
`git log --diff-filter=D --oneline -- scripts/<path>` → `git show <sha>^:scripts/<path>`.
