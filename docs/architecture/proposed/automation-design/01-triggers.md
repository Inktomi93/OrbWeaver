# 01 — Triggers: the Closed Taxonomy, TriggerFact, and the Watcher

> **Status: COMMITTED (D46) — prescriptive design; the ledger D-entry wins on any conflict.** What a
> rule can fire ON. Two source buses, one closed trigger taxonomy, one subscription subsystem.

---

## 0. The two source buses (both exist; automation adds NO third)

| Bus | Home | Discipline | Automation's relationship |
|---|---|---|---|
| per-chat `ChatBusEvent` | `@orb/contracts/chat` (26 discriminators incl. the 5 embedded `WiBusEvent` members; durable CHECK frozen — D50) | id-only payloads, replay ring, allowlist (no credentials/caller-ids representable) | subscribe via an injected `onChatEvent` op; NEVER widen the union for automation's sake |
| domain-event bus | `@orb/contracts/events` (`DomainEvent`, D38 — `character.updated`, `asset.created` today; crew/rpg mirror curated subsets in additively when built) | closed, id-only, re-read canon | subscribe via an injected `onDomainEvent` op |

**DECISION: the trigger id IS the source event discriminator — automation invents no third event
vocabulary.** A trigger is `{bus, type}` where `type` is a member of the source union. WHY: two
design sets (rpg-design/05 §5, chat-crew-design/04 §4) already mirror events onto these buses
expecting D46 to trigger on them BY NAME; a renamed automation-side alias would need a bimap and
drift. *(Rejected: a normalized `snake_case` trigger vocabulary mirroring the action ids — symmetry
is not worth a translation table over a frozen CHECK'd union.)*

## 1. The closed trigger union (`@orb/contracts/automation/trigger.ts`)

```ts
import { z } from "zod";

/** ChatBusEvent discriminators automation may trigger on — a SUBSET of the 26-member union.
 *  v1 = wired at ship; reserved = in the tuple + typed, refused by `createRule` until wired
 *  (the D37 born-whole posture: the vocabulary is complete from birth, the handlers land later). */
export const CHAT_TRIGGER_TYPES = [
  // ── v1 (wired) ──
  "chatOpened",          // ST CHAT_CHANGED — the flagship "on chat open, set POV" trigger (D50 #1)
  "messageCommitted",    // ST MESSAGE_SENT/RECEIVED — fact.message.role disambiguates
  "messageEdited",
  "variantSelected",     // swipe — fires AFTER the variable re-fold (04 §3 ordering rule)
  "turnStarted",         // carries intent/api/source/model/speakerCharacterId (group "whose turn")
  "turnCompleted",
  "turnAborted",
  "worldInfoActivated",  // ST WORLD_INFO_ACTIVATED — "when lore entry X fires, do Y"
  "personaSwitched",
  "chatCreated",
  // ── reserved (typed, not wired v1; criterion: first real rule request) ──
  "messageHidden",
  "messagesDeleted",
  "chatUpdated",         // coarse catch-all; reserved because predicates can't see WHICH field changed
  "wiEntryAttached",
  "wiEntryDetached",
] as const;
export type ChatTriggerType = (typeof CHAT_TRIGGER_TYPES)[number];

/** DomainEvent types automation may trigger on. The crew/rpg members are RESERVED: they enter this
 *  tuple when D59/D58 land their domain-event mirrors (chat-crew-design/04 §4; rpg-design/05 §5) —
 *  listed now so the two design sets' claims reconcile against ONE tuple. */
export const DOMAIN_TRIGGER_TYPES = [
  // ── v1 (wired) ──
  "character.updated",
  "asset.created",
  // ── reserved: chat-crew (D59) ──
  "crew.keeperRan",
  "crew.editProposalCreated",
  "crew.cardProposalCreated",
  "crew.directorPassCompleted",
  // ── reserved: rpg (D58) ──
  "rpg.clockCompleted",
  "rpg.sessionConcluded",
  "rpg.encounterEnded",
  "rpg.reputationMilestone",
  "rpg.checkResolved",
] as const;
export type DomainTriggerType = (typeof DOMAIN_TRIGGER_TYPES)[number];

export const automationTriggerSchema = z.discriminatedUnion("bus", [
  z.object({ bus: z.literal("chat"), type: z.enum(CHAT_TRIGGER_TYPES) }),
  z.object({ bus: z.literal("domain"), type: z.enum(DOMAIN_TRIGGER_TYPES) }),
]);
export type AutomationTrigger = z.infer<typeof automationTriggerSchema>;

/** Which tuple members are LIVE. `createRule`/`updateRule` refuse a reserved trigger with
 *  `AutomationReservedTriggerError` (a typed, user-visible refusal — not a silent no-op). */
export const LIVE_TRIGGERS: Record<ChatTriggerType | DomainTriggerType, boolean> = {
  /* mapped-type Record — a new tuple member without a liveness entry is a tsc error
     (the workloads RUNNERS gold standard, AGENTS-2 §7.5) */
} as const satisfies Record<ChatTriggerType | DomainTriggerType, boolean>;
```

**Permanently EXCLUDED from the taxonomy (not reserved — do not add):** `delta` (a streaming
firehose; a rule per token is a DoS on the rule engine), `reasoningEdited`/`reasoningCleared`/
`reasoningStreamDone` (reasoning plumbing, no automation story), `historyTruncated` (a resume-control
synthetic for stream catch-up, not a semantic event), `warning` (an operator diagnostic; automating
on warnings invites feedback loops with the thing that warned), `chatDeleted` (the rule's own chat
is gone — CASCADE removes the rule before it could fire; a cross-chat "on any chat deleted" rule is
a global-scope question deferred with global rules, 04 §1), `wiBookAttached`/`wiBookDetached`/
`wiEntryScopeChanged` (attachment plumbing below entry granularity — the two entry-level members
cover the real use). WHY excluded-not-reserved: a reserved member implies "will plausibly wire";
these have a standing reason not to, and recording that kills a future re-litigation.

## 2. TriggerFact — CEL never reads raw bus payloads

**DECISION: before predicate evaluation, the watcher resolves the event into a typed
`TriggerFact` by re-reading canon (the D38 discipline applied to automation).** Bus payloads are
id-only by law; a predicate that could only see ids would be useless ("fire when the committed
message's role is user" needs the role). The fact resolver does the narrow reads ONCE per event
(shared across all matching rules of that chat) and hands CEL a stable, documented shape:

```ts
/** The per-event fact CEL binds as `event`. Fields are POPULATED PER TRIGGER TYPE (the table below);
 *  unpopulated fields are absent (CEL `has()` guards them). All strings/numbers/booleans — no handles,
 *  no functions, no credentials (the resolver reads only the projections listed here). */
export interface TriggerFact {
  readonly type: string;                       // the trigger discriminator, e.g. "messageCommitted"
  readonly bus: "chat" | "domain";
  readonly chatId: string | null;              // null for domain-bus events with no chat scope
  // messageCommitted / messageEdited / variantSelected / messageHidden
  readonly message?: {
    readonly id: string;
    readonly role: "system" | "user" | "assistant";
    readonly authorUserId: string | null;
    readonly characterId: string | null;
    readonly seq: number;
    readonly content: string;                  // the SELECTED variant's content (capped 16 KiB for eval)
  };
  // turnStarted / turnCompleted / turnAborted
  readonly turn?: {
    readonly intent: string;                   // TurnIntent
    readonly api: string;
    readonly source: string;
    readonly model: string;
    readonly speakerCharacterId: string | null;
    readonly abortReason?: string;             // turnAborted only
    readonly automationDepth: number;          // 0 = human-initiated (03 §4 — the cascade guard reads this)
  };
  // worldInfoActivated
  readonly worldInfo?: { readonly entryIds: readonly string[] };
  // personaSwitched
  readonly persona?: { readonly from: string | null; readonly to: string | null };
  // domain-bus members
  readonly characterId?: string;               // character.updated
  readonly assetId?: string;                   // asset.created
}
```

| Trigger | Populated fact fields |
|---|---|
| `chatOpened` / `chatCreated` | `chatId` only |
| `messageCommitted` / `messageEdited` / `variantSelected` | `message` (one slot read joining the selected variant — D26) |
| `turnStarted` / `turnCompleted` / `turnAborted` | `turn` (payload fields + `automationDepth` via the injected `chat.getTurnOrigin` read, 03 §4) |
| `worldInfoActivated` | `worldInfo.entryIds` (payload-carried ids; contents NOT resolved — a predicate needing entry content is a Tier-2 job) |
| `personaSwitched` | `persona.from/to` (payload-carried) |
| `character.updated` / `asset.created` | the id field |

*(Rejected: handing CEL the raw `ChatBusEvent` object — couples the predicate surface to a frozen
union's incidental field names AND violates the re-read rule; rejected: resolving FULL entity
views — the fact is an eval projection, and unbounded content in a linear-time evaluator still
costs memory; the 16 KiB content cap is the belt.)*

## 3. The watcher — `domain/automation/watcher/`, started at the composition root

**DECISION: a domain-owned watcher subsystem started out-of-band (`startAutomationWatcher(env)`),
consuming injected event sources — the chat-crew scheduler / buddy-observer pattern verbatim
(chat-crew-design/04 §3).** *(Rejected: a `transport/jobs` driver — "which rules match and may
they fire" is domain logic (rule rows + budgets + depth), and drivers stay thin; rejected: chat
calling automation via an injected op per event — chat stays automation-blind, exactly as it stays
crew-blind and rpg-blind; the subscription is external.)*

```ts
export interface AutomationWatcherEnv {
  /** The per-chat bus, injected at entry (the BuddyObserverEnv / CrewSchedulerEnv precedent). */
  onChatEvent: (handler: (e: ChatBusEvent) => void) => Unsubscribe;
  /** The domain-event bus subscription seam (wired at entry/compose/event-bus.ts, D38). */
  onDomainEvent: (handler: (e: DomainEvent) => void) => Unsubscribe;
  automation: Pick<AutomationService, "handleEvent">;
  log: Logger;
}
```

Flow per event:

1. **Cheap pre-check** — an in-process `Set<ChatId>` of chats with ≥1 enabled rule (loaded at boot,
   maintained by the lifecycle verbs; `ASSUMES(single-replica)` annotated — the same annotation the
   chat replay ring and crew scheduler carry). Event's chat not in the set (or a domain-bus event
   with zero enabled domain-trigger rules) → return without a query. WHY: the bus fires on every
   token-adjacent lifecycle beat; a DB probe per event on every chat is the wrong steady-state.
   *(Rejected: a DB probe per event — the crew scheduler tolerates it because it handles ONE event
   type; the watcher handles fifteen.)*
2. `automation.handleEvent(e)` (the front door; the watcher subsystem itself stays dumb): filter
   the taxonomy (§1 — non-taxonomy events return immediately), resolve the `TriggerFact` (§2),
   load the chat's enabled rules for this trigger (one indexed read), then run the dispatch
   engine (04 §3): cascade-depth gate → per-rule cooldown/budget gate → CEL predicate → actions.
3. The handler is fire-and-forget wrapped (never throws into the bus loop — the buddy `react()`
   rule); SIGTERM unsubscribes both sources.

**Enforcers:** dep-cruiser — `domain/chat/**` never imports `domain/automation/**` (and vice
versa); a contract test pins that a chat with no rules produces zero automation reads per event
beyond the Set probe; the taxonomy filter is a mapped-type Record over the trigger tuples
(`exhaustive-dispatch` — a new tuple member without a filter entry fails `tsc`).
