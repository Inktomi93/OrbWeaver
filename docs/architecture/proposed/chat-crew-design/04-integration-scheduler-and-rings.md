# 04 — Integration: the Chat Graft, the Scheduler, Rings, Consent, and Review Surfaces

> **Status: COMMITTED (D59, 2026-07-01) — prescriptive design; the ledger D-entry wins on any
> conflict.** How the crew touches the turn (one optional injected op — chat stays crew-blind),
> how members get enqueued (the scheduler), what streams to the client, and who may see/do what.

---

## 1. The wiring principle — chat stays crew-blind (the rpg §0 rule, re-applied)

`domain/chat` gains NOTHING crew-specific in its logic. The graft is ONE injected, OPTIONAL op on
`ChatContext` (wired at `entry/compose`; absent ⇒ no-op), following the rpg/databank
GATHER-branch precedent:

| Injected op (chat side) | Provided by `domain/crew` | Called at |
|---|---|---|
| `crew.gatherTurnContext(chatId) → CrewGatherResult \| null` | `verbs/gather-turn-context.ts` (a thin read: `crew_plots.guidance` when director enabled) | GATHER phase, after the WI pool. `null` = no crew / director off ⇒ byte-identical non-crew turn |

```ts
export interface CrewGatherResult {
  /** ONE system injection into chat's single Injection[] list: the director's guidance.
   *  depth default 4 (author's-note register — near enough to steer, far enough not to dominate);
   *  audience: "host" (§2). Budgeted normally (NOT ignoreBudget — guidance is advisory, and if
   *  the window is that tight the story needs the history more than the steering). */
  injections: readonly ChatInjection[];
}
```

Only the DIRECTOR rides the turn — keeper/auditor/card-evolution are post-hoc and need no GATHER
presence (their artifacts arrive as WI entries and proposal rows). *(Rejected: a `{{directorNotes}}`
macro à la the rpg macros — rpg could demand a packaged preset that references its macros;
a plain chat runs the user's OWN preset, and requiring preset surgery to enable the director is a
setup cliff. The injection list needs no preset cooperation. Rejected: dual macro+injection paths
— two placements for one string is drift waiting to happen; if placement control is ever wanted,
add the macro THEN with the suppress-the-injection rule.)*

Scheduling needs NO chat-side op: the scheduler subscribes to the chat bus externally (§3), the
buddy-observer precedent. **Enforcers:** dep-cruiser — `domain/chat/**` never imports
`domain/crew/**` (and vice versa); a contract test pins that a chat with no crew row (or all
members off) assembles a byte-identical prompt with the crew op wired vs absent.

## 2. The injection `audience` field — the hidden-hand ring, made structural

**The problem:** the director's `guidance` must reach the MODEL (it rides the prompt) but not the
PLAYERS — yet chat exposes prompt-inspection surfaces (`previewAssembly`, `peekPrompt`,
`promptSnapshot` on variants). Without a rule, any member who can preview the prompt reads the
twist bank. The rpg design never had this problem shaped this way because rpg ring-1 rode macros
in a host-tuned preset and GM-eyes gated the read verbs (rpg-design/06 §6, 12 §6); a plain chat's
injections need their own gate.

**DECISION: `ChatInjection` gains `audience?: "all" | "host"` (additive, default `"all"`).** The
model always sees every injection (audience gates HUMANS, not the model). Chat's prompt-inspection
projections — `previewAssembly`, `peekPrompt`, and the variant `promptSnapshot` read path —
REDACT `audience:"host"` injections (elide content, keep a `[host-only injection]` placeholder)
unless the caller `requireHost`s. This is a small, generic chat-contract amendment (the satellite
table, doc 02 §2) — generic on purpose: rpg's reminder or a future feature can use the same field.
*(Rejected: no gate + "don't enable the director in chats where spoilers matter" — a prose-only
boundary is a wish (AGENTS-1 §2.3). Rejected: a crew-side prompt filter — crew cannot reach into
chat's preview verbs; the projection is chat's and must be gated where it is produced.)*

**GM-eyes for plain chats = the HOST**, full stop: `getPlotState`/`resetPlot` are host-only; the
host stream carries `plotUpdated`; member streams never do. There is no seat axis here — a plain
chat has no GM seat, and inventing one for the director is rpg-mode creep. *(Rejected: a per-chat
"plot visible to all" toggle — if the table wants a visible arc they can just… talk; the director
exists to be a hidden hand, and an un-hidden hand is a lorebook entry.)*

