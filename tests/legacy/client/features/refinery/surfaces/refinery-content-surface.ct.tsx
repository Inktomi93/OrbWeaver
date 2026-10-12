// CT: the LIVE refinery CONTENT workflow, mounted whole (audit `client-preset-refinery-01`), at the
// WORKBENCH composition (program #102, mockup variant C). The section mounts `RefineryContentSurface` in
// its CONTENT slot (`lib/refinery-section.tsx:83`), and the composition it performs is what this file
// exists to hold: three reads joined (session · runs · preflight, plus the gated card), the three-lane
// derivation, the per-rewrite decision sheet, and five write paths. Every component under it has its own
// CT and every one of those stays green while the JOIN breaks — precisely the class this file closes.
//
// THE WALK THROUGH THE PRODUCT, IN ORDER: load (all three lanes settled at once, not a spinner and not one
// stage behind a stepper) → view-back (the §16.1 walker pins a superseded run, ONE lane follows it, and the
// explicit way home returns it) → a per-field rewrite decision (the ratified Keep/Discard accept grammar,
// fail-closed) → apply → the terminal itemized outcome. Plus the claim the parallel canvas creates: three
// payloads side by side assert that they belong together, and the surface says so when they do not.
//
// THE RESPONDERS ARE INPUT-AWARE, never fixed arrays: `refinery.applyFields` ANSWERS THE ACCEPTS IT WAS
// SENT. A responder that ignored its input would paint the same outcome whether the surface sent one
// accept or three, so the Discard half of the grammar would be unfalsifiable — green by absence. The
// recorded input is asserted beside the rendered outcome for the same reason.
//
// Every barrier is a SETTLED rendered state. The pending arm (the `QueryBoundary` `reserveKey="refinery.
// session"` skeleton — #1188, replacing the old unkeyed "Loading the session…" sentence that reserved no
// box and let the workbench's whole settle move under it) is deliberately NOT asserted: it exists only
// while `refinery.getSession`/`character.get` are in flight, so pinning it passes where the flash is
// catchable and flakes where it is not.
//
// THE CLOCK IS FROZEN on every mount: the masthead's credit line renders an elapsed-since stamp off the
// session's `createdAt`, and `FROZEN_AT_MS` here IS `tests/support/iso/clock.ts`'s `FROZEN_AT_MS`, so the stamp
// is a fixed string rather than a value that drifts with the wall clock.

import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { FROZEN_AT_MS } from "@orb/testkit/iso/clock.ts";
import type { TrpcInput, TrpcRoutes, TrpcWireOutput } from "@orb/testkit/node/route-trpc.ts";
import { routeTrpc, trpcError, trpcHold } from "@orb/testkit/node/route-trpc.ts";
import { expect, test } from "@playwright/experimental-ct-react";
import { makeCharacterDetail } from "../../character/fixtures.ts";
import { RefineryContentStory } from "../_ct-stories.tsx";
import {
  CARD,
  freeze,
  LIVE_DESCRIPTION,
  ledger,
  preflight,
  REWRITE_RUN,
  REWRITTEN_DESCRIPTION,
  rewriteRun,
  SCORE_RUN_SUPERSEDED,
  SESSION_ID,
  sessionView,
  testId,
} from "./_refinery-content-support.ts";

const ANALYZE_RUN = mintTypeId(ID_PREFIX.refineryRun);
/** A rewrite that never lands in the ledger — the analyze's `sourceRunId` points here so the DAG edge says
 *  "this verdict is about a rewrite the canvas is not showing". */
const ORPHANED_REWRITE = mintTypeId(ID_PREFIX.refineryRun);

/** The session view with a few members changed — annotated, so the responder's exact-wire check sees the
 *  procedure's own output type rather than a widened spread. */
function sessionWith(patch: Partial<TrpcWireOutput<"refinery.getSession">>): TrpcWireOutput<"refinery.getSession"> {
  return { ...sessionView(), ...patch };
}

/** An analyze whose DAG parent is `sourceRunId` — the rewrite it judged. */
function analyzeRun(sourceRunId: string): TrpcWireOutput<"refinery.listRuns">[number] {
  return {
    id: ANALYZE_RUN,
    sessionId: SESSION_ID,
    iteration: 1,
    model: "test-analyzer",
    promptTokens: 2400,
    outputTokens: 700,
    durationMs: 12_000,
    sourceRunId,
    strippedKeys: [],
    createdAt: FROZEN_AT_MS + 3,
    stage: "analyze",
    payloadConfig: { kind: "fixed", mode: "full" },
    payload: {
      verdict: "NEEDS_REFINEMENT",
      soulScore: 8,
      soulAssessment: "Still unmistakably Zephyrine.",
      preserved: ["The ledger she won't close"],
      lost: [],
      gained: ["A reason to move"],
      issues: [],
      recommendations: ["Re-add the closing line"],
    },
  };
}

/** Preflight where the named stages breach the CONTEXT ceiling — the arm whose sentence is stage-neutral
 *  ("the assembled prompt likely exceeds the model's context"), i.e. the one two lanes can duplicate.
 *  `maxOutputTokens` stays generous so the output arm, which words itself per stage, does not fire. */
function preflightOver(over: readonly string[]): TrpcWireOutput<"refinery.preflight"> {
  return {
    contextTokens: 8000,
    stages: (["score", "rewrite", "analyze"] as const).map((stage) => ({
      stage,
      model: "test-model",
      temperature: null,
      maxOutputTokens: 4096,
      inputEstimate: over.includes(stage) ? 12_000 : 2736,
      outputEstimate: 1490,
    })),
  };
}

/** Preflight where score is over its OUTPUT ceiling and analyze is over the CONTEXT — two different facts,
 *  so two different sentences, so no hoist. */
function preflightDiverged(): TrpcWireOutput<"refinery.preflight"> {
  return {
    contextTokens: 8000,
    stages: [
      { stage: "score", model: "test-model", temperature: null, maxOutputTokens: 512, inputEstimate: 2736, outputEstimate: 1490 },
      { stage: "rewrite", model: "test-model", temperature: null, maxOutputTokens: 4096, inputEstimate: 2736, outputEstimate: 1490 },
      { stage: "analyze", model: "test-model", temperature: null, maxOutputTokens: 4096, inputEstimate: 12_000, outputEstimate: 1490 },
    ],
  };
}

