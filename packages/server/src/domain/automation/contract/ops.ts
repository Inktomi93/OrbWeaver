// domain/automation/contract/ops — the injected cross-feature op TYPES (domain-no-cross-feature; wired at
// entry/compose) + the dispatch seam the arm executors plug into. `AutomationOps` declares the READ ops the
// watcher/fact-resolver/CEL-env need (chat-owned projections — turn origin, the selected-variant message
// fact, the runtime fold cache, the config-plane picks) WIDENED with the action ops
// (applyVariableOps, worldInfo, notifications, imagery) and wires the `runArm` dispatcher — no stubs,
// no reserved slots here. Principal minting stays at the entry seam (`resolveAuthor`) — the domain never
// constructs a Principal (the tier-collapse the constitution forbids).

import type {
  AutomationAction,
  AutomationBusEvent,
  AutomationCelEnv,
  AutomationEmitSource,
  AutomationOrigin,
  AutomationRunOutcome,
  AutomationSuggestionKind,
  AutomationTrigger,
  RulePresetId,
  RulePresetKnobValues,
  SuggestibleAction,
  TriggerFact,
} from "@orb/contracts/automation";
import type { PromptTransform, TurnInitiator, VariablePrecondition, VariableWriteResult } from "@orb/contracts/chat";
import type { Can, Principal } from "@orb/contracts/identity";
import type { PromptTemplateMode, SizePresetName } from "@orb/contracts/imagery";
import type { NotificationEvent, NotificationRecipient } from "@orb/contracts/notifications";
import type { PluginSuggestedAct } from "@orb/contracts/plugin";
import type { SideGenKind } from "@orb/contracts/preset";
import type { ProseOverrides } from "@orb/contracts/prose";
import type { ResponseFormat } from "@orb/contracts/role-clients";
import type { ThemeBackground } from "@orb/contracts/theme";
import type { UpsertEntriesResult, UpsertLoreEntryInput } from "@orb/contracts/world-info";
import type { automationRules, Db } from "@orb/db";
import type { AutomationRuleId, AutomationSuggestionId, CharacterId, ChatId, MessageId, MessageVariantId, PluginId, UserId, WorldBookId } from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import type { ResolveViewerVisibility } from "#domain/chat";
import type { AnalysisConfirmAct } from "./analysis.ts";
import type { CreateRuleParams } from "./params.ts";

/** A stored automation-rule row — the dispatch's unit of work (its `actions` json is parsed at dispatch with
 *  the active disable-on-corrupt). Homed here (not persistence) so the engine/watcher share ONE row type. */
export type RuleRow = typeof automationRules.$inferSelect;

/** One VALIDATED, ready-to-insert rule — everything `createRule` decides before it writes anything, with the
 *  id already minted so a caller can read the row back by id after the write.
 *
 *  `position` IS ABSENT ON PURPOSE (#1427). It is allocated by the INSERT itself, from a scalar subquery over
 *  the rule's own scope, because a JS `max+1` read followed by a separate insert is two statements two
 *  concurrent creates can interleave inside — and they then pick the SAME position, in a column whose order
 *  is semantics (sibling arms mutate one shared write-through env in position order). */
