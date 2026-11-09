// A failed husk reap is housekeeping the person did not start: it logs and shows no toast (client-architecture-state-and-gates.md §11).

import { ID_PREFIX } from "@orb/kit/ids";
import { watchToastMounts } from "@orb/testkit/browser/spec";
import { noticeToast, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { BACKGROUND_FAILURE_LOGS } from "#client/data/background-failure-logs.ts";
import type { HuskReaperStory } from "./_husk-reaper-stories.tsx";

const STORY = "tests/client/data/_husk-reaper-stories/HuskReaperStory";
const REAP_FAILURE = "Scripted husk reap failure";
const CONTROL_NOTICE = "Control notice";

test("a husk reap that fails writes its log and raises no toast", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const husk = root.idSource.typeId(ID_PREFIX.chat);
  const calls = await routeTrpc(page, {
    ...serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings"]),
    "chat.reapHusk": ({ chatId }) => (chatId === husk ? trpcError({ message: REAP_FAILURE }) : undefined),
  });
  const toastMounts = await watchToastMounts(page);
  const logged = page.waitForEvent("console", {
    predicate: (message) => message.type() === "error" && message.text().includes(BACKGROUND_FAILURE_LOGS.huskReap),
  });
  await mount<typeof HuskReaperStory>(STORY, { chatId: husk, controlNotice: CONTROL_NOTICE });

  await page.getByRole("button", { name: "Enter the new room", exact: true }).click();
  await page.getByRole("button", { name: "Leave the room", exact: true }).click();
  await logged;
  expect(calls.lastInput("chat.reapHusk")).toEqual({ chatId: husk });
  await page.getByRole("button", { name: CONTROL_NOTICE, exact: true }).click();
  await expect(noticeToast(page, { title: CONTROL_NOTICE })).toBeVisible();
  expect(await toastMounts()).toBe(1);
});
