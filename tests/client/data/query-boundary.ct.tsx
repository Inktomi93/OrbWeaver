// QueryBoundary CT — the exemplar client component test: mount a story from `_ct-stories.tsx`
// (never a bare component), stub tRPC at the network with routeTrpc, assert decoded inputs off the
// recorder. Copy this file's shape for every client-feature CT.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError } from "../../support/ct/route-trpc";
import { DeferredEchoBoundaryStory, EchoBoundaryStory } from "./_ct-stories";

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

// networkMode:"online" (query-client.ts LAW) PAUSES queries offline — they never reject, so without
// the boundary's offline line a suspended surface would skeleton forever with zero feedback. Offline
// is cut AFTER mount (the CT harness needs the network for its own assets) and the reader mounts
// behind a click, landing born-paused.
test("offline + pending shows 'Waiting for connection…'; reconnect resumes and clears it", async ({ mount, page, context }) => {
  await routeTrpc(page, {
    echo: (input: unknown) => ({ message: `pong:${(input as { message: string }).message}` }),
  });

  await mount(<DeferredEchoBoundaryStory />);
  await context.setOffline(true);
  await page.getByRole("button", { name: "load" }).click();

  // Paused, not errored: the fallback stays AND the offline affordance appears with it.
  await expect(page.getByText("loading…")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Waiting for connection…" })).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText("pong:ping")).toBeVisible();
  // Online + settled: the line is gone (it never renders during a normal load either — it is
  // offline-gated, not pending-gated). By text, not role=status — the toast region also carries status.
  await expect(page.getByText("Waiting for connection…")).toHaveCount(0);
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
