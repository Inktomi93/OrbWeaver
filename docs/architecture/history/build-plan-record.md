---
kind: history
status: superseded
updated: 2026-07-13
---

> **History note:** the executed build plan, frozen 2026-07-13; the slim cursor lives in
> `core/Core-BUILD-PLAN.md`.

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
> **Progress (2026-07-06): Phases 0–5 BUILT** (all checkpoints green) — including the **D48 tool-loop**
> (the chat-domain recurse loop `runRecurseLoop` + `domain/tool-use` registry, PD-54 T1–T4; the earlier
> "one Phase-5 seam still open" note is CLEARED). **Phase 6 IN PROGRESS:** `@orb/ui` built + the primitive fleet integrated; the client
> feature-slice scaffold + gates landed and the base site boots; **the D62 revamp lanes L0–L6 are all
> LANDED** (`fa0d2e3` · `18383f8` · `0076f31` · `1f3a967` · `3cad8a0` · `ab54d38` · `9de07ab`) — the
> whole shell/polish revamp is done, desktop + mobile. **Remaining Phase-6 work = L7 parity buildout**
> (Presets first — placement PENDING the owner's presets→settings call, D62 P6 note) + the §8
> micro-polish + the punchlist §0b / revamp §0.5 PARTIAL leftovers (`SettingRow` grammar in the
> Appearance pane · account pane rides auth #50 · corpus J10 preview) + the design-enforcement §3
> gate/golden backlog (ARIA + screenshot goldens, `no-raw-interactive-intrinsics`,
> `empty-state-has-action`, the absent client-foundation belts — `ui-package-design.md` §11,
> re-trued 2026-07-09). **Phase 7 PARTIAL:** `domain/imagery` + gallery v1/v2 landed
> early (D47#1/D49#2); **tool-use BUILT** (D48/PD-54 — registry + recurse loop; the structured-output/MCP registrant extensions land with crew/buddy); databank · expressions pending. **Phase 8 not started.** The **D60
> agent-principal waves** ride alongside: AP0–AP2 landed; the AP3+ seat wave is pending (PD-17).
> Remaining targets: the `ready` rows in `Core-Audits-and-Debt.md`.
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

**The Phase-5 D48 seam is now CLOSED (PD-54, 2026-07-04, T1–T4):** the **OpenAI-path tool-loop** — the
chat-domain-owned recurse loop `runRecurseLoop` (`domain/chat/engine/pipeline.ts`) + the `domain/tool-use`
registry — IS built; the D48 wire/contract gates (tool history role, content parts, request fields,
`ToolCallRecord`) landed as its prerequisite. (Remaining extensions — structured-output/`response_format`
for crew, `project-mcp` for buddy — land with those domain waves, not the core loop.) It reconciled the
OpenAI-path and agent-sdk paths into the ONE `domain/tool-use` registry as planned.

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

**The D62 lane sequence (ledger D62; step-level detail lives in the D62 program docs:
`history/ui-polish-punchlist.md` · `history/ux-flow-revamp.md` (J1–J12 + the parity map) ·
`history/design-enforcement.md`). The standing rules for every lane:** feature-slice ·
surfaces/anchors · `state:files` · intent tokens · container-driven layout (`@media` only in
app-shell) · Query (server) + gated Zustand (client) · Router minimal · `#` imports. Every lane
brief cites its law rows (§4.1–§4.3), ends with verify snaps, updates the golden baselines in the
same commit, and pastes the §4.3 Tier-C checklist. Lanes L0→L4 are strictly ordered; L5/L6 hang off
L1/L2; L7 tracks server-domain availability.

**L0–L6 are LANDED (2026-07-05)** — the whole shell/polish revamp, desktop + mobile. The seven rows
below are now the history record (each ends with its landing commit); **L7 is the only remaining
Phase-6 lane.**

1. **L0 — tokens — DONE (`fa0d2e3`).** Rulings P1/P2 decided: the corrected Hearth palette
   (UIP-101) · pointer-conditional control heights (UIP-102 — coarse 44px floor / fine 28-34-40) ·
   the micro/tracking type pair · the avatar display-size trio · `--color-info`/`--glow`/
   `--shadow-overlay`. Same commit: `touch-target-floor` re-scope + the §4b axis-3/`tokens.json`
   `$description` wording + AA re-check.
2. **L1 — primitive deltas — DONE (`18383f8`)** (`ux-flow-revamp.md` §4, under the §13.7/§13.8 contract): new `kbd` ·
   `Text` micro/caps · `Avatar` sizes+hue · `Dialog` widths+`full` · `EmptyState` action/decoration ·
   `Skeleton` shimmer · `Button` secondary-bordered/ghost-muted (P5) · Tabs underline · weave-glyph
   re-home to `client/src/lib/`. Plus the remaining client-foundation belts: the D62 lanes are
   feature agents, so per §11.7 ALL §8-PARKED belts + the D62 design-gate set activate in/with this
   wave. **The CI browser lane activates here** (ci.yml has none — install browsers + run
   `playwright test`; prerequisite for the ARIA/screenshot goldens).
3. **L2 — shell chrome — DONE (`0076f31`)** (punchlist §2 + J3 header slot): rail polish + grouped sections ·
   kill the triple-title (panel header = list header row) · topbar identity header + ⌘K chip ·
   context-panel header · the document-scroll-leak fix (UIP-205) · `SECTION_PANEL_DEFAULTS`.
4. **L3 — flow spine — DONE (`1f3a967`)** (J1/J2/J4/J5): the landing surface (`{kind:landing}` — the committed
   welcome screen, P4) · the new-chat character picker (multi-select founds groups —
   `startChat(characterIds[])` already plural) · the real ⌘K palette over `@orb/ui/command` ·
   chat-list `ListRow` rows + search + row kebab (**this lane routes the four chat-lifecycle
   procedures** — title/star/archive/delete exist on `ChatService` but not in
   `transport/trpc/routers/chat.ts`; thin pass-through, D62). ARIA + screenshot goldens land on
   these states in the same lane.
5. **L4 — chat room — DONE (`3cad8a0`)** (J3/J6/J7 + punchlist §3): the 65–75ch thread column · hover-reveal message
   actions (+ coarse-pointer/`:focus-within` fallbacks) · pill composer · chat header ⋯ options
   menu · bulk-select (`selection-bar` + `state/message-selection-store.ts`) · cast-bar `+`
   add-member · **reasoning-block effort picker** (D41 data exists) · **inline image display**
   (`message-media` wiring) · **token-counter panel** (CONTEXT tab, over `@orb/kit/tokens`).
6. **L5 — sections & modals — DONE (`ab54d38`)** (J8–J11 + punchlist §4/§5): distinct Weave placeholders per section ·
   character detail card (J9; the editor is its own follow-on lane — `createSavedEntityForm`, with
   the retired FINAL-Character competition doc (yeeted under D66; git history has it) §7/§12 + the parity-map satellite dialogs riding it) · corpus
   interim search (J10) · the settings full-bleed overlay shell (J11 — Appearance pane migrates
   first; **(design set staged out-of-repo — see `../proposed/README.md`)** lands as the Connections pane's
   descriptor-driven params half when credentials UI arrives) · the interim theme picker
   (Hearth/Mocha/Light) — the full theme EDITOR rides **`history/themes-design.md`** (server
   `themes` entity + `createSavedEntityForm`) as a follow-on.
7. **L6 — mobile — DONE (`9de07ab`)** (J12, P3): bottom tab bar (Chats · Characters · Corpus · You) · land-on-CONTENT ·
   sheet polish · `interactive-widget=resizes-content` + safe-area audit · the §4.1 `MOBILE:`
   D-ledger amendment ships in this lane.
8. **L7 — parity growth — REMAINING (the only open Phase-6 lane)** (the `ux-flow-revamp.md` §3 map is
   the authority; each row cites its decided home; build by product priority as server domains
   allow): **Presets section** (P6; +
   prompt-manager Prompt tab; **`history/preset-form-mapper-elimination.md`** (BUILT 2026-07-12) was
   the lane rule for its editor — no flat-form mapper) → **World Info section** (P6; four activation sources per the
   map) → **character EDITOR** (+ import UI over the built card parsers; tag management modal —
   server half: `history/tag-pending-review.md`) → **Connections** (Settings pane; D47 direct
   providers when built) → **Corpus hub** (search/insights/stats faces; the deferred verbs:
   (design set staged out-of-repo — see `../proposed/README.md`) slot here)
   → **gallery grids** (D49 — server built; `media-grid` exists) → **`/imagine` command surface**
   (composer wand item; D46 Tier-1) → **Refinery + Analytics** (their engines' phases). Import/
   export surface growth rides `history/export-import-portability.md` (§3 delivery core, §5 ST
   adapter lane) when those waves open; Workloads UI lands in Settings→APP→System
   (`history/workloads-deferred-designs.md` for the as-built server halves). The feature-slice
   structure ABSORBS the Phase-7/8 feature UIs additively as those domains land (tool-use records ·
   databank panel · expressions stage · hub browse · saved-roster picker · rpg/crew/buddy surfaces
   · agent-principal admin rows — each enters at its parity-map home; this phase never waits on
   7/8).

Client test posture (unchanged): Playwright CT (`.ct.tsx`, `tests/client/` mirror) + e2e
(`.spec.ts`, `tests/e2e/`); no Vitest browser; client pure-logic stays node `.test.ts`. The D62
goldens (ARIA + screenshots) ARE the visual-regression gate this phase committed to.

**✅ Checkpoint:** the full stack runs end-to-end; client component + e2e tests green (incl. the
shell-structure goldens); the UI-boundary physics hold (an app→raw-primitive import fails to
resolve); **L0–L6 landed** = the app opens on the landing, every section has a distinct surface or
teaching state, no modal ships a sparkle placeholder, and mobile reflows to the bottom tab bar.
**Remaining for the phase: L7 parity growth** (Presets first) + the §8 micro-polish.

---

## Phase 7 — committed feature domains (post-chat additive grafts; PARTIAL)

> **Authoritative: ledger D47/D48/D49/D61 + the `docs/architecture/proposed/` design sets.** These are
> committed feature DOMAINS that graft onto the Phase-5 chat seams (event bus, turn pipeline, `can()`,
> assets, embeddings/search). Each depends only on Phase 5 — build by product priority, not a hard chain.

**Built:** **`domain/imagery`** (D49; hosted-only — local SD stays rejected, D39) and **gallery v1/v2**
(D49#2 — the `gallery` schema + verbs; the gif external-search half moved to `domain/hub` per D61).

**Remaining:**

1. **`domain/tool-use`** (D48 → design set staged out-of-repo — see `../proposed/README.md`, PD-54) — the ONE tool registry feeding BOTH wire projections (agent-sdk → MCP loop-internal; OpenAI-path → the chat-domain recurse loop, the open Phase-5 seam) + the structured-output (`response_format`) axis. Reconciles with the D46 `can()` plugin-capability surface (one registry, two sources).
2. **databank / document-RAG** (D49 → design set staged out-of-repo — see `../proposed/README.md`, PD-57) — a `documents` single-owned canon producer + per-type FK scope junctions + a derived `document_chunks` vector table + a `@orb/kit/chunk` chunker + a **db-free `infra/extraction`** loader (pdfjs/mammoth/epub) + a `search.documents` lens + a chat `{{databank}}` injection slot + scraper verbs. \~70% reuse of the embeddings/search substrate; v1 = global+chat scopes, owner/host-only retrieval, txt/md/pdf/html.
3. **expressions** (D49 → design set staged out-of-repo — see `../proposed/README.md`, PD-56) — a `classify` provider role (v1 = `chat`-role shaper; v2 = a `local-light classify` role, D39 template) + a `character_sprites` model (`(characterId FK, label, assetId FK)`, owner DERIVED) + an `EXPRESSION_LABELS` tuple + a per-turn chat hook + a client render slot.
4. **The D61 leaf** — **`domain/roster-preset`** (saved roster presets → design set staged out-of-repo — see `../proposed/README.md`). The D60 **agent-principal seat wave** (AP3+ — buddy adoption + rpg seats) also rides this band (design set staged out-of-repo — see `../proposed/README.md`, PD-17).

**BUILT:** **`domain/hub`** (remote card-hub browse/import + the gif proxy, over the B5a hardened-egress guard) landed per D61.
5\. **Standalone D47 server features** — **direct model providers** (native Anthropic/OpenAI/Google keys; the clean D39 source-add, `CRED_PROVIDERS` reserves the slots), **translate** (a request-shaper over the `chat` role), **standalone caption** (an ad-hoc vision verb; pairs with D45).

**✅ Checkpoint:** each domain's `.int`/`.contract` suites green; the gates green; chat surfaces the new blocks (tool-call records, databank injection) end-to-end.

---

## Phase 8 — scripting / automation / plugin system (D46)

> **Authoritative: ledger D46 + the design sets (design set staged out-of-repo — see
> `../proposed/README.md`) (Tier 1) and (design set staged out-of-repo — see `../proposed/README.md`)
> (Tier 2).** Built ON the Phase-5 born-compliant hooks (the two-plane
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

---

## Status narrative (frozen from `Core-STATUS.md`, as of 2026-07-09)

> **Session handoff snapshot.** Orbweaver is the ground-up remake of **neo-tavern** (live code:
> `/home/inktomi/inktomi-stack/development/neo-tavern`; orbweaver:
> `/home/inktomi/inktomi-stack/development/orbweaver`).

### Where we were (2026-07-09)

- **Phases 0–5 BUILT** (`pnpm check` + `pnpm test` green): the 6-package cake (`kit` · `contracts` ·
  `db` · `server` · `ui` · `client`), the gate suite, all server tiers, ALL domains, and the whole
  unified chat + memory + roster system — incl. the transport chat router + `streamMessages` SSE,
  memory recall wired into GATHER (`chat/substrate/assemble-gather.ts`), guided-steer routing,
  temporary-chat reap, targeted invites (`resolveHandle`), and the image-gen-in-chat caller.
- **Phase 5 FULLY CLOSED (2026-07-04):** the last seam — the OpenAI-path tool-loop (D48) — landed as
  PD-54 T1–T4. No P5 seams remain; the parity-audit log
  (`neo-orb-parity-audit.md`) went fully green 2026-07-09 (persona null-anchor cleared, character
  re-verified pre-lane).
- **Phase 6 (client) IN PROGRESS:** `@orb/ui` built + the primitive fleet integrated; the client
  feature-slice scaffold + gates landed and the base site boots; the feature surfaces remain and
  now build to the **D62 lane sequence** (L0 tokens → … → L7 parity; Phase 6 +
  the D62 program records in `history/` (`ui-polish-punchlist.md`, `ux-flow-revamp.md`); `proposed/`
  holds ONE active doc (D66 rule)).
- **Phase 7 PARTIAL:** `domain/imagery` + gallery landed early; tool-use · databank · expressions ·
  the D61 leaves (hub, roster-preset) pending.
- **D60 agent principals:** AP0–AP2 landed (identity spine + attribution + containment suite); the
  AP3+ seat wave is pending (PD-17) — though AP3's seat verb (`chat.seatAgent` + auth-matrix row) is
  already in-tree; `resolveAgentSpeaker` and the rest of the wave are not.
- Ledger latest at the time: **D66** (`Core-Laws-and-Precedents.md` + `Core-Path-Registry.md` — the UI/UX revamp program).

### NEXT ACTION (as of 2026-07-09)

Burn down the `ready` rows in `Core-Audits-and-Debt.md` (the live registry), finish the Phase-6
client feature surfaces — current lane: `../proposed/ui-cohesion-north-star.md` (the D66 UI-cohesion
program) — then the D60 seat wave (AP3+). (D48: DONE 2026-07-04; PD-119 keepMounted: DONE 2026-07-09.)

### Recon method that worked (keep for verification passes)

General-purpose agents reading whole files top-to-bottom (not grep-skim), structured `file:line`
returns, then verify/synthesize — verifying doc claims against real code repeatedly caught drift.
NOTE: *background* general-purpose agent launches were flaky in this environment (some returned 0
tool-uses); foreground launches were reliable.

### Reference material

- `references/sillytavern` (ST source — read, don't copy); `references/marinara-engine`,
  `references/stmp`.
- The original memory intent: `~/Downloads/memory-diagram.pdf` (the summarizer+vector replacement).
- neo-tavern's `docs/architecture/*` (layer cake, chat-resolution-pipeline, send-round-trip,
  feature-organization) and its `docs/plans/unified-group-chat.md` (§11.5 group-as-character memory is
  load-bearing). The steady clone for the parity oracle: `/tmp/neo-tavern-steady`.
