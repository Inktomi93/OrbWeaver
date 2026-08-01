// domain/automation/contract/ops — the injected cross-feature op TYPES (domain-no-cross-feature; wired at
// entry/compose) + the dispatch seam A6 plugs its arm executors into. A5 declares ONLY the READ ops the
// watcher/fact-resolver/CEL-env need (chat-owned projections — turn origin, the selected-variant message
// fact, the runtime fold cache, the config-plane picks). A6 WIDENS `AutomationOps` with the action ops
// (applyVariableOps, worldInfo, notifications, imagery) and wires the `runArm` dispatcher — no stubs,
// no reserved slots here. Principal minting stays at the entry seam (`resolveAuthor`) — the domain never
// constructs a Principal (the tier-collapse the constitution forbids).

import type { AutomationAction, AutomationBusEvent, AutomationCelEnv, AutomationOrigin, TriggerFact } from "@orb/contracts/automation";
import type { PromptTransform, TurnInitiator } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { PromptTemplateMode, SizePresetName } from "@orb/contracts/imagery";
import type { NotificationEvent } from "@orb/contracts/notifications";
import type { ProseOverrides } from "@orb/contracts/prose";
import type { ThemeBackground } from "@orb/contracts/theme";
import type { UpsertEntriesResult, UpsertLoreEntryInput } from "@orb/contracts/world-info";
import type { automationRules, Db } from "@orb/db";
import type { CharacterId, ChatId, MessageId, UserId, WorldBookId } from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import type { ResolveViewerVisibility } from "#domain/chat";

/** A stored automation-rule row — the dispatch's unit of work (its `actions` json is parsed at dispatch with
 *  the active disable-on-corrupt). Homed here (not persistence) so the engine/watcher share ONE row type. */
export type RuleRow = typeof automationRules.$inferSelect;

/** The fact resolver's output: the CEL fact + the event's cascade depth (0 = human plane). */
export interface ResolvedTrigger {
  readonly fact: TriggerFact;
  readonly automationDepth: number;
}

/** The rate-cap gate's verdict — `ok` to proceed, else the `detail` the fire row carries (the cooldown /
 *  per-rule-hour / per-chat-hour loop-safety belt). */
export type BudgetVerdict = { readonly ok: true } | { readonly ok: false; readonly detail: string };

/** A turn's origin as the cascade guard reads it (chat's `getTurnOrigin`, 03 §4) — the initiator + the depth
 *  the turn ran at. `null` when the ref names no committed reply slot in the chat. */
export interface TurnOriginRead {
  readonly initiator: TurnInitiator;
  readonly automationDepth: number;
}

/** The `generate_image` arm's request onto imagery (03 §1.7). Carries the FULL IC-C args — INCLUDING
 *  `subjectCharacterId`/`useAvatarReference`, which the D48 TOOL schema had to omit (JSON-Schema projection,
 *  the I4 lesson): the automation action args are human/config-authored and NOT projected, so this arm is the
 *  non-projected home those fields live in. Compose maps this onto imagery's `GeneratePictureParams` (resolving
 *  the author Principal); automation stays imagery-blind about the orchestration. */
export interface AutomationImageRequest {
  readonly authorUserId: UserId;
  readonly chatId: ChatId;
  /** The firing rule's cascade depth (`origin.automationDepth` = parentDepth + 1). When compose POSTS the
   *  non-quiet result into chat, it stamps this + `initiator:"automation"` onto the posted image's slot, so the
   *  resulting `messageCommitted` fact resolves at depth ≥ 1 and `runGates` cascade-suppresses a non-opted
   *  re-fire (the F1 → N1 self-loop belt; the F5 mechanism on the image-post path). Quiet posts nothing, so the
   *  stamp is inert there. */
  readonly automationDepth: number;
  readonly mode: PromptTemplateMode;
  /** The macro-RENDERED prompt (the arm renders its template first — §0). Absent ⇒ imagery extracts from chat. */
  readonly prompt?: string | undefined;
  readonly negative?: string | undefined;
  readonly n?: number | undefined;
  readonly size?: SizePresetName | undefined;
  readonly subjectCharacterId?: CharacterId | undefined;
  readonly useAvatarReference?: boolean | undefined;
  readonly reuse?: "prefer" | "never" | undefined;
  /** 03 §1.7's "one `/imagine` path": `quiet` ⇒ generate SILENTLY (store-only; reachable via the gallery);
   *  the default (`false`) POSTS the generated image into the chat as a message. The arm consumes `quiet`
   *  itself (imagery has no posting concept) — compose routes the non-quiet path through chat's existing
   *  image-post seam (`postNarratorMessage`), never a second posting path. */
  readonly quiet: boolean;
}

