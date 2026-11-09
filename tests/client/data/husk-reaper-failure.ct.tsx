// A failed husk reap is housekeeping the person did not start: it logs and shows no toast (client-architecture-state-and-gates.md §11).

import { ID_PREFIX } from "@orb/kit/ids";
import { absenceWindow, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { BACKGROUND_FAILURE_LOGS } from "#client/data/background-failure-logs.ts";
import type { HuskReaperStory } from "./_husk-reaper-stories.tsx";

const STORY = "tests/client/data/_husk-reaper-stories/HuskReaperStory";
const REAP_FAILURE = "Scripted husk reap failure";
const TOAST_WINDOW_MS = 300;
// Counted by slot, not role: a modal marks the toaster aria-hidden, so a role query would miss a toast behind it.
const TOAST_ROOT = '[data-slot="toast-root"]';

test("a husk reap that fails writes its log and raises no toast", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const husk = root.idSource.typeId(ID_PREFIX.chat);
  const calls = await routeTrpc(page, {
    ...serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings"]),
    "chat.reapHusk": ({ chatId }) => (chatId === husk ? trpcError({ message: REAP_FAILURE }) : undefined),
  });
  const logged = page.waitForEvent("console", {
    predicate: (message) => message.type() === "error" && message.text().includes(BACKGROUND_FAILURE_LOGS.huskReap),
  });
  await mount<typeof HuskReaperStory>(STORY, { chatId: husk });

  await page.getByRole("button", { name: "Enter the new room", exact: true }).click();
  await page.getByRole("button", { name: "Leave the room", exact: true }).click();
  await logged;
  expect(calls.lastInput("chat.reapHusk")).toEqual({ chatId: husk });
  await absenceWindow(page, TOAST_WINDOW_MS);
  await expect(page.locator(TOAST_ROOT)).toHaveCount(0);
});
