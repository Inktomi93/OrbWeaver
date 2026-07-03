---
kind: spec
status: active
updated: 2026-07-03
---

# 02 — Domain Shape and State: `domain/crew`, its Satellites, and Every Table

> **Status: COMMITTED (D59, 2026-07-01) — prescriptive design; the ledger D-entry wins on any
> conflict.** The code geography and the state model. Contains THE hard design call of this
> feature: where the director's state — and the whole crew's config/cadence/proposal state —
> lives.

---

## 1. THE DECISION — one thin `domain/crew` (the director-state call, generalized)

**DECISION: ONE new thin domain, `domain/crew`, owns (a) the per-chat crew config + cadence
state, (b) the director's plot state, (c) the message-edit proposal queue, and (d) the persistent
guide definitions (doc 06). Domain-of-affect WRITES stay with their owners** (world-info entries via the injected `worldInfo.upsertEntries`;
card proposals live IN `domain/character` — §5; message edits apply via injected
`chat.editMessage`). The member prompt+parse modules live in `domain/crew/members/` (the rpg
`crew/` subsystem pattern, rpg-design/02 §2); the workload runners are thin wrappers in
`domain/workloads/runners/` reaching through `WorkloadChatCrewEnv`.

The question the brief poses is "where does the plain director's state live?" — but the director
is the tip of a bigger question: **who owns the WHEN, the config, and the pending-review state for
ALL four members?** The rpg crew answered it for games: `domain/rpg` owned the when/config/state;
domains-of-affect owned the writes. A plain chat has no rpg — something must play that role.

**The alternatives, each rejected with the reason:**

- **Per-domain scattering** (keeper fully inside `world-info`, auditor fully inside `character`,
  guardian inside `chat`, director somewhere) — the literal reading of the Agent-Port-Map §4
  "domain-of-affect" rule. Rejected: each member would independently need chat-transcript reads
  (a cross-feature reach world-info/character have no business making), an injected `agentTurn`,
  a per-chat config home, and a cadence mechanism — four copies of the same plumbing, four config
  surfaces, no shared review vocabulary. The D58 precedent already REFINED the port-map rule:
  centralize the crew's prompt/parse/when in ONE feature domain; keep only the WRITE in the
  domain-of-affect. This design follows the enacted precedent, not the older lean.