Enforcement: the canary-secret test (doc 08 §3) — a fixture plot string must appear in the wire
request and in the HOST's preview, and must NOT appear in a member's preview, any member view, any
keeper entry, or any edit proposal.

## 3. The scheduler — `domain/crew/scheduler/`, started at the composition root

**DECISION: the cadence engine is a crew-domain subsystem started out-of-band
(`startCrewScheduler(env)`), consuming an injected event source — the buddy `observer/` pattern
verbatim.** *(Rejected: a `transport/jobs` driver owning the cadence decision — "is a member due"
is domain logic (config + counters + spans), and a driver must stay thin; the catalog-refresh
scheduler is the precedent for WHEN-to-enqueue drivers, but its decision is a clock, not domain
state. Rejected: D46 automation rules as the v1 trigger — Phase 8 doesn't exist yet, and doc 05 §a
decides the crew's built-in cadences STAY scheduler-owned even after it does.)*

```ts
export interface CrewSchedulerEnv {
  onChatEvent: (handler: (e: ChatBusLiteEvent) => void) => Unsubscribe;  // the chat bus, injected at entry (BuddyObserverEnv precedent)
  crew: Pick<CrewService, "onTurnCompleted">;
  log: Logger;
}
```

Flow per completed assistant turn (the bus's turn-completion event; id-only payload per D38 —
the handler re-reads what it needs):

1. Cheap pre-check: does a `crew_chats` row exist with ANY member enabled? (one indexed read;
   ~every chat in practice has no row → near-zero overhead). No row → return.
2. `crew.onTurnCompleted(chatId)` (the front-door verb — the scheduler subsystem itself stays
   dumb): bump `directorTurnCounter` (atomic `sql` increment, only when director enabled); read
   `maxSeq` (narrow canon read, 02 §3 `canon-reads.ts`); for each enabled member compute due-ness
   (03 §0 table); enqueue due members via `workloads.start({kind, params:{chatId}, ownerId: host})`.
3. `DomainConflictError` on enqueue → log-and-continue (03 §0 — durable counters make "later" free).
4. The handler is fire-and-forget wrapped (never throws into the bus loop — the buddy `react()`
   rule); SIGTERM unsubscribes.

`runNow(chatId, member)` (host verb) enqueues the same kinds directly, bypassing due-ness.
Every-turn prose audits enqueue from the same `onTurnCompleted` path (mode check), with
`params:{chatId, variantId}` resolved from the completed turn's event re-read. `onTurnCompleted`
also fires the AUTO-GUIDE refreshes (`autoRefresh:true` rows — doc 06 §3): the same `refreshGuide`
core, fire-and-forget with a per-`(chatId,guideKey)` in-flight latch — a verb call, never a
workload.

## 4. Bus events + the domain-event mirror

`domain/crew/bus.ts` — its OWN per-chat SSE bus (replay ring, `@orb/kit/replay-buffer`,
`ASSUMES(single-replica)`), fanned out by tRPC `crew.stream(chatId)` (member-gated; host variant
carries the host-ring members). WHY not the chat bus: `ChatBusEvent` is a closed union with a
frozen durable CHECK (D50) — the exact reason rpg grew its own bus (rpg-design/05 §5).

```ts
export type CrewBusEvent =
  | { type: "configChanged"; chatId: ChatId }
  | { type: "keeperRan"; chatId: ChatId; entriesAdded: number; entriesReplaced: number }
  | { type: "editProposalCreated"; chatId: ChatId; proposalId: CrewEditProposalId; messageId: MessageId }
  | { type: "editProposalResolved"; chatId: ChatId; proposalId: CrewEditProposalId; status: "accepted" | "dismissed" | "superseded" | "stale" }
  | { type: "cardProposalCreated"; chatId: ChatId; characterId: CharacterId }   // the chip on the roster; the durable copy is the notification (§5)
  | { type: "plotUpdated"; chatId: ChatId }                                      // HOST STREAM ONLY
  | { type: "auditClean"; chatId: ChatId; variantId: MessageVariantId }          // the on-demand "clean ✓" affordance
  | { type: "guideRefreshed"; chatId: ChatId; guideKey: string }                 // doc 06 §4
  | { type: "guideFlushed"; chatId: ChatId; guideKey: string | "all" }
  | { type: "guideConfigChanged"; chatId: ChatId };
```

Id-only payloads (D38 discipline; the two counters on `keeperRan` are display sugar, not state).
A curated subset mirrors onto the closed domain-event bus (`@orb/contracts/events`, additive
members) so D46 Tier-1 automation can trigger on crew activity (doc 05 §a): `crew.keeperRan`,
`crew.editProposalCreated`, `crew.cardProposalCreated`, `crew.directorPassCompleted`.

## 5. Notification touchpoints

ONE producer call: `notifications.emit` (injected — producers never import notifications
internals) fires for **card evolution proposals** — `{type:"crew-proposal", recipientUserId:
cardOwner, payload:{characterId, proposalId, chatId}}` (additive `NotificationEvent` member;
secret-free by construction — ids only). WHY only this member: card proposals are the one crew
artifact whose review surface (the character page) is OUTSIDE the chat the recipient may not have
open; keeper entries and edit proposals surface in-chat where the crew bus already reaches, and a
director pass is invisible by design. *(Rejected: notifying every proposal — inbox spam that
trains dismissal.)*

## 6. The `can()` matrix (the whole crew, one table)

Every crew verb routes `can(principal, action, resource)` — never a bare role check (D17).

| Authority | Actions |
|---|---|
| **Host** (`requireHost(chat)`) | `setConfig` · `runNow` · `getPlotState` · `resetPlot` · the host `crew.stream` variant (plot events) · full `CrewHostView` (config incl. keeper book + cadences) · guide management (`upsertGuide` · `setGuideEnabled` · `refreshGuide` · `editGuideContent` · `flushGuide`/`flushAllGuides` · `addPackagedGuide` — doc 06 §5) |
| **Member** (`requireParticipant(chat)`) | `getConfig` (the clamped `CrewConfigView`: which members are on — transparency without internals) · `crew.stream` (non-plot events) · `listEditProposals` (view) · `listGuides` (read-only — guides are room-visible, doc 06 §5) · the on-demand audit button (`runNow` for `crew-prose-audit` on a message — MEMBER-invokable: it spends one completion on the HOST's dime, so it is gated by `proseAudit.enabled` which the host set; enabling the member IS the host's consent to member-triggered audits) |
| **Edit-authority holders** (delegated: `can(principal,"chat.editMessage",chat)` — chat's own rule) | `acceptEditProposal` · `dismissEditProposal` |
| **Card owner** (`fetchOwned(character)`) | `listCardEvolutionProposals` · `acceptCardEvolution` · `dismissCardEvolution` (character-domain verbs) |
| **The crew runners** (env path, no principal — the workload runs as `ownerId`=host) | the `apply*` verbs ONLY (not on the wire surface) |

## 7. Multi-human consent (the room-reading rule)

The crew READS the whole room's transcript and is funded by the host. The consent model, decided:

- **Enable = host act; visibility = roster-wide.** Enabling any member is host-only (§6), and
  `getConfig` shows every participant WHICH members are on — no silent observers. This is the
  memory precedent extended (memory already host-runs over everyone's messages, D16/memory.md §3);
  the crew adds no new read the host didn't already have (the host can export the chat, D29).
- **Output rings follow the artifact**: keeper entries → room-visible (they enter the shared
  prompt; anyone can read the book the chat attaches); edit proposals → edit-authority holders;
  card proposals → card owner only; plot → host only (§2).
- **No member-level opt-out in v1** (D16 host-only conservatism). Reserved-additive: a
  per-participant "exclude my messages from crew slices" flag would thread through
  `canon-reads.ts` slice queries — recorded so the seam is known, not built (criterion: the first
  real multi-human deployment that asks).

Solo chats collapse gracefully: the sole human is the host; every row of the matrix is "you".

## 8. Client review surfaces (sketch level — the D44 world; normative detail: doc 07; the build chunk is doc 08 CW7)

- **The crew panel** — a chat CONTEXT-tab section (config is config; the rpg HUD's content-flank
  placement was for live STAKES, which the crew doesn't have): per-member toggle + the few knobs
  (keeper book picker, director cadence + `steer` textarea, audit mode with its cost sentence),
  a `runNow` button per member, last-run status chips (from workload rows). Host sees all; members
  see read-only enabled flags.
- **The director drawer** (host-only, inside the crew panel): current arc, twist bank,
  retired list, `resetPlot`. Rendered iff `getPlotState` resolves — the D22 level-clamp
  discipline: the server projects by authority; the client renders what arrives.
- **Edit-proposal chip** — under the audited message (the rpg choice-chip slot): "✎ proposed
  edit" → a diff view (current vs `proposedContent`) + the `notes` chips + accept/dismiss.
  `auditClean` renders a transient "clean ✓". Live via `crew.stream`.
- **Card evolution review** — on the character detail page: a "proposals" section listing pending
  rows, per-change diff + rationale + per-change checkboxes → accept (with the "a snapshot will be
  taken first" line) / dismiss. The notification (§5) deep-links here.
