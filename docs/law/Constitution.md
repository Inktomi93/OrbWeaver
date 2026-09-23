---
kind: law
status: active
updated: 2026-09-22
---

# Orbweaver constitution

Root `AGENTS.md` is the always-on core and the reading router. This file holds the doctrine, the domain map
and the index of law docs. Code comments cite these section numbers, so keep them stable.

## 0. Start here

Read root `AGENTS.md` first. It owns which law wins, package direction, type homes, verification and the
reading router. Read only the docs the router names for your task.

## 1. Doctrine

- Get it right the first time: full architecture, one home per concept, FK-enforced boundaries, complete tests and gates.
- The owner chose this shape on purpose. Do not argue it again.
- The authors are agents with no memory of earlier sessions. They drift toward the shortest path.
- The ledger, gates and boundaries replace that missing memory. Their job is to make a shortcut fail, not only discourage it.
- Banned shortcuts: a stubbed return, a swallowed error, a weakened test, an assertion-free test, a sideways import.
- When the correct path is tedious, do it correctly or stop and report.
- An engine is pure and lives in `kit`. The data it runs on lives in a domain. One engine gives every caller the same behavior.
- A table without an `ownerId` is still scoped. Scope comes from the Principal through the FK chain to the root row.
- Walk that chain before you report missing scope (`Spine-Identity-and-Auth.md` §2b).
- Parked programs live as plans under `../plans/`; each one links its work item.

## 2. One-directional flow

Root `AGENTS.md` "Package direction" owns the import order. Put each boundary at the earliest check that can
enforce it: a package dep, then a type, then dep-cruiser or lint, then a test. A boundary that only prose
states is not enforced. Detail: `Core-0-Architecture-and-Structure.md` §2–§3.

## 3. Placement

Root `AGENTS.md` "Where code goes" owns the placement table. The full outcome table and the partitioning
rule are in `Core-0-Architecture-and-Structure.md` §6. Look up which word names a concept in
`docs/law/vocabulary-map.md`; never decide it locally.

## 4. Build and verify

Root `AGENTS.md` owns the verification tiers, the harness artifacts and the escape-hatch ban. Lane commit,
probe and floor rules are in the `lane` skill (`.claude/skills/lane/SKILL.md`). The orchestrator runs the
whole-tree check after each merge train.

## 5. Cross-cutting threads

These threads cross many domains. Read the Spine doc in full before you change one.

| Thread | Home |
| - | - |
| Identity, auth, permission, agent principals | `Spine-Identity-and-Auth.md` |
| Settings, config, the four kinds of env value | `Spine-Config-and-Serialization.md` "Settings / config" |
| Serialization and the card codec | `Spine-Config-and-Serialization.md` "Serialization / serde core" |
| Type homes | `Spine-TypeScript-and-Patterns.md` |
| String-union dispatch | `Spine-TypeScript-and-Patterns.md` "String-union dispatch discipline" |
| Tests | `Spine-Testing.md` |

## 6. Domain map

Each domain lives at `packages/server/src/domain/<name>/` and follows the folder template in
`Core-0-Architecture-and-Structure.md` §4. For a built domain, the code and its file headers are the doc.

| Domain | Owns |
| - | - |
| `admin` | admin surfaces and gating |
| `assets` | the content-addressed asset index and the gallery verbs; the blob store is `infra/storage` |
| `automation` | owner rules, watchers, dispatch, budgets and global variables |
| `character` | the character card as a flat row, and a snapshot log that gates nothing |
| `chat` | the turn lifecycle, canon, prompt assembly and arbitration; stateless first |
| `chat/memory` | recall for chat; it delegates vectors to `embeddings` (`Knowledge-Cluster.md`) |
| `connection` | the front door over `@orb/inference`: its own tables, per-task resolution, catalogs and diagnostics |
| `credentials` | all credential logic: resolve, CRUD and metadata |
| `databank` | document banks: upload, scrape, ingest and retrieval for chats |
| `discovery` | library understanding: themes, centrality, near-duplicates, archetypes; its own in-memory cosine, never `search` |
| `embeddings` | the vector substrate: embeds every source, owns the vector store and the indexer; the one write path |
| `export`, `import` | card and chat portability over one serialization core; import emits content-change events |
| `imagery` | chat-facing image generation and prompt-template modes |
| `notifications` | the per-user durable inbox and its delivery stream |
| `persona` | personas: the pin is the `{{user}}` anchor; active is per participant |
| `plugin` | plugin install, activation, consent and the sandbox host port |
| `preset` | generation config only: params, custom parameters, sections; never the connection |
| `refinery` | model-driven rewrite sessions for a character card; writes go through injected `character` ops |
| `regex` | the owner regex script library and its scope attachments |
| `roster-preset` | saved rosters and applying one to a chat |
| `rpg` | game state, quests, journal and checkpoints for game chats |
| `search` | the one retrieval capability: cosine, rerank, field search |
| `sessions` | auth and BFF sessions |
| `settings` | app and user setting tiers |
| `stats` | turn economics only: tokens, cost, cache, timing |
| `tag` | one tag namespace and per-entity junctions; "proposed" is a status |
| `tool-use` | the tool registry, resolve and execute; chat owns the loop |
| `workloads` | the per-user job engine; it knows no domain |
| `world-info` | one books and entries store with scope junctions |

