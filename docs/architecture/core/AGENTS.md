---
kind: law
status: active
updated: 2026-09-10
---

# Orbweaver — Constitution (AGENTS)

> **Status: authoritative.** The shared instruction manual for any autonomous agent in this repository —
> read this file IN FULL first (deliberately terse: comprehensive overviews measurably hurt agent task
> success, `Documentation-Law.md`), then read IN FULL the specific docs your task touches (§0.3 — the reading-set router).

## 0. First 90 seconds (read this before you touch anything)

> **You are a cold amnesiac agent. §0.1 is the set of mistakes you WILL make in your first five minutes — know it. §0.2 is the structure you keep forgetting and misfiling against. Then jump to YOUR reading set (§0.3) and read ONLY those docs — reading the whole of `core/` measurably LOWERS task success (`Documentation-Law.md`).**

### 0.1 Tripwires (operational — every session)

1. **Docs are law — over your instinct AND your task prompt.** On ANY conflict the ledger (`Core-Path-Registry.md`) wins. If a prompt asks for what the spine homes elsewhere, follow the spine and FLAG it.
2. **KISS / YAGNI / "just code" are SUSPENDED here** (throwaway scripts + dev tooling excepted — never the architecture). The rigor IS the requirement; "redundant / over-engineered" → read the ledger before doubting, it's almost certainly a deliberate one-home / derive / no-doubling call.
3. **Imports flow ONE direction (§2).** A change that needs an upward import is automatically WRONG — re-home it, never force it.
4. **A green `pnpm check` proves STRUCTURE, not LOGIC** (assertion-free / lying tests still pass it). Never read green as "the logic is sound."
5. **You have no standing to shortcut.** When the right path is tedious: do it RIGHT, or STOP and flag. Stub / simplify-away / weaken-a-test / swallow-an-error / sideways-import are the banned reflexes — the instant you reach for one is the moment this file exists to stop you.
6. **Commit through the hooks:** commit normally in your assigned worktree or clone; the configured
   pre-commit hook may run the required whole-project checks, and pre-push owns `pnpm verify --push`.
   Keep explicit iteration checks scoped, and do not manually duplicate a full battery solely to commit.
   Hook bypass is only for a specific user- or coordinator-authorized exception whose reason and
   executed/owed checks are recorded. Main integration and push remain coordinator/owner scope. End the
   message with the `Co-Authored-By` trailer. **STANDING EXCEPTION (owner, 2026-09-11, until the gate-runtime
   cutover, #1584): the production loader is legacy while modules convert, so every whole-tree check the
   lefthook `pre-commit` / `pre-merge-commit` / `pre-push` hooks run is RED by construction. Lanes and the
   orchestrator commit and merge with `git -c core.hooksPath=/dev/null …`, run the scoped floor by hand,
   and name it in the commit message. That red is baseline, never a lane's defect and never laundered green.**
7. **`pnpm ast`, never grep,** for any code question (refs / callers / importers / exports / rot lenses).
8. **Grep is for CODE, never for LAW.** A law doc's ruling lives in the CONTEXT around a line, not the
   line — grepping "app-shell" finds the CSS exemption and misses that app-shell is NOT import-privileged.
   Read law docs in FULL; random-access is fine only for indexes (`Core-Path-Registry`,
   `Core-Enforcement-Active-Gates`).
9. **GitHub Project 1 owns MUTABLE WORK STATE.** An issue carries status, priority, dependencies,
   disposition, lane, and verification progress; durable law/design/review/evidence stays in the repo and
   links the issue. Before starting, re-derive then claim the issue. Session recovery is the board
   (`pnpm work:item overview`) + `.claude/rules/orchestration.md` (directly imported by root
   `AGENTS.md` for Codex) + the SessionStart auto-onboard hook; `docs/retro-workboard.md` is RETIRED
   and the dated boards are archived under `docs/history/`. Agent flow + invariants live in the
   [Project README](https://github.com/users/Inktomi93/projects/1); ingress forms live under
   `.github/ISSUE_TEMPLATE/`.

### 0.2 The shape you're working in (agents forget this and misfile — don't)

- **Packages are a one-directional cake: `kit ← contracts ← db ← server ← client`** (+ the sealed `ui`: `kit ← ui ← client`). These are REAL pnpm workspace packages, not folders — the layer is physics (an undeclared cross-package import won't even resolve). Before you write a type or a helper, decide WHICH package owns it; if it needs something UP the cake, you're in the wrong package. `kit`/`contracts`/`db` exist precisely so shapes and primitives have a home BELOW `server` — reach for them, don't re-invent locally.
- **A type/shape has exactly ONE home, by who needs it** (`Spine-TypeScript-and-Patterns.md`): DB row → `db` (`$inferSelect`); cross-boundary wire (server↔client, domain↔domain) → `contracts` (zod + inferred TS); pure primitive → `kit`; domain-internal → that domain's `contract/`. A hand-declared exported `type`/`interface`/`z.object` outside those four homes is gate-RED (`no-inline-types`) — never re-spell a shape a lower package already owns.
- **`kit` = pure ISOMORPHIC primitives + engines ONLY** — no `node:*`, no domain, no `db`, no `contracts`, no I/O (isomorphic npm like zod/luxon is fine). Node-only-pure code → `@orb/server/kit`, NEVER `@orb/kit` (the browser imports kit).
- **Tests are CENTRAL, never colocated.** The test for `packages/<pkg>/src/<path>.ts` lives at `tests/<pkg>/<path>.<kind>.test.ts` — a mechanical prefix-swap mirror (`packages/X/src/` ↔ `tests/X/`), kind by suffix (`.test` unit · `.int.test` db · `.contract.test` schema · `.test-d` types). A `.test.ts` dropped next to the source is RED (`test-layout` gate). Full policy: `Spine-Testing.md`.
- **CSS has SIX homes and a feature is not one of them** — the token vault, generated theme, ui globals,
  density-tier map, client globals, and ONE structural shell file. Reusable portable values are conformant
  DTCG tokens; nonportable generated CSS values use the vault's validated vendor extension, never a fake
  token type; component skins are `tv()` variants; layouts are `@orb/ui` primitives. The exact closed set,
  semantic ownership, and exceptions live only in `client-architecture-lockdown.md` §4.

### 0.3 Your reading set — find your task, read THOSE docs in full, skip the rest

| Your task | Read IN FULL, in this order |
| - | - |
| **any server domain** (a verb / persistence / contract) | `Core-0-Architecture-and-Structure.md` §3–4 → the Spine(s) you touch (§5) → your code's `Tier-*` → the domain's `contract/` + file headers |
| **identity / auth / sessions / agents** | `Spine-Identity-and-Auth.md` + ledger D17/D18/D40/D60/D65 → route the work to `security-executor` |
| **providers / backends / a new model source** | `Tier-3b-Providers.md` + the `domain/connection` code + D31/D39/D67 |
| **db schema / a migration** | `Tier-1-DB.md` + D15/D20/D23/D24/D28 |
| **a gate / an enforcement change** | `Core-0` §7 → `../../design/gate-runtime-read-first.md` and its ordered full reads → the affected `Core-Enforcement-Active-Gates.md` row and contract headers. `exemplars-2026-09-11.md` is refuted history; `../../../tooling/src/verify/gates/GATE-AUTHORING.md` explains only a legacy descriptor being replaced. |
| **a tool / an instrument** (anything under `tooling/`) | `Core-0` §9 → `Core-Tooling-Law.md` (§2 shape · §4 gates · §9 move playbook) → the tool's own file headers |
| **client / a feature surface** | `UI-Architecture-and-Layout.md` header (its reading order + §-map) → the owning Project issue and linked program doc |
| **a `@orb/ui` primitive** | `ui-package-design.md` + `UI-Primitives-and-Reuse.md` §13.7–§13.8 |
| **types / unions / dispatch** | `Spine-TypeScript-and-Patterns.md` |
| **tests** | `Spine-Testing.md` |
| **adding/changing a ledger decision** | `Documentation-Law.md` §"Ledger-entry style" → write it in `Core-Path-Registry.md` |
| **any doc edit** | `Documentation-Law.md` (content) + `Core-Docs-Formatting-Law.md` (mechanics) → `pnpm check:docs` |
| **"where does concept X live?"** | §6 (domain map) + §7 (topic index) — pointers only, then read the target |

## 1. The doctrine — why the rigor exists (read once)

- **The goal is get it right the FIRST time** — full architecture, one home per concept, FK-enforced
  boundaries, born-compliant schema, complete test + gate coverage. Nate chose this deliberately and at
  length. Do not relitigate it.
- **Why the rigor:** the author is a rotating cast of **amnesiac agents** — cold-starting, no memory of
  prior sessions, biased toward the path of least resistance (stub a return, swallow an error,
  "simplify" the awkward case, write a test that asserts nothing, sideways-import, carry a neo pattern).
  The apparatus — ledger, gates, audit panels, one-home/derive/FK/boundaries-are-physics — is NOT
  ceremony; it is **the substitute for the memory and judgment the author lacks**, and its job is to
  make the shortcut **impossible**, not merely discouraged.
- **"Unwired ≠ worthless."** "No consumer / dead / unwired" is a prompt to evaluate **intent**, not a
  delete signal — much of neo is scaffolded intent that never got wired. Understand → wire or modernize;
  flag-for-delete only for genuinely superseded residue, and say why. (Full rule: `Core-0` §1.)
- **Engine vs data:** the pure engines (macro, regex, speaker-label) are `kit`; the *data* they run on
  (`MacroContext` values, the regex script library) is a domain. One engine, every call site → identical
  behavior. (Full rule: `Core-0` §2.)
- Design sets are PARKED in `../proposed/` — `../proposed/INDEX.md` maps each committed program to its
  Project sprint; a parked set's own status lines rot. Project 1 owns activation and lifecycle, while the
  linked program document owns durable shape.
- **Ownership is INHERITED, not stamped:** a table without an `ownerId` is not unscoped — scope derives
  from the Principal through the FK chain to the root row, gated at the producer verb. Before flagging
  "missing scope," walk the chain (`Spine-Identity-and-Auth.md` §2b, D18/D20).

## 2. THE HARD CONSTRAINT — one-directional flow

This is the rule the placement judge obeys and the adversary hunts violations of.

1. **Imports flow one direction only** — the package cake (`kit ← contracts ← db ← server ← client`,
   plus the sealed `ui` package: `ui` deps `kit` only, `client` deps `ui`; D54) and the server tier list
   (`entry → transport → domain → infra → foundation → kit`). **A move is automatically WRONG if it
   would require an upward import** — "put X in `kit`" but X needs a domain type: illegal; "merge A into
   lower-tier B": illegal; "infra reaches into a domain": illegal (infra is a sealed executor).
2. **Enforcement is layered — push it up the ladder:** resolve-time (package deps — physics) →
   compile-time (branded types, exhaustive unions) → lint-time (dependency-cruiser, biome, `check`) →
   test-time. The cake → tier 1; invariants → tier 2; dep-cruiser → tier 3 backstop.
3. **Every placement names its enforcer.** Each move/boundary MUST say which tier makes it RED when
   violated (a package dep / a branded type / a dep-cruiser rule / a test). **A prose-only boundary is
   not a placement — it's a wish.**

Cross-feature dependency is NEVER a sideways import — a verb declares the *type* of an injected
cross-feature op in its `contract/`; the runtime op is wired at the composition root.

## 3. The placement decision (one line)

Pure + zero-I/O + zero-domain + multi-consumer → `kit` · cross-boundary shape → `contracts` · external
I/O adapter → `infra` · env/config/observability → `foundation` · business logic with one owner → its
domain (8-slot template) · two homes for one concept = merge · insider-knowledge name = rename · one
folder, two jobs = split. Full outcome table + the per-concept partitioning table: `Core-0` §6; the
concept→domain map: §6 below.

**Register boundary — this paragraph IS its home** (owner ruling 2026-08-30, #901 Fork 6; do not chase a
D-row, D151 is the separate actor-vocabulary half and disclaims this one): game-register words
(`party`, `npcs`, `quest`, `encounter`) live only
inside the rpg domain and its surfaces, never naming a non-game concept; an rpg surface naming a chat
concept uses the chat word instead. PROSE-ENFORCED by owner ruling — no gate — so the honesty mechanism
is the comment/doc sweep: a crossed word is a drifted-comment defect, fixed on sight.
**Which word names which concept is never decided locally and is not restated here — look it up in
[`../../design/vocabulary-map.md`](../../design/vocabulary-map.md)**, its ONE living home (#914).

## 4. Build + verify protocol

- Phase order (frozen in `../history/Core-BUILD-PLAN.md`): kit → contracts → db → server (foundation → infra →
  domain\[leaf-first] → transport → entry) → client; chat + memory LAST, built WHOLE (D16).
- Multi-agent dispatch in dependency tiers; **disjoint file sets** per agent (agents write only their
  slice + its tests, never shared barrels/compose); lanes commit their assigned slice, and the
  orchestrator integrates and verifies the combined tree.
- **Scope every agent prompt to its EXACT tier responsibility** — tier-collapse is precisely how neo
  patterns crept in (domains return contract types; only the entry seam mints the Principal; infra
  verifies, domain resolves, entry constructs).
- **Commit through the hooks:** commit normally in your assigned worktree or clone; the configured
  pre-commit hook may run required whole-project checks, and pre-push owns `pnpm verify --push`. Keep
  explicit development checks scoped, and do not manually duplicate a full battery solely to commit.
  Bypass only for a specific user- or coordinator-authorized exception, recording its reason and the
  checks already executed or still owed. Main integration and push remain coordinator/owner scope. End
  the message with the `Co-Authored-By` trailer.
- **Lane iteration is SCOPED; integrated graduation is the ORCHESTRATOR'S.** A lane's explicit inner loop
  names the affected tests, typecheck configs and lint inputs. Normal configured commit hooks may run
  their required whole-project checks; do not invoke a duplicate full battery merely because a commit is
  next. The orchestrator verifies the combined quiesced tree and routes anything caught back to the
  still-warm lane.
- **The harness auto-writes its artifacts — read them, never pipe or re-run to find a failure:**
  `pnpm check` → `reports/verify.json` + `reports/verify/<stage>.log` + `reports/check-structure.json`;
  `pnpm test` → `reports/test-report.json` + `reports/ct-flaky.json`. Invoke the scripts (a bare
  `npx vitest run` drops the json reporter); never `| tail` live output — it eats the failure list.
  **Those paths are `latest` POINTERS, not files a run writes in place (#1029)** — each run writes inside
  its own `reports/runs/<instrument>/<slot>/` and publishes the pointer atomically when it FINISHES, so
  concurrent runs keep both verdicts; take the slot the run printed when you need YOUR run. The layout's
  one home is `UNIFIED-VERIFICATION-DESIGN.md` §3.3b.
- **The ONE verification surface (`UNIFIED-VERIFICATION-DESIGN.md`):** iterate on `pnpm verify --changed`
  (scoped, fast inner loop); claim "done" only after `pnpm verify` (= `--static`, = `pnpm check`); the
  pre-push bar is `pnpm verify --push` (adds the PRODUCT node tests + CT + e2e-smoke — the behavioral
  suites a bare `pnpm check` does NOT run); the INSTRUMENT battery (`tests/tooling/**`) is `--full`-only
  since #1842, so `pnpm verify --full` is the works and the only whole-battery verdict on our own tools.
  **Tier membership is DATA, never prose — read it from `pnpm verify --list`.**
  Exit codes are a hard contract: 0 clean · 1 violations · 2 tool error (a checker BROKE — the run is not
  a verdict) · 3 misuse (bad args). `pnpm verify --list` prints every stage + its tier. **A SCOPED green
  (`--changed`/`--scope`) is NOT done:** it DEFERS every whole-project gate (registry / coverage / parity /
  completeness — the exact gates that catch half-registration across maps); the whole `pnpm check` is the
  verdict.
- **Banned escape hatches** (shipping one is the failure — if you can't go green without one, STOP and
  report): no `eslint-disable`/`biome-ignore` added to pass; no new dep-cruiser exemption or gate allowlist
  entry to dodge a rule; no `// TODO`/`// FIXME` in place of the work; no `any`/`unknown`/loose
  index-signature to appease tsc; no leaving the OLD map/structure beside the new "for now" (delete it in
  the same commit — half a migration IS the rot); no `{planned}`/`{placeholder}` marker on something not
  actually planned.
- **Probe a gate/behavior via a SCRATCH file, NEVER git.** Plant a throwaway violation at the target
  path (`features/__probe/lib/x.ts`) and `rm` it. NEVER `git stash` / `git checkout <path>` /
  `git restore` to undo a probe — they silently drop other uncommitted work and are banned even when
  nothing is lost. To probe a real file: `cp f f.bak; …; mv f.bak f`. This is the ONE home for the probe
  rule; every other file points here.
- **Testing — the explicit exception to the global "quality over quantity":** comprehensive coverage IS
  the bar — every persistence verb, contract, and load-bearing invariant gets a test
  (`test-presence`/`test-layout`/`test-determinism` gates). Still no padding: test real behavior, not
  tautologies; deterministic (injected clock/ids). Full policy: `Spine-Testing.md`.

## 5. The Spine (cross-cutting threads)

Some concerns aren't owned by one domain — they thread through many. A per-domain reader must check its
slice against them, never re-decide them. Each thread has ONE canonical `Spine-*` doc (below); older
docs cite these threads as "AGENTS-2 §7.x" / "spine §7.x" — those resolve here as §5.x — each section
here is a pointer only. **Read the Spine doc IN FULL before touching its thread.**

### 5.1 identity / auth / permission

**Canonical: [`Spine-Identity-and-Auth.md`](Spine-Identity-and-Auth.md).** Identity resolves ONCE at
the edge into one immutable `Principal`; permission = global-role × resource-role × capability, decided in
ONE kernel (`can()`) with two read classes — enforcement vs data projection (D121); agents are the model of
record but **NOT BUILT** (the mint + ceiling were purged 2026-07-25; only dormant DDL survives — Spine §4
states the tree, D60 states the design); BFF sessions ≠ SDK chat sessions.

### 5.2 settings / config / the env FOUR natures

**Canonical: [`Spine-Config-and-Serialization.md`](Spine-Config-and-Serialization.md)** §"Settings /
config". Env has four natures — true env · AppSettings (env floor, DB override wins) · the agent-sdk
credential firewall (a backend-internal config, NOT a settings tier) · generation params
(`UserIntent`/preset).

### 5.3 serialization / serde core

**Canonical: [`Spine-Config-and-Serialization.md`](Spine-Config-and-Serialization.md)** §"Serialization
/ serde core". ONE fully-modeled canonical card in `contracts`; the PNG codec is ONE string-based
`kit/png-card-chunk` engine; mappers consolidated.

### 5.4 types & schemas — one home, one direction, no inline

**Canonical: [`Spine-TypeScript-and-Patterns.md`](Spine-TypeScript-and-Patterns.md).** One home per
shape, derived by who needs it, flows DOWN only; enforced by the `no-inline-types` gate. The home table +
the house TS style live there.

### 5.5 string-union dispatch discipline

**Canonical: [`Spine-TypeScript-and-Patterns.md`](Spine-TypeScript-and-Patterns.md)** §"String-union
dispatch discipline" (moved there 2026-07-03). Every axis: ONE importable union + a mapped-type Record
or `assertNever` dispatch — a new member fails `tsc`. Enforcers: the `no-inline-union-redecl` gate owns
the "one importable union, never re-spelled" half; exhaustiveness itself is compile-time by
construction (the mapped `Record`/`assertNever` shape), not a gate file. The measured neo touch-count table and the `RUNNERS` gold standard are in that section.

## 6. Domain Map (neo-tavern's 20 → orbweaver)

Each domain follows the 8-slot template in `Core-0-Architecture-and-Structure.md` §4. **The code home
IS the domain name:** `packages/server/src/domain/<name>/` — and for built domains the code + its file
headers ARE the doc (per-domain prose gutted per `Documentation-Law.md`). Special cases: `memory` lives
at `domain/chat/memory/` (a chat subsystem; boundary: `Knowledge-Cluster.md`); `character` snapshot-UX:
the retired FINAL-Character competition doc (yeeted under D66; git history has it) §7/§12; `stats`↔`discovery` seam: [stats-discovery-seam.md](../history/stats-discovery-seam.md) (REALIZED);
participants/agents/identity → the pointer subsection below.

| Domain | Origin | Owns |
| - | - | - |
| **chat** | keep (slim) | the turn lifecycle, canon, assembly, arbitration. **Stateless-first** — the agent-sdk session cache is backend-internal (`infra/providers/backends/agent-sdk/session/`, D8), NOT a chat concern. `memory` is a subsystem here but *delegates* vectors. |
| **character** | keep | character identity; the card is a flat `characters` row; history = a `character_snapshots` log that gates nothing (D28). |
| **persona** | keep | personas; pin = anchor (`{{user}}`), active = per-participant. |
| **preset** | keep | **generation config only** (params/customParameters/sections) — never the connection. |
| **world-info** | keep | one books/entries store + scope junctions (already correct). |
| **connection** | **NEW** | api/source/model/providerRouting; the ONE provider-vocab map (runner/family *derived* from source+protocol); `resolveRole(role)` for all 8 roles (chat/embed/rerank/summarize/imageEmbed/generateImage/agent/structured — `PROVIDER_ROLES`, D109-4). Absorbs **models** (the catalog = "what a connection can pick"). |
| **credentials** | keep (un-invert) | ALL credential logic — resolve + CRUD + metadata. No `_shared` guts. |
| **tag** | keep (fix) | one tag namespace + per-entity junctions; **proposed = a status**, not a parallel store. Labels only — NOT analytics facets (those are `discovery`). |
| **embeddings** | **NEW** | the vector substrate: embeds every source + owns the vector store + the event-driven indexer. The ONE write path. |
| **search** | keep (narrow) | the ONE retrieval capability (cosine + rerank + field-search). One cosine engine. |
| **discovery** | rename of **corpus** | library *semantic understanding*: themes, hubness/centrality, near-duplicates, distillation (genre/tone/pitch), archetypes, similarity browsing. Consumes embeddings; embeds nothing; holds its OWN in-RAM cosine — does NOT call `search` (analytics ≠ retrieval). |
| **stats** | keep (narrow) | turn **economics** only — tokens/cost/cache/timing. Distinct from `discovery` (semantics). |
| ~~buddy~~ | **purged** | the domain was retired with the 2026-07-25 retro burn-down (no `domain/buddy` on the tree); the buddy-as-agent-role-connection design lives in the ledger/parked sets only, not as live code. |
| **settings** | keep | app + user setting tiers. |
| **sessions** | keep | auth/BFF sessions (distinct from SDK chat sessions). |
| **admin** | keep | admin surfaces / gating. |
| **import** | keep (rework) | a canon-write that **emits ContentChanged events** so the indexer auto-runs; the two neo bulk loops unified. |
| **export** | keep (rework) | import + export **share ONE serialization core** (`Spine-Config-and-Serialization.md`, §5.3 above). |
| **assets** | keep | the CAS index/table (the blob *store* itself is `infra/storage`). |
| **workloads** | keep | the per-user execution ENGINE (`singular\|bulk` mode) — rows, locks, worker, cancel, schedules, progress — and NOTHING domain-specific. Every job is a `WorkloadContribution` raised by its OWNING domain (`domain/<x>/workload-contributions.ts`, the ratified 10th root slot) and assembled into one exhaustive registry at `entry/compose/workload-contributions.ts`; the engine dispatches through it knowing no domain. NOT an enqueue target for the indexer (that is direct + bus-driven). |
| **notifications** | **NEW** | the per-user durable inbox + delivery stream (invite/kick/host-handoff to non-members the per-chat bus can't reach); part of the unified roster/group/multi-human system (D16). Producers emit via an injected op — chat (invite/kick/host-handoff), plugin (`domain/plugin/activation/crash-policy.ts` auto-disable, `domain/plugin/substrate/consent-prompt.ts` the #1041 consent aggregate) and automation (`domain/automation/engine/dispatch.ts` the owner-global auto-disable notice) — and the last three address a SINGLE human, which is why the inbox is not multi-human-gated (#1627); transport streams it on the `chat` room resume shape. |
| ~~models~~ | → **connection** | merged. |
| ~~debug~~ | → **foundation/observability** | `/api/_debug` is observability, not a domain. |
| ~~corpus~~ | → **discovery** | renamed (name required insider knowledge; it does library understanding). |

Phase-7/8 additive domains (post-chat grafts — D47/D48/D49; scripting D46): **imagery** BUILT
(`domain/imagery/` — chat-facing image gen, prompt-template modes, `/imagine` via automation);
**gallery** BUILT (`domain/assets` gallery v1/v2 verbs — `domain/hub` gif search/import was purged with
the 2026-07-22 hub drop — [gallery.md](../history/gallery.md) ·
[gallery-design.md](../history/gallery-design.md)); **tool-use** BUILT (`domain/tool-use/` —
registry/resolve/execute verbs, wired at `entry/compose`); **databank** BUILT (`domain/databank/`);
**automation** BUILT (`domain/automation/`); unbuilt → expressions design set (parked in `../proposed/`
— see its `INDEX.md`).

### Participants, agents & identity

**→ [`Spine-Identity-and-Auth.md`](Spine-Identity-and-Auth.md)** (identity/persona/permission; the
stateless chat-turn foundation) · the agent-principal design set (parked in `../proposed/` — see its `INDEX.md`)
(agent principals, D60) · ledger D28 + the `character` code (character).

### Memory ↔ search / the knowledge & derived-data untangle

**→ [`Knowledge-Cluster.md`](Knowledge-Cluster.md)** — the cluster boundary (embeddings · search ·
discovery · chat/memory · the stats fence), ownership table, and the 6 gate-protected cross-domain
invariants. Recall semantics live in the `chat/memory` code headers + ledger D55.

### Cross-cutting concept homes

**→ `Core-0-Architecture-and-Structure.md` §6** (the partitioning table: connection/preset/credentials/
roles/regex/world-info/labels/derived-data/economics/cards) + the domain map above.

### Connection ↔ providers boundary

**→ [`Tier-3b-Providers.md`](Tier-3b-Providers.md)** (execution; `runner`/`family`/`protocol` sealed
inside infra; `resolveChat`; stateful-vs-stateless backends) + the `domain/connection` code (selection +
the capability descriptor). The tell that it's right: `providers` imports zero domains, and
`runner`/`family` never appear in `domain/**`.

Live open work is tracked in `Core-Audits-and-Debt.md` (the PD registry) + `../proposed/`; no
domain-map judgment call is open here.

## 7. The index — where the law lives

| Topic | Home |
| - | - |
| package cake · server tiers · 8-slot feature template · partitioning table · the 13 legibility gates | `Core-0-Architecture-and-Structure.md` |
| the tooling tree (`@orb/tooling` sits ABOVE the cake) | `Core-0-Architecture-and-Structure.md` §9 (summary) → `Core-Tooling-Law.md` (the detail home) · `../../../scripts/README.md` |
| the D-ledger (canonical decisions) + enforcement catalog | `Core-Laws-and-Precedents.md` (§0–§6 + redirect index) → `Core-Path-Registry.md` · `Core-Enforcement-Active-Gates.md` · `Core-Enforcement-Deferred-Dropped.md` |
| build phases · checkpoints · stack + version pins | Project 1 (current work) · `../history/Core-BUILD-PLAN.md` (frozen phase archaeology) · the pnpm catalog (version pins) |
| planning + checklists | `Core-Planning-and-Checklists.md` |
| identity / auth / permission / agent principals | `Spine-Identity-and-Auth.md` (+ the agent-principal design set, parked in `../proposed/`, D60) |
| settings / config / serialization | `Spine-Config-and-Serialization.md` |
| types · schemas · string-union dispatch · house TS style | `Spine-TypeScript-and-Patterns.md` |
| testing policy (lanes, presence, determinism, factories) | `Spine-Testing.md` |
| the derived-data cluster boundary (embeddings/search/discovery/memory/stats) | `Knowledge-Cluster.md` |
| authoring a structural gate | `../../design/gate-runtime-read-first.md` owns the reading order; `../../../tooling/src/verify/ops/new-gate.ts` owns the `pnpm gate:new <name>` scaffold. The legacy `GATE-AUTHORING.md` and refuted exemplar report are not final-policy templates. |
| authoring a ui-audit detector rule | `../../../tooling/src/ui-audit/ops/walker/RULE-AUTHORING.md` |
| the domain map | §6 above |
| which WORD names which concept (user-facing copy · ids · testids · comments) | [`../../design/vocabulary-map.md`](../../design/vocabulary-map.md) — the one living home; D151 + §3 cite it and never restate it |
| server tier law | `Tier-1-DB.md` · `Tier-2-Foundation.md` · `Tier-3-Infra.md` · `Tier-3b-Providers.md` · `Tier-4-Transport.md` · `Tier-5-Entry.md` |
| UI law | `UI-Architecture-and-Layout.md` · `UI-Gates-and-Lessons.md` · `UI-Primitives-and-Reuse.md` · `UI-Theming-and-Content.md` · `ui-package-design.md` · `motion-and-animation-guide.md`; Project 1 + the linked proposed program own current work |
| client composition / feature architecture | `client-architecture-lockdown.md` (D70) |
| UI library evidence mines | `../history/UI-Lib-TanStack-Form.md` · `../history/UI-Lib-TanStack-Query.md` · `../history/UI-Lib-TanStack-Router.md` · `../history/UI-Lib-TanStack-Virtual.md` · `../history/UI-Lib-Zustand.md` |
| legacy migration / ST parity | `Core-Legacy-Migration-and-Gaps.md` (split index) → `Core-Shared-Dissolution.md` + `Core-ST-Feature-Gap-Register.md`; feature map: `Core-SillyTavern-Feature-Map.md` |
| live debt registry | `Core-Audits-and-Debt.md` |
| doc/comment law + markdown mechanics | `Documentation-Law.md` (this dir) · `Core-Docs-Formatting-Law.md` |
| mission | `../../Mission.md` |
| the neo→orb parity-audit record (campaign complete, protocol retired) | `../history/neo-orb-parity-audit.md` |
| structural search — USE THIS, NOT GREP, for code questions | `pnpm ast` (run bare for the lens list) · codemods `pnpm codemod` · import-boundary law `pnpm depcruise` |
| task → reading-set router (backend + frontend) | §0.3 above |
| mutable work state | [GitHub Project 1](https://github.com/users/Inktomi93/projects/1) (status · priority · dependencies · disposition · lane · verification); issue ingress: `../../../.github/ISSUE_TEMPLATE/` |
| session recovery + agent operations | the board (`pnpm work:item overview`) · `.claude/rules/orchestration.md` · `.claude/hooks/session-onboard.sh` (the SessionStart ritual); `docs/retro-workboard.md` is RETIRED (frozen: `../history/retro-workboard-2026-08-14.md`). Committed programs live at `../proposed/`, mapped by its `INDEX.md` + Project 1 |
| legacy "AGENTS-1/2/3 §x" citations in older docs | AGENTS-1 §1-4 → §1-4 here · AGENTS-1 §5 / AGENTS-3 §8 → §7 · AGENTS-2 §5/§7.x → §5/§5.x · AGENTS-3 §7 → §6 · AGENTS-1 §4 "Pain Ledger" → `../history/Pain-Ledger.md` · AGENTS-2 §6/§8.x → `../history/Grounded-Intelligence-AST-Scan.md` (law only where promoted) |
| resolved archeology (reference only, not live law) | `../history/`: `Pain-Ledger.md` · `Grounded-Intelligence-AST-Scan.md` · `Core-Debt-Cleared-Ledger.md` · `Core-Doc-Inconsistency-Audit-2026-06-26.md` · `Core-Doc-Review-Punchlist-2026-06-28.md` · `Core-Event-Bus-Parity-Audit.md` · `Shared-Drawer-Dissolution-Map.md` |

## §L — LANE DISCIPLINE (worktree agents)

Every dispatched worktree lane obeys these or its work gets refused at the merge:

1. **`git -C <your-worktree>` on EVERY git call** — your shell's cwd resets when its directory is
   deleted or a `cd` leaves the project. Never trust cwd for git.
2. **Prove your own commits:** `git show --stat <sha>` in your report, and `git status --short` EMPTY
   before you report — `git commit -- <pathspec>` silently skips untracked files, and a
   cited-but-never-committed file is destroyed at worktree teardown.
3. **Commit normally in your assigned worktree or clone.** Keep explicit iteration checks scoped; the
   configured commit hook may run its required whole-project checks. Do not manually duplicate a full
   battery solely to commit. Bypass the hook only for a specific user- or coordinator-authorized
   exception, and record the reason plus the checks executed or still owed.
4. **Merging main into your branch:** merge normally through the configured hooks and commit any
   conflict resolution without bypass by default; main integration remains the orchestrator's operation.
5. **Recreated a worktree manually?** `git worktree add` does NOT fire the install hook — run
   `pnpm worktree:bootstrap` (install + the agent-memory link) or every gate lies and the lane boots
   with an empty memory index.
6. **Rendered proof from a worktree:** `:5173` serves MAIN, never your tree — use
   `snap --isolated --ref <your-sha>` or screenshot from the CT browser.
7. **Scratch files are lane-unique** (prefix with your lane's short name); a shared name has landed one
   lane's commit message on another's commit.
8. **Report deviations WITH receipts.** If the spec text is wrong on the tree's evidence, say exactly
   where and why — spec-letter compliance against a false premise is a defect.
