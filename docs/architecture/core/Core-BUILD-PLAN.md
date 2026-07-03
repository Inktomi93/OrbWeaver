---
kind: law
status: active
updated: 2026-07-03
---

# Orbweaver — build plan (the ordered runbook)

> **Status: the single sequential guide — what to build, in what order, with the checkpoint that proves
> each phase done.** If anything here disagrees with the ledger (`Core-Laws-and-Precedents.md`), the
> ledger wins (this doc is the expansion, not a new authority).
>
> **The spine of the order:** build bottom-up so every import resolves downward —
> `kit → contracts → db → server (foundation → infra → domain[leaf-first] → transport → entry) → client`,
> with **chat + memory LAST** behind the differential oracle. The cake was validated at resolve-time on
> the empty tree (Phase 0) before any feature code existed.
>
> **Progress (2026-07-03): Phases 0–5 BUILT** (all checkpoints green) — with ONE Phase-5 seam still open:
> the **OpenAI-path tool-loop (D48)** is not built (`domain/chat/engine/pipeline.ts` marks it the next
> chunk). **Phase 6 IN PROGRESS:** `@orb/ui` built + the primitive fleet integrated; the client
> feature-slice scaffold + gates landed and the base site boots; the feature surfaces are the remaining
> work. **Phase 7 PARTIAL:** `domain/imagery` + gallery v1/v2 landed early (D47#1/D49#2); tool-use ·
> databank · expressions pending. **Phase 8 not started.** The **D60 agent-principal waves** ride
> alongside: AP0–AP2 landed; the AP3+ seat wave is pending (PD-17). Remaining targets: the `ready` rows
> in `Core-Audits-and-Debt.md`.
>
> Phases 6–8 depend only on Phase 5 — parallel post-chat tracks; the numbering is suggested priority
> (make chat usable → features → scripting), not a hard chain.

---

## Phases 0–5 — BUILT (checkpoints green; the code is the doc)

The bottom-up build landed in order; each phase's checkpoint held. What each phase was, and where its
law now lives:

- **Phase 0 — workspace + gates.** The pnpm workspace (now 6 packages — `ui` joined at Phase 6, D54),
  the blocking gate suite, `tests/support/` + the Vitest `test.projects` lanes, and the AI-native seam
  reservations (`ClipKind`, `WorkloadKind:'world-state'`, the `observer` participant kind — all in
  `@orb/contracts`). Gate catalog: `Core-Enforcement-Active-Gates.md`; test policy: `Spine-Testing.md`.
  Version pins live in the pnpm catalog; per-tier runtime libs joined it as their tier was built.
- **Phase 1 — `@orb/kit`.** The pure isomorphic leaf: primitives + the macro/regex/injection/world-info/
  persona engines. `kit-purity` green.
- **Phase 2 — `@orb/contracts`.** The wire types + zod schemas, built in the internal DAG order (the
  order mattered at build time; `tsc` now enforces the result).
- **Phase 3 — `@orb/db`.** `custom-types` (vector32) · libSQL client · `db/kit` · one born-whole
  `0000_baseline` (schema riders squash into it while it's still open — the `schema-baseline-parity`
  gate). The neo→orb data-port conditions live in `Core-Planning-and-Checklists.md §B`.
- **Phase 4 — `@orb/server`**, bottom-up tiers: `foundation` → `infra` (incl. the local-light
  embed/rerank tier + `VLLM_DISABLED`) → `domain` leaf-first in waves (W1 leaves → connection →
  embeddings/search → the rest) → `transport` (trpc routers · jobs · rate-limit; SSE wrapped in
  `withSubscriptionErrors`) → `entry` (compose · boot · auth seam · http · profile-import · lifecycle).
- **Phase 5 — chat + memory + the unified roster/group/multi-human system, built WHOLE (D16 — no
  feature-phasing; solo = roster-of-1, byte-identical, `no-if(isGroup)`).** The differential oracle
  (`tests/server/domain/chat/pipeline-breakpoint.parity.test.ts` + `tests/support/parity-runner.ts`
  against the steady clone) gates the assembly + cache-token PARITY surface; the intentional rewrites
  (roster/invites/notifications/presence/arbitration/memory) ship on `.int`/`.contract` suites. The D46
  born-compliant seams (two-plane variables, turn-initiator + budget axis, injected clock/PRNG,
  `ChatBusEvent` emit) are shaped into the turn pipeline. The build conditions + esoterica map:
  `Core-Planning-and-Checklists.md §C`. **The built `domain/chat` code is the authoritative design.**

**One Phase-5 seam still open:** the **OpenAI-path tool-loop (D48)** — the chat-domain-owned recurse
loop is NOT built (`domain/chat/engine/pipeline.ts` marks it the next chunk); the D48 wire/contract
gates (tool history role, content parts, request fields, `ToolCallRecord`) are the prerequisite work it
lands against. It reconciles with the agent-sdk path into ONE `domain/tool-use` registry (Phase 7).

---

## Phase 6 — `@orb/client` + `@orb/ui` (IN PROGRESS)

**Authoritative spec: the `UI-*.md` core set** — `UI-Architecture-and-Layout.md` (D42/D43) ·
`UI-Primitives-and-Reuse.md` (D54) · `UI-Theming-and-Content.md` (D44/D45) · `UI-Gates-and-Lessons.md` ·
the `UI-Lib-*.md` five. Build against it.

**Built:** **`@orb/ui`** (the sealed frontend leaf, `Core-0` §2) — the primitive fleet over Base UI +
the sealed satellites (cmdk/@dnd-kit/ECharts/Streamdown/CodeMirror…), the D44 trust-tiered security
primitives (`theme-scope` · `sandbox-frame` · `message-media` · the markdown sanitize allowlist) + the
D44 gates, tokens → Tailwind `@theme`. **`@orb/client`** scaffold — the feature-slice tree + the
`client-structure`/`component-size`/feature-isolation gates, vite entry + hand-written router tree; the
base site boots.

**Remaining:**

1. The client FEATURE surfaces over the scaffold: feature-slice · surfaces/anchors · `state:files` ·
   intent tokens; **container-driven** layout (4-tier; `@media` only in app-shell); Query (server) +
   gated Zustand (client); TanStack Router **minimal** (single-route shell, no file-based codegen). `#`
   imports, no `@/`.
2. Client component tests = **Playwright CT** (`.ct.tsx` at the `tests/client/` mirror); e2e =
   **Playwright** (`.spec.ts` under `tests/e2e/`). No Vitest browser. Client pure-logic stays node
   `.test.ts`. Add **visual-regression** (Playwright screenshots) as a gate.
3. **Client-surfaced committed features (D47/D49):** the **welcome screen** (`{kind:landing}` center
   pane), **reasoning-block render + effort picker** (the D41 data already exists), the **gallery
   grids**, the **token-counter panel** (over `@orb/kit/tokens` — pure client), **inline image display**
   (`message-media`), and the **`/imagine` command surface** (a D46 Tier-1 automation action). The
   feature-slice structure ABSORBS the Phase-7/8 feature UIs additively as those server domains land —
   this phase need not wait for 7/8.

**✅ Checkpoint:** the full stack runs end-to-end; client component + e2e tests green; the UI-boundary
physics hold (an app→raw-primitive import fails to resolve).

---

## Phase 7 — committed feature domains (post-chat additive grafts; PARTIAL)

> **Authoritative: ledger D47/D48/D49/D61 + the `docs/architecture/proposed/` design sets.** These are
> committed feature DOMAINS that graft onto the Phase-5 chat seams (event bus, turn pipeline, `can()`,
> assets, embeddings/search). Each depends only on Phase 5 — build by product priority, not a hard chain.

**Built:** **`domain/imagery`** (D49; hosted-only — local SD stays rejected, D39) and **gallery v1/v2**
(D49#2 — the `gallery` schema + verbs; the gif external-search half moved to `domain/hub` per D61).

**Remaining:**

1. **`domain/tool-use`** (D48 → `proposed/tool-use-design/`, PD-54) — the ONE tool registry feeding BOTH wire projections (agent-sdk → MCP loop-internal; OpenAI-path → the chat-domain recurse loop, the open Phase-5 seam) + the structured-output (`response_format`) axis. Reconciles with the D46 `can()` plugin-capability surface (one registry, two sources).
2. **databank / document-RAG** (D49 → `proposed/databank-design/`, PD-57) — a `documents` single-owned canon producer + per-type FK scope junctions + a derived `document_chunks` vector table + a `@orb/kit/chunk` chunker + a **db-free `infra/extraction`** loader (pdfjs/mammoth/epub) + a `search.documents` lens + a chat `{{databank}}` injection slot + scraper verbs. \~70% reuse of the embeddings/search substrate; v1 = global+chat scopes, owner/host-only retrieval, txt/md/pdf/html.
3. **expressions** (D49 → `proposed/expressions-design/`, PD-56) — a `classify` provider role (v1 = `chat`-role shaper; v2 = a `local-light classify` role, D39 template) + a `character_sprites` model (`(characterId FK, label, assetId FK)`, owner DERIVED) + an `EXPRESSION_LABELS` tuple + a per-turn chat hook + a client render slot.
4. **The D61 leaves** — **`domain/hub`** (remote card-hub browse/import + the gif proxy, over the B5a hardened-egress guard → `proposed/hub-browse-design/`) and **`domain/roster-preset`** (saved roster presets → `proposed/saved-rosters-design.md`). The D60 **agent-principal seat wave** (AP3+ — buddy adoption + rpg seats) also rides this band (`proposed/agent-principal-design/`, PD-17).
5. **Standalone D47 server features** — **direct model providers** (native Anthropic/OpenAI/Google keys; the clean D39 source-add, `CRED_PROVIDERS` reserves the slots), **translate** (a request-shaper over the `chat` role), **standalone caption** (an ad-hoc vision verb; pairs with D45).

**✅ Checkpoint:** each domain's `.int`/`.contract` suites green; the gates green; chat surfaces the new blocks (tool-call records, databank injection) end-to-end.

---

## Phase 8 — scripting / automation / plugin system (D46)

> **Authoritative: ledger D46 + the design sets `proposed/automation-design/` (Tier 1) and
> `proposed/plugin-design/` (Tier 2).** Built ON the Phase-5 born-compliant hooks (the two-plane
> variables, the turn-initiator/budget axis, the `ChatBusEvent` bus, the clock/PRNG-injected eval path,
> the `can()` capability axis). Committed in full — NOT a maybe.

1. **Tier 1 — declarative automation:** `@orb/contracts/automation` + a `domain/automation` leaf — `on <event> where <CEL/macro predicate> do <closed action union>`; triggers from the closed `ChatBusEvent` bus + chat-lifecycle events; v1 owner/host-authored only (member rules reserved-additive); autonomous hosted-cred turns hit the per-rule/$ budget axis (independent of the D17 consent axis).
2. **Tier 2 — the plugin host:** `infra/plugin-host/` (a dual-mode **QuickJS-ng** `quickjs-emscripten` WASM sandbox behind a Figma-style membrane) + the frozen versioned `@orb/contracts/plugin` host surface + a `domain/plugin` leaf (registry/lifecycle + capability-manifest → `can()`); serves BOTH installed plugins AND ad-hoc inline snippets (closes the STscript "medium band"). Rejected: `isolated-vm`, SES/Compartments, WASM-component; the ST `getContext()` god-object + dynamic-`import()` model are permanently OUT.
3. **Macro-DX + CEL + global vars:** the `kit/macro` DX layer (registry metadata · arg validation · parse-span diagnostics · autocomplete API) + CEL (`@marcbachmann/cel-js`) as the expression/predicate layer over `MacroEnv`; per-user **global variables** = a `fetchOwned` KV table (single-owned).
4. **The prompt-transform seam** (D50): if a synchronous prompt-mutation hook is ever wanted (ST's interceptors), it is an ordered `PromptTransform` step on the turn pipeline + `kit/injection` — NEVER a fire-and-forget bus subscription. Authoring UIs surface in the client (feature-slice, additive).

**✅ Checkpoint:** a Tier-1 rule fires on a `ChatBusEvent` + runs a closed action under budget; a Tier-2 plugin runs in the QuickJS membrane with a capability-gated host surface (no ambient access); determinism (injected clock/PRNG) proven by a replay test.

---

## Cross-cutting (every phase)

- **Tests travel with code** — each new file's test lands at its mirror path or `check` goes red (`test-layout` + `test-presence`).
- **Owned risks, no action** (`Core-Planning-and-Checklists.md §E`): the Qwen3-VL single-model concentration (cosine≈1.0 probe guards it); single-replica is the v1 stance (every `ASSUMES(single-replica)` site has a named DB-backed replacement seam).
- **The verification method that works** (keep using it): general-purpose agents reading whole files + a grep sweep for losing-side strings after any structural change.
