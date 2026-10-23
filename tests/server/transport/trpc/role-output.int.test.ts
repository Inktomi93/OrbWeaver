import { appRouter } from "@orb/server/transport/trpc";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { z } from "zod";

test("the role codec reports invalid game posture through safeParse without throwing", async () => {
  await using root = await createServerHarness({ startJobs: false });
  const principal = await root.principalFor(root.ownerId);
  const room = await root.services.chat.startChat({ principal, characterIds: [], opening: "none" });
  const page = await root.services.chat.getChatLineage({ principal, chatId: room.chat.id });
  expect(page.chain.map((row) => row.id)).toContain(room.chat.id);
  const definition = appRouter.chat.getChatLineage._def;
  if (!("output" in definition && definition.output instanceof z.ZodType)) {
    throw new Error("The actual getChatLineage procedure has no Zod output parser");
  }
  const output = definition.output;
  expect(output.safeParse(page).success).toBe(true);
  const invalid = output.safeParse({ ...page, chain: page.chain.map((row) => ({ ...row, isGame: true, gamePaused: true })) });
  expect(invalid.success).toBe(false);
  if (invalid.success) {
    throw new Error("Contradictory game posture passed the actual output parser");
  }
  expect(invalid.error.issues).toMatchObject([{ code: "custom", path: ["chain", 0], message: "An engaged game cannot also be paused" }]);
});
