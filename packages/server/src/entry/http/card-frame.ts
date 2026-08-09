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
//   • `allowInlineData` ⇐ the participant's `trustHtml` ALONE. This is the door: `data:` images for cards
//     authored by a character the HOST opted into (the same consent D44 uses to grant the tierB sandbox).
//
// ACCEPTED RESIDUAL, stated because it cannot be checked from here: a caller may name a TRUSTED sibling
// character for a card actually authored by an untrusted one in the SAME room. It is the viewer's own
// authenticated agent selecting between policies its host already granted inside that room, and the blast
// radius is `data:`/`https:` image loading inside a script-dead opaque-origin document. Closing it means
// resolving the AUTHOR from canon (a message read), which needs the display-macro/speaker-span pipeline to
// agree byte-for-byte with the stored body — noted, not built.
//
// ── WHY THE HANDLES ARE PER-USER AND IN-PROCESS ──────────────────────────────────────────────────────────
// A handle is 128 bits of CSPRNG, bound to the minting `userId`, and lives in a capped in-process map. So a
// link an attacker crafts resolves in nobody's store but the victim's — and a foreign or unknown id is
// indistinguishable from an expired one (the `/api/blob` no-existence-leak precedent). Nothing persists:
// model-authored bytes never reach disk through this route.

import { Buffer } from "node:buffer";
import { randomBytes } from "node:crypto";
import type { ParticipantView } from "@orb/contracts/chat";
import { CARD_FRAME_ROUTE, cardFrameMintRequestSchema, cardFrameUrl } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { CardFrameMediaPolicy } from "@orb/kit/card-frame";
import { buildCardFrameCsp, buildCardFrameDocument, CARD_FRAME_SAFE_FLOOR } from "@orb/kit/card-frame";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import type { Hono } from "hono";
import { hasCsrfHeader } from "#infra/auth";
import type { PrincipalEnv } from "./blob.ts";

const OK = 200;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const BAD_REQUEST = 400;

/** A handle lives 30 minutes, SLIDING on each serve — a transcript left open re-frames a card on remount
 *  (lazy iframes refetch) and must not find a hole where its card was. Nothing here is durable, so the
 *  slide costs a timestamp write and bounds retention to "the tab that is looking at it". */
const MS_PER_MINUTE = 60_000;
const TTL_MINUTES = 30;
const TTL_MS = TTL_MINUTES * MS_PER_MINUTE;
/** Retention ceilings. Both are enforced (count AND bytes) because a card's size varies by two orders of
 *  magnitude: a count-only cap would let 256 max-size cards pin ~20 MiB, a byte-only cap would let a flood
 *  of tiny cards pin an unbounded map. Oldest-first eviction; a victim of eviction re-mints. */
const BYTES_PER_MIB = 1_048_576;
const MAX_TOTAL_MIB = 8;
const MAX_ENTRIES = 256;
const MAX_TOTAL_BYTES = MAX_TOTAL_MIB * BYTES_PER_MIB;
const ID_BYTES = 16;
const ID_SHAPE = /^[0-9a-f]{32}$/u;

const HTML_MIME = "text/html; charset=utf-8";

interface FrameEntry {
  readonly userId: UserId;
  readonly doc: string;
  readonly csp: string;
  readonly bytes: number;
  expiresAt: number;
}

/** The membership-gated roster read — the ONE authority for a card's render policy. Structural port so
 *  `entry/http` states exactly the slice it consumes (the `BlobAssetsPort` precedent). */
export interface CardFrameRosterPort {
  readonly listParticipants: (params: { readonly principal: Principal; readonly chatId: ChatId }) => Promise<readonly ParticipantView[]>;
}

