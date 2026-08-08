// CT: the refinery R2 write tier (features/refinery/hooks/use-refinery-mutations.ts) — the three behaviours
// that are silently wrong when they are wrong, each driven through the REAL hook, the REAL app QueryClient
// and the REAL toast channel, over a network stubbed at `page.route`.
//
//  1. FRESHNESS. Refinery has NO bus event of any kind, so the write tier's own `invalidates` is the ONLY
//     freshness driver its three reads have — the claim the `query-freshness-coverage` STATIC entries make in
//     the gate's own registry. With `staleTime: Infinity` a missing row is not a stale read, it is a FROZEN
//     one: the roster would sit at its mount snapshot until the query is GC'd. The mounted roster read is
//     ACTIVE here, so a reached invalidate is a real wire refetch `routeTrpc` counts AND a repaint — never a
//     silent stale-mark that would pass with the row deleted.
//  2. DISCRIMINATED FAILURE COPY. The two typed refinery errors have OPPOSITE fixes ("run the missing stage
//     first" vs "try again"), and only the first carries a wire reason code. The pair below is two-sided: the
//     reason arm quotes the server's own sentence (the only text naming WHICH stage is missing), the codeless
//     arm keeps the retry copy. Collapse the branch either way and one of them reds.
//  3. THE ERRORS-AS-DATA REFUSAL. `applyFields` itemizes per entry and RESOLVES, so a total drop is a
//     mutation that succeeded while the user's card went untouched — no `errorToast`, no `mutation.error`,
//     nothing on screen (EDITSNAP-OK). The `refusal` arm is what makes it visible; the partial-apply twin
//     proves the arm is narrow (a write that DID land must not be toasted as a failure).

import { REFINERY_STAGE_NOT_READY_REASON } from "@orb/contracts/refinery";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError } from "../../../../support/ct/route-trpc.ts";
import { makeCharacterDetail } from "../../character/fixtures.ts";
import { RefineryDataStory } from "../_ct-stories.tsx";
import { makeRefinerySessionSummary } from "../fixtures.ts";

// MINTED, never hand-written: `typeIdSchema` validates the 26-char suffix, and a literal that drifts from the
// alphabet fails at a parse seam rather than at the assertion.
const SESSION_ID = mintTypeId(ID_PREFIX.refinerySession);
const CHARACTER_ID = mintTypeId(ID_PREFIX.character);

const TOAST = '[data-slot="toast-root"]';

/** One roster row on THIS test's minted ids (the fixture's own defaults are id-agnostic). */
function rosterRow(name: string): ReturnType<typeof makeRefinerySessionSummary> {
  return makeRefinerySessionSummary({ id: SESSION_ID, characterId: CHARACTER_ID, name });
}

test("a started session REFETCHES the roster — the writer-local driver these reads have instead of a bus", async ({ mount, page }) => {
  let rosterCalls = 0;
  const trpc = await routeTrpc(page, {
    // Grows on the second call: the assertion is a REPAINT, not just a wire count, so a refetch that never
    // reached the observer cannot pass.
    "refinery.listSessions": () => (rosterCalls++ === 0 ? [] : [rosterRow("Rev")]),
    "refinery.startSession": () => ({ id: SESSION_ID, characterId: CHARACTER_ID, status: "active" }),
  });

  const component = await mount(<RefineryDataStory characterId={CHARACTER_ID} sessionId={SESSION_ID} />);

  // Barrier on the SETTLED roster before writing: an invalidate landing on a still-in-flight FIRST fetch is
  // absorbed (query-core reuses the in-flight promise), which would fake a green.
  await expect(component.getByTestId("roster")).toHaveText("rows=0");
  await expect.poll(() => trpc.count("refinery.listSessions")).toBe(1);

  await component.getByRole("button", { name: "start session" }).click();

  await expect(component.getByTestId("roster")).toHaveText("rows=1");
  await expect.poll(() => trpc.count("refinery.listSessions")).toBe(2);
});