- `/api/_debug` is observability in `packages/server/src/foundation/`, not a domain.
- The agent-sdk session cache is internal to the backend (`packages/inference/src/backends/agent-sdk/session/`), not a chat concern.
- Each domain raises its own jobs in `domain/<x>/workload-contributions.ts`.
- `entry/compose/workload-contributions.ts` assembles them into one registry.
- `connection` resolves per task. The task list is `TASKS` in `packages/contracts/src/inference/tasks.ts`.
- `tag` holds labels only. Analytics facets belong to `discovery`.
- Game words (`party`, `npcs`, `quest`, `encounter`) name only `rpg` concepts. An rpg surface names a chat concept with the chat word.
- No gate checks that word rule. Fix a crossed word on sight.

### Participants, agents and identity

Read `Spine-Identity-and-Auth.md`. Agent principals are designed but not built; the design is the parked
plan `../plans/agent-principals/design.md`.

### Knowledge and derived data

`Knowledge-Cluster.md` owns the boundary between `embeddings`, `search`, `discovery`, `chat/memory` and
`stats`, and its cross-domain invariants.

### Connection and providers

`Tier-3b-Providers.md` owns `@orb/inference`: wires, providers, tasks, resolution and the capability
fold. `domain/connection` owns its tables, the principal check and the credential-free projection. Every
read verb delegates to the runtime. `@orb/inference` depends on no `@orb/db` or `@orb/server`, and its
exports map has one entry, so no domain can reach a backend.

## 7. Index of law

| Topic | Home |
| - | - |
| Packages, server tiers, the domain template, partitioning, the legibility gates | `Core-0-Architecture-and-Structure.md` |
| The tooling tree above the packages | `Core-0-Architecture-and-Structure.md` §9, then `Core-Tooling-Law.md`, `../../scripts/README.md` |
| The decision ledger | `../adr/README.md` (one decision per file) |
| Active gates | `Core-Enforcement-Active-Gates.md` |
| Writing a gate | `docs/law/gate-runtime-read-first.md`, then `../../tooling/src/verify/gates/GATE-AUTHORING.md` |
| Writing a ui-audit rule | `../../tooling/src/ui-audit/ops/walker/RULE-AUTHORING.md` |
| Verification design and report layout | `UNIFIED-VERIFICATION-DESIGN.md` |
| Server tier law | `Tier-1-DB.md`, `Tier-2-Foundation.md`, `Tier-3-Infra.md`, `Tier-3b-Providers.md`, `Tier-4-Transport.md`, `Tier-5-Entry.md` |
| UI law | `UI-Architecture-and-Layout.md`, `UI-Gates-and-Lessons.md`, `UI-Primitives-and-Reuse.md`, `UI-Theming-and-Content.md`, `UI-Density-Law.md`, `ui-package-design.md`, `motion-and-animation-guide.md` |
| Client composition | `client-architecture-lockdown.md` |
| SillyTavern parity rulings | `../adr/README.md` (D46, D47, D49) |
| Open work | `docs/work/README.md` |
| Docs and comments | `.claude/rules/writing.md`, `.claude/rules/comments.md`, `.claude/rules/docs.md` |
| Which word names a concept | `docs/law/vocabulary-map.md` |
| Mission | `../Mission.md` |

## L. Lane discipline

The `lane` skill owns lane rules (`.claude/skills/lane/SKILL.md`). The `orchestrator` skill owns dispatch
and merges.
