// CT: the Corpus understanding-pass invitation RUNS the pass (issue #155, owner-ruled: "just fucking run the
// job if they click the button"). The card used to deep-link to Settings → Jobs and print "Opens Settings →
// Jobs." under a button that started nothing — on the one surface whose whole state depends on that work.
//
// THE CONTRACT THESE THREE ARMS PIN, in the order a wrong implementation breaks them:
//   1. ENQUEUE, NOT NAVIGATE — the click puts two rows on the wire, `distill-characters` then
//      `compute-themes` CHAINED on it via the engine's `dependsOn` DAG gate. Asserted on the RECORDED wire
//      inputs, because "it navigated instead" and "it enqueued" are indistinguishable from the rendered card.
//   2. DEDUPE — with a run already live the door is GONE, replaced by that run's own progress state. A
//      button that fires a doomed second enqueue and toasts the engine's CONFLICT is the failure mode here.
//   3. FAILURE — a pass that stopped says so, on the card, with the way to try again.
//
// Every barrier below is a SETTLED rendered state (the door, the progress line, the failure line), never a
// state that exists only while a query is in flight.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder, TrpcRoutes } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { CorpusUnderstandingInvitationStory } from "../_ct-stories.tsx";

const VIEWER = { userId: "user_me", globalRole: "user", handle: "me" };

/** The affordance names, as locator patterns — the door's label carries state, so both spellings are pinned. */
const RUN_DOOR = /Run the understanding pass/;
const RETRY_DOOR = /Try the understanding pass again/;
const FAILURE_REASON = /the summarizer connection refused/;

/** A `workloads.list` row, in the shape the card reads it (id · kind · status · owner · progress · error). */
function row(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "workload_1",
    kind: "distill-characters",
    mode: "singular",
    lane: "sweep",
    status: "running",
    ownerId: VIEWER.userId,
    dependsOn: null,
    progress: null,
    result: null,
    error: null,
    poison: false,
    scheduledAt: 1,
    createdAt: 1,
    ...over,
  };
}

async function stub(page: Page, routes: TrpcRoutes = {}): Promise<TrpcRecorder> {
  return await routeTrpc(page, {
    "sessions.me": VIEWER,
    "workloads.list": [],
    ...routes,
  });
}

test("the door ENQUEUES the pass — distill, then themes chained on it — rather than opening Settings", async ({ mount, page }) => {
  let minted = 0;
  const recorder = await stub(page, {
    "workloads.start": () => {
      minted += 1;
      return { id: `workload_start_${minted}` };
    },
  });
  const component = await mount(<CorpusUnderstandingInvitationStory />);

  // SETTLED: the queue read has landed and the card is showing its door (not a stale first paint).
  const door = component.getByRole("button", { name: RUN_DOOR });
  await expect(door).toBeVisible();
  // The gloss that promised a picker is gone with the picker — this button does the work now.
  await expect(component.getByText("Opens Settings → Jobs.")).toHaveCount(0);

  await door.click();

  await expect.poll(() => recorder.count("workloads.start")).toBe(2);
  const [first, second] = recorder.inputs("workloads.start") as { input: { kind: string }; dependsOn?: string[] }[];
  expect(first?.input.kind).toBe("distill-characters");
  expect(second?.input.kind).toBe("compute-themes");
  // The CHAIN is the engine's gate, not a client loop: themes waits on the distill row's id.
  expect(second?.dependsOn).toEqual(["workload_start_1"]);
});

test("a live run replaces the door with its own progress state and never double-enqueues", async ({ mount, page }) => {
  const recorder = await stub(page, {
    "workloads.list": [row({})],
  });
  const component = await mount(<CorpusUnderstandingInvitationStory />);

  // SETTLED: the running arm has painted — the stage sentence only exists on that arm.
  await expect(component.getByText("Reading your cards")).toBeVisible();
  await expect(component.getByRole("button", { name: RUN_DOOR })).toHaveCount(0);
  // Nothing on this surface can enqueue while a run holds the floor.
  // ONESHOT-OK: this arm performs NO interaction, and `onClick` on the (absent) door is the only enqueue path
  // in the component — so there is no in-flight call for a retry to catch, and the two settled barriers above
  // already prove the running arm rendered. A poll here would pass at t=0 regardless and prove less.
  expect(recorder.count("workloads.start")).toBe(0);
});

// FOUND BY A LIVE DRIVE, 2026-08-17: straight after the click BOTH rows are `queued` and `workloads.list`
// returns newest-first, so taking the first active row made the card announce "Finding your story themes"
// while the themes row was doing nothing but waiting on its `dependsOn` gate. The stage a user is told about
// has to be the one the engine will run next — so the fixture below is deliberately in LIST order (themes
// first), which is the order that reproduced it.
test("with both stages queued the card names the stage that runs FIRST, not the newest row", async ({ mount, page }) => {
  await stub(page, {
    "workloads.list": [
      row({ id: "workload_themes", kind: "compute-themes", status: "queued", dependsOn: ["workload_distill"], createdAt: 2 }),
      row({ id: "workload_distill", kind: "distill-characters", status: "queued", createdAt: 1 }),
    ],
  });
  const component = await mount(<CorpusUnderstandingInvitationStory />);

  await expect(component.getByText("Reading your cards")).toBeVisible();
  await expect(component.getByText("Finding your story themes")).toHaveCount(0);
});

test("a stopped pass says why, on the card, and offers another go", async ({ mount, page }) => {
  await stub(page, {
    "workloads.list": [row({ status: "failed", error: "the summarizer connection refused" })],
  });
  const component = await mount(<CorpusUnderstandingInvitationStory />);

  await expect(component.getByText(FAILURE_REASON)).toBeVisible();
  await expect(component.getByRole("button", { name: RETRY_DOOR })).toBeVisible();
});
