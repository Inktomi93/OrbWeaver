# Orbweaver — planning status & handoff (read first)

> **Session handoff.** Orbweaver is the ground-up remake of **neo-tavern** (the live code is at
> `/home/inktomi/inktomi-stack/development/neo-tavern`; orbweaver is at
> `/home/inktomi/inktomi-stack/development/orbweaver`). We are in **planning** — no code yet, a set of
> architecture design docs. This file is the index + the locked decisions + the NEXT action.

## Why a remake
neo-tavern's architecture was sound but rotted in place: `domain/_shared` became a junk drawer; concepts
fragmented across stores (connection, labels, persona); the frontend leaned on inherited SillyTavern
sins. Keep the per-feature template (it's good); rebuild so the **file tree is self-documenting** and
**boundaries are physics (packages), not lint**.

## The docs (all under `docs/architecture/`)
- **`structure.md`** — the constitution. 4 locked principles + the enforcement ladder + the per-feature
  8-slot template + central test mirror + the 6 gates. Includes: `kit` holds the macro+regex ENGINES;
  the "unwired ≠ worthless" rule.
- **`domains.md`** — the feature map (neo-tavern's 18 → orbweaver), cross-cutting concept homes, the
  connection↔providers boundary. Points to the detail docs below.
- **`knowledge-cluster.md`** — embeddings/memory/search/discovery. Build-once-read-many; memory =
  scoped search; the lens dimension; the embedding-space-tied-to-model invariant.
- **`participants-agents-identity.md`** — character/persona + the chat-turn foundation (agent mode
  opt-in, NOT the bet); the 3 connection paths; de-pin; persona per-participant.
- **`tiers/providers.md`** — roles as the firewall; sealed backends; vLLM as its own multi-role
  engine; custom/BYO fully user-declared; hardware tiers (local-light transformers.js / local-heavy
  vLLM / hosted); the space invariant (verified the OpenRouter SDK `dimensions` param).
- **`domains/connection.md`** — selection conductor (`resolveRoleConnection`) + the ONE capability descriptor
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
- **De-pin characters** (live identity, versions = restorable history); **persona per-participant**
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

## Where we are (updated 2026-06-25) — docs complete, next is SCAFFOLD
The planning docs are **complete and reconciled**. Done:
- **Boundary scan** (ts-morph over the steady clone) — the 5-package cake is already clean (0 upward
  edges, 0 cycles); the only real entanglement was the `_shared` drawer (reached 245×). Build order:
  `kit → contracts → db → server (foundation→infra→domain→transport→entry) → client`. (`reports/boundary-scan.md`.)
- **Dissolution inventory** — every `_shared` + `shared/*` symbol has a home + gate. (`reports/shared-dissolution.md`.)
- **Per-domain target docs** — all 20 under `domains/` (8-slot layout + movement table + invariants each).
- **Tier surveys** — `tiers/{providers,infra,foundation,transport,db}.md`.
- **Spine threads** — §7.1–7.5 (identity-auth-permission · settings-and-config · serialization-core ·
  types-and-schemas · string-union-dispatch) + `spine/testing.md` (the consolidated test policy:
  4 kinds, the `test-presence` gate, mock/determinism doctrine, factory contract — `DECISIONS-LEDGER §6`).
- **Reconciliation + de-dup** — cross-doc conflicts resolved; the 3 doubled docs (chat/connection/providers)
  merged into their single homes; `structure.md §7` gate table extended. Decisions ledger: `reports/DECISIONS-LEDGER.md`.

**NEXT ACTION = scaffold**, in boundary-scan order: stand up the pnpm workspace + the 5 packages + the
six (now eleven) gates FIRST (validates the cake at resolve-time), then build bottom-up
(`kit` → `contracts` → `db` → server domains leaf-first → `client`), with **chat + memory LAST** behind
the cross-repo differential oracle against running neo-tavern (the locked build path). Resolve the three
parked stack decisions before step 1: package scope (`@orb/*` recommended), UI headless engine, 2026
version pins.

**Recon method that worked (keep for scaffold verification):** general-purpose agents reading whole files
top-to-bottom (not grep-skim), structured `file:line` returns, then verify/synthesize. Verifying claims
against real code repeatedly paid off — corrected `domains/chat.md` §8 (the live cache breakpoint), the
character-card "lossiness already fixed", the `node:buffer`-in-kit illegality, the
infra→domain capability-import, and more. NOTE: *background* general-purpose agent launches were flaky in
this environment (some returned 0 tool-uses); foreground launches were reliable.

## Reference material
- `references/sillytavern` (ST source — read, don't copy); `references/marinara-engine`, `references/stmp`.
- The original memory intent: `~/Downloads/memory-diagram.pdf` (the summarizer+vector replacement).
- neo-tavern's `docs/architecture/*` (the current layer cake, chat-resolution-pipeline, send-round-trip,
  feature-organization — the per-feature template + enforcement matrix) and `docs/plans/unified-group-
  chat.md` (the 1585-line group-chat plan — §11.5 group-as-character memory is load-bearing).
- neo-tavern domains (18): admin, assets, buddy, character, chat, corpus, credentials, debug, export,
  import, models, persona, preset, search, sessions, settings, stats, tag, workloads, world-info.
