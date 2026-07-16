// useGatedQuery CT — proves the TKey/TError fix (data/use-gated-query.ts header) against a REAL
// `trpc.chat.getChat.queryOptions(...)` call, never a hand-mock (a mock that erases the DataTag'd
// key type would hide the exact key-variance bug the fix pins — the whole reason this factory
// exists is to wrap tRPC's `queryOptions()` output). Two properties: (1) a real id flows the query
// through end-to-end (fires, resolves, renders); (2) a null id NEVER builds the real key — the
// `skipToken` gate — so the server-bound procedure is NEVER called (the `no-fake-disabled-id`
// invariant, verified here at the network-recorder level, not just by type).

import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../support/ct/route-trpc";
import { GatedQueryStory } from "./_ct-stories";

const CHAT_ID = castId<ChatId>("chat_gatedquerytest01");

test("a real id flows the query end-to-end (queryOptions fires, resolves, renders)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.getChat": (input: unknown) => ({
      title: `room for ${(input as { chatId: string }).chatId}`,
    }),
  });

  await mount(<GatedQueryStory chatId={CHAT_ID as never} />);

  await expect(page.getByTestId("gated-state")).toHaveText(`room for ${CHAT_ID}`);
  expect(trpc.count("chat.getChat")).toBe(1);
  expect(trpc.lastInput("chat.getChat")).toEqual({ chatId: CHAT_ID });
});

test("a null id never builds the real key — skipToken keeps the procedure UNCALLED", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.getChat": (): never => {
      throw new Error("must never be called — the gated-off branch must never build the real key");
    },
  });

  await mount(<GatedQueryStory chatId={null} />);

  await expect(page.getByTestId("gated-state")).toHaveText("disabled");
  // The load-bearing assertion: skipToken means no request was ever issued for this procedure.
  expect(trpc.count("chat.getChat")).toBe(0);
});
