// domain/chat/contract/foreign — the FOREIGN-INPUTS contract (the assemble-input ownership split). The turn's
// cross-inputs were one 15-field `AssembleCrossInputs` bundle that lumped two different things together; they
// are split by OWNERSHIP:
//   • FOREIGN  (another domain owns the read) → {@link ForeignInputs}, a resolved-DATA DTO produced by the thin
//     composition-root dep {@link ResolveForeignInputsOp}. Chat DECLARES this dep + DTO and CONSUMES them; a
//     later compose chunk supplies the runtime fn. Chat never imports preset/persona/settings — it receives the
//     RESOLVED DATA shape (Tier-5-Entry.md invariant 1: entry owns no business logic; the resolution takes chat-supplied
//     KEYS and returns DATA, so chat stays decoupled from those read APIs).
//   • CHAT-INTERNAL (chat owns the data/subsystem) → gathered by `substrate/assemble-gather.gatherAssembleContext`
//     using the `ChatContext` ops chat already holds (canon/injections/variables/metadata/memory/regex-tier).
//
// These are exported feature TYPES, so they live in `contract/` (the `types-in-contract` gate, §7.4) — NOT inline
// on a verb/substrate file. {@link ResolvedPersonas} is homed here (not assembly/context.ts, where it was a
// file-local shape) because BOTH `ForeignInputs` and the assembly producer now reference it — one home.

import type { AssemblePersona } from "@orb/contracts/chat";
import type { DatabankRetrievalSettings } from "@orb/contracts/databank";
import type { PromptConfig } from "@orb/contracts/preset";
import type { ChatSettings } from "@orb/contracts/settings";
import type { ChatId, PersonaId, PresetId, UserId } from "@orb/kit/ids";
import type { MemoryConfig } from "./memory.ts";

/** The host's turn-behavior knobs the engine honors (PD-146) — the schema-real `UserSettings.chat` arm the
 *  settings domain owns, picked (never re-spelled) to exactly the fields the SERVER turn path consumes:
 *   • `customStoppingStrings` — extra stop strings merged into the generation request's stop set (pipeline).
 *   • `autoContinue`          — after a length-capped reply, auto-issue continues (up to `autoContinueRounds`).
 *   • `autoContinueRounds`    — PD-146 bound: the max auto-continue follow-ups (the AUTO_CONTINUE loop cap).
 *   • `autoSwipe`             — after a too-short / blacklisted reply, auto-regenerate (up to `autoSwipe.maxRetries`).
 *   • `offerChoices`          — B1 / RULED F2: the host's per-USER DEFAULT for the offer-choices posture, which
 *                               a room inherits when its own `chatMetadata.offerChoices` is absent. It rides
 *                               HERE rather than being read chat-side because it is a settings value under the
 *                               frozen host (D19), which is exactly what this seam resolves; the room half is
 *                               chat's own metadata, and the two meet at `resolveTeachingKnobs`.
 *   • `charactersCanReact`    — B7: the host's per-USER DEFAULT for the react-tool attach posture (the
 *                               `offerChoices` twin — same seam, same `resolveTeachingKnobs` meeting point).
 *   • `reactionsEnabled`      — B7: the host's per-USER DEFAULT for the reaction-plane master switch. Read at
 *                               the SAME meeting point for the teaching knobs; the VERB-time gates
 *                               (`toggleReaction`/`listReactions`) resolve it through their own injected op
 *                               because no ForeignInputs exists outside the turn path.
 *  `enterSends`/`continueOnSend`/`smoothStream*` are CLIENT-honored (composer keydown / empty-send / stream
 *  pacer) and carry no server arm, so they are deliberately absent here. All fields default to their shipped
 *  posture (off/empty, except `reactionsEnabled` whose shipped posture is ON) ⇒ a host who never touched the
 *  pane sees byte-identical behavior. */
