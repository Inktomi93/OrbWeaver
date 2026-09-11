// The TRUST-GATED CARD-FRAME DOORWAY. `POST /api/card-frame` mints a frame handle from card bytes the
// caller's own session is already rendering; `GET /api/card-frame/:id` serves that document with ITS OWN
// Content-Security-Policy. The whole point is the second sentence: a `srcdoc` iframe INHERITS the app
// document's CSP, so a per-character trust grant can never widen `img-src` there — only a real response can
// (measured; the mechanism + the three browser facts it rests on are documented in `@orb/kit/card-frame`).
//
// ── THE TRUST BOUNDARY ───────────────────────────────────────────────────────────────────────────────────
// The mint body carries card BYTES and a POLICY SELECTOR (`chatId` + `characterId`). It never carries a
// policy. The server resolves the selector through the MEMBERSHIP-GATED roster read and takes that
// participant's server-resolved `renderPolicy` — the same value `ParticipantView.renderPolicy` hands the
// client, produced by `resolveRenderPolicy` at compose, which is tighten-only against the deployment floor.
// Every failure resolves to `CARD_FRAME_SAFE_FLOOR`: not a member, roster read threw, character absent from
// the room, `characterId: null`, `renderPolicy` absent on the row. Fail closed, every arm.
//
//   • `allowExternalMedia` ⇐ the app-tier `forbidExternalMedia` ceiling AND the participant's verdict. The
//     ceiling is read HERE, per mint, off the same live `getEffectiveConfig()` thunk the app-document CSP
//     reads — one deployment ceiling, two consumers, and the frame can never out-vote it.
//   • `allowInlineData` ⇐ the participant's HTML-TRUST LADDER at or above `trusted`. This is the door:
//     `data:` images for cards authored by a character the HOST opted into (the same consent D44 uses to
//     grant the tierB sandbox).
//   • the SCRIPT POSTURE ⇐ the TOP step of that same ladder AND the deployment `allowInteractiveCards`
//     ceiling (#111 legs 1+3) — `interactive` only when BOTH say yes, `static` otherwise and on every
//     failure arm. It selects which `CardFramePosture` the response policy is built through and is echoed
//     as `granted.interactive`. Since leg 3 this is a real capability: the interactive arm emits
//     `script-src 'unsafe-inline'` and the card's own scripts execute inside the opaque-origin sandbox.
//     What that does and does NOT reach — including residual R1, an unclosable WebRTC beacon — is measured
//     and recorded in `@orb/kit/card-frame`.
//
// ACCEPTED RESIDUAL, stated because it cannot be checked from here: a caller may name a TRUSTED (or, since
// #111 leg 3, an INTERACTIVE) sibling character for a card actually authored by a lesser one in the SAME
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
// That store is `frame-handle-store.ts` — the ONE home since U7 gave it a second doorway (the plugin frame).
// Its behaviour here is unchanged: same 128-bit ids, same count AND byte ceilings, same oldest-first eviction,
// same sliding 30-minute TTL, same owner check as the last word. This file's own tests are the proof of that.

import type { ParticipantView } from "@orb/contracts/chat";
import {
  allowsInteractiveCards,
  CARD_FRAME_MINT_BODY_MAX_BYTES,
  CARD_FRAME_ROUTE,
  cardFrameMintRequestSchema,
  cardFrameUrl,
  rendersTrustedHtml,
} from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { CardFrameMediaPolicy, CardFramePosture } from "@orb/kit/card-frame";
import { buildCardFrameCsp, buildCardFrameDocument, CARD_FRAME_SAFE_FLOOR } from "@orb/kit/card-frame";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { hasCsrfHeader } from "#infra/auth";
import type { PrincipalEnv } from "./blob.ts";
import { createFrameHandleStore, FRAME_HANDLE_SHAPE, FRAME_HANDLE_TTL_MS } from "./frame-handle-store.ts";

