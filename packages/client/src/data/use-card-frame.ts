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

import type { CardFrameMintRequest, CardFrameMintResponse, cardFrameMintRequestSchema } from "@orb/contracts/chat";
import { CARD_FRAME_MINTS_IN_FLIGHT, CARD_FRAME_ROUTE, cardFrameMintResponseSchema, installAllowsCardScripts } from "@orb/contracts/chat";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { viewerRunsCardScripts } from "@orb/contracts/settings";
import { isFetchFailure } from "@orb/kit/fetch-failure";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { z } from "zod";
import { surfaceDeferredFailure } from "#lib";
import { useAuthConfig } from "./auth-config.ts";
import { forgetIfCurrent, rememberBounded } from "./bounded-memo.ts";
import { readJsonBody } from "./http-error.ts";
import { roomRosterOptions, useTRPC } from "./trpc.ts";
import { useGatedQuery } from "./use-gated-query.ts";

export type CardFrameRequest = Readonly<z.input<typeof cardFrameMintRequestSchema>> & Pick<CardFrameMintRequest, "chatId" | "characterId">;

/** Per-tab memo so a re-render, a collapse/expand, or a lightbox open re-uses one handle instead of minting
 *  a fresh document per paint. Keyed on the attempt, the script consents the viewer can read, and the SERIALIZED
 *  REQUEST BODY, which together are the effect's trigger — a theme flip, a different character, or a change to the
 *  install's step, the character's step or the viewer's own switch changes the key, hence mints anew rather than
 *  serving a frame built under a stale palette or a stale grant. A serve only ever narrows a grant, so a consent
 *  that rose reaches the frame only through a new mint.
 *
 *  BOUNDED (#711 D3): each distinct body is a fresh key, so a long session with many theme flips / cards
 *  would grow this map without limit. `rememberBounded` caps it at {@link MINTED_CACHE_CAP} with LRU
 *  eviction — a re-served frame just re-mints, which is exactly what a genuinely-evicted stale key already does. */
const minted = new Map<string, Promise<MintAnswer | undefined>>();

/** A routed mint: the document's URL and what the server granted it. */
type MintAnswer = Pick<CardFrameMintResponse, "url" | "granted">;

/** Cap on the per-tab mint memo. Comfortably above the handful of distinct card bodies a chat shows at once;
 *  older keys (a since-replaced theme, a closed archive) evict rather than accreting for the tab's lifetime. */
const MINTED_CACHE_CAP = 128;

function cardFrameMintBody(request: CardFrameRequest): CardFrameMintRequest {
  return {
    chatId: request.chatId,
    characterId: request.characterId,
    html: request.html,
    ...(request.css === undefined ? {} : { css: request.css }),
    themeTokens: { ...request.themeTokens },
    styleTokens: { ...request.styleTokens },
    ...(request.fontFamily === undefined ? {} : { fontFamily: request.fontFamily }),
    ...(request.rootAttributes === undefined ? {} : { rootAttributes: { ...request.rootAttributes } }),
  };
}

// The tab's mints in flight, queued to the server's per-account bound so a transcript of framed replies never earns
// a 429 from one tab.
let mintsRunning = 0;
const mintQueue: (() => void)[] = [];

async function takeMintSlot(): Promise<void> {
  if (mintsRunning < CARD_FRAME_MINTS_IN_FLIGHT) {
    mintsRunning += 1;
    return;
  }
  await new Promise<void>((resolve) => {
    mintQueue.push(resolve);
  });
}

function releaseMintSlot(): void {
  const next = mintQueue.shift();
  if (next === undefined) {
    mintsRunning -= 1;
  } else {
    next();
  }
}

/** POST one serialized mint body; a mint the network or the server refuses, or an answer that is not a mint, resolves
 *  to `undefined` (the caller renders the floor). Any other fault rejects. */