// The review verbs are anchored because
// "Keep description" and "Keep (empties field) description" are different consent acts.
const KEEP_DESCRIPTION = /^Keep description$/;
const DISCARD_PERSONALITY = /^Discard personality$/;
const ANY_APPLY_COUNT = /^Apply \d+ kept$/;
/** Every lane's run verb, in either arm — the set the "one filled control" census is taken over. */
const RUN_ANY_STAGE = /^(Run|Re-run) (score|rewrite|analyze)$/;
const BACK_TO_LATEST = /^Back to latest$/;

function applyResult(input: TrpcInput<"refinery.applyFields">): TrpcWireOutput<"refinery.applyFields"> {
  return {
    applied: input.accepts.map((accept) =>
      accept.field === "greetings"
        ? { field: "greetings", greetingIndex: accept.greetingIndex ?? 0, kind: "replaced" }
        : { field: accept.field, kind: "replaced" },
    ),
    dropped: [],
    character: CARD,
    snapshotId: "casn_ct_snapshot",
  };
}

/** The three reads plus the gated card — everything the session pane joins — and the per-press decision
 *  write every Keep/Discard now makes. */
function baseRoutes(): TrpcRoutes<"refinery.getSession" | "refinery.listRuns" | "refinery.preflight" | "character.get" | "refinery.decideRewrite"> {
  return {
    "refinery.getSession": () => sessionView(),
    "refinery.listRuns": ledger,
    "refinery.preflight": preflight,
    "character.get": () => CARD,
    "refinery.decideRewrite": (input: TrpcInput<"refinery.decideRewrite">) => sessionWith({ rewriteDecisions: { [input.rewriteRunId]: input.decisions } }),
  };
}

test("the session pane JOINS its reads: the masthead's card name, the roster status, the draft line and one scope chip per selected field", async ({
  mount,
  page,
}) => {
  await freeze(page);
  await routeTrpc(page, baseRoutes());
  const component = await mount(<RefineryContentStory sessionId={SESSION_ID} />);

  // The settled pane exists at all — the surface's own testid, which is only rendered past BOTH gates
  // (`session.data` and the gated `character.data`).
  await expect(component.getByTestId(testId("refineryContent"))).toBeVisible();

  // Identity comes from the CARD read, status from the SESSION read: one masthead proving both landed and
  // were joined, which is the composition no component CT can exercise. The card name is the surface's ONE
  // opening statement, so it is a real heading, not a label beside the chips.
  await expect(page.getByRole("heading", { name: "Zephyrine Vale" })).toBeVisible();
  await expect(page.getByText("active", { exact: true })).toBeVisible();
  await expect(page.getByText("draft — the live card is untouched")).toBeVisible();

  // The scope strip is derived from `selection.fields`, in canonical order, one chip each.
  await expect(page.getByText("Description", { exact: true })).toBeVisible();
  await expect(page.getByText("Personality", { exact: true })).toBeVisible();
});

// ── THE #885 RESERVATION SEAM, AT THIS MOUNT (#1188) ─────────────────────────────────────────────────
// Opening a session used to paint a bare, unreserved "Loading the session…" sentence while the
// `getSession` → `character.get` waterfall and the dense workbench's own settle ran underneath it — a
// couple-second flash-and-shift on every rail landing (owner-felt, 2026-09-02). `trpcHold` pins the
// PENDING render as a stable, indefinitely-held state (never a race against a real flash) so the fallback
// itself is assertable: the reserved `SkeletonRows` busy region, never the surface's own content testid.

test("#1188 a HELD session read shows the reserved skeleton, never the surface's content testid — and settles into the real workbench on release", async ({
  mount,
  page,
}) => {
  await freeze(page);
  const hold = trpcHold<"refinery.getSession">();
  await routeTrpc(page, { ...baseRoutes(), "refinery.getSession": hold });
  const component = await mount(<RefineryContentStory sessionId={SESSION_ID} />);

  // THE BARRIER: the query is in flight and held — a stable state, not a caught flash.
  await hold.requested;
  await expect(component.getByTestId(testId("refineryContent"))).toHaveCount(0);
  // A real busy region (the shared `SkeletonRows`, #885's fallback shape), never the old bare sentence.
  await expect(page.locator('[aria-busy="true"] [data-slot="skeleton"]').first()).toBeVisible();
  await expect(page.getByText("Loading the session")).toHaveCount(0);

  hold.release(sessionView());

  // …and the SETTLED workbench replaces the skeleton — the join this pane exists to prove still holds.
  await expect(component.getByTestId(testId("refineryContent"))).toBeVisible();
  await expect(page.getByRole("heading", { name: "Zephyrine Vale" })).toBeVisible();
  await expect(page.locator('[aria-busy="true"] [data-slot="skeleton"]')).toHaveCount(0);
});

// ── THE CREDIT LINE NAMES THE MODEL (side-eye 2026-08-17, finding b) ─────────────────────────────────
// A self-hosted connection's `model` is an absolute weights PATH. The masthead inlined it raw into the
// caps/mono credit line, which wrapped onto a second row under the card's name. `@orb/kit/model-name` is
// the repo's answer to exactly this shape (#115) and every other model-naming surface already uses it.
/** A served local checkpoint, in the shape the engine actually reports (the kit's own worked example). */
const LOCAL_WEIGHTS_PATH = "/mnt/models/storage/vllm-models/quantized/Huihui-ThinkingCap-Qwen3.6-27B-abliterated-W8A8-Dynamic-Per-Token";
const LOCAL_WEIGHTS_DISPLAY = "Huihui-ThinkingCap-Qwen3.6-27B-abliterated · W8A8";