export interface CardFrameDeps {
  readonly roster: CardFrameRosterPort;
  /** The live app-tier external-media ceiling — the SAME read `securityHeaders` is built from. */
  readonly allowExternalMedia: () => boolean;
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

/** The floor policy, used for every non-serving response so no card-frame reply is ever un-policied. */
const FLOOR_CSP = buildCardFrameCsp(CARD_FRAME_SAFE_FLOOR, "document");

/** A body for the miss arm — a blank 404 inside an iframe reads as a broken card; this reads as a stale one.
 *  Identical for unknown / foreign / expired ids by construction (no existence leak). */
const MISS_DOC = buildCardFrameDocument({
  html: '<p style="font:14px system-ui;opacity:.6;padding:12px">This card frame expired. Reload to view it.</p>',
  css: undefined,
  themeTokens: undefined,
  fontFamily: undefined,
});

/** Resolve the frame's media policy from the SELECTOR. Every failure arm returns the safe floor. */
async function resolvePolicy(
  deps: CardFrameDeps,
  principal: Principal,
  selector: { readonly chatId: ChatId; readonly characterId: CharacterId | null },
): Promise<CardFrameMediaPolicy> {
  if (selector.characterId === null) {
    return CARD_FRAME_SAFE_FLOOR;
  }
  let participants: readonly ParticipantView[];
  try {
    participants = await deps.roster.listParticipants({ principal, chatId: selector.chatId });
  } catch {
    // A non-participant throws out of the membership gate. A foreigner learns nothing from the difference
    // between "not a member" and "no such character" — both are the floor.
    return CARD_FRAME_SAFE_FLOOR;
  }
  const policy = participants.find((p) => p.characterId === selector.characterId)?.renderPolicy;
  if (policy === undefined) {
    return CARD_FRAME_SAFE_FLOOR;
  }
  return {
    // Deployment ceiling AND the per-character verdict — tighten-only, and the ceiling is re-applied HERE
    // even though `resolveRenderPolicy` already folded it in: this is the boundary that must hold if that
    // resolver is ever weakened.
    allowExternalMedia: deps.allowExternalMedia() && !policy.forbidExternalMedia,
    allowInlineData: policy.trustHtml,
  };
}

/** The per-process handle store. Created per registrar call, so a test gets a clean one. */
function createStore(now: () => number): {
  readonly put: (entry: Omit<FrameEntry, "bytes">) => string;
  readonly take: (id: string, userId: UserId) => FrameEntry | undefined;
} {
  const entries = new Map<string, FrameEntry>();
  let totalBytes = 0;

  const drop = (id: string): void => {
    const found = entries.get(id);
    if (found !== undefined) {
      totalBytes -= found.bytes;
      entries.delete(id);
    }
  };

  return {
    put: (entry): string => {
      const bytes = Buffer.byteLength(entry.doc, "utf8");
      const id = randomBytes(ID_BYTES).toString("hex");
      entries.set(id, { ...entry, bytes });
      totalBytes += bytes;
      // Map iteration is insertion-ordered, so `keys().next()` IS the oldest handle.
      while (entries.size > MAX_ENTRIES || totalBytes > MAX_TOTAL_BYTES) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined || oldest === id) {
          break;
        }
        drop(oldest);
      }
      return id;
    },
    take: (id, userId): FrameEntry | undefined => {
      const found = entries.get(id);
      if (found === undefined) {
        return;
      }
      if (found.expiresAt <= now()) {
        drop(id);
        return;
      }
      // The owner check is the LAST word and never falls through to a different answer: a foreign id is
      // treated exactly like a missing one.
      if (found.userId !== userId) {
        return;
      }
      found.expiresAt = now() + TTL_MS;
      return found;
    },
  };
}

/** Register `POST /api/card-frame` (mint) + `GET /api/card-frame/:id` (serve) on `app`. */
export function registerCardFrame(app: Hono<PrincipalEnv>, deps: CardFrameDeps): void {
  const store = createStore(deps.now);

  app.post(CARD_FRAME_ROUTE, async (c) => {
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
      fontFamily: body.fontFamily,
    });
    const id = store.put({ userId: principal.userId, doc, csp: buildCardFrameCsp(policy, "document"), expiresAt: deps.now() + TTL_MS });
    return c.json({
      url: cardFrameUrl(id),
      expiresInMs: TTL_MS,
      granted: { externalMedia: policy.allowExternalMedia, inlineData: policy.allowInlineData },
    });
  });

  app.get(`${CARD_FRAME_ROUTE}/:id`, (c) => {
    const principal = c.get("principal");
    if (principal === null) {
      return c.body(null, UNAUTHORIZED);
    }
    const id = c.req.param("id");
    const entry = ID_SHAPE.test(id) ? store.take(id, principal.userId) : undefined;
    if (entry === undefined) {
      return c.body(MISS_DOC, NOT_FOUND, frameHeaders(FLOOR_CSP));
    }
    return c.body(entry.doc, OK, frameHeaders(entry.csp));
  });
}
