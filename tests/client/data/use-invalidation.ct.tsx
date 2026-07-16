// useInvalidation CT (data/use-invalidation.ts, PD-124) — proves the hoisted hook wires the LIVE
// `useTRPC()`/`useQueryClient()` context into `createInvalidation` end-to-end (never a hand-built
// `{ queryClient, trpc }` pair — the exact seam `invalidation.test.ts` already pins in isolation;
// this CT is what proves the CONTEXT WIRING, the part a pure unit test can't reach). The mounted
// `getChat` query is ACTIVE (an observer is subscribed), so `invalidateQueries` doesn't just mark
// it stale — it triggers an immediate refetch; a second network call is the load-bearing proof the
// hook reached the real client + the real query cache, not a no-op.

import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../support/ct/route-trpc";
import { InvalidationStory } from "./_ct-stories";

const CHAT_ID = castId<ChatId>("chat_ctinvalidationtest");

test("invalidate() (via the hook's live context) refetches the mounted getChat query", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.getChat": (input: unknown) => ({
      title: `room for ${(input as { chatId: string }).chatId}`,
    }),
  });

  await mount(<InvalidationStory chatId={CHAT_ID} />);

  await expect(page.getByTestId("invalidation-state")).toContainText(`room for ${CHAT_ID}`);
  expect(trpc.count("chat.getChat")).toBe(1);

  await page.getByRole("button", { name: "invalidate" }).click();

  await expect.poll(() => trpc.count("chat.getChat")).toBe(2);
});