test("each lane credits the model that produced ITS result, by NAME — the masthead pins none, and a weights path never prints raw", async ({ mount, page }) => {
  await freeze(page);
  await routeTrpc(page, {
    ...baseRoutes(),
    "refinery.listRuns": () => [...ledger().slice(0, 2), { ...rewriteRun(), model: LOCAL_WEIGHTS_PATH }, analyzeRun(REWRITE_RUN)],
  });
  await mount(<RefineryContentStory sessionId={SESSION_ID} />);

  const rewrite = page.getByTestId(testId("refineryRewriteLane"));
  await expect(rewrite).toContainText(LOCAL_WEIGHTS_DISPLAY);
  await expect(rewrite, "the raw path is not printed").not.toContainText(LOCAL_WEIGHTS_PATH);
  // LOSSLESS: the full identifier is still reachable, on the credit's own tooltip.
  await expect(rewrite.getByTitle(LOCAL_WEIGHTS_PATH)).toBeVisible();
  // Score and analyze ran on other models, and each lane says so — never the rewrite's model for all three.
  await expect(page.locator('[data-lane="score"]')).toContainText("test-scorer");
  await expect(page.locator('[data-lane="analyze"]')).toContainText("test-analyzer");
  await expect(page.getByTestId(testId("refineryMasthead"))).not.toContainText(LOCAL_WEIGHTS_DISPLAY);
});

test("ALL THREE STAGES are on one canvas: the score lane's latest payload, the rewrite island's accept work, and the analyze verdict", async ({
  mount,
  page,
}) => {
  await freeze(page);
  await routeTrpc(page, {
    ...baseRoutes(),
    "refinery.listRuns": () => [...ledger(), analyzeRun(REWRITE_RUN)],
  });
  await mount(<RefineryContentStory sessionId={SESSION_ID} />);

  // Lane 1 — the LATEST score (a last-write-wins fold over an oldest-first wire), with its docked summary.
  const score = page.locator('[data-lane="score"]');
  await expect(score.getByTestId("refinery-hero-value")).toHaveText("8.2");
  await expect(score.getByText("Much sharper after the rewrite.")).toBeVisible();

  // Lane 2 — the rewrite island, with the join of the run payload, the live card and the session's scope
  // already performed: the open field's pair, and the other field addressable in the queue.
  const rewrite = page.getByTestId("refinery-rewrite-lane");
  await expect(rewrite.locator('[data-slot="compare-block-after"]')).toContainText(REWRITTEN_DESCRIPTION);
  await expect(rewrite.locator('[data-slot="compare-block-before"]')).toContainText(LIVE_DESCRIPTION);
  await expect(rewrite.getByRole("button", { name: DISCARD_PERSONALITY })).toBeVisible();

  // Lane 3 — the verdict, beside the two payloads it is about, not one stepper press away.
  const analyze = page.locator('[data-lane="analyze"]');
  await expect(analyze.getByText("NEEDS_REFINEMENT")).toBeVisible();
  await expect(analyze.getByText("The ledger she won't close")).toBeVisible();
});

test("the canvas says when its lanes DISAGREE: a verdict about a rewrite the canvas is not showing is marked, and a matching one is not", async ({
  mount,
  page,
}) => {
  await freeze(page);
  await routeTrpc(page, {
    ...baseRoutes(),
    // The analyze's DAG parent is a rewrite that is not in the ledger — the engine's own `sourceRunId` edge
    // is the whole signal; nothing new is asked of the server.
    "refinery.listRuns": () => [...ledger(), analyzeRun(ORPHANED_REWRITE)],
  });
  await mount(<RefineryContentStory sessionId={SESSION_ID} />);

  const analyze = page.locator('[data-lane="analyze"]');
  await expect(analyze.getByText("NEEDS_REFINEMENT")).toBeVisible();
  await expect(analyze.getByText("judged an earlier rewrite")).toBeVisible();
  // The score lane is current and says nothing — the note is a STATE, not a permanent slot.
  await expect(page.locator('[data-lane="score"]').getByText("judged an earlier rewrite")).toHaveCount(0);
});

test("the §16.1 WALKER pins a superseded run — ONE lane follows it, the others stay live, and the explicit verb returns it", async ({ mount, page }) => {
  await freeze(page);
  await routeTrpc(page, baseRoutes());
  const component = await mount(<RefineryContentStory sessionId={SESSION_ID} viewBackRunId={SCORE_RUN_SUPERSEDED} />);

  const score = page.locator('[data-lane="score"]');
  // Settle on the LIVE arm first: view-back is a transition between two settled states, and asserting the
  // second without pinning the first would pass on a pane that never moved.
  await expect(score.getByTestId("refinery-hero-value")).toHaveText("8.2");
  await expect(page.getByText("superseded")).toHaveCount(0);

  // The door the CONTEXT Runs tab drives (`setRefineryViewedRun`) — a SIBLING pane in production, which is
  // exactly why this surface's own CT has to reach it through the shared state seam.
  await component.getByRole("button", { name: "walk back" }).click();

  await expect(score.getByText("viewing round 0 · superseded")).toBeVisible();
  await expect(score.getByTestId("refinery-hero-value")).toHaveText("4.1");
  await expect(score.getByText("Thin in the middle.")).toBeVisible();
  // The pin is per-LANE: the rewrite island beside it is untouched and still shows the live accept work.
  await expect(page.getByTestId("refinery-rewrite-lane").getByRole("button", { name: DISCARD_PERSONALITY })).toBeVisible();

  // And the walk is REVERSIBLE through an EXPLICIT verb. The stepper used to clear the pin as a side effect
  // of switching stage; with the stepper gone this is the only way home, so its absence would strand a user
  // on a superseded run.
  await score.getByRole("button", { name: BACK_TO_LATEST }).click();
  await expect(page.getByText("superseded")).toHaveCount(0);
  await expect(score.getByTestId("refinery-hero-value")).toHaveText("8.2");
});

// ── HONEST GATING + THE FOCAL (#158 items 4 and 5) ───────────────────────────────────────────────────
// The gate is the SERVER'S, re-derived, never invented: `assertStageReady` (domain/refinery/verbs/
// run-stage.ts) refuses exactly one cold case — an analyze with no rewrite. A cold REWRITE with no score
// is legal (`dispatchRewrite` passes `prior.score?.payload ?? null`), which is why only one of the two
// buttons the issue named is disabled here and the other's CAPTION was the thing that lied.