async function mintCardFrame(body: string): Promise<MintAnswer | undefined> {
  await takeMintSlot();
  try {
    return await postMint(body);
  } finally {
    releaseMintSlot();
  }
}

async function postMint(body: string): Promise<MintAnswer | undefined> {
  let response: Response;
  try {
    response = await fetch(CARD_FRAME_ROUTE, {
      method: "POST",
      headers: { [CSRF_HEADER]: "1", "Content-Type": "application/json" },
      body,
    });
  } catch (error) {
    if (!isFetchFailure(error)) {
      throw error;
    }
    return;
  }
  if (!response.ok) {
    return;
  }
  const parsed = cardFrameMintResponseSchema.safeParse(await readJsonBody(response));
  return parsed.success ? { url: parsed.data.url, granted: parsed.data.granted } : undefined;
}

/** Where one mint stands: still answering, answered with a routed URL and its grant, or answered with nothing (the
 *  floor). The grant is what the frame's notices read: whether this document runs scripts is its own, never a guess. */
type CardFrameMint =
  | { readonly state: "pending" }
  | { readonly state: "routed"; readonly url: string; readonly granted: CardFrameMintResponse["granted"] }
  | { readonly state: "floor" };

const GAVE_UP: CardFrameMint = { state: "floor" };

// The first mint and the one re-mint a miss earns.
const MINT_ATTEMPTS = 2;

function mintKey(attempt: number, consents: string, body: string): string {
  return `${String(attempt)}:${consents}:${body}`;
}

// The script consents this viewer can read for a mint's selector, as one key part: the install's step, the selected
// author's resolved policy on the roster, and the viewer's own switch. `undefined` while any of those reads is still
// loading: minting then would spend a mint whose key the landing read changes, so the frame waits instead. A read that
// failed is settled and counts as unknown.
function useMintConsents(request: CardFrameRequest | undefined): string | undefined {
  const trpc = useTRPC();
  const configRead = useAuthConfig();
  const settingsRead = useQuery(trpc.settings.getUserSettings.queryOptions());
  const roomRead = useGatedQuery(request?.chatId, (id) => roomRosterOptions(trpc, { chatId: id }));
  if (configRead.isLoading || settingsRead.isLoading || roomRead.isLoading) {
    return undefined;
  }
  const config = configRead.data;
  const settings = settingsRead.data;
  const room = roomRead.data;
  const seat = request?.characterId === null ? undefined : room?.participants.find((participant) => participant.characterId === request?.characterId);
  return JSON.stringify([
    config === undefined ? null : installAllowsCardScripts(config),
    settings === undefined ? null : viewerRunsCardScripts(settings),
    seat?.renderPolicy ?? room?.narratorRender?.renderPolicy ?? null,
  ]);
}

// The bodies that already spent their one re-mint in this tab. A card can claim its handle lost on every load, so the
// re-mint a miss earns is spent once per body per tab, not once per mount: a later miss for that body goes to the floor.
const remintSpent = new Map<string, true>();

// A miss means the server dropped the handle, so every handle the tab remembers for these bytes goes: a remount mints
// afresh instead of serving a handle that is gone. Answers whether these bytes may still mint once more.
function forgetMints(request: CardFrameRequest | undefined, consents: string | undefined): boolean {
  if (request === undefined || consents === undefined) {
    return false;
  }
  const body = JSON.stringify(cardFrameMintBody(request));
  for (let attempt = 0; attempt < MINT_ATTEMPTS; attempt += 1) {
    minted.delete(mintKey(attempt, consents, body));
  }
  if (remintSpent.has(body)) {
    return false;
  }
  rememberBounded(remintSpent, body, true, MINTED_CACHE_CAP);
  return true;
}

/** One routed frame's mint, and the two ways its caller learns the handle is no use. */
export interface CardFrame {
  readonly mint: CardFrameMint;
  /** The frame loaded the server's miss notice (`SandboxFrame.onMissing`): the handle expired or was evicted. The
   *  tab's first miss for these bytes mints them again; any later one gives up to the floor. */
  readonly onMissing: () => void;
  /** Give up on the routed frame for good: from now on {@link CardFrame.mint} is the floor. */
  readonly giveUp: () => void;
}

