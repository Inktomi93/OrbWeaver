// The CLIENT half of the trust-gated card-frame doorway: mint a routed frame URL for a card's exact bytes,
// so the sandbox renders as a DOCUMENT WITH ITS OWN CSP instead of a `srcdoc` blob that inherits ours.
// Raw fetch, not tRPC — the route is a Hono handler serving an HTML document (`entry/http/card-frame.ts`).
//
// The request names `chatId` + `characterId` as a POLICY SELECTOR only; the SERVER resolves that
// character's `renderPolicy` off the membership-gated roster and decides the frame's CSP. Nothing this file
// sends can widen a policy, which is why it may run in the browser at all.
//
// DEGRADE, NEVER BLOCK: an unauthenticated, offline, rate-limited or otherwise failed mint resolves to
// `undefined`, and `SandboxFrame` renders the srcdoc FLOOR — a strictly TIGHTER frame (it inherits the app
// document's policy on top of its own). A card is never blank because the door was shut.

import type { CardFrameMintRequest, CardFrameMintResponse } from "@orb/contracts/chat";
import { CARD_FRAME_ROUTE, cardFrameMintResponseSchema } from "@orb/contracts/chat";
import { CSRF_HEADER } from "@orb/contracts/identity";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { useEffect, useState } from "react";

/** What a caller knows about ONE card. The bytes are the same ones the srcdoc floor would render. */
export interface CardFrameRequest {
  readonly chatId: ChatId;
  /** The authoring participant — the policy SELECTOR. `null` (user/system-authored) ⇒ the server's floor. */
  readonly characterId: CharacterId | null;
  readonly html: string;
  readonly css: string | undefined;
  readonly themeTokens: Readonly<Record<string, string>>;
  readonly fontFamily: string | undefined;
}

/** Per-tab memo so a re-render, a collapse/expand, or a lightbox open re-uses one handle instead of minting
 *  a fresh document per paint. Keyed on the SERIALIZED REQUEST BODY, which is both the natural cache key
 *  and the effect's only dependency — a theme flip or a different character changes the bytes, hence the
 *  key, hence mints anew rather than serving a frame built under a stale palette or a stale policy. */
const minted = new Map<string, Promise<string | undefined>>();

/** The wire body for one card. Pure + exported so the shape is testable without a browser. */
export function cardFrameMintBody(request: CardFrameRequest): CardFrameMintRequest {
  return {
    chatId: request.chatId,
    characterId: request.characterId,
    html: request.html,
    ...(request.css === undefined ? {} : { css: request.css }),
    themeTokens: { ...request.themeTokens },
    ...(request.fontFamily === undefined ? {} : { fontFamily: request.fontFamily }),
  };
}

/** POST one serialized mint body; ANY failure resolves to `undefined` (the caller renders the floor). */
export async function mintCardFrame(body: string): Promise<string | undefined> {
  let parsed: CardFrameMintResponse;
  try {
    const response = await fetch(CARD_FRAME_ROUTE, {
      method: "POST",
      headers: { [CSRF_HEADER]: "1", "Content-Type": "application/json" },
      body,
    });
    if (!response.ok) {
      return;
    }
    parsed = cardFrameMintResponseSchema.parse(await response.json());
  } catch {
    return;
  }
  return parsed.url;
}

/**
 * The routed frame URL for one card, or `undefined` while it resolves / when it cannot be had (the floor).
 *
 * `request === undefined` is the "no room context" arm — a story mount, the rpg card archive before a chat
 * is threaded — and never mints. That arm is not a degradation to apologise for: without a chat there is no
 * roster, so there is no trust verdict to widen anything with.
 */
export function useCardFrameSrc(request: CardFrameRequest | undefined): string | undefined {
  // The state carries the BODY it resolved for, not a bare URL. That is what lets the stale case be answered
  // during RENDER (`resolved.body !== body ⇒ undefined`) instead of by a synchronous `setState` inside the
  // effect — which is a cascading render, and which React's own lint bans. So the only `setState` here is
  // the async one in the mint's callback: the legitimate "an external system answered" shape.
  const [resolved, setResolved] = useState<{ readonly body: string; readonly url: string | undefined } | undefined>(undefined);
  // The serialized body is the effect's ONE dependency — a string, so it compares by value where `request`
  // (a fresh object every render) would re-mint on every paint. Nothing else is closed over, so the dep
  // list is exhaustive by construction rather than by a suppression asserting it.
  const body = request === undefined ? undefined : JSON.stringify(cardFrameMintBody(request));

  useEffect(() => {
    if (body === undefined) {
      return;
    }
    let live = true;
    const pending = minted.get(body) ?? mintCardFrame(body);
    minted.set(body, pending);
    void pending.then((url) => {
      if (live) {
        setResolved({ body, url });
      }
    });
    return (): void => {
      live = false;
    };
  }, [body]);

  // A handle NEVER outlives the bytes it was minted for: a theme flip, a different character, or dropping
  // the room context all change `body`, and until the new mint answers the card renders the srcdoc floor.
  return body !== undefined && resolved?.body === body ? resolved.url : undefined;
}
