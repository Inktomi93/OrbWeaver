// Shared owner data and injected operations; implementations and authority resolution stay in server domains.

import type { AssetId, CharacterId, ChatId, UserId } from "@orb/kit/ids";
import type { IanaTimeZone } from "@orb/kit/time";
import type { ParticipantRole } from "#identity";
import type { BindingActor } from "#inference";
import type { TagView } from "#tag";
import type { ThemeBackground, ThemeOverride } from "#theme";
import type { TurnInitiator } from "./bus.ts";
import type { GuidedSteer } from "./metadata.ts";
import type { HistoryFloorSeq, RenderPolicy } from "./roster.ts";
import type { TurnOutcome } from "./views.ts";

/** Does the invite's minter still hold the authority to mint a signup invite: enabled, and a global admin? */

export type SignupMinterCheckOp = (minterUserId: UserId) => Promise<boolean>;

/** The per-seat card-derived decoration a roster projection needs, resolved from ONE character read (the
 *  render policy, the raw theme + background overrides, and the card name/avatar) — collapses what used to
 *  be four separate reads of the same `characters` row per participant. `card` is null for a human/agent
 *  seat, no resolvable host, or a gone/mid-delete card. */
export interface SeatDeco {
  /** The content-render policy (character override ?? global floor); the bare global floor for a card-less seat. */
  readonly renderPolicy: RenderPolicy;
  /** The raw, unmerged per-character theme override; null for a card-less seat. Chat never reads the themes
   *  table — the override/global/default cascade is a client concern. */
  readonly themeOverride: ThemeOverride | null;
  /** BG-C — the raw, unmerged per-character carried BACKGROUND source (the `themeOverride` twin); null for a
   *  card-less seat. The true-solo takeover + cascade are a client concern (the app-shell resolver). */
  readonly backgroundOverride: ThemeBackground | null;
  /** The card's display name + avatar; null for a human/agent seat, no host, or a gone card. */
  readonly card: { readonly name: string; readonly avatarAssetId: AssetId | null } | null;
}

/** Accepted tag identities resolved under the card owner's authority. The member-card read exposes
 * identities only to that owner and clamps guests to names. */
export type ResolveCharacterTagsOp = (params: {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
}) => Promise<readonly Pick<TagView, "id" | "name">[]>;

/** Resolves a roster member's full card-derived decoration in ONE read. `characterId: null` (a human/agent
 *  seat) or `ownerId: null` (no resolvable host) yields the bare global floor + a null card — fail-closed. */
export type ResolveSeatDecoOp = (params: { readonly ownerId: UserId | null; readonly characterId: CharacterId | null }) => Promise<SeatDeco>;

/** ONE human's read-visibility over ONE chat — membership AND the D16 canon floor as a SINGLE value, because
 *  they are one inseparable answer. `historyFloorSeq` is the INCLUSIVE `messages.seq` floor this viewer may
 *  read from (`NO_HISTORY_FLOOR` = 0 = unclamped); it is DERIVED by the one resolver
 *  (`substrate/auth/clamp::resolveHistoryFloorSeq`), never re-computed by the consumer. There is deliberately
 *  no "member: yes" projection without the floor — a consumer that only wants membership still receives the
 *  floor, so "forgot to clamp" is unrepresentable rather than merely discouraged. */
export interface ViewerVisibility {
  readonly role: ParticipantRole;
  readonly historyFloorSeq: HistoryFloorSeq;
  /** The parity-plus §3.6 / D106 hidden-content verdict for THIS viewer: `true` ⇒ they read hidden-class spans
   *  (`<lie>`/`<ofilter>`) verbatim — the host reveal plane; `false` ⇒ a member, whose canon must be
   *  hidden-stripped before any cross-domain consumer serves the body. DERIVED here from `role` via chat's ONE
   *  `viewerReadsHidden` home so a cross-domain consumer (the plugin realm) never re-derives `role === "host"`. */
  readonly readsHidden: boolean;
}

