// QueryBoundary CT — the exemplar client component test: mount a story from `_ct-stories.tsx`
// (never a bare component), stub tRPC at the network with routeTrpc, assert decoded inputs off the
// recorder. Copy this file's shape for every client-feature CT.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError, trpcHold } from "../../support/ct/route-trpc.ts";
import { BatchedHoldStory, DeferredEchoBoundaryStory, EchoBoundaryStory } from "./_ct-stories.tsx";

test("renders suspended data through the boundary and records the decoded input", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    echo: (input: unknown) => ({ message: `pong:${(input as { message: string }).message}` }),
  });

  await mount(<EchoBoundaryStory />);

  await expect(page.getByText("pong:ping")).toBeVisible();
  await expect.poll(() => trpc.count("echo")).toBe(1);
  // Deep-equal on the DECODED input pins the batched-GET wire decode end-to-end.
  await expect.poll(() => trpc.lastInput("echo")).toEqual({ message: "ping" });
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

// ── routeTrpc's DEFERRED responder (`trpcHold`, #136) ───────────────────────────────────────────────
// Before it, every responder was invoked synchronously and the batch fulfilled in the same turn, so a
// CT had no way to hold a query open: the only ways to see a pending arm were to race the response or
// to cut the network entirely (which is a DIFFERENT state — `networkMode:"online"` PAUSES rather than
// pends, as the offline test above pins). These two prove the arm at the seam that motivated it.

test("trpcHold parks a query at a STABLE pending render; releasing it settles the same request", async ({ mount, page }) => {
  const hold = trpcHold();
  const trpc = await routeTrpc(page, { echo: hold });

  await mount(<DeferredEchoBoundaryStory />);
  await page.getByRole("button", { name: "load" }).click();

  // The barrier is the hold itself, never a timer: the request is intercepted and parked, so the
  // fallback is a settled state that stays put for as long as the test wants it.
  await hold.requested;
  await expect(page.getByText("loading…")).toBeVisible();
  await expect.poll(() => trpc.count("echo")).toBe(1);

  hold.release({ message: "pong:ping" });

  await expect(page.getByText("pong:ping")).toBeVisible();
  // Still ONE call: the parked request answered. A release that re-fetched (or a hold that dropped the
  // request and let react-query retry) would read 2 here.
  await expect.poll(() => trpc.count("echo")).toBe(1);
});

test("a held batch answers its siblings correctly on release — one well-formed, index-aligned envelope", async ({ mount, page }) => {
  const hold = trpcHold();
  // Only `length` is read off the sibling (see BatchedHoldProbe), so one plausible row is the whole stub.
  const trpc = await routeTrpc(page, { echo: hold, "tag.listTags": [{ id: "tag_ct_hold_sibling", name: "sibling" }] });

  await mount(<BatchedHoldStory />);
  await hold.requested;

  // Same commit ⇒ ONE batched request, so the sibling is held WITH the echo. That is the wire's shape,
  // not a harness choice: the client is httpBatchLink, deliberately not the stream link (data/trpc.ts),
  // so a batch has exactly one response and cannot answer three of four entries.
  await expect(page.getByTestId("held-state")).toHaveText("pending");
  await expect(page.getByTestId("sibling-state")).toHaveText("pending");

  hold.release({ message: "pong:ping" });

  await expect(page.getByTestId("held-state")).toHaveText("pong:ping");
  // The envelope survived the hold: the sibling's entry carried its OWN responder's data — a mis-indexed
  // or truncated batch lands the echo's payload, or `tags=0`, here. (MEASURED for the record, on the
  // pre-#136 stub with an async responder in this exact story: the SIBLING was unharmed at `tags=1`; the
  // async entry alone serialized to `{}` and rendered `none`. The old failure was one silently wrong
  // entry, not a broken batch — which is precisely why nothing caught it.)
  await expect(page.getByTestId("sibling-state")).toHaveText("tags=1");
  await expect.poll(() => trpc.count("tag.listTags")).toBe(1);
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
  await expect.poll(() => trpc.count("echo")).toBe(2);
});
