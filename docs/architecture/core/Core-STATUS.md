# Orbweaver — build status & handoff (read first)

> **Session handoff.** Orbweaver is the ground-up remake of **neo-tavern** (the live code is at
> `/home/inktomi/inktomi-stack/development/neo-tavern`; orbweaver is at
> `/home/inktomi/inktomi-stack/development/orbweaver`). **We are BUILDING** — Phases 0–4b are committed
> (planning is done; the design docs below remain authoritative). This file is the index + the locked
> decisions + the NEXT action. **Latest decision: D54** (client-foundation modernization — the central-primitive
> reuse model + surface→primitive map + the Form under-use fix standardized in `UI-Primitives-and-Reuse.md` §13; **TanStack Virtual
> KEPT, the "virtua swap" reversed** on refuted premises — `directDomUpdates` fix shipped + chat APIs native;
> seven `client-tanstack-*`/`client-zustand` mine companions). Recent: D53 (regex scripts — three-source joint
> attachment + host-authority vs per-user-display split + the `node:vm` ReDoS watchdog in `@orb/server/kit`),
> D52 (charts: **ECharts**, nivo DROPPED at v0.99 — supersedes D43; `UI-Gates-and-Lessons.md` §11.3/§11.8), D46–D51
> (scripting/automation graduated · 7 ST feature gaps · tool-use + structured-output gates · the gap register
> closed · `ChatBusEvent` parity · D45 multimodal threaded at the wire seam), D45 (image INPUT to vision models —
> `ModelCapability.vision` + content-parts; `UI-Theming-and-Content.md` §12.4), D44 (theming + rich message content; `UI-Theming-and-Content.md` §12), PD-11 (hosted rerank wired).
> Recent: D42 (Phase-6 client foundation), D43 (full neo-client audit → machine-enforceable plan, `UI-Architecture-and-Layout.md`
> §11), D44 (theming + rich message content, §12).

## Why a remake