/**
 * The ONE mint hook for a routed card frame, card or styled reply: the mint for these exact bytes, re-minted when its
 * handle is gone (once per body per tab), then the floor. A pending mint and a refused one stay apart, so a caller can hold a stand-in
 * for the first and draw its floor for the second.
 *
 * `request === undefined` is the "no room context" arm — a story mount, the rpg card archive before a chat
 * is threaded — and never mints. That arm is not a degradation to apologise for: without a chat there is no
 * roster, so there is no trust verdict to widen anything with.
 */
export function useCardFrame(request: CardFrameRequest | undefined): CardFrame {
  const [attempt, setAttempt] = useState(0);
  const [lost, setLost] = useState(false);
  const consents = useMintConsents(request);
  const mint = useCardFrameMint(request, attempt, consents);
  return {
    mint: lost ? GAVE_UP : mint,
    onMissing: (): void => {
      if (forgetMints(request, consents) && attempt < MINT_ATTEMPTS - 1) {
        setAttempt(1);
      } else {
        setLost(true);
      }
    },
    giveUp: (): void => {
      setLost(true);
    },
  };
}

// A higher `attempt` mints the same bytes again instead of reusing the tab's handle.
function useCardFrameMint(request: CardFrameRequest | undefined, attempt: number, consents: string | undefined): CardFrameMint {
  // The state carries the KEY it resolved for, not a bare URL. That is what lets the stale case be answered
  // during RENDER (`resolved.key !== key ⇒ pending`) instead of by a synchronous `setState` inside the
  // effect — which is a cascading render, and which React's own lint bans. So the only `setState` here is
  // the async one in the mint's callback: the legitimate "an external system answered" shape.
  const [resolved, setResolved] = useState<{ readonly key: string; readonly answer: MintAnswer | undefined } | undefined>(undefined);
  // The serialized body and its attempt key are the effect's dependencies — strings, so they compare by value
  // where `request` (a fresh object every render) would re-mint on every paint.
  const body = request === undefined ? undefined : JSON.stringify(cardFrameMintBody(request));
  const key = body === undefined || consents === undefined ? undefined : mintKey(attempt, consents, body);

  useEffect(() => {
    if (body === undefined || key === undefined) {
      return;
    }
    let live = true;
    const pending = minted.get(key) ?? mintCardFrame(body);
    rememberBounded(minted, key, pending, MINTED_CACHE_CAP);
    // `mintCardFrame` collapses every mint failure to `undefined`; `.catch` owns a throw from the callback.
    pending
      .then((answer) => {
        // A FAILED MINT IS NOT AN ANSWER, so it must not be remembered as one: `mintCardFrame` collapses a
        // 401, an offline blip and a version-skewed body alike into `undefined`, and caching that settled
        // promise would serve one bad second to those exact bytes for the rest of the tab's life. Evicted
        // OUTSIDE the `live` gate — an unmounted card must not leave the poison behind for its neighbours.
        if (answer === undefined) {
          forgetIfCurrent(minted, key, pending);
        }
        if (live) {
          setResolved({ key, answer });
        }
      })
      .catch(surfaceDeferredFailure);
    return (): void => {
      live = false;
    };
  }, [body, key]);

  // A handle NEVER outlives the bytes it was minted for: a theme flip, a different character, or dropping
  // the room context all change `body`. No request draws the floor; a request stays pending until its consents load
  // and its own mint answers.
  if (body === undefined) {
    return { state: "floor" };
  }
  if (key === undefined || resolved?.key !== key) {
    return { state: "pending" };
  }
  return resolved.answer === undefined ? { state: "floor" } : { state: "routed", url: resolved.answer.url, granted: resolved.answer.granted };
}