/** The NARROW generation result automation reads — the image count. Never imagery's blocks/provenance:
 *  automation dispatches the generation, it does not post it. (Cost VISIBILITY rides the stats domain off the
 *  imagery write itself; automation no longer accumulates spend — the $/day ceiling was stripped.) */
export interface AutomationImageResult {
  readonly imageCount: number;
}

/** The `trigger_turn` arm's request onto chat's non-human turn seam (03 §1.6 / §4). `authorUserId` = the rule
 *  author (→ chat's `funderUserId`/`triggeredBy` — spend attribution + the D17 by-proxy consent subject);
 *  `automationDepth` = the cascade depth (parentDepth + 1), stamped on the reply slot so the guard bounds the
 *  chain. Compose maps this onto chat's `requestTurn` with `initiator:"automation"` HARDCODED (automation
 *  cannot spoof a different origin) + the funder resolved from the room's host. */
export interface AutomationTurnRequest {
  readonly authorUserId: UserId;
  readonly chatId: ChatId;
  readonly automationDepth: number;
  /** Force the speaker (03 §1.6); absent ⇒ normal arbitration. */
  readonly speakerCharacterId?: CharacterId | undefined;
  /** The macro-RENDERED guided steer (the arm renders `guidedTemplate` first — §0). Absent ⇒ no steer. */
  readonly guided?: string | undefined;
}

/** The NARROW turn result automation reads — how many replies committed. Never chat's message views:
 *  automation triggers the turn, it does not render it. (Cost VISIBILITY rides the stats domain off the
 *  turn's own metering; automation no longer accumulates spend — the $/day ceiling was stripped.) */
export interface AutomationTurnResult {
  /** How many reply slots committed (0 = the turn produced nothing — e.g. a stale forced speaker / lock yield). */
  readonly messageCount: number;
}

/** BG-F — one candidate the `set_chat_background` arm's LLM QUIET-pick chooses among: a human-facing NAME
 *  and the `ThemeBackground` SOURCE it resolves to (an owned-library asset in v1). The arm sends the names
 *  to the model, matches the returned name back to a choice, and writes its `background`. */
export interface BackgroundChoice {
  readonly name: string;
  readonly background: ThemeBackground;
}

/** The injected cross-feature ops (04 §4). A5 wired the chat READ projections; A6 WIDENS with the action
 *  write ops (the fact resolver + CEL-env builder stay chat-blind — the D26 selected-variant join, the delta
 *  fold). Every op is wired at `entry/compose` (one-directional flow); the domain declares only the TYPE. */