/** THE cross-domain viewer-visibility op (the D-ledger read-visibility entry). Any NON-chat domain that must
 *  decide "may this human see this chat's CONTENT" consumes this — never a membership read of its own, and
 *  never a second clamp home (a mirrored floor computation in another domain is the defect class the plugin
 *  fan-out already demonstrated).
 *
 *  `null` = NOT a present member (or no such chat — one leak-free answer, the `GetMembership` posture). `null`
 *  is the sentinel precisely BECAUSE the alternative (`{ member: false, historyFloorSeq: 0 }`) reads as
 *  "no floor in force" to a caller that forgets to test membership first: a floor of 0 means UNCLAMPED, so a
 *  non-member would inherit the widest possible visibility on the exact code path where the check was
 *  skipped. `null` fails CLOSED under `?.` / `if (v === null)` and cannot be misread as a permissive floor.
 *
 *  STANDALONE + principal-free (the `GetMembership`/`ExtractQuiet` precedent — the consumer's own authority
 *  gate runs around it) and compose-wired: `userId` is the VIEWER whose visibility is being resolved and MUST
 *  be a server-resolved identity, never a caller-supplied one (the injected-op caller-gate rule — an op whose
 *  params drop the caller is a latent cross-tenant hole). */
export type ResolveViewerVisibility = (chatId: ChatId, userId: UserId) => Promise<ViewerVisibility | null>;

export type ResolveSeatDecosOp = (params: {
  readonly ownerId: UserId;
  readonly characterIds: readonly CharacterId[];
}) => Promise<ReadonlyMap<CharacterId, SeatDeco>>;

/**
 * `requestTurn` — the NON-HUMAN turn seam. PRINCIPAL-FREE by design: it
 * is NOT on `ChatService` and never routed — it is an injected op the composition root hands automation's
 * `trigger_turn` arm and the Tier-2 plugin membrane's `turn.trigger` host-fn. The verb resolves the funding
 * host from the room itself (never a caller-supplied id), gates the initiator's membership, threads the origin
 * onto the reply slot, and runs the turn through the SAME engine path a human send clears — the per-chat turn
 * lock and the cascade-depth cap included. (The owner-consent and per-member budget belts this line used to
 * name left with the inference program §14 F13/F11; automation's own §3 rate gate is the surviving spend wall, and
 * it sits in the arm above this op.)
 */
export interface RequestTurnParams {
  readonly chatId: ChatId;
  /** The non-human origin stamped on the reply slot (`"automation"` | `"plugin"`) — the cascade guard's label
   *  (depth is the lever, not the label). A caller may not pass `"human"` here (see the verb's guard), and
   *  `"import"` names only slots the bulk-import seam wrote, never a requested turn. */
  readonly initiator: Exclude<TurnInitiator, "import">;
  /** The responsible human (D19): the rule AUTHOR / plugin INSTALLER. Owns attribution and abort rights and
   *  must be a PRESENT participant (else a leak-free NOT_FOUND). The room's frozen host funds and runs the
   *  turn. */
  readonly triggeredBy: UserId;
  /** The parent depth + 1. Stamped on the reply slot so the reply's events resolve
   *  their cascade depth; the verb REFUSES a value past `AUTOMATION_DEPTH_HARD_CAP` (the plugin-path belt —
   *  automation's dispatch gate already bounds its own path). */
  readonly automationDepth: number;
  /** Force the speaker; absent ⇒ normal arbitration. */
  readonly speakerCharacterId?: CharacterId | undefined;
  /** A one-turn guided steer (the rendered `guidedTemplate`) placed via GATHER→BUILD, exactly like a human
   *  send's `guided`. */
  readonly guided?: GuidedSteer | undefined;
  /** The binding actor whose own chat binding the turn folds before the funder's (an automation rule's). */
  readonly actor?: BindingActor | undefined;
  /** The clock the turn's time macros read. No viewer drives this turn, so the caller states its ruled zone:
   *  an automation rule's own stamped clock, else UTC. */
  readonly timeZone: IanaTimeZone;
}
export type RequestTurnOp = (params: RequestTurnParams) => Promise<TurnOutcome>;
