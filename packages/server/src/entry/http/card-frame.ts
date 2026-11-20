// The TRUST-GATED CARD-FRAME DOORWAY. `POST /api/card-frame` mints a frame handle from card bytes the
// caller's own session is already rendering; `GET /api/card-frame/:id` serves that document with ITS OWN
// Content-Security-Policy. The whole point is the second sentence: a `srcdoc` iframe INHERITS the app
// document's CSP, so a per-character trust grant can never widen `img-src` there — only a real response can
// (measured; the mechanism + the three browser facts it rests on are documented in `@orb/kit/card-frame`).
//
// ── THE TRUST BOUNDARY ───────────────────────────────────────────────────────────────────────────────────
// The mint body carries card BYTES, the viewer's theme and style tokens, and a POLICY SELECTOR (`chatId` +
// `characterId`). It never carries a policy: no token reaches the CSP, the sandbox or the script. The server
// resolves the selector through the MEMBERSHIP-GATED roster read and takes that participant's server-resolved
// `renderPolicy` — the same value `ParticipantView.renderPolicy` hands the client, produced by
// `resolveRenderPolicy` at compose, which is tighten-only against the deployment floor. A narrator row's selector is
// the host's synthetic group character, which holds no seat; it takes the room's narrator policy, the most restrictive
// among the present character seats (`resolveNarratorRenderPolicy`, the value `ChatDetail.narratorRender` carries).
// Every SELECTOR failure resolves to `CARD_FRAME_SAFE_FLOOR`: not a member, roster read threw, character
// absent from the room, `characterId: null`, `renderPolicy` absent on the row. The viewer's own settings (the
// script-consent input below) are read only when the install and the author's step already allow scripts; a failed
// read there gives that document the static posture, so one bad read never blanks a room.
//
//   • the MEDIA GRANT ⇐ `resolveCardMediaVerdict` (`@orb/contracts/chat`), the one rule the client's media notice
//     also reads: `https:` media only while the app-tier ceiling allows it AND the participant does not forbid it
//     (the ceiling read HERE, per mint, off the same live `getEffectiveConfig()` thunk the app-document CSP reads),
//     and `data:` images from Rich HTML up. Both are re-resolved on every SERVE and only ever narrowed (see the GET).
//   • the SCRIPT POSTURE ⇐ `resolveCardScriptVerdict`: the TOP step of that same ladder AND the install's step being
//     `interactive` AND the viewer's own `chat.runCardScripts` consent — `interactive` only when
//     ALL THREE say yes, `static` otherwise and on every selector failure. It selects which `CardFramePosture`
//     the response policy is built through and is echoed as `granted.interactive`. Since leg 3 this is a real capability: the interactive arm emits
//     `script-src 'unsafe-inline'` and the card's own scripts execute inside the opaque-origin sandbox.
//     What that does and does NOT reach — including residual R1, an unclosable WebRTC beacon — is measured
//     and recorded in `@orb/kit/card-frame`.
//   • a FORMING mint (`forming: true`, a panel of a reply still streaming) is capped after the selector resolves: the
//     static posture and no external media, whatever the selector grants, because the room has not kept those bytes and
//     a save-pass script, a stop string or an abort can still remove them. `data:` images keep the step's answer: they
//     fetch nothing. The cap is the grant the handle stores, so every serve keeps it (a serve only narrows). A forming
//     handle lives until a turn ends in its room, every account's at once: the stream it drew a panel of is over, and
//     the settled reply mints its own frame. ONLY A PRESENT MEMBER'S handle joins that release (`getMembership`): a
//     handle that vanished at a foreign room's turn end would tell its minter when that room's turns end. A
//     non-member's forming handle stays untagged and lives its TTL, and its mint answers exactly as a member's does,
//     because a refusal would itself answer the membership question. A second turn streaming beside the first in one room loses its forming
//     handles at the first one's end; its frames on screen keep their loaded documents, and a remount spends the one
//     re-mint.
//   • CARRIED AUTHORS (`carriedFrom`, the other characters whose stylesheets a framed reply carries) are resolved through
//     the same read, at mint and on every serve: external media loads only while each of them allows it too, so one
//     character's media setting never admits another's `url()`. An author the read cannot resolve allows none. They
//     narrow the media grant only: a stylesheet runs no script.
//
// ACCEPTED RESIDUAL, stated because it cannot be checked from here: a caller may name a TRUSTED (or an
// INTERACTIVE) sibling character for a card actually authored by a lesser one in the SAME
// room, and the frame is then built with the named character's policy. RE-WEIGHED at the leg-3 grant, since
// the blast radius stopped being "an image load" and became "that card's scripts run":
//   • no CHARACTER can reach it. Both live mint sites pass the message row's own `characterId` straight
//     through (`features/chat/components/message-row-parts.tsx`, `features/rpg/lib/archived-cards.ts`), so
//     the bytes and the selector come from the same server-supplied row. A model cannot choose a selector.
//   • reaching it requires posting a hand-crafted mint from the VIEWER'S OWN authenticated session — an
//     attacker who already has that has no need of a card frame. It stays self-attack, one rung louder.
// Closing it means resolving the AUTHOR from canon (a message read), which needs the display-macro/
// speaker-span pipeline to agree byte-for-byte with the stored body — noted, still not built.
//
// ── WHY THE HANDLES ARE PER-USER AND IN-PROCESS ──────────────────────────────────────────────────────────
// A handle is 128 bits of CSPRNG, bound to the minting `userId`, and lives in a capped in-process map. So a
// link an attacker crafts resolves in nobody's store but the victim's — and a foreign or unknown id is
// indistinguishable from an expired one (the `/api/blob` no-existence-leak precedent). Nothing persists:
// model-authored bytes never reach disk through this route.
//
// That store is `frame-handle-store.ts`, the ONE home it shares with the plugin frame: 128-bit ids, count AND byte
// ceilings (this doorway's are `CARD_FRAME_CEILINGS`, sized there for split replies), oldest-first eviction, a
// sliding 30-minute TTL, and the owner check as the last word.

