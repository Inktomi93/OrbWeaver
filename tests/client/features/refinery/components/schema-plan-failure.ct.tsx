// The schema editor states a failed plan ask in its own plan line, so no toast repeats it per typing pause
// (client-architecture-state-and-gates.md §11).
import { REFINERY_SCHEMA_PLAN_UNCHECKED_LINE } from "@orb/contracts/refinery";
import { absenceWindow, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { REFINERY_SCHEMA_JSON_NAME } from "#client/features/refinery/lib/refinery-names.ts";
import type { SchemaPreviewStory } from "./_payload-stories.tsx";

const STORY = "tests/client/features/refinery/components/_payload-stories/SchemaPreviewStory";
const FAILING_ASKS = 2;
const TOAST_WINDOW_MS = 300;
// Counted by slot, not role: a modal marks the toaster aria-hidden, so a role query would miss a toast behind it.
const TOAST_ROOT = '[data-slot="toast-root"]';

test("plan asks that fail on two typing pauses show the plan line once and raise no toast", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  let asks = 0;
  const calls = await routeTrpc(page, {
    ...serveCorpusProcedures(caller, ["settings.getUserSettings", "sessions.me", "character.list"]),
    ...serveCorpusProcedures(caller, ["refinery.schemaPlan"], () => (asks++ < FAILING_ASKS ? trpcError() : undefined)),
  });
  await mount<typeof SchemaPreviewStory>(STORY, {});

  const schema = page.getByRole("textbox", { name: REFINERY_SCHEMA_JSON_NAME, exact: true });
  const line = page.getByRole("dialog").getByText(REFINERY_SCHEMA_PLAN_UNCHECKED_LINE, { exact: true });
  await schema.fill(JSON.stringify({ type: "object", properties: { mood: { type: "string" } } }));
  await expect(line).toBeVisible();
  await schema.fill(JSON.stringify({ type: "object", properties: { mood: { type: "string" }, place: { type: "string" } } }));
  await expect.poll(() => calls.count("refinery.schemaPlan")).toBe(FAILING_ASKS);
  await expect(line).toHaveCount(1);
  await absenceWindow(page, TOAST_WINDOW_MS);
  await expect(page.locator(TOAST_ROOT)).toHaveCount(0);
});