/** A session with NOTHING run yet — round 0, the state the owner's screenshot was taken in. */
function emptyLedger(): TrpcWireOutput<"refinery.listRuns"> {
  return [];
}

test("at round 0 the gated stage says so and the runnable ones do not — the gate is the server's, not a caption's", async ({ mount, page }) => {
  await freeze(page);
  await routeTrpc(page, { ...baseRoutes(), "refinery.listRuns": emptyLedger });
  await mount(<RefineryContentStory sessionId={SESSION_ID} />);
  await expect(page.getByTestId(testId("refineryContent"))).toBeVisible();

  // ANALYZE is genuinely un-runnable — the server refuses it outright — so it renders disabled WITH the
  // reason, rather than at full enabled weight beside a caption stating the precondition it ignores.
  const analyze = page.locator('[data-lane="analyze"]');
  await expect(analyze.getByRole("button", { name: "Run analyze" })).toBeDisabled();
  await expect(analyze.getByText("Run a rewrite first — analyze judges a rewrite against your original.")).toBeVisible();

  // SCORE and REWRITE are both live at round 0. A client-side "you must score first" would be a stricter
  // rule than the domain's, i.e. a tier-collapse — the rewrite simply runs ungrounded, and the copy says so.
  await expect(page.locator('[data-lane="score"]').getByRole("button", { name: "Run score" })).toBeEnabled();
  await expect(page.getByTestId(testId("refineryRewriteLane")).getByRole("button", { name: "Run rewrite" })).toBeEnabled();
});

test("the FOCAL tracks the actionable stage: at round 0 it is on SCORE, and it moves to the rewrite island once a score exists", async ({ mount, page }) => {
  await freeze(page);
  await routeTrpc(page, { ...baseRoutes(), "refinery.listRuns": emptyLedger });
  await mount(<RefineryContentStory sessionId={SESSION_ID} />);
  await expect(page.getByTestId(testId("refineryContent"))).toBeVisible();

  // ONE focal (CD3), and it points where the user should go. The accent used to sit permanently on
  // 2 · REWRITE, which at round 0 is not the recommended next step.
  await expect(page.locator('[data-lane="score"]')).toHaveAttribute("data-focal", "true");
  await expect(page.getByTestId(testId("refineryRewriteLane"))).not.toHaveAttribute("data-focal", "true");
  await expect(page.locator('[data-lane="analyze"]')).not.toHaveAttribute("data-focal", "true");
});

test("the FOCAL moves to the rewrite island once a score has landed — the accept work is the decision from there on", async ({ mount, page }) => {
  await freeze(page);
  await routeTrpc(page, baseRoutes());
  await mount(<RefineryContentStory sessionId={SESSION_ID} />);
  await expect(page.locator('[data-lane="score"]').getByTestId("refinery-hero-value")).toHaveText("8.2");

  await expect(page.getByTestId(testId("refineryRewriteLane"))).toHaveAttribute("data-focal", "true");
  await expect(page.locator('[data-lane="score"]')).not.toHaveAttribute("data-focal", "true");
});

// ── ONE ACT, ONE BODY (side-eye 2026-08-19 P1-4 / P2) ────────────────────────────────────────────────

test("exactly ONE run control on the canvas is filled, and it is the FOCAL lane's — the rest recede", async ({ mount, page }) => {
  await freeze(page);
  await routeTrpc(page, { ...baseRoutes(), "refinery.listRuns": emptyLedger });
  await mount(<RefineryContentStory sessionId={SESSION_ID} />);
  await expect(page.getByTestId(testId("refineryContent"))).toBeVisible();

  // A `secondary` button paints `bg-transparent`, so "is this one filled?" is the resolved background's
  // alpha, not a class list — and counting the filled ones across the whole canvas is the claim: §14 is
  // one loud verb in the work pane, and the CONTEXT ledger's twin of it went ghost (see the Runs tab CT).
  const filled = await page
    .getByRole("button", { name: RUN_ANY_STAGE })
    .evaluateAll((nodes) => nodes.filter((node) => getComputedStyle(node).backgroundColor !== "rgba(0, 0, 0, 0)").map((node) => node.textContent ?? ""));
  expect(filled, "one filled run control, on the lane the pipeline says to run").toEqual(["Run score"]);
  // …and it IS the focal lane's, which is the thing that makes the emphasis mean something.
  await expect(page.locator('[data-lane="score"]')).toHaveAttribute("data-focal", "true");
});

test("two stages breaching with the SAME sentence print ONE session-level warning, not the same paragraph twice", async ({ mount, page }) => {
  await freeze(page);
  await routeTrpc(page, { ...baseRoutes(), "refinery.preflight": () => preflightOver(["score", "analyze"]) });
  await mount(<RefineryContentStory sessionId={SESSION_ID} />);
  await expect(page.getByTestId(testId("refineryContent"))).toBeVisible();

  // THE DEFECT: the context-overrun sentence is about the SELECTION, so with score and analyze both over
  // it rendered verbatim in two lanes with two identically-named "Narrow the selection" buttons about one
  // selection. Once, now — and the button says what it narrows for.
  await expect(page.getByTestId(testId("refineryPreflightWarn"))).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Narrow the selection for score and analyze" })).toBeVisible();
  // The warning glyph stays per-lane: that mark is about THIS stage's numbers, and suppressing it would lose the
  // reason the hoisted paragraph is on screen at all.
  await expect(page.locator('[data-lane="score"]').getByTestId(testId("refineryFitLine"))).toContainText("⚠");
});

