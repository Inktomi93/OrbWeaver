// CT: the LIVE refinery CONTENT workflow, mounted whole (audit `client-preset-refinery-01`). The section
// mounts `RefineryContentSurface` in its CONTENT slot (`lib/refinery-section.tsx:88`), and until now the
// composition it performs had ZERO direct behavioral proof: three reads joined (session · runs ·
// preflight, plus the gated card), the run-selection resolver, the per-rewrite decision sheet, and five
// write paths. Every component under it had its own CT and every one of those stayed green while the
// JOIN could break — which is precisely the class this file exists to close.
//
// THE WALK THROUGH THE PRODUCT, IN ORDER: load (the settled session pane, not a spinner) → view-back (the
// §16.1 walker pins a superseded run and the pane follows) → a per-block rewrite decision (the ratified
// Keep/Discard accept grammar, fail-closed) → apply → the terminal itemized outcome.
//
// THE RESPONDERS ARE INPUT-AWARE, never fixed arrays: `refinery.applyFields` ANSWERS THE ACCEPTS IT WAS
// SENT. A responder that ignored its input would paint the same outcome whether the surface sent one
// accept or three, so the Discard half of the grammar would be unfalsifiable — green by absence. The
// recorded input is asserted beside the rendered outcome for the same reason.
//
// Every barrier is a SETTLED rendered state. The loading arm ("Loading the session…") is deliberately NOT
// asserted: it exists only while a query is in flight, so pinning it passes where the flash is catchable
// and flakes where it is not.

import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { testId } from "../../../../../packages/client/src/lib/test-ids.ts";
import type { TrpcRoutes } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { makeCharacterDetail } from "../../character/fixtures.ts";
import { RefineryContentStory } from "../_ct-stories.tsx";

// MINTED, never hand-written (the `typeIdSchema` 26-char-suffix rule — a drifted literal dies at a parse
// seam instead of at an assertion).
const SESSION_ID = mintTypeId(ID_PREFIX.refinerySession);
const CHARACTER_ID = mintTypeId(ID_PREFIX.character);
const SCORE_RUN_SUPERSEDED = mintTypeId(ID_PREFIX.refineryRun);
const SCORE_RUN_LATEST = mintTypeId(ID_PREFIX.refineryRun);
const REWRITE_RUN = mintTypeId(ID_PREFIX.refineryRun);

const FROZEN_AT = 1_750_000_000_000;
// PROSE-LENGTH on both sides (over `accept-review`'s 200-char inline-diff threshold) so the description
// block renders the side-by-side PAIR and the after pane carries the whole rewrite verbatim — an
// assertable string. Personality stays short on purpose: that block takes the FORK-C inline word diff,
// which renders token segments rather than one text node, so it is asserted through its VERB instead.
const LIVE_DESCRIPTION =
  "A wandering cartographer who has spent eleven years walking the coast road, filling one ledger after another with soundings nobody asked her for, and who has never once agreed to sell a map to a man in uniform, whatever he offered.";
const LIVE_PERSONALITY = "Guarded, precise.";
const REWRITTEN_DESCRIPTION =
  "A cartographer who maps the drowned roads nobody else will walk, carrying eleven years of soundings in a salt-stained ledger she guards more carefully than her own name, and who has never once agreed to sell a chart to a uniform.";
const REWRITTEN_PERSONALITY = "Wry, unhurried, quietly certain.";

/** The LIVE card the surface reads (`character.get`) — also the session's ORIGINAL pin here, so nothing
 *  in this file is DIVERGED (§21's conflict pane is the accept-review CT's subject, not this one's). */
const CARD = makeCharacterDetail({
  id: CHARACTER_ID,
  name: "Zephyrine Vale",
  description: LIVE_DESCRIPTION,
  personality: LIVE_PERSONALITY,
});

const STAGE_CONFIG = {
  score: { kind: "fixed", mode: "full" },
  rewrite: { kind: "fixed", mode: "balanced" },
  analyze: { kind: "fixed", mode: "full" },
};

function sessionView(): unknown {
  return {
    id: SESSION_ID,
    characterId: CHARACTER_ID,
    name: "Rev",
    status: "active",
    originalCard: CARD,
    // Two REFINABLE fields in scope — the accept review paints exactly these, and the scope strip prints
    // one chip each.
    selection: { fields: ["description", "personality"] },
    stageConfig: STAGE_CONFIG,
    guidance: null,
    iterationCount: 1,
    createdAt: FROZEN_AT,
    updatedAt: FROZEN_AT,
  };
}

