# `scripts/` — the research zone (explicitly throwaway)

> The durable tool fleet LEFT this tree. Standing instruments, checkers, codemods, and
> operator CLI now lives in `tooling/` as `@orb/tooling` (`docs/law/Core-Tooling-Law.md`; the
> constitution's tooling-tree law is `docs/law/Core-0-Architecture-and-Structure.md` §9).
> Research here is deliberately throwaway: probe rigs, one-shot lenses, and operator scripts.
> Direct process launchers and supervisors also live here under Core-Tooling-Law §2.6. Their
> verification contracts remain enforced; the research exemptions do not erase those contracts.

## The zone's rules

- **KISS/YAGNI apply here and only here.** The constitution suspends them for the architecture
  (`AGENTS.md` "Posture"); this tree is the named exception — a probe is allowed to be a
  400-line straight line with hardcoded paths.
- **No five-slot template, no tooling size cap, no tooling front-door gate.** Those gates scan
  `tooling/src/`. The configured Biome relaxations do not remove compiler ownership or the typed
  ESLint checks on direct TypeScript launchers.
- **This zone MAY import `@orb/tooling`.** Plumbing reuse beats respelling: a probe imports
  `@orb/tooling/_shared/browser` rather than re-minting a Playwright bootstrap. The one-way glass is
  `packages/** ⇏ tooling/**` (the `packages-no-tooling` cruiser stanza), never `scripts/ ⇏ tooling/`.
- **Research implementations do not become standing verification tools in place.** Promote them
  into `tooling/src/<tool>/` under the five-slot template and delete the original. Native process
  adapters may front verification commands under Core-Tooling-Law §2.6; they reuse the shared
  policy readers and preserve process/report/exit semantics.
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
| `probes/sdk-tool-seed-probe.ts` | the #1593 arm probe: is a seeded `tool_use`/`tool_result` PAIR admissible on an agent-sdk session resume? Three arms — `--wire` (ts0, FREE: the mode-3 loopback capture reads the BLOCK TYPES of the constructed `/v1/messages` body; request construction, never the production path — the sub runs behind the credential firewall with no observable body), seeded-pair behaviour (ts1, one small turn per model), (the ts2 flatten canary was retired with the flatten arm itself, #1607). Measured 2026-09-04 on `claude-haiku-4-5`/`claude-sonnet-5`/`claude-opus-4-8`: the pair reaches construction as paired blocks with the id intact (full arm admissible → #1605), all three models read both arms as DATA. Hand-run, real quota, never CI; re-run after every SDK bump. |
| `probes/transcript-census.ts` | the census half of the tool-guard tuning rig — named in `SELF_TOOL_RELPATHS` in `.claude/hooks/tool-guard.mjs`, and the source of the doctrine's Bash-call census. Its header is also the only record of the reverse-engineered transcript JSONL shape |
| `probes/guard-replay.ts` | the guard rig's other half (same `SELF_TOOL_RELPATHS` constant) |

### Process launchers and supervisors

Root `package.json` scripts identify the live entry points. Their role is native invocation,
capacity configuration, process supervision and honest result propagation; reusable implementation
and policy belong in `tooling/`. A filename roster here would duplicate those live callers and drift
when another native tool needs an adapter. TypeScript launchers directly under `scripts/` receive
Node compiler and typed ESLint ownership through the shared world rules.

### Operator one-offs

`dev/sandbox.sh` (`pnpm sandbox`) · `probes/history-system-rows.ts`
(`pnpm probe:history-system-rows`, the D69 capability measurement).

`sandbox.sh` is HAND-RUN ONLY, re-derived 2026-08-22 (#421): it is reached solely by its `pnpm sandbox`
alias and runs on the HOST to launch `.devcontainer/`. (`dev/oracle-steady-clone.sh`, the neo-parity
campaign's capture rig, was removed with the neo parity rip — #428, git preserves it.)

### `probes/rpg-extraction/` — 2026-08-22 disposition (#426)

Per 2026-08-22's deletion shortlist, six
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

`review-mirror.mjs` moved to `tooling/src/review-mirror/` on 2026-08-25 (#712). The recurring
adversarial milestone sweep is a durable instrument, not a throwaway lens: `pnpm review:mirror` now
generates the comment-stripped tracked-code mirror plus fail-closed E5/E6/E7 review evidence. D62 keeps
it manual; no standing workflow or cron exists.

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
**No replacement gate exists or should be built** (`docs/law/Core-Tooling-Law.md` §7 carries the
measured receipt).

## Deleted by owner ruling (2026-08-22) — git history preserves them

Four one-shot lenses with zero invocations in any visible transcript window, each with its output
consumed when it ran: `probes/find-react-element-casts.ts`, `probes/find-shitty-casts.ts`,
`lens/kit-candidates.ts` (+ its `lens:kit-candidates` pnpm alias), and
`audit/build-repository-audit-manifest.mjs` (its output was the 2026-08-13 repository audit, since
deleted with the reviews-leave-docs migration). Recover any of them with
`git log --diff-filter=D --oneline -- scripts/<path>` → `git show <sha>^:scripts/<path>`.