import type { GetMembership, RenderPolicy } from "@orb/contracts/chat";
import {
  CARD_FRAME_MINT_BODY_MAX_BYTES,
  CARD_FRAME_MINTS_IN_FLIGHT,
  CARD_FRAME_ROUTE,
  cardFrameMintRequestSchema,
  cardFrameUrl,
  cardScriptsNeedViewerConsent,
  resolveCardMediaVerdict,
  resolveCardScriptVerdict,
} from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { CardFrameMediaPolicy, CardFramePosture } from "@orb/kit/card-frame";
import { buildCardFrameCsp, buildCardFrameDocument, CARD_FRAME_MISSING_ATTRIBUTE, CARD_FRAME_SAFE_FLOOR, cardFrameResponseHeaders } from "@orb/kit/card-frame";
import { DomainForbiddenError, DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import type { Clock } from "@orb/kit/time";
import type { Hono, MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { ChatService } from "#domain/chat";
import type { Logger } from "#foundation/observability";
import { getLog } from "#foundation/observability";
import { hasCsrfHeader } from "#infra/auth";
import type { PrincipalEnv } from "./contract/request-env.ts";
import { CARD_FRAME_CEILINGS, createFrameHandleStore, FRAME_HANDLE_SHAPE, FRAME_HANDLE_TTL_MS } from "./frame-handle-store.ts";
import type { OwnPolicyRegistrar, OwnPolicyReply } from "./security-headers.ts";

const OK = 200;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const BAD_REQUEST = 400;
const PAYLOAD_TOO_LARGE = 413;
const TOO_MANY_REQUESTS = 429;

/** The membership-gated author-policy read — the ONE authority for a card's render policy, a seat's or the room's
 *  narrator policy. Structural port so `entry/http` states exactly the slice it consumes (the `BlobAssetsPort` precedent). */
export interface CardFrameParticipantsPort {
  readonly resolveAuthorRenderPolicy: ChatService["resolveAuthorRenderPolicy"];
  /** The present-seat read. A forming handle joins its room's turn-end release only when the minter sits there. */
  readonly getMembership: GetMembership;
}

export interface CardFrameDeps {
  readonly participants: CardFrameParticipantsPort;
  /** The live app-tier external-media ceiling — the SAME read `securityHeaders` is built from. */
  readonly allowExternalMedia: () => boolean;
  /** The live app-tier INTERACTIVE-CARD ceiling (`installAllowsCardScripts` over `effectiveConfig`, floor TRUE).
   *  Read here per mint for the same reason `allowExternalMedia` is: `resolveRenderPolicy` already folded
   *  it into the ladder, and this is the boundary that must still hold if that resolver is ever weakened.
   *  It is the ONLY box-wide control over residual R1 (`@orb/kit/card-frame`), so it is read again on every
   *  SERVE of an interactive document: switching it off withdraws card scripts from the next frame load,
   *  even for a handle minted before the switch. */
  readonly installAllowsCardScripts: () => boolean;
  /** The VIEWER's own consent (`viewerRunsCardScripts`): may card scripts run in this caller's browser? Read per mint
   *  and per serve when the install and the author's step allow scripts, so turning it off reaches a handle minted
   *  before the switch, exactly as the deployment ceiling does. A rejection reads as no. */
  readonly viewerRunsCardScripts: (viewer: Principal) => Promise<boolean>;
  /** Hears each turn that ends in a room, completed or aborted; returns the unsubscribe. */
  readonly onTurnEnded: (listener: (chatId: ChatId) => void) => () => void;
  readonly now: Clock;
  readonly logger: Logger;
  /** Registers the served document's route, writes its policy and steps the app policy aside for its path. */
  readonly registerOwnPolicyRoute: OwnPolicyRegistrar;
}

/** The floor policy, used for every non-serving response so no card-frame reply is ever un-policied. Static
 *  posture: a miss serves OUR expiry notice, which is not any character's card and inherits no opt-in. */
export const CARD_FRAME_FLOOR_CSP = buildCardFrameCsp(CARD_FRAME_SAFE_FLOOR, "document", "static");

/** A body for the miss arm — a blank 404 inside an iframe reads as a broken card; this reads as a stale one.
 *  Identical for unknown / foreign / expired ids by construction (no existence leak). */
const MISS_DOC = buildCardFrameDocument({
  html: '<p style="font:14px system-ui;opacity:.6;padding:12px">This card frame expired. Reload to view it.</p>',
  css: undefined,
  themeTokens: undefined,
  styleTokens: undefined,
  fontFamily: undefined,
  // The frame says so on load, so a framed reply mints again rather than showing this notice as the reply.
  rootAttributes: { [CARD_FRAME_MISSING_ATTRIBUTE]: "" },
});

/** What ONE mint resolves from its selector: the media grants AND the document's script posture. Both come
 *  out of the same membership-gated roster read, and both fail closed together — a card the server cannot
 *  attribute gets the floor media policy AND the static posture, never one of the two. */
interface ResolvedFramePolicy {
  readonly media: CardFrameMediaPolicy;
  readonly posture: CardFramePosture;
}

/** The floor: no `data:`, no external media, and the static posture. Every failure arm returns exactly this. */
const FRAME_POLICY_FLOOR: ResolvedFramePolicy = { media: CARD_FRAME_SAFE_FLOOR, posture: "static" };

// The viewer's script consent, or no when it cannot be read: the document then serves static, and the read failure is
// an operator event rather than a blank card.
async function readViewerConsent(deps: CardFrameDeps, principal: Principal): Promise<boolean> {
  try {
    return await deps.viewerRunsCardScripts(principal);
  } catch (err) {
    getLog(deps.logger).warn({ err, userId: principal.userId }, "card-frame: viewer settings read failed, serving the static posture");
    return false;
  }
}

/** The selector a mint names and a named document keeps for its serves. */
interface FrameSelector {
  readonly chatId: ChatId;
  readonly characterId: CharacterId | null;
  readonly carriedFrom?: readonly CharacterId[] | undefined;
}

// One author's server-resolved policy in the room, or null when the caller cannot resolve it there.
async function authorPolicy(deps: CardFrameDeps, principal: Principal, chatId: ChatId, characterId: CharacterId): Promise<RenderPolicy | null> {
  // a LEAK-FREE COLLAPSE to the SAFE FLOOR, stated in the comment below — a non-participant throwing out of the membership gate and an unknown character must land on the identical restrictive policy, or the frame's permissiveness reveals chat membership. Every failure arm here tightens, never widens. Ends if the floor stops being the safe posture.
  try {
    return (await deps.participants.resolveAuthorRenderPolicy({ principal, chatId, characterId })) ?? null;
  } catch (error) {
    // A non-participant throws out of the membership gate. A foreigner learns nothing from the difference
    // between "not a member" and "no such character" — both are the floor. Any other failure is a fault.
    if (error instanceof DomainNotFoundError || error instanceof DomainForbiddenError) {
      return null;
    }
    throw error;
  }
}

// Whether every carried author lets external media load. A carried sheet's `url()` loads under the receiving document's
// grant, so the document takes the narrower of its own grant and each author's (UI-Theming-and-Content §12.2). An author
// the caller cannot resolve in the room allows none.
async function carriedAuthorsAllowMedia(deps: CardFrameDeps, principal: Principal, selector: FrameSelector): Promise<boolean> {
  for (const characterId of selector.carriedFrom ?? []) {
    const policy = await authorPolicy(deps, principal, selector.chatId, characterId);
    if (policy === null || !resolveCardMediaVerdict({ installForbids: !deps.allowExternalMedia(), policy }).external.loads) {
      return false;
    }
  }
  return true;
}

/** Resolve the frame's media policy + posture from the SELECTOR. Every failure arm returns the safe floor. */
async function resolvePolicy(deps: CardFrameDeps, principal: Principal, selector: FrameSelector): Promise<ResolvedFramePolicy> {
  if (selector.characterId === null) {
    return FRAME_POLICY_FLOOR;
  }
  const policy = await authorPolicy(deps, principal, selector.chatId, selector.characterId);
  if (policy === null) {
    return FRAME_POLICY_FLOOR;
  }
  // The deployment ceilings are passed HERE as well as folded inside `resolveRenderPolicy`: this is the boundary that
  // must hold if that resolver is ever weakened. The step is the server's own membership-gated roster value — the
  // mint body cannot name it (the request is a SELECTOR, never a policy, and `strictObject` rejects a smuggled key).
  const media = resolveCardMediaVerdict({ installForbids: !deps.allowExternalMedia(), policy });
  const installAllows = deps.installAllowsCardScripts();
  // The viewer's consent is asked only when the other two allow scripts; a failed read is a no, so the document
  // still serves, static, rather than erroring (D294).
  const viewerRuns = cardScriptsNeedViewerConsent({ installAllows, step: policy.htmlTrust }) && (await readViewerConsent(deps, principal));
  // Carried stylesheets are CSS only, so they narrow the media grant and never the posture or `data:` images, which
  // fetch nothing.
  const externalMedia = media.external.loads && (await carriedAuthorsAllowMedia(deps, principal, selector));
  return {
    media: { allowExternalMedia: externalMedia, allowInlineData: media.inlineData },
    // THE PER-DOCUMENT POSTURE SELECTION: the interactive posture emits `script-src 'unsafe-inline'` and the card's own
    // scripts RUN. `resolveCardScriptVerdict` is the one home of the rule.
    posture: resolveCardScriptVerdict({ installAllows, step: policy.htmlTrust, viewerRuns }).runs ? "interactive" : "static",
  };
}

// A streaming panel's cap: no script and no request off the box, whatever the selector resolved.
function capForming(policy: ResolvedFramePolicy): ResolvedFramePolicy {
  return { media: { allowExternalMedia: false, allowInlineData: policy.media.allowInlineData }, posture: "static" };
}

/** Register `POST /api/card-frame` (mint) + `GET /api/card-frame/:id` (serve) on `app`. */
export function registerCardFrame(app: Hono<PrincipalEnv>, deps: CardFrameDeps): void {
  const store = createFrameHandleStore(deps.now, CARD_FRAME_CEILINGS);
  deps.onTurnEnded(store.dropForming);
  const mintsInFlight = new Map<UserId, number>();

  // THE IN-FLIGHT GATE runs BEFORE the body limit, because the body limit buffers a chunked body whole before the
  // handler runs. Past the bound the mint answers 429 without reading a byte of its body. A request with no principal
  // passes through to the handler's own 401.
  const mintGate: MiddlewareHandler<PrincipalEnv> = async (c, next) => {
    const principal = c.get("principal");
    if (principal === null) {
      await next();
      return c.res;
    }
    const inFlight = mintsInFlight.get(principal.userId) ?? 0;
    if (inFlight >= CARD_FRAME_MINTS_IN_FLIGHT) {
      return c.body(null, TOO_MANY_REQUESTS);
    }
    mintsInFlight.set(principal.userId, inFlight + 1);
    try {
      await next();
    } finally {
      const left = (mintsInFlight.get(principal.userId) ?? 1) - 1;
      if (left > 0) {
        mintsInFlight.set(principal.userId, left);
      } else {
        mintsInFlight.delete(principal.userId);
      }
    }
    return c.res;
  };

  app.post(CARD_FRAME_ROUTE, mintGate, bodyLimit({ maxSize: CARD_FRAME_MINT_BODY_MAX_BYTES, onError: (c) => c.body(null, PAYLOAD_TOO_LARGE) }), async (c) => {
    const principal = c.get("principal");
    if (principal === null) {
      return c.body(null, UNAUTHORIZED);
    }
    // The same custom-header CSRF belt the auth routes use: a cross-site form POST cannot set it, and the
    // mint is the only state-adding verb on this route pair.
    if (!hasCsrfHeader(c.req.raw.headers)) {
      return c.json({ error: "missing CSRF header" }, FORBIDDEN);
    }
    let raw: unknown;
    // the CLIENT is the owner and the 400 is the surface — an unparseable request body is the caller's error, answered with `invalid JSON body`, exactly as the schema-parse failure two lines below is. A malformed inbound payload is not an operator event. Ends if body decoding gains a server-side fault worth distinguishing from bad input.
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, BAD_REQUEST);
    }
    const parsed = cardFrameMintRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: "invalid card-frame mint" }, BAD_REQUEST);
    }
    const body = parsed.data;
    const selector: FrameSelector = { chatId: body.chatId, characterId: body.characterId, carriedFrom: body.carriedFrom };
    const resolved = await resolvePolicy(deps, principal, selector);
    const policy = body.forming === true ? capForming(resolved) : resolved;
    // The clamps inside `buildCardFrameDocument` run on OUR side of the boundary — the client's own clamp
    // is defense in depth for the srcdoc floor, never the reason these values are safe here.
    const doc = buildCardFrameDocument({
      html: body.html,
      css: body.css,
      themeTokens: body.themeTokens,
      // The schema admitted only the closed slice, each value past its own grammar; this clamp still runs
      // here and is the one that bounds the root size to the appearance range.
      styleTokens: body.styleTokens,
      fontFamily: body.fontFamily,
      rootAttributes: body.rootAttributes,
    });
    // A document minted for a named character keeps its selector and the grants it resolved beside it, so a
    // SERVE can withdraw any of them (see the GET below). A null selector resolves to the floor, which has
    // nothing left to withdraw.
    const grant =
      body.characterId === null
        ? {}
        : { grant: { chatId: body.chatId, characterId: body.characterId, carriedFrom: body.carriedFrom, media: policy.media, posture: policy.posture } };
    // The selector falls to the floor for a non-member by design, so the turn-end tag needs its own present-seat read.
    const sitsInRoom = body.forming === true && (await deps.participants.getMembership(body.chatId, principal.userId)) !== null;
    const id = store.put({
      userId: principal.userId,
      doc,
      csp: buildCardFrameCsp(policy.media, "document", policy.posture),
      ...grant,
      ...(sitsInRoom ? { formingIn: body.chatId } : {}),
      expiresAt: deps.now() + FRAME_HANDLE_TTL_MS,
    });
    return c.json({
      url: cardFrameUrl(id),
      expiresInMs: FRAME_HANDLE_TTL_MS,
      granted: { externalMedia: policy.media.allowExternalMedia, inlineData: policy.media.allowInlineData, interactive: policy.posture === "interactive" },
    });
  });

  const served = (status: typeof OK | typeof NOT_FOUND, body: string, policy: string): OwnPolicyReply => ({
    kind: "document",
    status,
    body,
    headers: cardFrameResponseHeaders(),
    policy,
  });
  deps.registerOwnPolicyRoute(app, "cardFrameDocument", async (c, id) => {
    const principal = c.get("principal");
    if (principal === null) {
      return { kind: "refusal", status: UNAUTHORIZED };
    }
    const entry = FRAME_HANDLE_SHAPE.test(id) ? store.take(id, principal.userId) : undefined;
    if (entry === undefined) {
      return served(NOT_FOUND, MISS_DOC, CARD_FRAME_FLOOR_CSP);
    }
    // THE REVOCATION. The client memoizes a handle per card body for the tab's life, so a grant decided
    // only at mint would outlive an admin switching interactive cards or external media off, a host moving
    // the character to a lower rung or forbidding its media, the viewer leaving the room, or the viewer
    // turning card scripts off. A named-character document is therefore re-resolved on every serve, through
    // the same membership-gated read as the mint, and served under the narrower of what it was minted with
    // and what it would mint now. A serve can only withdraw a grant, never add one.
    if (entry.grant !== undefined) {
      const current = await resolvePolicy(deps, principal, entry.grant);
      const media: CardFrameMediaPolicy = {
        allowExternalMedia: entry.grant.media.allowExternalMedia && current.media.allowExternalMedia,
        allowInlineData: entry.grant.media.allowInlineData && current.media.allowInlineData,
      };
      const posture: CardFramePosture = entry.grant.posture === "interactive" && current.posture === "interactive" ? "interactive" : "static";
      return served(OK, entry.doc, buildCardFrameCsp(media, "document", posture));
    }
    return served(OK, entry.doc, entry.csp);
  });
}