neo-tavern's architecture was sound but rotted in place: `domain/_shared` became a junk drawer; concepts
fragmented across stores (connection, labels, persona); the frontend leaned on inherited SillyTavern
sins. Keep the per-feature template (it's good); rebuild so the **file tree is self-documenting** and
**boundaries are physics (packages), not lint**.

## The docs (all under `docs/architecture/`)

- **`Core-BUILD-PLAN.md`** — ⭐ the ordered runbook: numbered phases (workspace+gates → kit → contracts → db
  → server tiers leaf-first → chat+memory → client) with a checkpoint per phase. Start here to build.
- **`Core-0-Architecture-and-Structure.md`** — the constitution. 4 locked principles + the enforcement ladder + the per-feature
  8-slot template + central test mirror + the 13 gates. Includes: `kit` holds the macro+regex ENGINES;
  the "unwired ≠ worthless" rule.
- **`domains.md`** — the feature map (neo-tavern's 20 → orbweaver), cross-cutting concept homes, the
  connection↔providers boundary. Points to the detail docs below.
- **`domains/memory.md`** — embeddings/memory/search/discovery. Build-once-read-many; memory =
  scoped search; the lens dimension; the embedding-space-tied-to-model invariant.
- **`participants-agents-identity.md`** — character/persona + the chat-turn foundation (agent mode
  opt-in, NOT the bet); the 3 connection paths; de-pin; persona per-participant.
- **`core/Tier-3b-Providers.md`** — roles as the firewall; sealed backends; vLLM as its own multi-role
  engine; custom/BYO fully user-declared; hardware tiers (local-light transformers.js / local-heavy
  vLLM / hosted); the space invariant (verified the OpenRouter SDK `dimensions` param).
- **`domain/connection`** — selection conductor (`resolveRole`) + the ONE capability descriptor
  (distinct reasoning/sampling/verbosity axes) that drives BOTH translation AND the samplers panel.
- **`domains/chat.md`** — the resolution ORDER as the artifact (one explicit stage list per context); the 8
  load-bearing rules; one injection list + one budget; two-phase assemble; render-once; guided model;
  ephemeral taxonomy; cache: PRESERVE the live 2B history breakpoint (relocate-the-tag, not drop —
  §8 corrected 2026-06-25 after a code re-check; dropping it = silent ~5300-token/turn regression).

## Locked principles (constitution)

1. **Packages (pnpm workspaces)** — `@orb/kit·contracts·db·server·client`; the cake is resolver-enforced
   (physics, not lint). dependency-cruiser is the backstop.
2. **`#` subpath imports intra-package, package deps cross-package, ZERO `paths` aliases** (the `@/`
   shadcn tax is gone). `#` is native (no tooling); `@anthropic-ai/sdk` peer stays unused (no API key).
3. **Name by role; no `_` junk drawers.** `kit` = pure primitives + the pure ENGINES (macro, regex,
   speaker-label). Services are features, not `_shared`.
4. **One central `tests/` tree mirroring `src` 1:1** (prefix-swap path, kind by suffix). Enforce the mirror.

- **Enforcement ladder:** push to resolve-time (packages) + compile-time (types); lint/check is backstop.
- **"unwired ≠ worthless":** evaluate ST-inherited/scaffolded intent → wire/modernize; don't auto-delete.

## Key locked decisions (don't re-litigate)

- **Connection ≠ preset.** Connection = {api,source,model,providerRouting} (user-selected); preset =
  generation config. `runner`/`family` sealed inside providers (provably derivable from `(api,source)`).
- **Agent mode is opt-in** — stateless chat turn is the foundation; `claude-agent-sdk` reserved for the
  Max sub + agent mode; its statefulness/env-knobs are backend-internal.
- **Inference roles are multi-backend, hardware-tiered**; embed space is tied to the MODEL (same model =
  free local↔hosted switch via OR `dimensions` param + provider-pin + cosine probe; different dim =
  rare re-index).
- **Memory = scoped search** over ONE substrate (segments+digests, two lenses, tiered); `discovery`
  (was corpus) = semantics; `stats` = economics; scoped-group recall = egocentric-only.
- **De-pin characters** (live identity in a flat `characters` row; history = the standalone
  `character_snapshots` log, which gates nothing — D28); **persona per-participant**
  (active on roster, anchor=pinned for `{{user}}`, attribution per-message); drop `chats.personaId`.
- **One capability descriptor** drives params translation + the panel (reasoning/sampling/verbosity as
  distinct axes — fixes the "bonkers mapper").
- **Chat order is one explicit stage list**; engines (macro/regex) live in `kit`; one injection list +
  one budget.
- **Custom/BYO backend** = user declares profile + request + response mappings (nothing baked).
- **Build path = greenfield for EVERYTHING, including chat + memory** (decided 2026-06-25). No in-place
  refactor of neo-tavern. The high-risk tiers (chat, the memory/knowledge cluster, the
  breakpoint/squash/name-stamp machinery) are ported greenfield but gated by a **cross-repo differential
  oracle against running neo-tavern**: same inputs → old vs new, diff SEND/ASSEMBLE/RECEIVE outputs AND
  cache-token counts (the §8 lesson — catches silent perf/behavior regressions a from-prose rebuild
  misses). The steady clone stays the reference to diff against; it is not deleted.

## Where we are (updated 2026-06-30) — Phases 0–5 ALMOST COMPLETE, next is Phase 6 (client)

The planning docs are **complete and reconciled**, and the build is extremely far along. **Built + committed
(`pnpm check` + `pnpm test` — green):**

- **Phase 0** — pnpm workspace + the 5 packages + the **13-gate suite**.
- **Phase 1 — `@orb/kit`** — the pure leaf.
- **Phase 2 — `@orb/contracts`** — the cross-boundary wire types + zod schemas.
- **Phase 3 — `@orb/db`** — born-whole `0000_baseline`.
- **Phase 4a — server `foundation`** — observability · config · env base.
- **Phase 4b — server `infra`** — crypto · network · storage · image · auth + `providers`.
- **Phase 4c — server `domain`** — ALL domains (Wave 1, 1.5, 2, 3) are completely built and tested.
- **Phase 4d & 4e — server `transport`/`entry`** — Root composition, lifecycle, jobs, and HTTP roots are built.
- **Phase 5 — `chat`/`memory`** — **ALMOST COMPLETE.** The complex multi-human roster, `memory/` triggers, regex `SEND/RECEIVE` parser (`node:vm`), `runChatTurn` adapter, and the 530-line `ChatContext` DI assembly (`compose/chat.ts`) are **100% built and wired.**

**Built docs/decisions still authoritative — DO NOT re-derive:**

- **Boundary scan** (ts-morph) — the cake is clean (0 upward edges, 0 cycles). (`core/Core-Audits-and-Debt.md`.)
- **Dissolution inventory** — every `_shared`/`shared/*` symbol has a home + gate. (`core/Core-Legacy-Migration-and-Gaps.md`.)
- **Per-domain target docs** (all 20 under `domains/`), **tier surveys** (`tiers/*`), **spine threads**
  (§7.1–7.5 + `core/Spine-Testing.md` + `core/Spine-TypeScript-and-Patterns.md`), and the cross-doc **reconciliation/de-dup**.
  Decisions ledger: `core/Core-Laws-and-Precedents.md` (latest: **D54** + **PD-11**).

**NEXT ACTION = Finish the final Phase 5 seams (TRPC Router + Memory Recall Caller), execute the `Ready` items in `Core-Audits-and-Debt.md`, then start Phase 6 (Client).**
The primary focus is knocking out the remaining `Core-Audits-and-Debt.md` items that are `Ready`, particularly `PD-46` (the transport chat router) so the frontend can actually reach the finished chat engine, and `PD-61/62/63/65/66` (the final chat-coupled integrations).

**Recon method that worked (keep for scaffold verification):** general-purpose agents reading whole files
top-to-bottom (not grep-skim), structured `file:line` returns, then verify/synthesize. Verifying claims
against real code repeatedly paid off — corrected `domains/chat.md` §8 (the live cache breakpoint), the
character-card "lossiness already fixed", the `node:buffer`-in-kit illegality, the
infra→domain capability-import, and more. NOTE: _background_ general-purpose agent launches were flaky in
this environment (some returned 0 tool-uses); foreground launches were reliable.

## Reference material

- `references/sillytavern` (ST source — read, don't copy); `references/marinara-engine`, `references/stmp`.
- The original memory intent: `~/Downloads/memory-diagram.pdf` (the summarizer+vector replacement).
- neo-tavern's `docs/architecture/*` (the current layer cake, chat-resolution-pipeline, send-round-trip,
  feature-organization — the per-feature template + enforcement matrix) and `docs/plans/unified-group-
chat.md` (the 1585-line group-chat plan — §11.5 group-as-character memory is load-bearing).
- neo-tavern domains (20): admin, assets, buddy, character, chat, corpus, credentials, debug, export,
  import, models, persona, preset, search, sessions, settings, stats, tag, workloads, world-info.