test("an OUT-OF-ORDER stage refusal toasts the SERVER's sentence — the only text naming the stage to run first", async ({ mount, page }) => {
  const serverSentence = "There is no rewrite to judge yet — run the rewrite stage first.";
  await routeTrpc(page, {
    "refinery.listSessions": () => [rosterRow("Rev")],
    // BAD_REQUEST + the reason code, exactly as `RefineryStageNotReadyError` → the tRPC error formatter emits
    // it (a DomainOperationError is the only class that carries a `.code`).
    "refinery.runStage": () => trpcError({ code: "BAD_REQUEST", message: serverSentence, reason: REFINERY_STAGE_NOT_READY_REASON }),
  });

  const component = await mount(<RefineryDataStory characterId={CHARACTER_ID} sessionId={SESSION_ID} />);
  await expect(component.getByTestId("roster")).toHaveText("rows=1");

  await component.getByRole("button", { name: "run stage" }).click();

  const toast = page.locator(TOAST);
  await expect(toast).toHaveCount(1);
  await expect(toast).toContainText(serverSentence);
  await expect(toast).toHaveAttribute("data-type", "error");
});

test("a run FAILURE keeps the RETRY copy — the reason branch is narrow", async ({ mount, page }) => {
  // No `reason`: `RefineryRunFailedError` is a DomainUnavailableError → SERVICE_UNAVAILABLE, and the formatter
  // emits no reason code for it. "Try again" is the honest copy for that arm, and the server's own sentence
  // (which names no stage and no fix) must NOT be promoted to the toast.
  await routeTrpc(page, {
    "refinery.listSessions": () => [rosterRow("Rev")],
    "refinery.runStage": () => trpcError({ code: "SERVICE_UNAVAILABLE", message: "The refiner returned nothing usable for that stage." }),
  });

  const component = await mount(<RefineryDataStory characterId={CHARACTER_ID} sessionId={SESSION_ID} />);
  await expect(component.getByTestId("roster")).toHaveText("rows=1");

  await component.getByRole("button", { name: "run stage" }).click();

  const toast = page.locator(TOAST);
  await expect(toast).toHaveCount(1);
  await expect(toast).toContainText("That stage didn't finish — try again.");
  await expect(toast).not.toContainText("nothing usable");
});

test("an apply that dropped EVERY accepted entry toasts the refusal — the write RESOLVED, so nothing else would", async ({ mount, page }) => {
  await routeTrpc(page, {
    "refinery.listSessions": () => [rosterRow("Rev")],
    // The zero-write arm of `applyFields`: every accept died on the intersection belts, itemized, HTTP 200.
    "refinery.applyFields": () => ({
      applied: [],
      dropped: [{ field: "description", reason: "not_in_rewrite" }],
      character: makeCharacterDetail(),
    }),
  });

  const component = await mount(<RefineryDataStory characterId={CHARACTER_ID} sessionId={SESSION_ID} />);
  await expect(component.getByTestId("roster")).toHaveText("rows=1");

  await component.getByRole("button", { name: "apply" }).click();

  const toast = page.locator(TOAST);
  await expect(toast).toHaveCount(1);
  await expect(toast).toContainText("Nothing was applied — every accepted rewrite was dropped.");
  await expect(toast).toHaveAttribute("data-type", "error");
});

test("a PARTIAL apply toasts NOTHING — the write landed, and its per-entry drops are data, not a failure", async ({ mount, page }) => {
  let rosterCalls = 0;
  await routeTrpc(page, {
    // The second response differs, so the SETTLE barrier below is a rendered state and not a request count:
    // `onSettled`'s invalidate runs AFTER `onSuccess` (where a refusal would have toasted), so a repaint to
    // `rows=2` proves the refusal decision has already been made and made silently.
    "refinery.listSessions": () => (rosterCalls++ === 0 ? [rosterRow("Rev")] : [rosterRow("Rev"), rosterRow("Second")]),
    "refinery.applyFields": () => ({
      applied: [{ field: "description" }],
      dropped: [{ field: "greetings", greetingIndex: 1, reason: "greeting_index_invalid" }],
      character: makeCharacterDetail(),
    }),
  });

  const component = await mount(<RefineryDataStory characterId={CHARACTER_ID} sessionId={SESSION_ID} />);
  await expect(component.getByTestId("roster")).toHaveText("rows=1");

  await component.getByRole("button", { name: "apply" }).click();

  await expect(component.getByTestId("roster")).toHaveText("rows=2");
  await expect(page.locator(TOAST)).toHaveCount(0);
});
