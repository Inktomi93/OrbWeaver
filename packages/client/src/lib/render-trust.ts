// The render-trust resolver — pure, zero-I/O, the one place the per-message render trust tier +
// external-media gate are decided. trust="trusted" iff the message is the viewer's own input, or the
// authoring character sits above the floor on the server-resolved renderPolicy.htmlTrust LADDER (the ONE
// ordered axis, contracts/chat: untrusted < trusted < interactive); else "untrusted" (another user's
// input, a character on the untrusted step, and any row with no resolved policy). External media is a separate
// axis. Both read the server-resolved ParticipantView.renderPolicy; absent ⇒ fail closed. A plain (tierA) row's
// verdict — which setting holds it plain and whether this viewer may change it — is read here off the same policy,
// so the notice that names a setting can never disagree with the tier it explains.
//
// Homed in lib/ (the cross-cutting display seams, beside `message-render`) rather than features/chat:
// TWO features render the same authored content — chat's transcript rows and the rpg panel's card
// archive (Scene "Cards" / Journal) — and a cross-feature RUNTIME import is banned, so a second home
// here would mean a second spelling of a SECURITY verdict.

import type { DeploymentRenderPolicy, ParticipantView, RenderPolicy } from "@orb/contracts/chat";
import { rendersTrustedHtml } from "@orb/contracts/chat";
import type { CharacterId, UserId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";

const RENDER_TRUSTS = ["trusted", "untrusted"] as const;
type RenderTrust = (typeof RENDER_TRUSTS)[number];
const CARD_TIERS = ["tierA", "tierB"] as const;
/** The docs/law/UI-Theming-and-Content.md §12.2 card render tiers. `tierA` = the inert sanitized allowlist in the main DOM;
 *  `tierB` = the sandboxed `ImmersiveCard` mini-UI that may carry the card's own CSS. */
type CardTier = (typeof CARD_TIERS)[number];

// Unresolved character policy fails closed; deployment defaults are resolved separately below.
const SAFE_FLOOR: RenderPolicy = { htmlTrust: "untrusted", forbidExternalMedia: true };

/** The same strictness one tier DOWN: the DEPLOYMENT pair a per-character override resolves against, used
 *  while `/api/auth/config` has not landed (`data/auth-config.ts`'s `useRenderPolicyFloor`). Kept beside
 *  {@link SAFE_FLOOR} because they are the same decision said at two tiers, and a second spelling of a
 *  fail-closed default is how one of them drifts permissive. */
export const DEPLOYMENT_FLOOR: DeploymentRenderPolicy = { trustHtml: false, forbidExternalMedia: true, allowInteractiveCards: false };

export interface RowRenderPolicy {
  readonly trust: RenderTrust;
  readonly allowExternal: boolean;
  /** The §4.8 lenient naked-HTML wrap gate — a CHAT-level verdict (game chat + `features.immersiveHtml`),
   *  carried on the row policy so the block projection reads ONE render-policy object. False by default:
   *  outside a card-teaching game, raw HTML stays literal text / a code block. */
  readonly lenientCards: boolean;
  /** The `appearance.colorQuotedSpeech` pref, carried on the SAME render-policy object the body arms already
   *  read (the `lenientCards` precedent) rather than a parallel prop down four render helpers. Default ON —
   *  it matches the contract default, so a mount that threads no pref renders what the settings say. */
  readonly colorQuotes: boolean;
  /** The CARD render tier (docs/law/UI-Theming-and-Content.md §12.2), resolved HERE because it has TWO independent consent axes and this
   *  file is the one trust authority — a second spelling elsewhere would be a second spelling of a security
   *  verdict, the same reason `trust` itself lives here.
   *
   *  `tierB` (the sandboxed ImmersiveCard, card CSS applied) when EITHER consent is present:
   *   1. the AUTHOR is trusted — the viewer's own input, or a character at or above `trusted`, read off
   *      the ONE ordered `renderPolicy.htmlTrust` ladder (`rendersTrustedHtml`), or
   *   2. the ROOM consented — a game chat with `features.immersiveHtml` ON (`lenientCards`). Turning that
   *      switch on is what makes the engine TEACH the model to emit `:::card` fences; a room that asks for
   *      cards and then refuses to render them is a toggle that lies. The host flipping it IS the consent.
   *
   *  `tierA` (the default inert allowlist — no `<style>`, no inline `style=`) otherwise. */
  readonly cardTier: CardTier;
  /** Whose content a `tierA` row is and what its own policy says, for the plain-content notice; absent on `tierB`.
   *  {@link resolvePlainVerdict} turns it into the reason and the remedy once the viewer's standing is read. */
  readonly plain?: PlainSubject | undefined;
}

/** What makes a `tierA` row plain, read off the same policy the tier came from. */
const PLAIN_REASONS = [
  // The character's own HTML setting is Plain text.
  "character",
  // The character inherits the install default, and the install renders HTML as plain.
  "install",
  // Another person wrote the row: no setting renders someone else's HTML.
  "member",
  // No seated character's policy covers the row, so it renders at the fail-closed floor.
  "unattributed",
] as const;
export type PlainReason = (typeof PLAIN_REASONS)[number];

/** Where the viewer can turn rich content on for this row, or that they cannot. */
const PLAIN_REMEDIES = [
  // The character's Trust tab: the viewer hosts the room, so the character is theirs.
  "character-trust",
  // The System section's media and trust settings: the viewer is an admin.
  "system-trust",
  // Only the room's host can change it.
  "ask-host",
  // Nothing turns it on.
  "none",
] as const;
export type PlainRemedy = (typeof PLAIN_REMEDIES)[number];

/** A `tierA` row's author as its policy resolved: a seated character with a resolved policy, another person, or
 *  neither (the fail-closed floor). */
export interface PlainSubject {
  readonly author: "character" | "member" | "unattributed";
  /** The character whose setting it is; null when no character's setting applies. */
  readonly characterId: CharacterId | null;
  /** That character's name in this room, when the room names one. */
  readonly characterName: string | undefined;
  /** Whether the viewer hosts the room. Characters in a room are the host's (D64), so only the host can edit one. */
  readonly viewerIsHost: boolean;
}

export interface PlainVerdict {
  readonly reason: PlainReason;
  readonly remedy: PlainRemedy;
  readonly characterId: CharacterId | null;
  readonly characterName: string | undefined;
}

/** What the plain-content verdict reads beyond the row: the install's render defaults as `/api/auth/config` served
 *  them, and whether the viewer may open the admin settings. */
export interface ViewerRenderStanding {
  readonly deployment: DeploymentRenderPolicy;
  readonly isAdmin: boolean;
}

export interface ResolveRowRenderPolicyInput {
  readonly role: MessageRole;
  readonly authorUserId: UserId | null;
  readonly characterId: CharacterId | null;
  readonly viewerUserId: UserId | null;
  readonly participants?: ReadonlyMap<CharacterId, ParticipantView> | undefined;
  /** The chat-level §4.8 lenient-wrap verdict the surface resolved (game + immersiveHtml). Absent ⇒ off. */
  readonly lenientHtmlCards?: boolean | undefined;
  /** The user's quoted-speech tint pref; absent ⇒ ON (the contract default). */
  readonly colorQuotedSpeech?: boolean | undefined;
  /** Whether the viewer hosts the room (`ChatDetail.viewerIsHost`); absent ⇒ not. */
  readonly viewerIsHost?: boolean | undefined;
}

// Why an untrusted character policy is untrusted. `resolveRenderPolicy` (`@orb/contracts/chat`) renders HTML when the
// override says so, else when the install says so, and an override that inherits on both columns resolves to the
// interactive rung while the install allows interactive cards. So with either install switch up, an untrusted step can
// only be the character's own Plain text. With both down the install default is the cause; a character set to Plain
// text on top of it reads the same here, and the notice moves to the character once the install default is on.
function plainReason(author: PlainSubject["author"], deployment: DeploymentRenderPolicy): PlainReason {
  if (author !== "character") {
    return author;
  }
  return deployment.trustHtml || deployment.allowInteractiveCards ? "character" : "install";
}

function plainRemedy(reason: PlainReason, isHost: boolean, isAdmin: boolean): PlainRemedy {
  switch (reason) {
    case "character":
      return isHost ? "character-trust" : "ask-host";
    case "install":
      // The install default is the admin's; a host who is not an admin can still give their own character Rich HTML.
      if (isAdmin) {
        return "system-trust";
      }
      return isHost ? "character-trust" : "ask-host";
    case "member":
    case "unattributed":
      return "none";
    default:
      return assertNeverReason(reason);
  }
}

function assertNeverReason(reason: never): never {
  throw new Error(`render-trust: unhandled plain reason ${String(reason)}`);
}

/** Which setting holds a `tierA` row plain and where this viewer can change it. */
export function resolvePlainVerdict(subject: PlainSubject, standing: ViewerRenderStanding): PlainVerdict {
  const reason = plainReason(subject.author, standing.deployment);
  return {
    reason,
    remedy: plainRemedy(reason, subject.viewerIsHost, standing.isAdmin),
    characterId: subject.characterId,
    characterName: subject.characterName,
  };
}

export function resolveRowRenderPolicy(input: ResolveRowRenderPolicyInput): RowRenderPolicy {
  const { role, authorUserId, characterId, viewerUserId, participants } = input;

  const seat = characterId === null ? undefined : participants?.get(characterId);
  const resolved = seat?.renderPolicy;
  const policy: RenderPolicy = resolved ?? SAFE_FLOOR;

  const isOwnUserMessage = role === "user" && authorUserId !== null && authorUserId === viewerUserId;

  const trust: RenderTrust = isOwnUserMessage || rendersTrustedHtml(policy.htmlTrust) ? "trusted" : "untrusted";
  const lenientCards = input.lenientHtmlCards === true;
  // EITHER consent grants the sandboxed tier — see the field doc. Both come from the host or the box (the
  // character's resolved step, or the room's immersive-HTML switch); neither is anything the MODEL can assert.
  const cardTier: CardTier = trust === "trusted" || lenientCards ? "tierB" : "tierA";
  const base = { trust, allowExternal: !policy.forbidExternalMedia, lenientCards, colorQuotes: input.colorQuotedSpeech !== false, cardTier };
  if (cardTier === "tierB") {
    return base;
  }
  let author: PlainSubject["author"] = "unattributed";
  if (role === "user") {
    author = "member";
  } else if (resolved !== undefined) {
    author = "character";
  }
  return {
    ...base,
    plain: {
      author,
      characterId: author === "character" ? characterId : null,
      characterName: seat?.displayName,
      viewerIsHost: input.viewerIsHost === true,
    },
  };
}
