// CT: `useCarriedAppearance` — the phase-independent read of "whose card dresses this room".
//
// WHY IT EXISTS (owner dogfood 2026-08-06): the carried look — the app-root background (BG-C) and the
// room-theme takeover — used to be resolved from `chat.getChat`'s roster, which a DRAFT has none of. Every
// consumer therefore gated a card's appearance on a committed chat id, and a brand-new chat wore the
// viewer's default chrome until the first message created the row.
//
// IT IS ONE ARM NOW, AND THESE PINS SAY SO. The fix used to be a second, draft-phase resolver over the
// founding CARDS; the room has had a row from the creation CLICK since
// `chat-creation-draft-mode-replacement.md` §4.1 R1, and `useStartChat` seeds `chat.getChat` from
// `startChat`'s own response. The card-reading arm and `useDraftCastCards` are DELETED — the hook reads one
// gated `chat.getChat` and nothing else (`packages/client/src/data/use-carried-appearance.ts`). Two pins
// this header used to advertise (a draft projecting founding cards; a partially-loaded cast reading
// `pending` rather than a smaller cast) described that deleted arm and are gone with it — they were not
// missing coverage, they were coverage of a question that can no longer be asked.
//
// THE THREE PINS:
//   1. COMMITTED  → the roster projects (humans counted, characters carried).
//   2. LANDING / no open chat → `undefined` (nothing carried; the viewer's own chrome).
//   3. A FAILED roster read degrades to `undefined` — decoration never throws into a consumer's boundary,
//      and the story mounts OUTSIDE any QueryBoundary, so a throwing read would surface as a page error.

import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError } from "../../support/node/route-trpc.ts";
import { CarriedAppearanceCastStory } from "./_ct-stories.tsx";

const ARIA = mintTypeId(ID_PREFIX.character);

test("COMMITTED: the roster projects into the cast (humans counted, characters carried)", async ({ mount, page }) => {
  const chatId = mintTypeId(ID_PREFIX.chat);
  await routeTrpc(page, {
    "chat.getChat": () => ({
      participants: [
        { id: "cp_h", kind: "human", characterId: null, displayName: "Nate", leftSeq: null },
        { id: "cp_a", kind: "character", characterId: ARIA, displayName: "Aria", leftSeq: null },
      ],
      background: null,
    }),
  });

  await mount(<CarriedAppearanceCastStory chatId={chatId} />);

  await expect(page.getByTestId("carried-cast")).toHaveText("humans=1 cards=Aria");
});

test("LANDING and a BLANK draft carry nothing (the viewer's own chrome)", async ({ mount, page }) => {
  await routeTrpc(page, {});

  await mount(<CarriedAppearanceCastStory chatId={null} />);

  // No chat — the `undefined` floor every consumer maps to "the viewer's own chrome". The gate means the
  // key is never built, so this is the skipToken arm, not a resolved-empty one.
  await expect(page.getByTestId("carried-cast")).toHaveText("pending");
});

test("a FAILED roster read degrades to the same floor and never throws", async ({ mount, page }) => {
  const chatId = mintTypeId(ID_PREFIX.chat);
  await routeTrpc(page, { "chat.getChat": () => trpcError({ message: "roster read failed" }) });

  // The hook's own contract is NON-SUSPENDING and non-throwing; the assertion below is only meaningful
  // because nothing here catches — a `throwOnError` default would land as a page error, not a fallback.
  const pageErrors: string[] = [];
  page.on("pageerror", (error: Error) => {
    pageErrors.push(error.message);
  });

  // THE BARRIER, not a race (#1265). The readout is deliberately the SAME `pending` for in-flight and for
  // failed (the story's header says so), so asserting straight off the mount would be satisfied by the
  // LOADING arm and would prove nothing about the error arm — it only redded before because the failure
  // happened to land first. Registered before the mount so it cannot be missed, and awaited before the
  // assertions: once the failure envelope has reached the browser, `retry: false` (ct-data-providers)
  // settles the query to error in that same fetch resolution, so what is asserted below is the SETTLED
  // failed read.
  const failedRead = page.waitForResponse((response) => response.url().includes("chat.getChat"));

  await mount(<CarriedAppearanceCastStory chatId={chatId} />);
  await failedRead;

  await expect(page.getByTestId("carried-cast")).toHaveText("pending");
  expect(pageErrors).toEqual([]);
});