const OK = 200;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const BAD_REQUEST = 400;
const PAYLOAD_TOO_LARGE = 413;

const HTML_MIME = "text/html; charset=utf-8";

/** The membership-gated participant read — the ONE authority for a card's render policy. Structural port
 *  so `entry/http` states exactly the slice it consumes (the `BlobAssetsPort` precedent). */
export interface CardFrameParticipantsPort {
  readonly listParticipants: (params: { readonly principal: Principal; readonly chatId: ChatId }) => Promise<readonly ParticipantView[]>;
}

export interface CardFrameDeps {
  readonly participants: CardFrameParticipantsPort;
  /** The live app-tier external-media ceiling — the SAME read `securityHeaders` is built from. */
  readonly allowExternalMedia: () => boolean;
  /** The live app-tier INTERACTIVE-CARD ceiling (`effectiveConfig.allowInteractiveCards`, floor FALSE).
   *  Read here per mint for the same reason `allowExternalMedia` is: `resolveRenderPolicy` already folded
   *  it into the ladder, and this is the boundary that must still hold if that resolver is ever weakened.
   *  It is the ONLY control over residual R1 (`@orb/kit/card-frame`), so it gets two belts, not one. */
  readonly allowInteractiveCards: () => boolean;
  readonly now: () => number;
}

/** The frame response's non-CSP siblings. `no-store` because the document holds one viewer's card bytes;
 *  `nosniff` because the body is attacker-influenced markup and must never be re-typed by a sniffing
 *  browser; `no-referrer` so a permitted external image fetch cannot carry our URL anywhere. */