function scoreRun(id: string, iteration: number, overallScore: number, summary: string): unknown {
  return {
    id,
    sessionId: SESSION_ID,
    iteration,
    model: "test-scorer",
    promptTokens: 2736,
    outputTokens: 1490,
    durationMs: 23_600,
    sourceRunId: null,
    strippedKeys: [],
    createdAt: FROZEN_AT + iteration,
    stage: "score",
    payloadConfig: { kind: "fixed", mode: "full" },
    payload: { fieldScores: [], overallScore, priorityImprovements: [], summary },
  };
}

function rewriteRun(): unknown {
  return {
    id: REWRITE_RUN,
    sessionId: SESSION_ID,
    iteration: 1,
    model: "test-rewriter",
    promptTokens: 3100,
    outputTokens: 900,
    durationMs: 18_000,
    sourceRunId: null,
    strippedKeys: [],
    createdAt: FROZEN_AT + 2,
    stage: "rewrite",
    payloadConfig: { kind: "fixed", mode: "balanced" },
    payload: {
      fields: [
        { field: "description", text: REWRITTEN_DESCRIPTION },
        { field: "personality", text: REWRITTEN_PERSONALITY },
      ],
    },
  };
}

function preflight(): unknown {
  return {
    contextTokens: 8000,
    stages: (["score", "rewrite", "analyze"] as const).map((stage) => ({
      stage,
      model: "test-model",
      temperature: null,
      maxOutputTokens: 4096,
      inputEstimate: 2736,
      outputEstimate: 1490,
    })),
  };
}

/** The accepts the surface sent, as `routeTrpc` decoded them off the wire. */
interface ApplyInput {
  readonly accepts: readonly { readonly field: string; readonly greetingIndex?: number }[];
}

// The affordance names, hoisted (biome `useTopLevelRegex`). The stepper cells are matched loosely because
// a cell's accessible name carries its numeral and status line too; the review verbs are ANCHORED because
// "Keep description" and "Keep (empties field) description" are different consent acts.
const STEP_SCORE = /Score/;
const STEP_REWRITE = /Rewrite/;
const KEEP_DESCRIPTION = /^Keep description$/;
const DISCARD_PERSONALITY = /^Discard personality$/;
const ANY_APPLY_COUNT = /^Apply \d+ kept$/;

/** The ledger the surface reads, OLDEST FIRST (the wire's order — the surface's `latestOf` map keeps the
 *  last write per stage, so a newest-first fixture would silently invert which score is "latest"). */
function ledger(): unknown[] {
  return [scoreRun(SCORE_RUN_SUPERSEDED, 0, 4.1, "Thin in the middle."), scoreRun(SCORE_RUN_LATEST, 1, 8.2, "Much sharper after the rewrite."), rewriteRun()];
}

/** The three reads plus the gated card — everything the session pane joins. */
function baseRoutes(): TrpcRoutes {
  return {
    "refinery.getSession": sessionView,
    "refinery.listRuns": ledger,
    "refinery.preflight": preflight,
    "character.get": (): unknown => CARD,
  };
}

test("the session pane JOINS its reads: the card's name, the roster status, the draft line and one scope chip per selected field", async ({ mount, page }) => {
  await routeTrpc(page, baseRoutes());
  const component = await mount(<RefineryContentStory sessionId={SESSION_ID} />);

  // The settled pane exists at all — the surface's own testid, which is only rendered past BOTH gates
  // (`session.data` and the gated `character.data`).
  await expect(component.getByTestId(testId("refineryContent"))).toBeVisible();

  // Identity comes from the CARD read, status from the SESSION read: one row proving both landed and were
  // joined, which is the composition no component CT can exercise.
  await expect(page.getByText("Zephyrine Vale")).toBeVisible();
  await expect(page.getByText("active")).toBeVisible();
  await expect(page.getByText("draft — the live card is untouched")).toBeVisible();

  // The scope strip is derived from `selection.fields`, in canonical order, one chip each.
  await expect(page.getByText("Description", { exact: true })).toBeVisible();
  await expect(page.getByText("Personality", { exact: true })).toBeVisible();

  // The stepper's per-stage status is projected from the LEDGER — "overall 8.2" is the LATEST score run,
  // i.e. the last-write-wins fold over an oldest-first wire.
  await expect(page.getByTestId(testId("refineryStepper"))).toContainText("overall 8.2");
  // The pane opens on score and paints that same latest run (the count-up settles, so poll the text).
  await expect(page.getByTestId("refinery-hero-value")).toHaveText("8.2");
  await expect(page.getByText("Much sharper after the rewrite.")).toBeVisible();
});