export type ChatBehaviorInputs = Pick<
  ChatSettings,
  "autoContinue" | "autoContinueRounds" | "autoSwipe" | "charactersCanReact" | "customStoppingStrings" | "offerChoices" | "reactionsEnabled"
>;

/** The resolved personas for a turn (the persona domain owns the read — FOREIGN).
 *   • `anchor` is `{{user}}` for card-derived sections (the chat-open anchor — `chats.anchorPersonaId`).
 *   • `active` is `{{user}}` for prompt-config / user-authored sections, bound by the turn's
 *     {@link TurnVoice}: the ANCHOR human's current seat persona on every turn but impersonate, so who pressed
 *     send cannot change the cached prompt (D122 as amended); the trigger's persona on an impersonate draft.
 *   • `activeUserId` is the human `active` belongs to — SHAPE's null-stamp guard key. Absent ⇒ null (fail
 *     closed: no unstamped row borrows the name).
 *  A persona arm is `null` when its pointer is unset OR its owner is not a present member (the roster consent
 *  gate — {@link ResolveForeignInputsOp}); a null anchor falls to `active` at `pinnedPersona`, which is exactly
 *  the HEAL heal-the-pointer semantics (a departed member's pin stops pinning, and is never copied). */
export interface ResolvedPersonas {
  readonly anchor: AssemblePersona | null;
  readonly active: AssemblePersona | null;
  readonly activeUserId?: UserId | null | undefined;
}

/** One present human seat and the persona it holds — the resolver reads the anchor human's seat persona here. */
export interface HumanSeatPersona {
  readonly userId: UserId;
  readonly personaId: PersonaId | null;
}

/** Whose persona a turn's prompt-config `{{user}}` binds to. `anchor`: the room's anchor human (every canon
 *  turn — the cached prefix may not depend on who pressed send). `trigger`: the pressing human (an impersonate
 *  draft is that human's own next line). */
export const TURN_VOICES = ["anchor", "trigger"] as const;
export type TurnVoice = (typeof TURN_VOICES)[number];

/**
 * WHO DRIVES THIS TURN — the assemble-time trigger identity, as a DISCRIMINATED UNION rather than the
 * nullable `triggerPersonaId` it replaces (Chat-Macro-Resolution §3/§4).
 *
 * The old field encoded three states in one nullable id, and the fourth real state — *a live human whose
 * seat holds NO persona* — had no arm, so it collided with `null` ("deliberately no triggering human") and
 * bound that human's `{{user}}` to the chat ANCHOR. Live consequence (INVITE-JOIN-NULL-PERSONA): every
 * invite-joined member seated with `activePersonaId = NULL`, so the model was told the HOST said everything
 * the member said. A missing state must be an ARM, never a sentinel that already means something else.
 *
 * The trigger binds `{{user}}` only on a `trigger`-voice turn ({@link TurnVoice}); an `anchor`-voice turn
 * binds the anchor human's seat persona whoever triggered it.
 *
 *   • `{ kind: "human" }` — a live human drives this turn. Their `{{user}}` is `personaId` when their seat
 *     holds one, and the kit floor ("User") when it does not. **This arm never reaches the anchor** — a seat
 *     the anchor-holder does not hold must not be presented to the model wearing the anchor's identity.
 *   • `{ kind: "none" }` — DELIBERATELY no triggering human (a deferred drain / an automation turn, and also
 *     every trigger-less READ: a preview, a card display, a host instrument): `{{user}}` binds to the chat
 *     ANCHOR, the chat-invariant identity (D51 rider), never a presence-order bystander.
 *
 * TWO ARMS, AND THE UNION IS REQUIRED — there is no absent/`undefined` third state. An absent trigger meaning
 * "the trigger is UNKNOWN" would have to resolve through some fallback (e.g. the first PRESENT human's
 * persona) — nondeterministic (a join re-orders it), and on a host instrument a cross-member read (a
 * multi-human room's preview could show ANOTHER member's persona as `{{user}}`). Every caller must instead
 * state which arm it is in, and "I have no triggering human" has exactly one spelling with one well-defined
 * meaning. Making the field REQUIRED rather than throwing on absence is the enforcement-ladder call: the
 * missing state becomes unrepresentable instead of loud (§2.2).
 */