function frameHeaders(csp: string): Record<string, string> {
  return {
    "Content-Type": HTML_MIME,
    "Content-Security-Policy": csp,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
}

/** The floor policy, used for every non-serving response so no card-frame reply is ever un-policied. Static
 *  posture: a miss serves OUR expiry notice, which is not any character's card and inherits no opt-in. */
const FLOOR_CSP = buildCardFrameCsp(CARD_FRAME_SAFE_FLOOR, "document", "static");

/** A body for the miss arm — a blank 404 inside an iframe reads as a broken card; this reads as a stale one.
 *  Identical for unknown / foreign / expired ids by construction (no existence leak). */
const MISS_DOC = buildCardFrameDocument({
  html: '<p style="font:14px system-ui;opacity:.6;padding:12px">This card frame expired. Reload to view it.</p>',
  css: undefined,
  themeTokens: undefined,
  styleTokens: undefined,
  fontFamily: undefined,
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

/** Resolve the frame's media policy + posture from the SELECTOR. Every failure arm returns the safe floor. */
async function resolvePolicy(
  deps: CardFrameDeps,
  principal: Principal,
  selector: { readonly chatId: ChatId; readonly characterId: CharacterId | null },
): Promise<ResolvedFramePolicy> {
  if (selector.characterId === null) {
    return FRAME_POLICY_FLOOR;
  }
  let participants: readonly ParticipantView[];
  // @orb-waive caught-failure-ownership(catch): a LEAK-FREE COLLAPSE to the SAFE FLOOR, stated in the comment below — a non-participant throwing out of the membership gate and an unknown character must land on the identical restrictive policy, or the frame's permissiveness reveals chat membership. Every failure arm here tightens, never widens. Ends if the floor stops being the safe posture.
  try {
    participants = await deps.participants.listParticipants({ principal, chatId: selector.chatId });
  } catch {
    // A non-participant throws out of the membership gate. A foreigner learns nothing from the difference
    // between "not a member" and "no such character" — both are the floor.
    return FRAME_POLICY_FLOOR;
  }
  const policy = participants.find((p) => p.characterId === selector.characterId)?.renderPolicy;
  if (policy === undefined) {
    return FRAME_POLICY_FLOOR;
  }
  return {
    media: {
      // Deployment ceiling AND the per-character verdict — tighten-only, and the ceiling is re-applied HERE
      // even though `resolveRenderPolicy` already folded it in: this is the boundary that must hold if that
      // resolver is ever weakened.
      allowExternalMedia: deps.allowExternalMedia() && !policy.forbidExternalMedia,
      // The `data:` door opens from the RENDER step up — `interactive` is above it on the one ordered
      // ladder, so an interactive card is a trusted card by construction and cannot lose the door.
      allowInlineData: rendersTrustedHtml(policy.htmlTrust),
    },
    // THE PER-DOCUMENT POSTURE SELECTION (#111 leg 1), now a real capability (leg 3): the interactive arm
    // emits `script-src 'unsafe-inline'` and the card's own scripts RUN. Read through the ladder's one
    // predicate rather than a second boolean, off the server's own membership-gated roster value — the mint
    // body cannot name it (the request is a SELECTOR, never a policy, and `strictObject` rejects a smuggled
    // key outright). The deployment ceiling is re-applied HERE as well as inside `resolveRenderPolicy`, the
    // `allowExternalMedia` shape exactly: two belts on the axis whose residual has no third one.
    posture: deps.allowInteractiveCards() && allowsInteractiveCards(policy.htmlTrust) ? "interactive" : "static",
  };
}

/** Register `POST /api/card-frame` (mint) + `GET /api/card-frame/:id` (serve) on `app`. */
export function registerCardFrame(app: Hono<PrincipalEnv>, deps: CardFrameDeps): void {
  const store = createFrameHandleStore(deps.now);

  app.post(CARD_FRAME_ROUTE, bodyLimit({ maxSize: CARD_FRAME_MINT_BODY_MAX_BYTES, onError: (c) => c.body(null, PAYLOAD_TOO_LARGE) }), async (c) => {
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
    // @orb-waive caught-failure-ownership(catch): the CLIENT is the owner and the 400 is the surface — an unparseable request body is the caller's error, answered with `invalid JSON body`, exactly as the schema-parse failure two lines below is. A malformed inbound payload is not an operator event. Ends if body decoding gains a server-side fault worth distinguishing from bad input.
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
    const policy = await resolvePolicy(deps, principal, { chatId: body.chatId, characterId: body.characterId });
    // The clamps inside `buildCardFrameDocument` run on OUR side of the boundary — the client's own clamp
    // is defense in depth for the srcdoc floor, never the reason these values are safe here.
    const doc = buildCardFrameDocument({
      html: body.html,
      css: body.css,
      themeTokens: body.themeTokens,
      // `undefined`: the CHAT card mint carries no non-color slice (#799 widened the PLUGIN frame's
      // injection, not the card's). Named rather than omitted — `CardFrameContent` has no optional fields,
      // so a new slot is a decision every construction site is forced to take.
      styleTokens: undefined,
      fontFamily: body.fontFamily,
    });
    const id = store.put({
      userId: principal.userId,
      doc,
      csp: buildCardFrameCsp(policy.media, "document", policy.posture),
      expiresAt: deps.now() + FRAME_HANDLE_TTL_MS,
    });
    return c.json({
      url: cardFrameUrl(id),
      expiresInMs: FRAME_HANDLE_TTL_MS,
      granted: { externalMedia: policy.media.allowExternalMedia, inlineData: policy.media.allowInlineData, interactive: policy.posture === "interactive" },
    });
  });

  app.get(`${CARD_FRAME_ROUTE}/:id`, (c) => {
    const principal = c.get("principal");
    if (principal === null) {
      return c.body(null, UNAUTHORIZED);
    }
    const id = c.req.param("id");
    const entry = FRAME_HANDLE_SHAPE.test(id) ? store.take(id, principal.userId) : undefined;
    if (entry === undefined) {
      return c.body(MISS_DOC, NOT_FOUND, frameHeaders(FLOOR_CSP));
    }
    return c.body(entry.doc, OK, frameHeaders(entry.csp));
  });
}