test("…and stages breaching DIFFERENTLY keep their own warnings, each named for its own stage", async ({ mount, page }) => {
  await freeze(page);
  await routeTrpc(page, { ...baseRoutes(), "refinery.preflight": () => preflightDiverged() });
  await mount(<RefineryContentStory sessionId={SESSION_ID} />);
  await expect(page.getByTestId(testId("refineryContent"))).toBeVisible();

  // Divergence is the case where two warnings are two FACTS, so both stay — and neither button is
  // ambiguous, which was the other half of the finding.
  await expect(page.getByTestId(testId("refineryPreflightWarn"))).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Narrow the selection for score" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Narrow the selection for analyze" })).toBeVisible();
});

test("the workbench has a door back to the card it is about", async ({ mount, page }) => {
  await freeze(page);
  await routeTrpc(page, baseRoutes());
  await mount(<RefineryContentStory sessionId={SESSION_ID} />);
  await expect(page.getByTestId(testId("refineryMasthead"))).toBeVisible();
  // The utility question the review asked: the whole surface is about one character and there was no way
  // to reach it. The name is in the accessible name so the control is unambiguous in a controls list.
  await expect(page.getByRole("button", { name: "Open card Zephyrine Vale in the Characters section" })).toBeVisible();
});

test("a per-field KEEP/DISCARD decision drives the apply: only the kept field is sent, and the terminal outcome itemizes it", async ({ mount, page }) => {
  await freeze(page);
  // Recorded as a LIST, not a nullable single: the count is an assertion of its own (one press, one call),
  // and reading `[0]` needs no cast — a `let x: T | null` written only inside a closure stays narrowed to
  // `null` for tsc, which is exactly the pressure that produces a banned `as unknown as` double-cast.
  const applyInputs: TrpcInput<"refinery.applyFields">[] = [];
  await routeTrpc(page, {
    ...baseRoutes(),
    // INPUT-AWARE (header): the outcome is a function of the accepts the surface actually sent. Hand this
    // a fixed two-field array and the Discard below stops proving anything.
    "refinery.applyFields": (input: TrpcInput<"refinery.applyFields">) => {
      applyInputs.push(input);
      return applyResult(input);
    },
  });
  const component = await mount(<RefineryContentStory sessionId={SESSION_ID} />);
  await expect(page.locator('[data-lane="score"]').getByTestId("refinery-hero-value")).toHaveText("8.2");

  // The accept work needs no stage switch — the rewrite island is on the canvas from the first paint.
  const rewrite = page.getByTestId("refinery-rewrite-lane");
  await expect(rewrite.locator('[data-slot="compare-block-after"]')).toContainText(REWRITTEN_DESCRIPTION);

  // FAIL-CLOSED: every field opens Undecided, so with nothing decided there is nothing to apply and the
  // terminal verb is inert. (Belt 10 — the surface must not offer a press that would write nothing.)
  await expect(page.getByRole("button", { name: ANY_APPLY_COUNT })).toBeDisabled();

  await page.getByRole("button", { name: KEEP_DESCRIPTION }).click();
  await page.getByRole("button", { name: DISCARD_PERSONALITY }).click();

  // ONE kept: the counter on the verb is the surface's own accounting of the decision sheet.
  await expect(page.getByRole("button", { name: "Apply 1 kept" })).toBeEnabled();
  await page.getByRole("button", { name: "Apply 1 kept" }).click();

  // The TERMINAL result replaces the three-lane canvas: the itemization, the reversibility line, and the exit.
  await expect(component.getByTestId(testId("refineryApplyOutcome"))).toBeVisible();
  await expect(page.getByText("1 field written.")).toBeVisible();
  // The rollback point is named for the user, never by its raw snapshot label: no session id leaks.
  await expect(component.getByTestId(testId("refineryApplyOutcome"))).not.toContainText(SESSION_ID);
  await expect(page.getByText("replaced")).toBeVisible();
  await expect(page.getByRole("button", { name: "Done" })).toBeVisible();

  // …and the WIRE agrees with the pixels: the discarded field never left the browser. Asserted after the
  // outcome painted, so this reads a settled recording, not a race.
  expect(applyInputs).toHaveLength(1);
  expect(applyInputs[0]?.accepts).toEqual([{ field: "description" }]);
});

// ── FINAL-PASS FIXES (0575) ───────────────────────────────────────────────────────────────────────────

/** A rewrite run as an OLDER build stored it: the model put a slot index on a non-greetings field. */
const STRAY_INDEX_REWRITE_RUN = mintTypeId(ID_PREFIX.refineryRun);

/** The stray-index run's id and economics, carrying any payload a test needs. */
function rewriteRunWith(
  fields: Extract<TrpcWireOutput<"refinery.listRuns">[number], { stage: "rewrite" }>["payload"]["fields"],
): TrpcWireOutput<"refinery.listRuns">[number] {
  return { ...strayIndexRewriteRun(), stage: "rewrite", payloadConfig: { kind: "fixed", mode: "balanced" }, payload: { fields } };
}

function strayIndexRewriteRun(): TrpcWireOutput<"refinery.listRuns">[number] {
  return {
    id: STRAY_INDEX_REWRITE_RUN,
    sessionId: SESSION_ID,
    iteration: 1,
    model: "test-rewriter",
    promptTokens: 3100,
    outputTokens: 900,
    durationMs: 18_000,
    sourceRunId: null,
    strippedKeys: [],
    createdAt: FROZEN_AT_MS + 2,
    stage: "rewrite",
    payloadConfig: { kind: "fixed", mode: "balanced" },
    payload: {
      fields: [
        { field: "description", greetingIndex: 0, text: REWRITTEN_DESCRIPTION },
        { field: "greetings", greetingIndex: 1, text: "Back again, and early." },
      ],
    },
  };
}

