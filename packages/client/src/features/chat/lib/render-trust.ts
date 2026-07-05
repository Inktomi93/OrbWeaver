// The RENDER-TRUST resolver (D44 §12.0 — "two trust tiers, untrusted BY DEFAULT"). Pure, zero-I/O — the
// ONE place the per-message render trust tier + external-media gate are decided at the client boundary, so
// `message-row.tsx` never hand-picks `trust` (the pre-#25 hardcoded `trust="trusted"` was the security
// hole: it rendered LLM/imported/other-participant content as trusted — an indirect-prompt-injection +
// tracking-pixel surface). The rule mirrors ST's model (untrusted default + an explicit opt-in):
//
//   trust = "trusted"  IFF
//     • the message is the VIEWER's OWN input — role==="user" AND authorUserId === the viewing principal
//       (self-authored; the box owner's own text is trusted by definition), OR
//     • the authoring character opted in — its RESOLVED `renderPolicy.trustHtml` is true (a per-character
//       OR deployment-global escalation, resolved server-side as `override ?? global`, D44 §12.0).
//   else "untrusted"  (the safe default for ALL assistant/LLM, other-participant, and system content).
//
// External media is a SEPARATE axis (a trusted message can still gate external media): `allowExternal`
// derives from the authoring participant's resolved `renderPolicy.forbidExternalMedia`. Both axes read the
// SERVER-resolved `ParticipantView.renderPolicy` (never re-resolved here); when it is absent (a partial
// payload / a not-yet-wired producer) the resolver fails CLOSED to the safe floor.

import type { ParticipantView, RenderPolicy } from "@orb/contracts/chat";
import type { CharacterId, UserId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";

/** The render trust tier fed to `@orb/ui/markdown` + the html-card dispatch (file-local — the exported
 *  surface is the `RowRenderPolicy` shape + the resolver; the union rides the interface field). */
type RenderTrust = "trusted" | "untrusted";

/** The safe floor (D44 §12.0 fail-closed): untrusted rendering + external media GATED (click-to-load). Used
 *  whenever no server-resolved `renderPolicy` is available for the authoring participant. */
const SAFE_FLOOR: RenderPolicy = { trustHtml: false, forbidExternalMedia: true };

/** The resolved per-row render decision: which markdown/html-card trust tier, and whether external media
 *  may auto-load (vs the click-to-load gate). */
export interface RowRenderPolicy {
  readonly trust: RenderTrust;
  /** `true` ⇒ external (http/https) media may load; `false` ⇒ `<MessageMedia>` shows the click-to-load
   *  placeholder (the load itself is the tracking-pixel/exfil — D44 §12.3). */
  readonly allowExternal: boolean;
}

export interface ResolveRowRenderPolicyInput {
  readonly role: MessageRole;
  /** The server-stamped acting principal who authored the message (the real "who said it" — distinct from
   *  the presentation `personaId`). Null for legacy/system rows. */
  readonly authorUserId: UserId | null;
  /** The authoring character (assistant rows) — the key into the resolved-policy roster. */
  readonly characterId: CharacterId | null;
  /** The viewing principal (the "own-authored" comparand) — the first-human-seat proxy until #50. */
  readonly viewerUserId: UserId | null;
  /** The roster keyed by character id (carries each character's server-resolved `renderPolicy`). */
  readonly participants?: ReadonlyMap<CharacterId, ParticipantView> | undefined;
}

/** Resolve one message row's render trust + media gate (D44 §12.0 — untrusted by default; see file head). */
export function resolveRowRenderPolicy(input: ResolveRowRenderPolicyInput): RowRenderPolicy {
  const { role, authorUserId, characterId, viewerUserId, participants } = input;

  // The authoring character's SERVER-resolved policy (assistant rows). Fail closed to the safe floor when
  // the character isn't in the roster or the payload carried no resolved policy.
  const policy: RenderPolicy =
    (characterId === null ? undefined : participants?.get(characterId)?.renderPolicy) ?? SAFE_FLOOR;

  // "Own input" = a user-role message authored by the viewing principal. A null viewer (no human seat) or a
  // null authorUserId can NEVER match — so an unauthenticated/foreign row stays untrusted (fail closed).
  const isOwnUserMessage =
    role === "user" && authorUserId !== null && authorUserId === viewerUserId;

  const trust: RenderTrust = isOwnUserMessage || policy.trustHtml ? "trusted" : "untrusted";
  return { trust, allowExternal: !policy.forbidExternalMedia };
}