export interface AutomationOps {
  readonly chat: {
    /** The triggering message projected to the CEL fact (the SELECTED variant's content, D26). `null` when
     *  the id names no live slot (a raced delete). */
    readonly getMessageFact: (chatId: ChatId, messageId: MessageId) => Promise<NonNullable<TriggerFact["message"]> | null>;
    /** The cascade-guard depth read off a committed reply slot (03 §4). `null` = no such slot / a human turn. */
    readonly getTurnOrigin: (chatId: ChatId, messageId: MessageId) => Promise<TurnOriginRead | null>;
    /** THE cross-domain viewer-visibility op (chat's `resolveViewerVisibility`, compose-wired) — the ONLY way
     *  this domain may answer "may this human see that chat's CONTENT". It hands back membership AND the D16
     *  history floor as one value (`null` = not a present member), so the plugin fan-out's delivery gate
     *  cannot stop at "member: yes" the way it used to and ship pre-join canon to a clamped member. Automation
     *  never re-derives either half: no membership select, no second clamp home. The TYPE is chat's (type-only
     *  cross-domain import — the sanctioned injected-op shape declaration), so a change to the verdict shape
     *  fails tsc here instead of drifting. */
    readonly resolveViewerVisibility: ResolveViewerVisibility;
    /** The chat's CURRENT runtime variables — the materialized delta-fold cache (CEL `vars`). */
    readonly readVariables: (chatId: ChatId) => Promise<Record<string, string>>;
    /** The chat's config-plane ChoiceBlock picks (CEL `choice`). */
    readonly readChoicePicks: (chatId: ChatId) => Promise<Record<string, string>>;
    /** A6 — the standalone (out-of-turn) runtime-variable write a `set_variable` chat-scope arm dispatches
     *  through (03 §1.1); wired to chat's `applyStandaloneVariableOps` at compose. Principal-free — the
     *  author's host authority was re-verified at the dispatch gate. */
    readonly applyVariableOps: (chatId: ChatId, ops: readonly VarOp[]) => Promise<void>;
    /** BG-F — the `set_chat_background` arm's CANDIDATE set: the author's owned background library projected
     *  to `(name, source)` pairs (compose reads the author's `appearance.backgroundLibrary`). Empty ⇒ the
     *  arm no-ops (nothing to pick). Author-scoped; the picked source is the author's own asset, so BG-C's
     *  asset-ownership gate on the write never refuses it. */
    readonly listBackgroundChoices: (authorUserId: UserId) => Promise<readonly BackgroundChoice[]>;
    /** PROSE-1 census 91 — the ROOM HOST's prose overrides for this chat (owner-decision 8, option (a)),
     *  wired to chat's `resolveChatProse` at compose. The `set_chat_background` quiet pick reads its two
     *  authored clauses from here; a hostless/stale room resolves `{}` ⇒ the shipped defaults. */
    readonly resolveChatProse: (chatId: ChatId) => Promise<ProseOverrides>;
    /** BG-F — the `set_chat_background` arm's WRITE, wired to chat's host-gated `setChatBackground` under the
     *  author's Principal at compose (the author's dispatch-time host authority was re-verified at the gate).
     *  Writes the per-chat carried background — INERT for every viewer outside a true-solo room (BG-C), which
     *  is exactly what makes this automation write scope-safe. */
    readonly setChatBackground: (args: { readonly authorUserId: UserId; readonly chatId: ChatId; readonly background: ThemeBackground }) => Promise<void>;
    /** A6 — the `trigger_turn` arm's autonomous chat turn (03 §1.6 / §4), wired to chat's `requestTurn` at
     *  compose (`initiator:"automation"`, the funder = the rule author, the funding host resolved from the
     *  room). Loop-safety belts: the engine's per-member turn RATE budget INSIDE `requestTurn` + the cascade-depth
     *  guard + the dispatch rate gate above. Consent-gated by the engine's `assertMaxProSubConsent` (a by-proxy
     *  hosted turn without owner consent is refused — the refusal surfaces as an `arm_error`). */
    readonly requestTurn: (req: AutomationTurnRequest) => Promise<AutomationTurnResult>;
  };
  /** A6 — the SHARED, hand-edit-safe world-info writer (CC-D; the ONE write path — consumed, never forked —
   *  03 §1.3). `authorUserId` resolves to the book owner's Principal at compose. */
  readonly worldInfo: {
    readonly upsertEntries: (args: {
      readonly authorUserId: UserId;
      readonly bookId: WorldBookId;
      readonly entries: readonly UpsertLoreEntryInput[];
    }) => Promise<UpsertEntriesResult>;
  };
  /** A6 — the unified-inbox delivery for a `post_notification` arm (the `automation-notice` member — 03 §1.5);
   *  wired to the composed durable-first `notifications.emit` at compose (never a re-rolled inbox). */
  readonly notifications: {
    readonly emit: (event: NotificationEvent) => Promise<void>;
  };
  /** A6 — the `/imagine` engine for a `generate_image` arm (03 §1.7); wired to `imagery.generatePicture`. */
  readonly imagery: {
    readonly generatePicture: (req: AutomationImageRequest) => Promise<AutomationImageResult>;
  };
  /** BG-F — the FIRST quiet LLM op in `AutomationOps`: a one-shot summarize-role generation that returns raw
   *  text and posts NOTHING to the chat (the `set_chat_background` arm's model pick). Wired at compose to the
   *  author's resolved `summarize`-role connection (the D79 quiet-turn seam), author-scoped for the
   *  connection. Generic by design (the extensible shape) — future quiet-LLM arms reuse it. `text` is `""` on
   *  an empty/failed generation (the caller treats "" as "no pick"). (Cost VISIBILITY rides the stats domain
   *  off the generation itself; automation no longer gates spend.) */
  readonly summarizeQuiet: (args: { readonly authorUserId: UserId; readonly chatId: ChatId; readonly prompt: string }) => Promise<{ readonly text: string }>;
}

/** Resolve a rule AUTHOR's `Principal` for the dispatch-time authority re-check (03 §2). Minted at the entry
 *  seam (the constitution: only entry constructs a Principal) and injected; `null` when the user is gone. */
export type ResolveAuthorPrincipal = (userId: UserId) => Promise<Principal | null>;

/** The automation feedback-bus sink (04 §5). Injected; wired at compose to `publishAutomationEvent` (A8b) —
 *  fans the event to the chat's `automation.stream` subscribers (the transport-owned per-chat live bus). The
 *  `surface_quick_reply` arm's `quickReplySurfaced` is the one MEMBER-visible event; the rest are host-only. */
export type EmitAutomationEvent = (event: AutomationBusEvent) => void;

/** The in-process pre-check index (01 §3) — chats with ≥1 enabled rule + whether any enabled DOMAIN-trigger
 *  rule exists. `ASSUMES(single-replica)`: the sets are per-process, reloaded at boot + on every lifecycle
 *  mutation. The watcher's handler returns without a DB read when the event's chat is unwatched. */