test("a kept non-greetings field never carries a model-supplied slot index to the apply; a kept greeting keeps its own", async ({ mount, page }) => {
  await freeze(page);
  const applyInputs: TrpcInput<"refinery.applyFields">[] = [];
  const card = makeCharacterDetail({ ...CARD, greetings: [{ text: "Hello." }, { text: "Back again." }] });
  await routeTrpc(page, {
    ...baseRoutes(),
    "refinery.getSession": () => sessionWith({ originalCard: card, selection: { fields: ["description", "greetings"] } }),
    "character.get": () => card,
    "refinery.listRuns": () => [strayIndexRewriteRun()],
    "refinery.applyFields": (input: TrpcInput<"refinery.applyFields">) => {
      applyInputs.push(input);
      return applyResult(input);
    },
  });
  const component = await mount(<RefineryContentStory sessionId={SESSION_ID} />);
  await page.getByRole("button", { name: KEEP_DESCRIPTION }).click();
  await page.getByRole("button", { name: /^Keep greetings \[1\]$/ }).click();
  await page.getByRole("button", { name: "Apply 2 kept" }).click();
  await expect(component.getByTestId(testId("refineryApplyOutcome"))).toBeVisible();
  expect(applyInputs[0]?.accepts).toEqual([{ field: "description" }, { field: "greetings", greetingIndex: 1 }]);
});

test("each Keep/Discard press persists the run's WHOLE sheet, addressed by payload position", async ({ mount, page }) => {
  await freeze(page);
  const decideInputs: TrpcInput<"refinery.decideRewrite">[] = [];
  await routeTrpc(page, {
    ...baseRoutes(),
    "refinery.decideRewrite": (input: TrpcInput<"refinery.decideRewrite">) => {
      decideInputs.push(input);
      return sessionWith({ rewriteDecisions: { [input.rewriteRunId]: input.decisions } });
    },
  });
  await mount(<RefineryContentStory sessionId={SESSION_ID} />);
  await page.getByRole("button", { name: KEEP_DESCRIPTION }).click();
  await page.getByRole("button", { name: DISCARD_PERSONALITY }).click();
  await expect(page.getByRole("button", { name: "Apply 1 kept" })).toBeEnabled();
  await expect.poll(() => decideInputs.length).toBe(2);
  expect(decideInputs.map((input) => input.decisions)).toEqual([[true], [true, false]]);
  expect(decideInputs.every((input) => input.rewriteRunId === REWRITE_RUN && input.sessionId === SESSION_ID)).toBe(true);
});

test("RE-ENTRY reopens the persisted decisions: the kept count and each field's state come back from the session", async ({ mount, page }) => {
  await freeze(page);
  await routeTrpc(page, {
    ...baseRoutes(),
    "refinery.getSession": () => sessionWith({ rewriteDecisions: { [REWRITE_RUN]: [true, false] } }),
  });
  await mount(<RefineryContentStory sessionId={SESSION_ID} />);
  await expect(page.getByRole("button", { name: "Apply 1 kept" })).toBeEnabled();
  await expect(page.getByTestId(testId("refineryQueueRow")).and(page.locator('[data-queue-state="kept"]'))).toHaveCount(1);
  await expect(page.getByTestId(testId("refineryQueueRow")).and(page.locator('[data-queue-state="discarded"]'))).toHaveCount(1);
});

test("a COMPLETED session locks Apply with the reason beside it; Save as copy (a branch) stays available; the masthead says applied", async ({
  mount,
  page,
}) => {
  await freeze(page);
  await routeTrpc(page, {
    ...baseRoutes(),
    "refinery.getSession": () => sessionWith({ status: "completed", rewriteDecisions: { [REWRITE_RUN]: [true, true] } }),
  });
  await mount(<RefineryContentStory sessionId={SESSION_ID} />);
  await expect(page.getByTestId(testId("refineryQueueRow")).and(page.locator('[data-queue-state="kept"]'))).toHaveCount(2);
  const apply = page.getByRole("button", { name: "Apply 2 kept" });
  await expect(apply).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save as copy" })).toBeEnabled();
  await expect(apply).toHaveAttribute("aria-describedby", /.+/u);
  // The masthead reads the session's real state, never only this view's own outcome.
  await expect(page.getByTestId(testId("refineryMasthead"))).toContainText("applied · snapshot taken");
});

test("a run that FITS prints no token arithmetic; only a breaching stage shows its fit line", async ({ mount, page }) => {
  await freeze(page);
  await routeTrpc(page, { ...baseRoutes(), "refinery.preflight": () => preflightOver(["analyze"]) });
  await mount(<RefineryContentStory sessionId={SESSION_ID} />);
  await expect(page.locator('[data-lane="score"]').getByTestId("refinery-hero-value")).toHaveText("8.2");
  await expect(page.getByTestId(testId("refineryFitLine"))).toHaveCount(1);
  await expect(page.locator('[data-lane="analyze"]').getByTestId(testId("refineryFitLine"))).toHaveCount(1);
});