- **`domain/director` alone** (the port-map §3.3 lean: "its own thin domain owning a
  `director_plots` table"). Rejected: it names ONE member and orphans the other three's
  config/cadence/proposals — you would grow a crew domain around it anyway, misnamed. (rpg-design
  /02 §1 already rejected `domain/director` for games and explicitly reserved "a general-roleplay
  director" as "a different, future feature" — this is that feature, and it arrives with three
  siblings, which is exactly why the domain is `crew`, not `director`.)
- **A `chats`-adjacent table / `chats.metadata.crew` sub-blob owned by chat.** Rejected: chat is
  the 16k-line integration apex the whole architecture works to keep slim, and the rpg precedent's
  headline win is "chat gains NOTHING" (rpg-design/05 §0). Crew config is not chat canon; putting
  it in `chats.metadata` makes the chat metadata schema grow crew fields and makes chat the crew's
  config authority — the exact re-fattening `no-if(isGame)` discipline exists to prevent.
- **Fold into D46 automation** (crew members as automation-era machinery). Rejected: D46 rules are
  declarative event→CEL-predicate→closed-action-union; a rule cannot AUTHOR a plot, hold a twist
  bank, or store a pending diff. Automation can TRIGGER crew work (doc 05 §a — the Phase-8
  evolution path); it cannot BE the crew.

**Why a new domain is justified under the domain-of-affect rule:** the port-map §4 test —
*"introduces a genuinely new subsystem? → only then a new thin domain"* — names the director's
secret plots as its own example. The crew's plot state, cadence counters, and proposal queues are
data NO existing domain owns (they are neither chat canon, nor lore, nor card content, nor
workload rows). One domain, five capabilities (four members + the persistent guides, doc 06), one
FK root (`crew_chats.chatId` / `chatId`-keyed rows) — the same "they exist only together" argument
that made `domain/rpg` one domain.

**Naming:** `domain/crew` (WorkloadKind prefix `crew-`, TypeID prefixes `crewprop_`). In prose,
"the chat crew" (this domain) vs "the rpg crew" (`domain/rpg/crew/`, a subsystem of rpg — kinds
prefixed `rpg-`). *(Rejected: `domain/chat-crew` — the `chat-` prefix reads as chat ownership,
which is the opposite of the design; rejected: `domain/narrative` — vague; the keeper and prose
auditor aren't "narrative".)*

## 2. Satellite work in committed homes (additive, small — the rpg-design/02 §1 table style)

| Home | Addition | Doc |
|---|---|---|
| `@orb/contracts/crew` | NEW contracts module: config schema, member payload schemas, bus events, view shapes, tuples | §6, 03 |
| `@orb/contracts/events` | additive `crew.*` members on the closed domain-event union | 04 §4 |
| `@orb/contracts/notifications` | additive `crew-proposal` member on `NotificationEvent` | 04 §5 |
| `@orb/contracts/chat` | `ChatInjection` gains optional `audience?: "all" \| "host"` (default `"all"`) — the ONE chat-contract touch | 04 §2 |
| `@orb/db/schema/crew.ts` | 4 tables (`crew_chats`, `crew_plots`, `crew_edit_proposals`, `crew_guides`) | §4, 06 §2 |
| `@orb/db/schema/character.ts` | 1 table (`card_evolution_proposals`) — character-owned (§5) | §5 |
| `@orb/kit/ids` | `crewprop_`, `cardprop_` TypeID prefixes | §4–5 |
| `kit/macro` registry | nothing — the director rides the injection list, not a macro (04 §2 argues it) | 04 §2 |
| `domain/chat` | ONE optional injected op: `ChatContext.crew?: { gatherTurnContext }`; preview/peek surfaces filter injections by `audience` vs caller authority | 04 §2 |
| `domain/character` | `card_evolution_proposals` + 4 verbs (`proposeCardEvolution` env-only · `listCardEvolutionProposals` · `acceptCardEvolution` · `dismissCardEvolution`) | §5, 03 §2 |
| `domain/world-info` | nothing new to DESIGN — the `upsertEntries` bulk injected op is D58-COMMITTED but NOT YET IN THE TREE; whichever builder arrives first (crew CW2 or rpg R7) lands the same op (doc 08's dependency table owns the race) | 03 §1, 08 |
| `domain/workloads` | 4 new `WorkloadKind`s + runners + `WorkloadChatCrewEnv` on the runner-env | 03 |
| `@orb/contracts/workloads` + `@orb/db/schema/workloads.ts` | the `WORKLOAD_KINDS` tuple widens by the 4 `crew-*` kinds ⇒ the `workloads.kind` CHECK REGENERATES (the D34 derivation; rides the `0000_baseline` squash). All 4 kinds are born in CW1 with STUB runners so `RUNNERS`/`exhaustive-dispatch` stay green (the D58 `reconcile-world-state` stub precedent); CW2–CW5 replace their stubs | 08 CW1 |
| `@orb/server/kit` | `runStructuredAgentTurn` — the shared call-agentTurn-with-responseFormat + zod-validate + ONE-bounded-retry helper (rpg crew runners converge on it too — doc 05 §e) | 03 §0 |
| `entry/compose` | wiring: crew service + the chat op + `WorkloadChatCrewEnv` + `startCrewScheduler` + notifications op | 04 §3 |

## 3. The 8-slot layout

```
domain/crew/
├── index.ts            FRONT DOOR — CrewService, createCrewService, CrewServiceDeps, bus surface, errors,
│                        startCrewScheduler, the WorkloadChatCrewEnv op types
├── service.ts          COMPOSITION ROOT — wires the verb factories. Zero logic.
├── context.ts          DI BUNDLE — explicit `export interface CrewContext` (§7)
├── bus.ts              the crew SSE bus + replay ring — ASSUMES(single-replica) annotated (04 §4)
├── contract/
│   ├── service.ts      CrewService interface (§8)
│   ├── params.ts       every verb's *Params
│   ├── results.ts      *Result + EditProposalView + PlotStateView + CrewRunSummary
│   ├── views.ts        CrewConfigView (member-facing: enabled flags only) · CrewHostView (full)
│   ├── errors.ts       CrewNotFoundError · CrewConflictError (game-chat refusal) · StaleProposalError
│   ├── crew-env.ts     WorkloadChatCrewEnv — the injected op bundle the runners receive (types only)
│   └── events.ts       CrewBusEvent union (04 §4)
├── verbs/
│   ├── config.ts       getConfig · setConfig (host; refuses on active rpg game) · runNow (host, per member)
│   ├── plot.ts         getPlotState (host-ring read) · resetPlot (host)
│   ├── proposals.ts    listEditProposals · acceptEditProposal · dismissEditProposal
│   ├── guides.ts       listGuides · upsertGuide · setGuideEnabled · refreshGuide · editGuideContent ·
│   │                    flushGuide/flushAllGuides · addPackagedGuide (doc 06 §4)
│   ├── gather-turn-context.ts  the chat GATHER op (04 §1) — a thin crew_plots.guidance read
│   ├── on-turn-completed.ts   the scheduler's decision verb: read config+counters → enqueue due members
│   │                    + fire auto-guide refreshes (04 §3, 06 §3)
│   └── appliers.ts     applyKeeperResult · applyDirectorPass · applyProseAudit · applyCardEvolution —
│                        called ONLY by workload runners through the env, never by transport (rpg §5 precedent)
├── persistence/
│   ├── config.ts       crew_chats reads/writes + counter bumps (atomic sql increments)
│   ├── plots.ts        crew_plots reads/writes
│   ├── proposals.ts    crew_edit_proposals lifecycle queries
│   ├── guides.ts       crew_guides definition CRUD (content lives in chat_injections — doc 06 §2)
│   └── canon-reads.ts  NARROW sanctioned schema reads: transcript slice (seq-ranged, selected variants),
│                        max seq, chat host, roster character ids/names — the buddy observer-db-reads
│                        precedent (buddy.md movement table: schema-level reads, not cross-feature calls)
├── substrate/
│   ├── slice.ts        pure transcript-slice shaping (window math, protectTail cutoff, token trim)
│   ├── guide-refresh.ts pure guide prompt assembly ({{previousGuide}}, label framing — doc 06 §3)
│   └── constants.ts    every default (cadences, caps, protectTail, packaged guide templates — §6, 06 §1)
├── members/            NAMED SUBSYSTEM — one prompt+parse module per WorkloadKind (the rpg crew/ pattern):
│   ├── lorebook-keeper.ts    buildMessages(inputs) pure + payload schema + apply-shaping
│   ├── card-evolution.ts
│   ├── director.ts
│   └── prose-audit.ts
└── scheduler/          NAMED SUBSYSTEM — the cadence engine (the buddy observer/ pattern):
    ├── start.ts        startCrewScheduler(env): subscribe chat-bus turn events, SIGTERM teardown
    └── env.ts          CrewSchedulerEnv type — { onChatEvent, workloads.start, log } (04 §3)
```

## 4. The `domain/crew` tables (born-compliant; ride the `0000_baseline` squash like rpg's)

All D23-clean: every row reaches its authority through `chatId → chat_participants` (chats are
membership-scoped, D18 — no `ownerId` stamps).

**`crew_chats`** — one row per crew-enabled chat (created on first `setConfig`):

| Column | Type | Notes |
|---|---|---|
| `chatId` | text PK, FK → `chats.id` CASCADE | one crew per chat |
| `config` | text (JSON) | zod-parsed on read against `crewConfigSchema` (§6) — the `chats.metadata` lazy-parse discipline |
| `keeperLastSeq` | integer NOT NULL default 0 | high-water mark: last message seq the keeper has processed. Advances ONLY on run success |
| `cardEvolutionLastSeq` | integer NOT NULL default 0 | same, for the auditor |
| `directorTurnCounter` | integer NOT NULL default 0 | assistant turns since the last director pass (scheduler-bumped, atomic `sql` increment) |
| `createdAt` / `updatedAt` | integer (epoch ms) | injected clock |

WHY counters as columns, config as a blob: the counters mutate per-turn and must be atomic
increments (never read-modify-write across a multi-second gap — the buddy `bondXp` lesson); the
config mutates rarely and versions as one schema. *(Rejected: counters inside the JSON blob —
per-turn read-modify-write of a blob is the race the column dodges.)*

**`crew_plots`** — the director's hidden hand (one row per chat, created on first director pass):

| Column | Type | Notes |
|---|---|---|
| `chatId` | text PK, FK → `chats.id` CASCADE | |
| `arc` | text NOT NULL | the secret story arc (model-authored, host-ring) |
| `twists` | text (JSON: `string[]`) | the active twist bank (≤6) |
| `retiredTwists` | text (JSON: `string[]`) | fired/abandoned twists (audit trail; feeds the next pass so twists don't resurrect) |
| `guidance` | text NOT NULL | the CURRENT injection content the director authored — GATHER reads it verbatim (no per-turn recompute) |
| `lastPassSeq` | integer NOT NULL | max message seq the last pass saw |
| `updatedAt` | integer | |

WHY a real table and not `context.memory`-style agent KV *(marinara: §7 per-agent memory)*: typed
columns are queryable (the host plot panel), schema-validated at the edges, and can't silently rot
into an untyped bag — the D58 "typed tables + zod at persistence/LLM edges replace the metadata
blob" delta, applied here.

**`crew_edit_proposals`** — the prose auditor's queue:

| Column | Type | Notes |
|---|---|---|
| `id` | text PK (`crewprop_`) | |
| `chatId` | text FK → `chats.id` CASCADE | |
| `messageId` | text FK → `messages.id` CASCADE | the audited slot |
| `variantId` | text FK → `message_variants.id` CASCADE | the audited variant (swipe-safety key — §9) |
| `proposedContent` | text NOT NULL | the full replacement text |
| `notes` | text (JSON) | `{kind: "prose"\|"continuity", note}[]` — the rationale chips |
| `auditedHash` | text NOT NULL | SHA-256 of the variant content AT audit time (stale-accept guard — §9) |
| `originalContent` | text nullable | stamped AT ACCEPT with the pre-edit text — backs the one "restore original" affordance (07 §4.3; the marinara restore-original lesson) |
| `status` | text CHECK | `pending \| accepted \| dismissed \| superseded \| stale` |
| `createdAt` / `resolvedAt` | integer / nullable | |

Partial unique index: **one `pending` proposal per `variantId`** (a re-run replaces — the buddy
proposal-Map replace-on-new semantic, made durable).

**`crew_guides`** — the persistent-guide definitions (composite PK `(chatId, guideKey)`): specced
in full in doc 06 §2 (definition-only rows; the guide CONTENT's one home is the `chat_injections`
row linked by the stored `injectionId` FK — doc 06 §1's CREW-1 linkage, never a magic-id format).

## 5. The `domain/character` table — `card_evolution_proposals` (character-owned, NOT crew-owned)

**DECISION: the proposal row + its accept/dismiss lifecycle live in `domain/character`.** The crew
runner calls an injected `character.proposeCardEvolution` op; review happens on character surfaces.
WHY: the proposal is ABOUT the card, its accept path writes the card, and its natural review home
is the character page — the tag domain's "proposed = a status in the owning domain" precedent. It
also future-proofs: an import pass or a human could file proposals through the same verb with zero
crew involvement. *(Rejected: a crew-owned proposals table that calls `character.update` on
accept — it splits one lifecycle across two domains and makes the character page read a foreign
domain for its own card's pending state.)*

| Column | Type | Notes |
|---|---|---|
| `id` | text PK (`cardprop_`) | |
| `characterId` | text FK → `characters.id` CASCADE | authority derives here (`characters.ownerId`) — D23 derive, no stamp |
| `chatId` | text FK → `chats.id` SET NULL | provenance (which chat's play produced it); survives chat deletion as history |
| `changes` | text (JSON) | typed: `{field, op, text, rationale}[]` per `cardEvolutionChangesSchema` (03 §2) |
| `sourceSpan` | text (JSON) | `{fromSeq, toSeq}` — the transcript span audited |
| `status` | text CHECK | `pending \| accepted \| dismissed \| superseded` |
| `createdAt` / `resolvedAt` | integer / nullable | |

Partial unique index: **one `pending` per `(characterId, chatId)`** — a newer audit supersedes the
old proposal (status flip, not delete; the audit trail survives).

**The accept verb is the safety story:** `acceptCardEvolution(principal, proposalId, pickedChangeIdxs?)`
— owner-only (`fetchOwned` on the character); takes an AUTOMATIC `character_snapshots` snapshot
labeled `pre-evolution` FIRST (the D28 history log — accept is always reversible via `restore`);
applies the picked changes through the normal `character.update` path (per-change accept: the
owner can take the personality append and reject the scenario rewrite); flips status. This is
marinara's injection-review layer *(marinara: §12)* upgraded from UI-gate to schema-enforced
lifecycle — **propose-don't-dispose**.

## 6. The config schema (`@orb/contracts/crew`)

```ts
export const crewConfigSchema = z.object({
  version: z.literal(1),
  keeper: z.object({
    enabled: z.boolean().default(false),
    bookId: typeIdSchema("wibook").nullable().default(null), // null + enabled ⇒ the domain mints + attaches a book on first run (03 §1)
    minSpan: z.number().int().min(16).max(256).default(48),  // messages pending before a run enqueues
  }).default({}),
  cardEvolution: z.object({
    enabled: z.boolean().default(false),
    minSpan: z.number().int().min(64).max(1024).default(128),
  }).default({}),
  director: z.object({
    enabled: z.boolean().default(false),
    cadenceTurns: z.number().int().min(4).max(64).default(16), // assistant turns between passes (gentler than rpg's 8 — plain roleplay wants a hand on the tiller, not a hand on the wheel)
    steer: z.string().max(600).default(""),                    // the host's standing direction ("slow burn", "keep it cozy") — rides every director pass
  }).default({}),
  proseAudit: z.object({
    enabled: z.boolean().default(false),
    mode: z.enum(["on-demand", "every-turn"]).default("on-demand"), // 03 §4 argues the default
  }).default({}),
});
```

Constants (in `substrate/constants.ts`, not config): `PROTECT_TAIL = 16` (messages; the keeper /
auditor never read the newest 16 — they're swipe/edit-volatile), `KEEPER_ENTRY_CAP = 60`,
`KEEPER_MAX_ENTRIES_PER_RUN = 6`, `PROPOSAL_CHANGE_CAP = 3`, `TWIST_CAP = 6`.

**Config surfaces decision:** per-chat ONLY, host-set, every member default OFF (keeper
default-OFF RATIFIED, Nate 2026-07-01; the revisit-on-evidence criterion below stands). No
`UserSettings.crew` (per-user defaults for new chats) and no `AppSettings.crew` in v1 — YAGNI
until someone wants defaults; the criterion that adds `UserSettings.crew.defaults` is "a user
enabling the keeper on their third chat by hand." Spend governance is the D46 budget axis's job
when Phase 8 lands (doc 05 §f); until then the throttles are structural (cadence floors in the
schema's `min()`s + single-active-per-kind + default-OFF).

## 7. `CrewContext` — the injected ops (one-way flow; wired at `entry/compose`)

```ts
export interface CrewContext {
  db: Db; clock: Clock; newId: IdMint; log: Logger;
  emitBus: (e: CrewBusEvent) => void;
  emitDomainEvent: EmitDomainEvent;                       // the closed contracts/events mirror set (04 §4)
  // cross-feature ops (types here; values wired at entry):
  chat: {
    editMessage: (principal: Principal, p: EditMessageParams) => Promise<void>;  // proposal accept — chat's can() enforces
    hasActiveGame: (chatId: ChatId) => Promise<boolean>;  // the rpg-exclusion predicate (05 §h); wired to a no-op false when rpg is absent
    setChatInjection / listChatInjections / deleteChatInjection: …;  // the guide content home (doc 06 — injections are chat's data)
  };
  agentTurn: AgentTurnOp;                                 // the sealed runner — the guide refresh verb awaits it directly (doc 06 §3; the buddy-`ask` precedent)
  worldInfo: {
    upsertEntries: WorldInfoUpsertEntriesOp;              // the D58-committed bulk op (rpg-design/02 §1) — reused verbatim
    listEntryIndex: (bookId: BookId) => Promise<EntryIndexRow[]>;
    createBook: (ownerId: UserId, name: string) => Promise<BookId>;
    attachToChat: (chatId: ChatId, bookId: BookId) => Promise<void>;
  };
  character: {
    proposeCardEvolution: (p: ProposeCardEvolutionParams) => Promise<CardEvolutionProposalId>;
    getCard: (characterId: CharacterId) => Promise<CharacterCard | null>;
  };
  workloads: { start: StartWorkloadOp };                  // runNow + the scheduler's enqueue
  notifications: { emit: NotificationsEmitOp };           // proposal-created delivery (04 §5)
  can: CanOp;                                             // the ONE authority seam
}
```

Workloads-side mirror: `WorkloadRunnerEnv` gains `chatCrew: WorkloadChatCrewEnv` — the runners'
op bundle: `{ readRunInputs(kind, chatId), applyKeeperResult, applyDirectorPass, applyProseAudit,
applyCardEvolution, agentTurn }` where `agentTurn` is the sealed `infra/providers` runner (buddy
Option B — the SAME op the rpg crew and buddy inject; invariant: no crew code imports a provider).
Chat-side mirror: `ChatContext` gains `crew?: { gatherTurnContext }` (04 §2).

**Flow check (the physics):** crew imports NO sibling domain; chat/workloads import NO crew
internals; the client imports `@orb/contracts/crew` only. Enforcers: package deps +
`domain-no-cross-feature` dep-cruiser + the 04 §2 byte-identity test.

## 8. The `CrewService` surface (contract/service.ts)

```ts
CrewService = {
  // config (host)
  getConfig(p): Promise<CrewConfigView | CrewHostView>   // projection by caller authority (member: enabled flags; host: full)
  setConfig(p): Promise<CrewHostView>                    // host; refuses on active rpg game (CrewConflictError)
  runNow(p: { chatId; member: CrewMember }): Promise<{ workloadId }>  // host; bypasses cadence, resets the member's counter/mark is NOT advanced (the run itself advances it on success)
  // director (host-ring)
  getPlotState(p): Promise<PlotStateView>                // host-only
  resetPlot(p): Promise<void>                            // host; wipes crew_plots (a fresh hidden hand)
  // edit proposals
  listEditProposals(p): Promise<EditProposalView[]>      // scoped to callers holding edit authority on the chat (04 §6)
  acceptEditProposal(p): Promise<void>                   // verifies pending + selected-variant + hash; calls chat.editMessage(principal,…)
  dismissEditProposal(p): Promise<void>
  // persistent guides (doc 06 §4 — the full signatures)
  listGuides / upsertGuide / setGuideEnabled / refreshGuide / editGuideContent / flushGuide / flushAllGuides / addPackagedGuide
  // the chat GATHER op (injected into ChatContext.crew, not tRPC)
  gatherTurnContext(p: { chatId }): Promise<CrewGatherResult | null>
  // scheduler seam (front door, driver-called — not tRPC)
  onTurnCompleted(p: { chatId }): Promise<void>          // read config+counters → enqueue due members (04 §3)
  // crew appliers (env-only; never on the wire)
  applyKeeperResult / applyDirectorPass / applyProseAudit / applyCardEvolution
}
```

The tRPC router (`transport/trpc/routers/crew.ts`) is a thin shim over config + plot + proposals;
`onTurnCompleted` and the appliers are NOT on the wire surface (the rpg §5 precedent).

## 9. Swipe / staleness semantics (the correctness section)

- **The protect tail is the volatility firewall.** Keeper + card auditor read only
  `seq ≤ maxSeq − PROTECT_TAIL` — content that old is behind the swipe/edit hot zone in practice,
  and both members are IDEMPOTENT over re-reads anyway (below), so a rare deep edit self-heals on
  the next pass. *(Rejected: hash-diff re-processing of already-covered spans à la memory's
  self-heal — the keeper is curation, not a pure index; re-distilling old spans would fight the
  host's hand edits. The high-water mark + protect tail is the right cheapness.)*
- **Edit proposals key on the VARIANT.** A proposal for a variant that is no longer
  `selectedVariantId` at accept time is refused → status `superseded`. A proposal whose
  `auditedHash` no longer matches the variant's current content (someone edited meanwhile) is
  refused → status `stale` (`StaleProposalError` surfaces "this reply changed since the audit").
  Checks are LAZY (at accept), not eager listeners — nothing subscribes to swipe events.
- **High-water marks advance only on run SUCCESS**, inside the applier (the same transaction as
  the write). A failed/retried workload re-covers the same span; the keeper's
  `replacesEntryName` + span-stamped entries make the re-run idempotent (03 §1).
- **Director passes are advisory-only writes** to `crew_plots` — a swipe can never contradict
  director state because the director holds no canon claims, only intent. Its next pass reads
  whatever canon now says (`lastPassSeq` is a cursor, not a truth claim).

## 10. Test plan (shape level)

`test-presence`/`test-layout` per house law: every verb, persistence module, contract schema, and
member module carries its mirror test. Shape-specific gates: the member dispatch in the scheduler
+ `runNow` is a mapped-type Record over the `CrewMember` tuple (`exhaustive-dispatch`);
`CrewContext`/`WorkloadChatCrewEnv`/`CrewSchedulerEnv` are explicit interfaces
(`no-inline-types`); the counter bumps are `sql` increments (a concurrency test exercises two
parallel turn-completions). Full plan: doc 08 §3.