export interface EnabledRuleIndex {
  /** Whether `chatId` has ≥1 enabled rule (any bus) — the chat-bus fast path. */
  readonly has: (chatId: ChatId) => boolean;
  /** Whether any enabled rule triggers on the domain bus — the domain-bus fast path. */
  readonly hasDomainRules: () => boolean;
  /** Recompute both sets from canon (boot + after each enable/disable/delete/trigger-change). */
  readonly reload: () => Promise<void>;
}

/** One arm-template render request (the shared render seam `substrate/macro-render` consumes). The CEL
 *  activation, the injected clock/PRNG (determinism), the template, and an optional `macroEnv` seeding the
 *  `{{name}}` catch-all — the `transform_draft` arm passes `{ draft }` so `{{draft}}` renders the current
 *  target text (A7); every other arm omits it (the empty default). */
export interface ArmTemplateRender {
  readonly env: AutomationCelEnv;
  readonly nowMs: number;
  readonly prng: () => number;
  readonly template: string;
  readonly macroEnv?: Record<string, string>;
}

/** The A7 prompt-transform index's reconciled deps (`engine/prompt-transforms`) — db + the injected chat READ
 *  ops (`readChoicePicks`) + the injected clock/PRNG for the deterministic template render + the chat
 *  registry's register/unregister (wired at entry/compose; the chat domain owns the registry, automation
 *  declares only the TYPE — one-directional flow). */
export interface PromptTransformIndexDeps {
  readonly db: Db;
  readonly ops: AutomationOps;
  readonly prng: () => number;
  readonly now: () => number;
  readonly register: (transform: PromptTransform) => void;
  readonly unregister: (id: string) => void;
}

/** The A7 prompt-transform index — the automation side of the D50 `PromptTransform` seam (04 §6). A
 *  `transform_draft` rule does NOT watcher-dispatch (its arm records a typed refusal there); it REGISTERS a
 *  `PromptTransform` into chat's compose-wired registry, applied synchronously at the turn pipeline's two
 *  fixed points. `reload` recomputes the registered set from canon (boot + after every lifecycle mutation
 *  that can change an enabled transform rule — enable/disable/update/delete/reorder), diffing so a removed
 *  rule deregisters. `ASSUMES(single-replica)`: the registry is a per-process Map (the enabled-index / chat
 *  replay-ring annotation). */
export interface PromptTransformIndex {
  readonly reload: () => Promise<void>;
}

// ── the dispatch seam A6 plugs into ───────────────────────────────────────────────────────────────
/** The per-rule dispatch frame handed to an arm executor: the resolved fact + the built CEL env (for
 *  `{{expr::…}}` + template render) + the write origin (`{ ruleId, childDepth }`) + the injected clock stamp. */
export interface DispatchFrame {
  readonly chatId: ChatId;
  readonly authorUserId: UserId;
  readonly fact: TriggerFact;
  readonly env: AutomationCelEnv;
  readonly origin: AutomationOrigin;
  readonly now: number;
}

/** One arm's execution outcome. `ok` on success; else a typed `arm_error` refusal → the `action_error` fire
 *  terminal (increments `consecutive_errors`, aborts the rule's remaining arms). The first non-`ok` outcome
 *  aborts the rule's remaining arms (04 §3). */
export type ArmOutcome = { readonly ok: true } | { readonly ok: false; readonly kind: "arm_error"; readonly detail: string };

/** The arm dispatcher (04 §4). ONE function that runs any arm — dispatch is a `switch(action.type)` (the
 *  RUNNERS discipline realized as a switch, NOT an object map: no snake_case property keys, a `default: never`
 *  exhaustiveness pin). A5 wired a not-yet-filled default (every arm records `action_error`); A6 wires the
 *  real one via `createArmExecutors`. `trigger_turn` is WIRED (§AC-B landed); the sole v1-unwired arm
 *  (`transform_draft` — pipeline-registered, A7) + the reserved arms return a typed refusal, NOT a fabricated
 *  success. */
export type ArmDispatch = (action: AutomationAction, frame: DispatchFrame) => Promise<ArmOutcome>;

/** The arm dispatcher's shared deps (a subset of the AutomationContext) — the db, the injected action ops, the
 *  injected PRNG (deterministic template render), and the automation-bus sink (`surface_quick_reply`). Built
 *  at compose and passed to `createArmExecutors`. */
export interface ArmExecutorDeps {
  readonly db: Db;
  readonly ops: AutomationOps;
  readonly prng: () => number;
  readonly notify: EmitAutomationEvent;
}