test("the score hero gives its summary the lane's full width — never a narrow column beside the figure", async ({ mount, page }) => {
  await freeze(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await routeTrpc(page, baseRoutes());
  await mount(<RefineryContentStory sessionId={SESSION_ID} />);
  const hero = page.locator('[data-lane="score"]').getByTestId(testId("refineryHeroGauge"));
  const summary = hero.getByText("Much sharper after the rewrite.");
  await expect(summary).toBeVisible();
  // The figure sits above the summary, so the summary spans (nearly) the whole card.
  await expect
    .poll(async () => {
      const heroBox = await hero.boundingBox();
      const summaryBox = await summary.boundingBox();
      return heroBox === null || summaryBox === null ? 0 : summaryBox.width / heroBox.width;
    })
    .toBeGreaterThan(0.75);
});

test("session chrome stays on palette: scope pills are neutral and the ACTIVE status chip is the accent tone", async ({ mount, page }) => {
  await freeze(page);
  await routeTrpc(page, baseRoutes());
  await mount(<RefineryContentStory sessionId={SESSION_ID} />);
  const masthead = page.getByTestId(testId("refineryMasthead"));
  await expect(masthead.getByRole("group", { name: "Scope" }).locator('[data-hint-tone="info"]')).toHaveCount(0);
  await expect(masthead.getByRole("group", { name: "Scope" }).locator('[data-hint-tone="neutral"]')).toHaveCount(2);
  await expect(masthead.getByRole("group", { name: "Session state" }).locator('[data-hint-tone="accent"]')).toHaveText("active");
});

// ── ATOMIC APPLY, RECOVERY BY EXPLICIT DISCARD (owner ruling) ────────────────────────────────────────

const RECOVER_ONE = "Discard the refused field and apply the other 1";

/** The atomic refusal: nothing written, no snapshot, the one refused entry itemized. */
function refusedResult(dropped: TrpcWireOutput<"refinery.applyFields">["dropped"][number]): TrpcWireOutput<"refinery.applyFields"> {
  return { applied: [], dropped: [dropped], character: CARD, snapshotId: null };
}

test("a refused apply offers to discard exactly the refused entries and apply the rest; the discard is staged and persists", async ({ mount, page }) => {
  await freeze(page);
  const applyInputs: TrpcInput<"refinery.applyFields">[] = [];
  const decideInputs: TrpcInput<"refinery.decideRewrite">[] = [];
  // The SERVER's copy of the sheet — what a re-entry would read back.
  let stored: TrpcWireOutput<"refinery.getSession">["rewriteDecisions"] = {};
  await routeTrpc(page, {
    ...baseRoutes(),
    "refinery.getSession": () => sessionWith({ rewriteDecisions: stored }),
    "refinery.decideRewrite": (input: TrpcInput<"refinery.decideRewrite">) => {
      decideInputs.push(input);
      stored = { ...stored, [input.rewriteRunId]: input.decisions };
      return sessionWith({ rewriteDecisions: stored });
    },
    // Atomic: while personality is kept the verb refuses the whole batch; without it, it applies.
    "refinery.applyFields": (input: TrpcInput<"refinery.applyFields">) => {
      applyInputs.push(input);
      return input.accepts.some((accept) => accept.field === "personality")
        ? refusedResult({ field: "personality", reason: "diverged_since_session" })
        : applyResult(input);
    },
  });
  const component = await mount(<RefineryContentStory sessionId={SESSION_ID} />);
  await page.getByRole("button", { name: KEEP_DESCRIPTION }).click();
  await page.getByRole("button", { name: /^Keep personality$/ }).click();
  await page.getByRole("button", { name: "Apply 2 kept" }).click();

  const outcome = component.getByTestId(testId("refineryApplyOutcome"));
  await expect(outcome.getByRole("button", { name: RECOVER_ONE })).toBeVisible();
  await outcome.getByRole("button", { name: RECOVER_ONE }).click();

  await expect(page.getByText("1 field written.")).toBeVisible();
  // Exactly the refused entry was discarded (payload position 1), the other stays kept…
  await expect.poll(() => decideInputs.at(-1)?.decisions).toEqual([true, false]);
  // …and the retry sent only what remained.
  expect(applyInputs.map((input) => input.accepts)).toEqual([[{ field: "description" }, { field: "personality" }], [{ field: "description" }]]);
  // Re-entry reads the persisted sheet: personality is Discarded there too.
  expect(stored[REWRITE_RUN]).toEqual([true, false]);
});

test("no recovery is offered when every kept entry was refused — nothing would remain to apply", async ({ mount, page }) => {
  await freeze(page);
  await routeTrpc(page, {
    ...baseRoutes(),
    "refinery.applyFields": () => refusedResult({ field: "description", reason: "not_selected" }),
  });
  const component = await mount(<RefineryContentStory sessionId={SESSION_ID} />);
  await page.getByRole("button", { name: KEEP_DESCRIPTION }).click();
  await page.getByRole("button", { name: DISCARD_PERSONALITY }).click();
  await page.getByRole("button", { name: "Apply 1 kept" }).click();
  const outcome = component.getByTestId(testId("refineryApplyOutcome"));
  await expect(outcome.getByRole("button", { name: "Edit scope" })).toBeVisible();
  await expect(outcome.getByRole("button", { name: /^Discard the refused/u })).toHaveCount(0);
});

// ── VERIFIER ROUND (0575) ─────────────────────────────────────────────────────────────────────────────

function copyResult(input: TrpcInput<"refinery.applyAsCopy">): TrpcWireOutput<"refinery.applyAsCopy"> {
  const result = applyResult({ sessionId: input.sessionId, accepts: input.accepts });
  return { applied: result.applied, dropped: result.dropped, character: makeCharacterDetail({ ...CARD, name: "Zephyrine Vale (refined)" }) };
}

test("a Save as copy never tells the masthead the live card took a snapshot", async ({ mount, page }) => {
  await freeze(page);
  await routeTrpc(page, {
    ...baseRoutes(),
    "refinery.applyAsCopy": (input: TrpcInput<"refinery.applyAsCopy">) => copyResult(input),
  });
  const component = await mount(<RefineryContentStory sessionId={SESSION_ID} />);
  await page.getByRole("button", { name: KEEP_DESCRIPTION }).click();
  await page.getByRole("button", { name: "Save as copy" }).click();
  await expect(component.getByTestId(testId("refineryApplyOutcome"))).toBeVisible();
  const masthead = page.getByTestId(testId("refineryMasthead"));
  await expect(masthead).toContainText("draft — the live card is untouched");
  await expect(masthead).not.toContainText("snapshot taken");
});

test("a rewrite entry the verb always refuses is shown NOT APPLICABLE with its reason, never offered a Keep, never counted", async ({ mount, page }) => {
  await freeze(page);
  const card = makeCharacterDetail({ ...CARD, greetings: [{ text: "Hello." }] });
  await routeTrpc(page, {
    ...baseRoutes(),
    "refinery.getSession": () => sessionWith({ originalCard: card, selection: { fields: ["description", "greetings"] } }),
    "character.get": () => card,
    "refinery.listRuns": () => [
      rewriteRunWith([
        { field: "description", text: REWRITTEN_DESCRIPTION },
        // No slot index on a greetings replace, and a slot past the live card's one greeting.
        { field: "greetings", text: "Which greeting?" },
        { field: "greetings", greetingIndex: 4, text: "A slot that is gone." },
      ]),
    ],
  });
  await mount(<RefineryContentStory sessionId={SESSION_ID} />);
  const notApplicable = page.getByTestId(testId("refineryUnapplicable"));
  await expect(notApplicable).toContainText("greetings [?]");
  await expect(notApplicable).toContainText("greetings [4]");
  await expect(page.getByRole("button", { name: /^Keep greetings/u })).toHaveCount(0);
  await expect(page.getByTestId(testId("refineryQueueRow"))).toHaveCount(1);
  await page.getByRole("button", { name: KEEP_DESCRIPTION }).click();
  await expect(page.getByRole("button", { name: "Apply 1 kept" })).toBeEnabled();
});

test("decision writes are SERIALIZED: a press made while one is in flight waits, and the latest sheet lands last", async ({ mount, page }) => {
  await freeze(page);
  const decideInputs: TrpcInput<"refinery.decideRewrite">[] = [];
  const firstWrite = trpcHold<"refinery.decideRewrite">();
  await routeTrpc(page, {
    ...baseRoutes(),
    "refinery.decideRewrite": (input: TrpcInput<"refinery.decideRewrite">) => {
      decideInputs.push(input);
      return decideInputs.length === 1 ? firstWrite : sessionWith({ rewriteDecisions: { [input.rewriteRunId]: input.decisions } });
    },
  });
  await mount(<RefineryContentStory sessionId={SESSION_ID} />);
  await page.getByRole("button", { name: KEEP_DESCRIPTION }).click();
  await firstWrite.requested;
  await page.getByRole("button", { name: DISCARD_PERSONALITY }).click();
  // The second press is visible at once, but its write has not left the browser while the first is out.
  await expect(page.getByRole("button", { name: "Apply 1 kept" })).toBeEnabled();
  expect(decideInputs).toHaveLength(1);
  firstWrite.release(sessionWith({ rewriteDecisions: { [REWRITE_RUN]: [true] } }));
  await expect.poll(() => decideInputs.map((input) => input.decisions)).toEqual([[true], [true, false]]);
});

test("a REFUSED decision write reverts the press — no phantom Keep is left on screen", async ({ mount, page }) => {
  await freeze(page);
  await routeTrpc(page, { ...baseRoutes(), "refinery.decideRewrite": () => trpcError({ message: "write refused" }) });
  await mount(<RefineryContentStory sessionId={SESSION_ID} />);
  await page.getByRole("button", { name: KEEP_DESCRIPTION }).click();
  await expect(page.getByTestId(testId("refineryQueueRow")).and(page.locator('[data-queue-state="kept"]'))).toHaveCount(0);
  await expect(page.getByRole("button", { name: ANY_APPLY_COUNT })).toBeDisabled();
});

// ── RECHECK ROUND (0575): one terminal write at a time, and queued decisions outlive the workbench ─────

const RECOVER_COPY = "Discard the refused field and save the other 1 as a copy";

/** The copy arm's atomic refusal: no character minted, the one refused entry itemized. */
function refusedCopy(): TrpcWireOutput<"refinery.applyAsCopy"> {
  return { applied: [], dropped: [{ field: "personality", reason: "diverged_since_session" }], character: null };
}

test("a DOUBLE press on a refused copy's recovery sends ONE copy, and every terminal control is disabled while it is out", async ({ mount, page }) => {
  await freeze(page);
  const copyInputs: TrpcInput<"refinery.applyAsCopy">[] = [];
  const retry = trpcHold<"refinery.applyAsCopy">();
  await routeTrpc(page, {
    ...baseRoutes(),
    "refinery.applyAsCopy": (input: TrpcInput<"refinery.applyAsCopy">) => {
      copyInputs.push(input);
      return copyInputs.length === 1 ? refusedCopy() : retry;
    },
  });
  const component = await mount(<RefineryContentStory sessionId={SESSION_ID} />);
  await page.getByRole("button", { name: KEEP_DESCRIPTION }).click();
  await page.getByRole("button", { name: /^Keep personality$/ }).click();
  await page.getByRole("button", { name: "Save as copy" }).click();

  // The recovery names the act it re-runs — a copy, not an apply.
  const recover = component.getByTestId(testId("refineryApplyOutcome")).getByRole("button", { name: RECOVER_COPY });
  await expect(recover).toBeVisible();
  await recover.dblclick();
  await retry.requested;
  // The press staged the discard, so the recovery has nothing left to offer: no enabled recovery remains.
  await expect(recover.and(page.locator(":enabled"))).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save as copy" })).toBeDisabled();
  await expect(page.getByRole("button", { name: ANY_APPLY_COUNT })).toBeDisabled();
  retry.release(copyResult({ sessionId: SESSION_ID, accepts: [{ field: "description" }] }));
  await expect(page.getByText('1 field written to the copy "Zephyrine Vale (refined)".')).toBeVisible();
  // The refused first copy, then exactly ONE retry — never a second minted character.
  expect(copyInputs.map((input) => input.accepts)).toEqual([[{ field: "description" }, { field: "personality" }], [{ field: "description" }]]);
});

test("a decision pressed while a write is out is still SENT after the workbench unmounts", async ({ mount, page }) => {
  await freeze(page);
  const decideInputs: TrpcInput<"refinery.decideRewrite">[] = [];
  const firstWrite = trpcHold<"refinery.decideRewrite">();
  await routeTrpc(page, {
    ...baseRoutes(),
    "refinery.decideRewrite": (input: TrpcInput<"refinery.decideRewrite">) => {
      decideInputs.push(input);
      return decideInputs.length === 1 ? firstWrite : sessionWith({ rewriteDecisions: { [input.rewriteRunId]: input.decisions } });
    },
  });
  const component = await mount(<RefineryContentStory sessionId={SESSION_ID} />);
  await page.getByRole("button", { name: KEEP_DESCRIPTION }).click();
  await firstWrite.requested;
  await page.getByRole("button", { name: DISCARD_PERSONALITY }).click();
  await expect(page.getByRole("button", { name: "Apply 1 kept" })).toBeEnabled();
  // The user leaves before the first write returns.
  await component.unmount();
  firstWrite.release(sessionWith({ rewriteDecisions: { [REWRITE_RUN]: [true] } }));
  await expect.poll(() => decideInputs.map((input) => input.decisions)).toEqual([[true], [true, false]]);
});