test("the §16.1 WALKER pins a superseded run and the pane follows it — with the chip that says so", async ({ mount, page }) => {
  await routeTrpc(page, baseRoutes());
  const component = await mount(<RefineryContentStory sessionId={SESSION_ID} viewBackRunId={SCORE_RUN_SUPERSEDED} />);

  // Settle on the LIVE arm first: view-back is a transition between two settled states, and asserting the
  // second without pinning the first would pass on a pane that never moved.
  await expect(page.getByTestId("refinery-hero-value")).toHaveText("8.2");
  await expect(page.getByText("superseded")).toHaveCount(0);

  // The door the CONTEXT Runs tab drives (`setRefineryViewedRun`) — a SIBLING pane in production, which is
  // exactly why this surface's own CT has to reach it through the shared state seam.
  await component.getByRole("button", { name: "walk back" }).click();

  await expect(page.getByText("viewing round 0 · superseded")).toBeVisible();
  await expect(page.getByTestId("refinery-hero-value")).toHaveText("4.1");
  await expect(page.getByText("Thin in the middle.")).toBeVisible();

  // And the walk is REVERSIBLE through the stepper (its `onSelect` clears the pin) — the pane returns to
  // the live latest rather than stranding the user on an old commit.
  await page.getByRole("button", { name: STEP_SCORE }).click();
  await expect(page.getByText("superseded")).toHaveCount(0);
  await expect(page.getByTestId("refinery-hero-value")).toHaveText("8.2");
});

test("a per-block KEEP/DISCARD decision drives the apply: only the kept block is sent, and the terminal outcome itemizes it", async ({ mount, page }) => {
  // Recorded as a LIST, not a nullable single: the count is an assertion of its own (one press, one call),
  // and reading `[0]` needs no cast — a `let x: T | null` written only inside a closure stays narrowed to
  // `null` for tsc, which is exactly the pressure that produces a banned `as unknown as` double-cast.
  const applyInputs: ApplyInput[] = [];
  await routeTrpc(page, {
    ...baseRoutes(),
    // INPUT-AWARE (header): the outcome is a function of the accepts the surface actually sent. Hand this
    // a fixed two-field array and the Discard below stops proving anything.
    "refinery.applyFields": (input: unknown): unknown => {
      const decoded = input as ApplyInput;
      applyInputs.push(decoded);
      return {
        applied: decoded.accepts.map((accept) => ({ field: accept.field, kind: "replaced" })),
        dropped: [],
        character: CARD,
        snapshotId: "casn_ct_snapshot",
      };
    },
  });
  const component = await mount(<RefineryContentStory sessionId={SESSION_ID} />);
  await expect(page.getByTestId("refinery-hero-value")).toHaveText("8.2");

  // Walk to the rewrite stage — the accept review only exists there.
  await page.getByRole("button", { name: STEP_REWRITE }).click();
  // Both selected fields became reviewable BLOCKS — the join of the rewrite run's payload with the live
  // card and the session's scope, which is the derivation no component CT performs.
  await expect(page.locator('[data-slot="compare-block-after"]')).toContainText(REWRITTEN_DESCRIPTION);
  await expect(page.locator('[data-slot="compare-block-before"]')).toContainText(LIVE_DESCRIPTION);
  await expect(page.getByRole("button", { name: DISCARD_PERSONALITY })).toBeVisible();

  // FAIL-CLOSED: every block opens Undecided, so with nothing decided there is nothing to apply and the
  // terminal verb is inert. (Belt 10 — the surface must not offer a press that would write nothing.)
  await expect(page.getByRole("button", { name: ANY_APPLY_COUNT })).toBeDisabled();

  await page.getByRole("button", { name: KEEP_DESCRIPTION }).click();
  await page.getByRole("button", { name: DISCARD_PERSONALITY }).click();

  // ONE kept: the counter on the verb is the surface's own accounting of the decision sheet.
  await expect(page.getByRole("button", { name: "Apply 1 kept" })).toBeEnabled();
  await page.getByRole("button", { name: "Apply 1 kept" }).click();

  // The TERMINAL result replaces the stage pane: the itemization, the reversibility line, and the exit.
  await expect(component.getByTestId(testId("refineryApplyOutcome"))).toBeVisible();
  await expect(page.getByText("1 field written.")).toBeVisible();
  await expect(
    page.getByText(`A snapshot was taken first — "auto: before refinery apply · ${SESSION_ID}" — reversible from the character's History tab.`),
  ).toBeVisible();
  await expect(page.getByText("replaced")).toBeVisible();
  await expect(page.getByRole("button", { name: "Done" })).toBeVisible();

  // …and the WIRE agrees with the pixels: the discarded block never left the browser. Asserted after the
  // outcome painted, so this reads a settled recording, not a race.
  expect(applyInputs).toHaveLength(1);
  expect(applyInputs[0]?.accepts).toEqual([{ field: "description" }]);
});