export interface PlannedRuleInsert {
  readonly id: AutomationRuleId;
  readonly ownerId: UserId;
  /** NULL = the owner-GLOBAL lane (C5). The column was born nullable for this. */
  readonly chatId: ChatId | null;
  readonly name: string;
  readonly description: string | null;
  readonly triggerBus: AutomationTrigger["bus"];
  readonly triggerType: AutomationTrigger["type"];
  readonly predicateCel: string | null;
  readonly actions: readonly AutomationAction[];
  /** Mint provenance (both-or-neither — the paired db CHECK): non-null ONLY on `createRuleFromPreset`'s
   *  writes. */
  readonly rulePresetId: RulePresetId | null;
  readonly rulePresetKnobs: RulePresetKnobValues | null;
  readonly matchAutomationEvents: boolean;
  readonly cooldownSeconds: number;
  readonly maxFiresPerHour: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** The gate-less half of `createRule`: validate a payload and mint its row, writing NOTHING. It is injected
 *  into `createRuleFromPreset` the same way the whole verb used to be (a verb never imports a sibling verb),
 *  so a preset set can validate EVERY member before its first write and then commit them in one batch. */
export type PlanRule = (params: CreateRuleParams) => Promise<PlannedRuleInsert>;

/** The fact resolver's output: the CEL fact + the event's cascade depth (0 = human plane). */
export interface ResolvedTrigger {
  readonly fact: TriggerFact;
  readonly automationDepth: number;
}

/** The rate-cap gate's verdict — `ok` to proceed, else the `detail` the fire row carries (the cooldown /
 *  per-rule-hour / per-chat-hour loop-safety belt). */
export type BudgetVerdict = { readonly ok: true } | { readonly ok: false; readonly detail: string };

/** A turn's origin as the cascade guard reads it (chat's `getTurnOrigin`) — the initiator + the depth
 *  the turn ran at. `null` when the ref names no committed reply slot in the chat. */
export interface TurnOriginRead {
  readonly initiator: TurnInitiator;
  readonly automationDepth: number;
}

/** The `generate_image` arm's request onto imagery. Carries the FULL IC-C args — INCLUDING
 *  `subjectCharacterId`/`useAvatarReference`, which the D48 TOOL schema had to omit (JSON-Schema projection,
 *  the I4 lesson): the automation action args are human/config-authored and NOT projected, so this arm is the
 *  non-projected home those fields live in. Compose maps this onto imagery's `GeneratePictureParams` (resolving
 *  the author Principal); automation stays imagery-blind about the orchestration. */
export interface AutomationImageRequest {
  readonly authorUserId: UserId;
  /** C5 — NULL on an owner-GLOBAL rule's fire. Imagery's own `GeneratePictureParams.chatId` was already
   *  optional, so this widening is automation-internal at the TYPE; the BEHAVIOURAL half is imagery's
   *  chat-less caption path (`domain/imagery/verbs/extract-prompt.ts`), which is why a global
   *  `generate_image` is admitted only for a caption mode — a text-EXTRACTION mode reads a chat's recent
   *  canon through the quiet shaper and has nothing to read here. */
  readonly chatId: ChatId | null;
  /** The firing rule's cascade depth (`origin.automationDepth` = parentDepth + 1). When compose POSTS the
   *  non-quiet result into chat, it stamps this + `initiator:"automation"` onto the posted image's slot, so the
   *  resulting `messageCommitted` fact resolves at depth ≥ 1 and `runGates` cascade-suppresses a non-opted
   *  re-fire (the cascade self-loop guard; the image-post depth-stamp mechanism). Quiet posts nothing, so the
   *  stamp is inert there. */
  readonly automationDepth: number;
  readonly mode: PromptTemplateMode;
  /** The macro-RENDERED prompt (the arm renders its template first). Absent ⇒ imagery extracts from chat. */
  readonly prompt?: string | undefined;
  readonly negative?: string | undefined;
  readonly n?: number | undefined;
  readonly size?: SizePresetName | undefined;
  readonly subjectCharacterId?: CharacterId | undefined;
  readonly useAvatarReference?: boolean | undefined;
  readonly reuse?: "prefer" | "never" | undefined;
  /** ONE `/imagine` path: `quiet` ⇒ generate SILENTLY (store-only; reachable via the gallery);
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

/** The `trigger_turn` arm's request onto chat's non-human turn seam. `authorUserId` = the rule
 *  author (→ chat's `funderUserId`/`triggeredBy` — spend attribution + the D17 by-proxy consent subject);
 *  `automationDepth` = the cascade depth (parentDepth + 1), stamped on the reply slot so the guard bounds the
 *  chain. Compose maps this onto chat's `requestTurn` with `initiator:"automation"` HARDCODED (automation
 *  cannot spoof a different origin) + the funder resolved from the room's host. */
export interface AutomationTurnRequest {
  readonly authorUserId: UserId;
  readonly chatId: ChatId;
  readonly automationDepth: number;
  /** Force the speaker; absent ⇒ normal arbitration. */
  readonly speakerCharacterId?: CharacterId | undefined;
  /** The macro-RENDERED guided steer (the arm renders `guidedTemplate` first). Absent ⇒ no steer. */
  readonly guided?: string | undefined;
}

// ── the `run_tool` arm's seam onto the ONE tool registry (D146) ───────────────────────────────────────
// Automation declares the TYPE; `entry/compose` binds it to `domain/tool-use` (the cake — automation never
// imports a sibling domain). The arm hands over a NAME and a RENDERED args document and gets DATA back; there
// is no message-write op on this surface and none may be added (the class-1 wall: a tool result is data back
// to the arm, never a message insert).

/** The `run_tool` arm's request. `argsJson` is the arm's macro-rendered `argsTemplate` — the arm renders, the
 *  op executes, exactly like every other templated arm. `authorUserId` is the rule AUTHOR: the tool runs as
 *  them, on their grant, in their variable namespace, and it is their direct-drive reachability the op
 *  re-checks before invoking. */
export interface AutomationToolRequest {
  readonly authorUserId: UserId;
  /** C5 — NULL on an owner-GLOBAL rule's fire. `ToolExecutionContext` supports the non-chat consumer BY
   *  CONTRACT (`domain/tool-use/contract/params.ts`: chatId/turnId/roster are all nullable, and a chat-scoped
   *  tool running under a null roster is "an errors-as-data denial, never a crash"), so the arm needs no
   *  special case: the registry answers for what a chat-less invocation can do. */
  readonly chatId: ChatId | null;
  readonly name: string;
  readonly argsJson: string;
}

/** What ONE `run_tool` invocation produced. Three arms, and the middle one is the whole of D146-d:
 *
 *  • `ok` — the tool's result STRING, verbatim (a guest tool's return is already its own JSON document; the
 *    execute pipeline never re-stringifies it). The arm may capture it into a variable.
 *  • `unavailable` — the named tool is not drivable by this author RIGHT NOW. It passed the mint gate once, so
 *    this means the CONTRIBUTOR WENT AWAY (the plugin was disabled, upgraded or uninstalled — ordinary user
 *    action). The arm PAUSES the rule on it. It is a separate arm from `failed` precisely so the pause can
 *    never be mistaken for a fault: routing it through `failed` would spend `consecutive_errors` and
 *    auto-disable the rule at 20, which is the rot D146-d names.
 *  • `failed` — the tool ran and refused, or its args did not parse, or its handler threw. That IS a fault
 *    worth an `arm_error`: the rule's author wrote something the tool rejects, and the error budget is how a
 *    rule that can only ever fail eventually stops. */
export type AutomationToolOutcome =
  | { readonly ok: true; readonly result: string }
  | { readonly ok: false; readonly reason: "unavailable" }
  | { readonly ok: false; readonly reason: "failed"; readonly error: string };

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

/** The injected cross-feature ops: the chat READ projections WIDENED with the action
 *  write ops (the fact resolver + CEL-env builder stay chat-blind — the D26 selected-variant join, the delta
 *  fold). Every op is wired at `entry/compose` (one-directional flow); the domain declares only the TYPE. */
export interface AutomationOps {
  readonly chat: {
    /** The triggering message projected to the CEL fact (the SELECTED variant's content, D26). `null` when
     *  the id names no live slot (a raced delete). */
    readonly getMessageFact: (chatId: ChatId, messageId: MessageId) => Promise<NonNullable<TriggerFact["message"]> | null>;
    /** The cascade-guard depth read off a committed reply slot. `null` = no such slot / a human turn. */
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
    /** The standalone (out-of-turn) runtime-variable write a `set_variable` chat-scope arm dispatches
     *  through; wired to chat's `applyStandaloneVariableOps` at compose. Principal-free — the
     *  author's host authority was re-verified at the dispatch gate.
     *
     *  `expect` is the OPTIONAL compare-and-set (#1555): with preconditions the write lands only while every
     *  one still holds against the live fold, and otherwise refuses AS DATA having written nothing. The
     *  automation arms pass none (a rule's `set_variable` is an unconditional assignment) and read `applied`;
     *  the plugin membrane aliases this exact op and is the caller that uses it. */
    readonly applyVariableOps: (chatId: ChatId, ops: readonly VarOp[], expect?: readonly VariablePrecondition[]) => Promise<VariableWriteResult>;
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
    /** The `trigger_turn` arm's autonomous chat turn, wired to chat's `requestTurn` at
     *  compose (`initiator:"automation"`, the funder = the rule author, the funding host resolved from the
     *  room). Loop-safety belts: the cascade-depth guard inside `requestTurn` + the per-chat turn lock + the
     *  dispatch rate gate above — which is the SPEND wall now that the engine's per-member turn budget and the
     *  by-proxy owner-consent belt are gone (the inference program §14 F11/F13). Any refusal surfaces as an
     *  `arm_error`. */
    readonly requestTurn: (req: AutomationTurnRequest) => Promise<AutomationTurnResult>;
  };
  /** The SHARED, hand-edit-safe world-info writer (CC-D; the ONE write path — consumed, never forked).
   *  `authorUserId` resolves to the book owner's Principal at compose. */
  readonly worldInfo: {
    readonly upsertEntries: (args: {
      readonly authorUserId: UserId;
      readonly bookId: WorldBookId;
      readonly entries: readonly UpsertLoreEntryInput[];
    }) => Promise<UpsertEntriesResult>;
  };
  /** The unified-inbox delivery for a `post_notification` arm (the `automation-notice` member);
   *  wired to the composed durable-first `notifications.emit` at compose (never a re-rolled inbox). */
  readonly notifications: {
    readonly emit: (event: NotificationEvent) => Promise<void>;
  };
  /** The `/imagine` engine for a `generate_image` arm; wired to `imagery.generatePicture`. */
  readonly imagery: {
    readonly generatePicture: (req: AutomationImageRequest) => Promise<AutomationImageResult>;
  };
  /** D146 — the ONE tool registry, reached by the `run_tool` arm. Wired at compose to `domain/tool-use`. */
  readonly tools: {
    /** DIRECT-DRIVE reachability: may `authorUserId` name `toolName` themselves? Answers `true` only for a
     *  contributor tool that author INSTALLED (`tool-use/substrate/reachability.ts` states why the plugin's
     *  own PL-C invocation ceiling is not sufficient for this question).
     *
     *  TWO callers, one predicate, two meanings for `false` — this is the D146-d hinge:
     *    • the MINT gate (`substrate/validate.ts`) ⇒ a typed refusal; the rule is never stored.
     *    • the per-fire PAUSE gate (`engine/dispatch.ts::runGates`) ⇒ the rule pauses, spending nothing.
     *  Synchronous because the registry is an in-process Map — a per-fire gate must cost nothing. */
    readonly isToolDrivableBy: (toolName: string, authorUserId: UserId) => boolean;
    /** Invoke one tool as the rule author. Re-checks reachability ITSELF (never trusting that a caller
     *  checked) and returns `unavailable` when it has gone — so the pause posture holds even when a plugin is
     *  deactivated in the window between the gate and this call. Never throws for a tool-level failure. */
    readonly runTool: (req: AutomationToolRequest) => Promise<AutomationToolOutcome>;
  };
  /** THE generic quiet-LLM op (widened at C1 from the /autobg-only shape its own header always promised): a
   *  one-shot generation on the AUTHOR's own role-resolved connection that returns raw text and posts NOTHING
   *  to the chat. Two variants through ONE op, decided by `responseFormat`:
   *    • absent — a plain quiet generation on the `summarize` role (the /autobg pick, the D79 quiet-turn seam);
   *    • present — a SCHEMA-CONSTRAINED generation the compose-side summarize facade routes to the
   *      `structured` role (D109-4; its firewall row excludes the metered sub — hosted-cred laundering
   *      structurally closed). NOT a second op and NOT a bare `runStructuredTurn` import into this domain:
   *      the facade already owns the constrained-vs-plain wire split (`entry/compose/role-clients.ts`), so
   *      the variant is a pass-through field on the ONE lane.
   *  `systemPrompt` and `posture` are the CALLER's (the domain owns its prompt text and each call site names
   *  its `SIDE_GEN_POSTURES` floor — the no-hardcoded-side-gen-sampling law; compose folds the author's
   *  preset params over it). WHY author-scoped rather than D109-2 turn-inheritance: an automation arm is the
   *  author's standing side generation (it can fire with no committed turn — `runRuleNow`); the author funds
   *  their own call under their own consent; no by-proxy triple exists. `text` is `""` on an empty/failed
   *  generation (the caller treats "" as "no answer"). (Cost VISIBILITY rides the stats domain off the
   *  generation itself; automation no longer gates spend.) */
  readonly summarizeQuiet: (args: {
    readonly authorUserId: UserId;
    readonly chatId: ChatId;
    readonly systemPrompt: string;
    readonly prompt: string;
    readonly posture: SideGenKind;
    readonly responseFormat?: ResponseFormat | undefined;
  }) => Promise<{ readonly text: string }>;
}

/** Resolve a rule AUTHOR's `Principal` for the dispatch-time authority re-check. Minted at the entry
 *  seam (the constitution: only entry constructs a Principal) and injected; `null` when the user is gone. */
export type ResolveAuthorPrincipal = (userId: UserId) => Promise<Principal | null>;

/** The domain rows a CHAT-LESS `TriggerFact` can reference — one per domain-bus event. Homed HERE (the
 *  domain's type home) rather than beside the read it drives, because TWO independent consumers ask about it:
 *  the plugin fan-out's visibility gate and the owner-global rule gate, through the one mapping in
 *  `substrate/fact-scope.ts`.
 *
 *  IT GREW TO FOUR WITH S7 AND THAT IS THE POINT. The visibility gate's chat-less arm was `character`/`asset`
 *  with a fail-CLOSED default, which was correct while the trigger tuple had two domain members. Widening the
 *  tuple to `persona.updated`/`world-info.updated` without widening this would have left both new facts
 *  falling into that default forever: a plugin could DECLARE them, every cheap gate would pass, and delivery
 *  would silently never happen — a dead wire that reads as coverage. Fail-closed is the right DEFAULT and the
 *  wrong ANSWER.
 *
 *  @public Test-anchored module surface; its contract test is the tuple's liveness pin. */
export const DOMAIN_ROW_KINDS = ["character", "asset", "persona", "worldBook"] as const;
export type DomainRowKind = (typeof DOMAIN_ROW_KINDS)[number];

/** The domain row one chat-less fact references — the `(kind, id)` pair an ownership read takes
 *  (`substrate/fact-scope.ts` resolves it; both gates consume it). */
export interface FactSubject {
  readonly kind: DomainRowKind;
  readonly id: string;
}

/** C5 — is a rule AUTHOR still a live, ENABLED account? The owner-GLOBAL lane's standing-authority read
 *  (`substrate/authority.ts::holdsOwnerAuthority` states what it substitutes for and why).
 *
 *  IT IS AN INJECTED OP AND NOT A LOCAL SELECT, and the reason is the identity spine rather than taste: the
 *  `users` table is read and written by `domain/sessions` + `domain/admin` ONLY (the no-direct-users-read
 *  chokepoint, `Spine-Identity-and-Auth.md`), so every other domain takes what it needs about a user through
 *  the resolved Principal or an op wired at compose. A chat rule's authority needs no such read — its
 *  answer comes from the roster — which is exactly why this arrived with the lane that has no roster.
 *
 *  Fail-CLOSED at the wiring: a vanished row answers `false`, never "assume enabled". */
export type IsAuthorEnabled = (userId: UserId) => Promise<boolean>;

/** The automation feedback-bus sink. Injected; wired at compose to `publishAutomationEvent` —
 *  fans the event to the chat's `automation.stream` subscribers (the transport-owned per-chat live bus). The
 *  `surface_quick_reply` arm's `quickReplySurfaced` is the one MEMBER-visible event; the rest are host-only. */
export type EmitAutomationEvent = (event: AutomationBusEvent) => void;

/** The in-process pre-check index — chats with ≥1 enabled rule + whether any enabled DOMAIN-trigger
 *  rule exists. `ASSUMES(single-replica)`: the sets are per-process, reloaded at boot + on every lifecycle
 *  mutation. The watcher's handler returns without a DB read when the event's chat is unwatched. */
export interface EnabledRuleIndex {
  /** Whether `chatId` has ≥1 enabled rule (any bus) — the chat-bus fast path. */
  readonly has: (chatId: ChatId) => boolean;
  /** Whether any enabled rule triggers on the domain bus — the domain-bus fast path. */
  readonly hasDomainRules: () => boolean;
  /** #1431 — whether the snapshot is known BEHIND canon (a `refresh` failed). While true both reads above
   *  answer TRUE (fail open ⇒ canon decides) and the watcher front door rebuilds on the next event. */
  readonly isStale: () => boolean;
  /** Recompute both sets from canon, THROWING on failure — the BOOT call. */
  readonly reload: () => Promise<void>;
  /** The post-MUTATION recompute: never rejects (the durable write already committed), latching stale on
   *  failure instead. See {@link EnabledRuleIndex.isStale}. */
  readonly refresh: () => Promise<void>;
}

/** One arm-template render request (the shared render seam `substrate/macro-render` consumes). The CEL
 *  activation, the injected clock/PRNG (determinism), the template, and an optional `macroEnv` seeding the
 *  `{{name}}` catch-all — the `transform_draft` arm passes `{ draft }` so `{{draft}}` renders the current
 *  target text; every other arm omits it (the empty default). */
export interface ArmTemplateRender {
  readonly env: AutomationCelEnv;
  /** C5 — whether this render's frame HAS a room. REQUIRED rather than defaulted, deliberately: it decides
   *  whether the three chat-keyed CEL roots are bound at all, and a field a caller can forget is a field
   *  that silently binds an invented empty chat to an owner-global rule's template. `tsc` names every call
   *  site instead. */
  readonly chatScoped: boolean;
  readonly nowMs: number;
  readonly prng: () => number;
  readonly template: string;
  readonly macroEnv?: Record<string, string>;
}

/** The prompt-transform index's reconciled deps (`engine/prompt-transforms`) — db + the injected chat READ
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

/** The prompt-transform index — the automation side of the D50 `PromptTransform` seam. A
 *  `transform_draft` rule does NOT watcher-dispatch (its arm records a typed refusal there); it REGISTERS a
 *  `PromptTransform` into chat's compose-wired registry, applied synchronously at the turn pipeline's two
 *  fixed points. `reload` recomputes the registered set from canon (boot + after every lifecycle mutation
 *  that can change an enabled transform rule — enable/disable/update/delete/reorder), diffing so a removed
 *  rule deregisters. `ASSUMES(single-replica)`: the registry is a per-process Map (the enabled-index / chat
 *  replay-ring annotation). */
export interface PromptTransformIndex {
  /** Reconcile the registry against canon, THROWING on failure — the BOOT call. */
  readonly reload: () => Promise<void>;
  /** The post-MUTATION reconcile: never rejects (the durable write already committed), latching stale on
   *  failure instead. Unlike the enabled index there is no read to fail OPEN — a registered transform is a
   *  live closure the turn pipeline calls — so the latch's only remedy is the retry the watcher front door
   *  drives on the next event. See {@link PromptTransformIndex.isStale}. */
  readonly refresh: () => Promise<void>;
  /** #1431 — whether the registered set is known BEHIND canon (a `refresh` failed). */
  readonly isStale: () => boolean;
}

/** C6 — the inputs a `NotificationRecipient` selector resolves against (`substrate/notification-recipients`).
 *  Homed here rather than beside the resolver because it is the SHARED shape of two producers: the
 *  `post_notification` arm (host = the rule author, actor = the triggering fact's message author) and the
 *  plugin `notify` path wired at compose (host = the installer, actor = none).
 *
 *  `actorUserId` is deliberately UNBRANDED: it arrives from the wire-shaped `TriggerFact` (all scalars, no
 *  brands) and is used ONLY as an exclusion key against ids the db just returned — never as a lookup — so
 *  branding it would claim a validation it has not had. `null` = no human act to spare ⇒ nobody is excluded. */
export interface NotificationRecipientQuery {
  readonly recipient: NotificationRecipient;
  readonly chatId: ChatId;
  readonly hostUserId: UserId;
  readonly actorUserId: string | null;
}

// ── the dispatch seam the arm executors plug into ─────────────────────────────────────────────────
/** The per-rule dispatch frame handed to an arm executor: the resolved fact + the built CEL env (for
 *  `{{expr::…}}` + template render) + the write origin (`{ ruleId, childDepth }`) + the injected clock stamp. */
export interface DispatchFrame {
  /** C5 — THE SCOPE DISCRIMINANT of the whole dispatch. A chat-scoped rule's own chat; NULL for an
   *  owner-GLOBAL rule (`automation_rules.chat_id IS NULL`), which fires off the domain bus with no room.
   *
   *  IT IS ALSO WHAT DECIDES THE CEL BINDING SET, and that is the second belt behind the mint refusal: a
   *  global frame's activation OMITS the three chat-keyed roots (`chat`/`vars`/`choice` — see
   *  `substrate/macro-render.ts`), so a chat-keyed reference that somehow reached a stored global rule
   *  ERRORS loudly (a `predicate_error` / an arm's typed refusal) instead of silently reading an invented
   *  empty room. Mint refuses it; the runtime cannot fake it. */
  readonly chatId: ChatId | null;
  readonly authorUserId: UserId;
  readonly fact: TriggerFact;
  readonly env: AutomationCelEnv;
  readonly origin: AutomationOrigin;
  readonly now: number;
}

/** A {@link DispatchFrame} PROVEN to have a room — the shape a CHAT-REQUIRED arm's internals are written
 *  against (`engine/analysis-arm.ts` is the one with enough internals to need it).
 *
 *  IT EXISTS SO THE NARROWING HAPPENS ONCE, at the executor's front door, instead of at every read: an arm
 *  whose whole engine reads chat canon would otherwise re-ask "is there a chat?" a dozen times and answer it
 *  differently in one of them. The refusal that produces it is the second belt behind the mint's
 *  `AUTOMATION_ARM_SCOPE` gate — `engine/arm-executors.ts::chatRequiredRefusal` states why both exist. */
export type ChatScopedDispatchFrame = Omit<DispatchFrame, "chatId"> & { readonly chatId: ChatId };

/** One arm's execution outcome. `ok` on success; else one of TWO non-ok kinds, and the difference between them
 *  is the whole of D146-d — both abort the rule's remaining arms, and they part company on what the rule PAYS:
 *
 *  • `arm_error` — a typed refusal → the `action_error` fire terminal. Increments `consecutive_errors`, which
 *    auto-disables the rule at 20. That is correct for a FAULT.
 *  • `paused` — the arm's CONTRIBUTOR is not available to this author right now (only `run_tool` can produce
 *    it). → the `paused` run terminal: NO fire row, NO error increment, NO `last_fired_at` stamp, no state
 *    changed at all, so the next event after the contributor returns dispatches normally. Routing this through
 *    `arm_error` is exactly the rot D146-d forbids: disabling one plugin would silently consume every rule
 *    naming its tools, and re-enabling would not bring them back. */
export type ArmOutcome =
  | {
      readonly ok: true;
      /** S4 — the arm ASKED instead of acting (a confirm-first arm stashed itself). The rule's terminal
       *  then records NO fire row: a suggestion is not a fire, and the CONFIRM writes the `fired` row when
       *  the host says yes (§3-S4's fire-log honesty). Absent/false = the arm really ran. */
      readonly suggested?: boolean;
    }
  | { readonly ok: false; readonly kind: "arm_error"; readonly detail: string }
  /** Carries NO `detail`, deliberately: a pause writes no fire row, so there is nowhere for a detail to go and
   *  a field that exists only to be discarded is dead wire. The WHY is not lost — the rule's terminal is
   *  `paused`, and "a tool from a plugin that isn't enabled" is the only thing that can produce it. */
  | { readonly ok: false; readonly kind: "paused" };

/** A rule's (or a confirmed stash's continuation's — #1553) arm RUN: the aborting arm's `arm_error` detail
 *  (`null` = no arm errored), plus the two terminal MODIFIERS an arm can raise — `suggested` (the S4 stash:
 *  the arm ASKED instead of acting) and `paused` (D146-d: the arm's contributor vanished mid-dispatch). Each
 *  changes the TERMINAL and nothing else. Homed here (not `engine/dispatch.ts`, where `runArms` computes
 *  it) because `no-inline-types` wants an exported cross-file shape in the domain's type home. */
export interface ArmsResult {
  readonly detail: Record<string, unknown> | null;
  readonly suggested: boolean;
  readonly paused: boolean;
}

/** The arm dispatcher. ONE function that runs any arm — dispatch is a `switch(action.type)` (the
 *  RUNNERS discipline realized as a switch, NOT an object map: no snake_case property keys, a `default: never`
 *  exhaustiveness pin). A not-yet-filled default records `action_error` for every arm until `createArmExecutors`
 *  wires the real one. `trigger_turn` is WIRED; the sole v1-unwired arm
 *  (`transform_draft` — pipeline-registered) + the reserved arms return a typed refusal, NOT a fabricated
 *  success.
 *
 *  `continuation` (#1553, OWNER RULING: STASH) is every arm AFTER this one in the rule's own action list —
 *  `runArms` computes it as `actions.slice(i + 1)` at each step and ALWAYS passes it; every other caller
 *  (a single-arm manual dispatch, a test harness) may omit it — it exists so a confirm-first arm can stash
 *  it onto the pending ask ({@link StashedArm.continuation}): the ruling is that the arms behind a raised
 *  confirmation are not dropped, they wait on the SAME ask and run after the host says yes
 *  (`verbs/confirm-suggestion.ts`). A non-suggestible arm ignores the parameter entirely — only
 *  `stashConfirmFirstArm` reads it, defaulting an omitted one to empty (nothing to stash behind a
 *  single-arm call). */
export type ArmDispatch = (action: AutomationAction, frame: DispatchFrame, continuation?: readonly AutomationAction[]) => Promise<ArmOutcome>;

// ── S4: the pending-ask store (interaction-direction-spec §3-S4) ─────────────────────────────────────
// Homed BESIDE `DispatchFrame` rather than in its own contract file for one hard reason: the stashed record
// CONTAINS a frame, and a separate module would make `ops → suggestions → ops` a cycle the import gate reds.
// It belongs here on the merits too — it is a per-process INJECTED SEAM, exactly like `EnabledRuleIndex` and
// `PromptTransformIndex` above it.
//
// RULED F1: the map is IN-RAM with a TTL, per process, never a table. What that buys and costs, stated once:
//   • buys — no schema, no migration, no orphan rows to reap, and a respawn CANNOT leave a stale ask
//     standing against state that moved under it (an accepted cost: a wiped ask is one re-fire away).
//   • costs — an ask raised while the host is away expires unseen. That is the RECORDED FLIP CRITERION for
//     durable rows (§8 F1), the same column class as R5's suggestion fire-terminal. Neither is built.
// `ASSUMES(single-replica)` — the enabled-rule index / chat replay-ring annotation.

/** The CONFIRM class's executable half — the arm as it resolved at fire time, WITH the frame it resolved in.
 *  Both halves are stored because "executes the STORED arm" means exactly that: the same author, the same
 *  cascade origin, the same `env` snapshot its templates would have rendered against. Re-deriving a frame at
 *  confirm would silently make a confirmed ask a DIFFERENT act from the one the host was shown.
 *
 *  `continuation` (#1553, OWNER RULING: STASH the continuation) is every arm that sat BEHIND this one in the
 *  rule's own action list at fire time — d11a0f6e9 (#1419) used to drop them; the ruling is that a confirmed
 *  card completes the rule, so they wait on this same ask and run in order once the host says yes
 *  (`verbs/confirm-suggestion.ts::executeStashedArm`). Empty when this was the rule's LAST arm. */
export interface StashedArm {
  readonly action: SuggestibleAction;
  readonly frame: DispatchFrame;
  readonly continuation: readonly AutomationAction[];
}

/** The PAYLOAD half of a pending ask, discriminated by WHOSE enforcement set the confirmed act must re-enter
 *  through. This is the load-bearing distinction and it is not cosmetic: executing a plugin's stashed act
 *  through `runArm` (automation's dispatcher) would run it under AUTOMATION's belts instead of the plugin
 *  bridge's — the attachment gate, the per-plugin 64-entry ceiling and `neutralizeMacros`
 *  (`domain/plugin/substrate/bridge.ts`). That is an enforcement-set swap hidden inside a UX affordance:
 *  the feature demos correctly and the capability quietly widens. THE ENFORCEMENT SET FOLLOWS THE ORIGIN.
 *
 *  `null` is the INVITATION class and is `null` by construction — `budget_refused` is decided before the
 *  predicate and before any env exists, so no rendered arm can be stashed, which is also why that path has
 *  no TOCTOU.
 *
 *  @public knip type-face false positive — it is a structural field of the exported `Suggestion` shape
 *  (its `payload` field), never referenced by its own name at any call site. */
export type SuggestionPayload =
  | { readonly via: "arm"; readonly stashed: StashedArm }
  /** A plugin-origin act, re-executed through `domain/plugin`'s OWN bridge at confirm (the injected
   *  {@link ExecutePluginSuggestion} op — automation may not import a sibling domain). Inert data: it names
   *  an act and nothing that could execute it. */
  | { readonly via: "plugin-act"; readonly act: PluginSuggestedAct }
  /** A confirm-routed `run_analysis` OUTPUT (S5 §4 — a per-route `apply:"confirm"`), executed by the
   *  analysis engine's OWN confirm executor. Deliberately NOT a `via:"arm"` stash of a synthesized arm,
   *  for two load-bearing reasons: (1) a stashed `insert_world_info_entry` would MACRO-RENDER the model's
   *  bytes at confirm (`runInsertWorldInfo` renders `contentTemplate`) — machine-authored content is
   *  macro-inert data (§2 law 6), so the act is stashed FULLY RESOLVED and nothing renders; (2) a
   *  durable-write confirm must advance the rule-state WATERMARK on apply, which no generic arm knows
   *  about. The BELTS still have one home: the lore act applies through the SAME `applyRuleLoreWrite`
   *  helper the arm uses (attach gate, per-rule entry cap) — the enforcement set follows the origin
   *  without forking the belt. */
  | { readonly via: "analysis"; readonly act: AnalysisConfirmAct };

/** WHO raised the ask. The SAME `AutomationEmitSource` union the bus already carries for `quickReplySurfaced`
 *  (one home — a plugin has no rule, so the source names the real origin id, never a synthetic one), plus the
 *  per-origin liveness anchor the confirm re-check needs. */
export type SuggestionSource = AutomationEmitSource;

/** One pending ask. */
export interface PendingSuggestion {
  readonly id: AutomationSuggestionId;
  readonly kind: AutomationSuggestionKind;
  readonly chatId: ChatId;
  /** Rule or plugin — the replace-per-kind slot key, the liveness branch, and the execution branch. */
  readonly source: SuggestionSource;
  /** The identity a confirmed execution runs AS: the rule AUTHOR, or the plugin's INSTALLER. The confirmer is
   *  the AUTHORIZER only (§3-S4: ownership, funding and the variable namespace all key off this user, never
   *  off who clicked) — and it is the user whose HOST authority the confirm re-check re-runs, which is the
   *  whole of the ruled host-handoff wall: an actor who lost host cannot have their pending ask executed by
   *  the new host. Fail-closed, no re-mint, no transfer (owner ruling 2026-08-24). */
  readonly actorUserId: UserId;
  readonly summary: string;
  readonly expiresAt: number;
  readonly payload: SuggestionPayload | null;
}

/** C3 — apply a HOST-CONFIRMED prose rewrite to one audited reply, wired at `entry/compose` to chat's own
 *  `applyProseRewrite` verb under the rule author's Principal (the `setChatBackground` wiring shape).
 *
 *  IT IS DELIBERATELY NOT ON {@link AutomationOps}, and that placement IS the enforcer. `AutomationOps` is
 *  handed to every arm executor ({@link ArmExecutorDeps}), so an op on it is an op an ARM can call — and the
 *  class-1 wall says no arm-surface op may write prose into canon (§1). This op lives on the
 *  `AutomationContext` beside {@link ExecutePluginSuggestion} (the same "confirm-only executor" class) and
 *  reaches the arms' side of the domain nowhere: `ArmExecutorDeps` cannot spell it, so "only a host-confirmed
 *  card can move this" is a fact about the type graph rather than a promise in a comment.
 *
 *  The REFUSALS are the verb's own and they are typed, because they are the whole point of a pinned card: the
 *  chat verb re-reads the slot and refuses if the pinned variant is no longer selected (superseded) or its
 *  bytes no longer hash to `expectedContentHash` (stale), writing nothing either way. Rejects on refusal; the
 *  confirm verb surfaces it as `action_error`. */
export type ApplyProseRewrite = (req: {
  readonly authorUserId: UserId;
  readonly chatId: ChatId;
  readonly messageId: MessageId;
  readonly variantId: MessageVariantId;
  readonly expectedContentHash: string;
  readonly content: string;
}) => Promise<void>;

/** What the analysis CONFIRM executor (`substrate/analysis-confirm.ts`) needs — a subset of the verb's ctx
 *  (db + the injected ops + the claim-time clock value + C3's confirm-only rewrite op). Homed here beside the
 *  payload union it executes: the deps name `AutomationOps`, and a home in `contract/analysis.ts` would make
 *  `analysis ⇄ ops` a cycle. */
export interface AnalysisConfirmDeps {
  readonly db: Db;
  readonly ops: AutomationOps;
  readonly nowMs: number;
  readonly applyProseRewrite: ApplyProseRewrite;
}

/** Execute a CONFIRMED plugin-origin act through `domain/plugin`'s own bridge — declared here as a TYPE and
 *  wired at `entry/compose` (the cake: automation never imports plugin). The op rebuilds the plugin's bridge
 *  from the `pluginId` + installer, so the confirmed act takes the plugin's OWN gates and belts, and re-checks
 *  nothing about authority: the confirm verb already gated the host, claimed the ask take-once, and re-ran
 *  the actor's host authority. Rejects on any refusal; the verb surfaces it as `action_error`. */
export type ExecutePluginSuggestion = (req: {
  readonly pluginId: PluginId;
  readonly installerUserId: UserId;
  readonly chatId: ChatId;
  readonly act: PluginSuggestedAct;
}) => Promise<void>;

/** Is this plugin still installed AND enabled FOR THIS OWNER? The plugin half of the confirm-time liveness
 *  re-check (the twin of "the rule still exists and is enabled"). Declared here, wired at compose to
 *  `domain/plugin`'s OWNER-SCOPED read — automation holds no `plugins` table and may not query one, and the
 *  read takes the owner because every `plugins` read filters `ownerId` by construction (a leak-free
 *  partition). The owner passed is the ask's own `actorUserId`, so a record whose plugin was re-keyed to
 *  someone else answers `false`. Fail-CLOSED on anything but a live enabled row. */
export type IsPluginLive = (pluginId: PluginId, ownerId: UserId) => Promise<boolean>;

/** The per-process pending map (`substrate/suggestions.ts` implements it). Every method that can observe an
 *  expired entry takes the INJECTED clock's `nowMs` and sweeps first — the TTL is carried EXPLICITLY
 *  (§3-S4) rather than by a timer: a timer reads the wall clock in a domain whose every other time read is
 *  injected (test-determinism) and holds a process handle open for a map allowed to be empty. */
export interface SuggestionStore {
  /** Stash an ask, REPLACING any pending one for the same `(chatId, ruleId)` (RULED F1's replace-per-kind):
   *  a rule that keeps firing keeps ONE live ask, so a cadence rule can never wallpaper the band. */
  readonly raise: (entry: PendingSuggestion) => void;
  /** Read without taking — the authority gate needs the ask's CHAT before it can gate the caller on it. */
  readonly peek: (id: AutomationSuggestionId, nowMs: number) => PendingSuggestion | null;
  /** TAKE-ONCE: id-match, delete-on-take, atomic against a double-click (the second claim finds nothing).
   *  The delete happens whether or not the post-claim re-checks pass — a claimed ask is spent either way. */
  readonly claim: (id: AutomationSuggestionId, nowMs: number) => PendingSuggestion | null;
  /** The explicit dismiss — the same take, without the execution. */
  readonly drop: (id: AutomationSuggestionId, nowMs: number) => PendingSuggestion | null;
  /** VOID every ask of one rule (disabled/deleted — its consent question can no longer be answered). */
  readonly voidRule: (ruleId: AutomationRuleId) => number;
  /** VOID every ask of one PLUGIN (deactivated/uninstalled — the twin of `voidRule`). The confirm-time
   *  liveness re-check is what makes a stale plugin card SAFE; this is what makes it disappear, so a host is
   *  not offered an answer that would refuse. */
  readonly voidPlugin: (pluginId: PluginId) => number;
  /** VOID every ask in one chat (the RULED host-handoff sweep: authority died, its pending asks die). */
  readonly voidChat: (chatId: ChatId) => number;
  /** A chat's live asks, oldest first (the handoff sweep's input). */
  readonly listForChat: (chatId: ChatId, nowMs: number) => readonly PendingSuggestion[];
  /** How many asks the store holds for a chat, WITHOUT sweeping — the zero-cost pre-check on the hot bus
   *  path (a chat with no pending ask must cost nothing per event). */
  readonly countForChat: (chatId: ChatId) => number;
}

/** What the "does this user still hold host here" predicate needs — a SUBSET of the `AutomationContext`,
 *  so the dispatch passes its own ctx and a verb passes its own. The predicate itself is ONE home
 *  (`substrate/authority.ts`): the dispatch gate, the S4 confirm re-check and the host-handoff VOID sweep
 *  must never answer it differently. */
export interface AuthorityDeps {
  readonly db: Db;
  readonly can: Can;
  readonly resolveAuthor: ResolveAuthorPrincipal;
  /** C5 — the OWNER-GLOBAL arm's standing read (see {@link IsAuthorEnabled}). */
  readonly isAuthorEnabled: IsAuthorEnabled;
}

/** What ONE dispatch batch did: whether any rule disabled itself (the caller reloads the enabled index)
 *  and each rule's terminal in dispatch order (`null` = it reached none — cascade-suppressed, or a
 *  transform-only rule, which registers into the turn pipeline instead of dispatching). */
export interface DispatchSummary {
  readonly anyDisabled: boolean;
  readonly outcomes: readonly (AutomationRunOutcome | null)[];
}

/** How a batch was started. A bus fire uses the default; R7's `runRuleNow` passes the HOST who asked, which
 *  lifts the two whether-to-fire-BY-ITSELF gates (the fire-rate cap and the predicate) and stamps the fire
 *  row — `engine/dispatch.ts::runGates` states the line and why each lift is load-bearing. */
export interface DispatchOptions {
  readonly manualBy?: UserId;
}

/** The arm dispatcher's shared deps (a subset of the AutomationContext) — the db, the injected action ops, the
 *  injected PRNG (deterministic template render), and the automation-bus sink (`surface_quick_reply`). Built
 *  at compose and passed to `createArmExecutors`. */
export interface ArmExecutorDeps {
  readonly db: Db;
  readonly ops: AutomationOps;
  readonly prng: () => number;
  readonly notify: EmitAutomationEvent;
  /** S4 — the in-RAM pending-ask map a confirm-first arm STASHES into instead of executing (RULED F1). */
  readonly suggestions: SuggestionStore;
  /** S4 — the pending ask's claim handle. */
  readonly newSuggestionId: () => AutomationSuggestionId;
}