export type TurnTrigger = { readonly kind: "human"; readonly userId: UserId; readonly personaId: PersonaId | null } | { readonly kind: "none" };

/**
 * The FOREIGN half of the assemble inputs — RESOLVED DATA another domain owns, produced by
 * {@link ResolveForeignInputsOp} at the composition root and CONSUMED by the chat gather. Every field is
 * settings-/preset-/persona-derived (a read chat must NOT perform itself):
 *   • `promptConfig`        — the chat's active preset under the host's settings (preset domain).
 *   • `personas`            — anchor + active (persona domain).
 *   • `scanDepth`           — the host's `UserSettings.worldInfo.scanDepth` (settings) — the WI keyword-scan
 *                             window the gather slices `recentMessages` to.
 *   • `injectionTokenBudget`— the host's `UserSettings.worldInfo.tokenBudget` (settings) — the ONE injection
 *                             budget pass (0 ⇒ unbudgeted).
 *   • `memoryConfig`        — the resolved memory tuning (`AppSettings.memoryDefaults` ⊕ `UserSettings.memory`
 *                             enable, settings/admin) read by recall AND the post-turn build (threaded via
 *                             `TurnPrep.memoryConfig` — D36 opt-out on both sides); absent ⇒ the floor (`DEFAULTS`).
 *   • `chatBehavior`        — the host's `UserSettings.chat` turn-behavior arm (PD-146 — {@link ChatBehaviorInputs}):
 *                             custom stop strings + auto-continue/auto-swipe. All-off ⇒ byte-identical to today.
 *   • `databankRetrieval`   — the host's `UserSettings.databank.retrieval` (k/minScore/rerank, settings) — the
 *                             gather passes these to `search.documents` (DB6). Absent ⇒ search's own defaults.
 *   • `databankSlotTokenBudget` — the host's `UserSettings.databank.slotTokenBudget` — the `{{databank}}` slot's
 *                             share of the turn. Absent ⇒ the gather's baked 4096 fallback.
 */
export interface ForeignInputs {
  readonly promptConfig: PromptConfig;
  /** The RESOLVED preset id `promptConfig` came from (GM override wins over host default), or null when the system
   *  `DEFAULT_PROMPT_CONFIG` stood in — WAVE MU user-macro source attribution (`MacroSourceRef` needs the id).
   *  Absent/null ⇒ the turn stamps the `"default"` source label (unreachable when no user macros are
   *  authored, since the default config has none). */
  readonly presetId?: PresetId | null | undefined;
  /** The NAME of the preset {@link ForeignInputs.presetId} points at — the SAME resolution, so the two can
   *  never disagree about which preset this room assembles. Read by the room's Regex section, which must
   *  name the preset the TURN uses (the GM redirect's on a game chat) and has no other route to it: the
   *  wire's tier key is the bare word `preset`, and the client's only preset name is the VIEWER's active
   *  one (#1754). Absent/null ⇒ the system `DEFAULT_PROMPT_CONFIG` stood in (or a fake that names nothing)
   *  ⇒ the section says the bare `From the preset`, never a guess. */
  readonly presetName?: string | null | undefined;
  readonly personas: ResolvedPersonas;
  readonly scanDepth: number;
  readonly injectionTokenBudget: number;
  readonly memoryConfig?: MemoryConfig | null | undefined;
  /** Absent ⇒ the turn path defaults to {@link DEFAULT_CHAT_BEHAVIOR} (all-off — byte-identical to today),
   *  mirroring the `memoryConfig` opt-out precedent above. The real composition-root op always supplies it. */
  readonly chatBehavior?: ChatBehaviorInputs | undefined;
  /** The host's `UserSettings.databank.retrieval` (k/minScore/rerank) — the gather passes these to
   *  `search.documents` (DB6). Absent ⇒ gather omits them and `search.documents` uses its own defaults,
   *  which ARE the databank defaults (byte-identical to pre-wire); the real compose op always supplies it. */
  readonly databankRetrieval?: DatabankRetrievalSettings | undefined;
  /** The host's `UserSettings.databank.slotTokenBudget` — the `{{databank}}` slot's share of the turn.
   *  Absent ⇒ the gather uses its baked default (4096, byte-identical to pre-wire). */
  readonly databankSlotTokenBudget?: number | undefined;
}

