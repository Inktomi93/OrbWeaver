// QueryBoundary CT — the exemplar client component test: mount a story from `_ct-stories.tsx`
// (never a bare component), stub tRPC at the network with routeTrpc, assert decoded inputs off the
// recorder. Copy this file's shape for every client-feature CT.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError } from "../../support/ct/route-trpc";
import { EchoBoundaryStory } from "./_ct-stories";

test("renders suspended data through the boundary and records the decoded input", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    echo: (input: unknown) => ({ message: `pong:${(input as { message: string }).message}` }),
  });

  await mount(<EchoBoundaryStory />);

  await expect(page.getByText("pong:ping")).toBeVisible();
  expect(trpc.count("echo")).toBe(1);
  // Deep-equal on the DECODED input pins the batched-GET wire decode end-to-end.
  expect(trpc.lastInput("echo")).toEqual({ message: "ping" });
});

test("error surface → retry refetches (the reset handshake, not a re-render)", async ({ mount, page }) => {
  let call = 0;
  const trpc = await routeTrpc(page, {
    echo: (): unknown => (call++ === 0 ? trpcError({ message: "boom" }) : { message: "recovered" }),
  });

  await mount(<EchoBoundaryStory />);

  // Page-scoped locators: QueryBoundary REPLACES its child element on state swaps
  // (fallback → alert → data), so a mount-handle-scoped locator can pin a detached root.
  const alert = page.getByRole("alert");
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("boom");

  await page.getByRole("button", { name: "Try again" }).click();

  await expect(page.getByText("recovered")).toBeVisible();
  // 2 calls = the retry REFETCHED (a reset-less boundary re-throws the cached error at 1).
  expect(trpc.count("echo")).toBe(2);
});