/** The PD-146 turn-behavior floor: no custom stops, no auto-continue, no auto-swipe. The one home the turn
 *  path defaults to when a `ForeignInputs` omits `chatBehavior` (a test fake / the memory-opt-out precedent). */
export const DEFAULT_CHAT_BEHAVIOR: ChatBehaviorInputs = {
  autoContinue: false,
  autoContinueRounds: 1,
  autoSwipe: { enabled: false, minLength: 0, blacklist: [], maxRetries: 1 },
  charactersCanReact: false,
  customStoppingStrings: [],
  offerChoices: false,
  // ON is this floor's byte-identical value, not an exception to it: the B6 reaction plane shipped
  // always-on, so the do-nothing default must keep it on (`contracts/settings` defaults it `true` too).
  reactionsEnabled: true,
};

/**
 * The thin composition-root dep that resolves {@link ForeignInputs} from chat-supplied KEYS. The keys are the
 * minimum the FOREIGN reads need under the FROZEN `runAsUserId` (D19 — the host, never the caller); the resolver
 * returns RESOLVED DATA, so it touches NO chat tables (Tier-5-Entry.md invariant 1). `anchorPersonaId` is the chat-open
 * anchor (`chats.anchorPersonaId`).
 *
 * There is no `personaIds` (the room's ONLINE persona ids, the chat-side GATHER's input) here: the resolver
 * resolves the anchor, the `humanSeats` persona of the anchor human, and — on a `trigger`-voice turn — the
 * trigger's persona.
 *
 * THE PERSONA READ IS ROSTER-GATED, and chat supplies the gate. Personas are single-owned
 * (`personas.ownerId`), but a room's assembly is a room-plane read under the frozen host — so the resolver
 * cannot read them as any one human. `presentHumanUserIds` is the room's CONSENT SET (its present human
 * participants, `leftSeq IS NULL`); the persona domain's principal-less roster op resolves an id only when
 * its owner is in that set. Chat owns membership, so chat computes this — never the resolver.
 *
 * `trigger` is the turn's identity axis — see {@link TurnTrigger} for its arms and why it is a union.
 */
export type ResolveForeignInputsOp = (args: {
  readonly chatId: ChatId;
  readonly runAsUserId: UserId;
  readonly model: string;
  readonly anchorPersonaId: PersonaId | null;
  /** The room's PRESENT human participants — the persona-read consent set (see above). Empty ⇒ no persona
   *  resolves (a hostless/stale room assembles with the kit floor rather than an unscoped read). */
  readonly presentHumanUserIds: readonly UserId[];
  /** Every present human seat and the persona it holds. */
  readonly humanSeats: readonly HumanSeatPersona[];
  readonly trigger: TurnTrigger;
  readonly voice: TurnVoice;
  /** A feature-supplied GM-voice preset REDIRECT (docs/plans/rpg/design.md — resolved by the caller's early
   *  `rpg.resolvePresetOverride` hop): when present, the resolver assembles THIS preset (owned-or-system under
   *  the host, else the normal default — the lenient-id rule) instead of the host's `UserSettings` default.
   *  Absent ⇒ byte-identical to today. Inert until the turn path passes it (docs/plans/rpg/design.md push 2). */
  readonly presetOverride?: PresetId | undefined;
}) => Promise<ForeignInputs>;
