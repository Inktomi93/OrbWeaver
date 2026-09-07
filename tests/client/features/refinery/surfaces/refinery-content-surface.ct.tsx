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
// session's `createdAt`, and `FROZEN_AT` here IS `tests/support/clock.ts`'s `FROZEN_AT_MS`, so the stamp
// is a fixed string rather than a value that drifts with the wall clock.

import type { RefinerySessionId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { testId } from "../../../../../packages/client/src/lib/test-ids.ts";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import type { TrpcRoutes } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcHold } from "../../../../support/node/route-trpc.ts";
import { characterListResponder, makeCharacterDetail, makeCharacterSummary } from "../../character/fixtures.ts";
import { RefineryContentStory, RefineryStartStory } from "../_ct-stories.tsx";
import { makeRefinerySessionSummary } from "../fixtures.ts";

// MINTED, never hand-written (the `typeIdSchema` 26-char-suffix rule — a drifted literal dies at a parse
// seam instead of at an assertion).
const SESSION_ID = mintTypeId(ID_PREFIX.refinerySession);
const CHARACTER_ID = mintTypeId(ID_PREFIX.character);
const SCORE_RUN_SUPERSEDED = mintTypeId(ID_PREFIX.refineryRun);
const SCORE_RUN_LATEST = mintTypeId(ID_PREFIX.refineryRun);
const REWRITE_RUN = mintTypeId(ID_PREFIX.refineryRun);
const ANALYZE_RUN = mintTypeId(ID_PREFIX.refineryRun);
/** A rewrite that never lands in the ledger — the analyze's `sourceRunId` points here so the DAG edge says
 *  "this verdict is about a rewrite the canvas is not showing". */
const ORPHANED_REWRITE = mintTypeId(ID_PREFIX.refineryRun);

const FROZEN_AT = FROZEN_AT_MS;
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

function sessionView(sessionId: RefinerySessionId = SESSION_ID): unknown {
  return {
    id: sessionId,
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

function scoreRun(row: { id: string; iteration: number; overallScore: number; summary: string }): unknown {
  const { id, iteration, overallScore, summary } = row;
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

/** An analyze whose DAG parent is `sourceRunId` — the rewrite it judged. */
function analyzeRun(sourceRunId: string): unknown {
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
    createdAt: FROZEN_AT + 3,
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

/** Preflight where the named stages breach the CONTEXT ceiling — the arm whose sentence is stage-neutral
 *  ("the assembled prompt likely exceeds the model's context"), i.e. the one two lanes can duplicate.
 *  `maxOutputTokens` stays generous so the output arm, which words itself per stage, does not fire. */
function preflightOver(over: readonly string[]): unknown {
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
function preflightDiverged(): unknown {
  return {
    contextTokens: 8000,
    stages: [
      { stage: "score", model: "test-model", temperature: null, maxOutputTokens: 512, inputEstimate: 2736, outputEstimate: 1490 },
      { stage: "rewrite", model: "test-model", temperature: null, maxOutputTokens: 4096, inputEstimate: 2736, outputEstimate: 1490 },
      { stage: "analyze", model: "test-model", temperature: null, maxOutputTokens: 4096, inputEstimate: 12_000, outputEstimate: 1490 },
    ],
  };
}

/** The accepts the surface sent, as `routeTrpc` decoded them off the wire. */
interface ApplyInput {
  readonly accepts: readonly { readonly field: string; readonly greetingIndex?: number }[];
}

// The review verbs are anchored because
// "Keep description" and "Keep (empties field) description" are different consent acts.
const KEEP_DESCRIPTION = /^Keep description$/;
const DISCARD_PERSONALITY = /^Discard personality$/;
const ANY_APPLY_COUNT = /^Apply \d+ kept$/;
/** Every lane's run verb, in either arm — the set the "one filled control" census is taken over. */
const RUN_ANY_STAGE = /^(Run|Re-run) (score|rewrite|analyze)$/;
const BACK_TO_LATEST = /^Back to latest$/;

/** The ledger the surface reads, OLDEST FIRST (the wire's order — the lane fold keeps the last write per
 *  stage, so a newest-first fixture would silently invert which score is "latest"). */
function ledger(): unknown[] {
  return [
    scoreRun({ id: SCORE_RUN_SUPERSEDED, iteration: 0, overallScore: 4.1, summary: "Thin in the middle." }),
    scoreRun({ id: SCORE_RUN_LATEST, iteration: 1, overallScore: 8.2, summary: "Much sharper after the rewrite." }),
    rewriteRun(),
  ];
}

/** The three reads plus the gated card — everything the session pane joins. */
function baseRoutes(): TrpcRoutes {
  return {
    "refinery.getSession": (): unknown => sessionView(),
    "refinery.listRuns": ledger,
    "refinery.preflight": preflight,
    "character.get": (): unknown => CARD,
  };
}

/** Freeze the page clock so the masthead's elapsed-since credit line is a fixed string. */
async function freeze(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date(FROZEN_AT));
}

// ── THE LANDING PICK: resume-or-mint (#79) ───────────────────────────────────────────────────────────
// Measured 2026-08-14: picking a character always minted, so ordinary re-entry left 3 duplicate sessions on
// one card in five minutes while the scored one sat behind a COLLAPSED roster and read as lost work. Both
// tests drive the REAL door — teaching state → character picker → a row click — and read the verdict off the
// WIRE (`startSession`'s call count) beside the pane that painted, because "which session am I in" is only
// visible in the id the surface then asks `getSession` for.

/** A second OPEN session on the same card, older — the one resume must NOT pick. */
const OLDER_OPEN_SESSION_ID = mintTypeId(ID_PREFIX.refinerySession);
/** The newest OPEN session on the card — the resume target. */
const NEWEST_OPEN_SESSION_ID = mintTypeId(ID_PREFIX.refinerySession);
/** A FINISHED session on the card (an apply set `completed`) — resumable is `active` only, so this mints. */
const COMPLETED_SESSION_ID = mintTypeId(ID_PREFIX.refinerySession);
/** The session `startSession` hands back on the mint arm. */
const MINTED_SESSION_ID = mintTypeId(ID_PREFIX.refinerySession);

/** A library big enough to outgrow one `character.list` page — the owner's live corpus size (#157 scope
 *  add). The picker used to ask for ONE 100-row page, so cards 101…327 were unreachable from the landing
 *  even though the roster beside it could name them. */
const BIG_LIBRARY_SIZE = 327;
const BIG_LIBRARY = Array.from({ length: BIG_LIBRARY_SIZE }, (_, i) =>
  makeCharacterSummary({ id: `chr_ct_lib_${String(i + 1).padStart(3, "0")}`, name: `Ward ${String(i + 1).padStart(3, "0")}` }),
);
/** The LAST card in that library — the one a fixed-limit picker can never reach. */
const DEEPEST_CARD = `Ward ${String(BIG_LIBRARY_SIZE).padStart(3, "0")}`;
/** The landing's reads: the roster the resume check consults, plus the library the picker lists. The four
 *  session-scoped reads answer for WHICHEVER session gets opened, so the id the surface asked for is the
 *  observable — a fixed-session responder would paint the same pane either way. */
function landingRoutes(roster: readonly unknown[]): TrpcRoutes {
  return {
    "refinery.listSessions": (): readonly unknown[] => roster,
    "character.list": characterListResponder([makeCharacterSummary({ id: CHARACTER_ID, name: "Zephyrine Vale" })]),
    "refinery.getSession": (input: unknown): unknown => sessionView((input as { sessionId: RefinerySessionId }).sessionId),
    "refinery.listRuns": ledger,
    "refinery.preflight": preflight,
    "character.get": (): unknown => CARD,
  };
}

/** One roster row about THIS card, at a chosen status and freshness. */
function rosterRow(id: string, status: string, updatedAt: number): unknown {
  return makeRefinerySessionSummary({ id, characterId: CHARACTER_ID, characterName: "Zephyrine Vale", name: null, status, createdAt: FROZEN_AT, updatedAt });
}

/**
 * Walk the landing exactly as a user does: the picker IS the landing (#157 — "the landing for that is
 * wasted"), so there is no reveal step any more; the barrier is the row itself being on screen.
 *
 * The old two-step walk waited for a "Pick a character" button to go ENABLED, and that wait was doing
 * double duty as the barrier that the roster the resume-or-mint decision reads had landed. That job moved
 * INTO the decision: `useOpenRefinery` awaits the roster (`ensureQueryData`) before it decides, so the
 * #79 guarantee no longer depends on a disabled window in the UI — which is exactly why the window could
 * be deleted rather than merely hidden.
 */
async function pickZephyrine(page: Page): Promise<void> {
  await page.getByRole("option", { name: "Zephyrine Vale" }).click();
}

test("picking a character that already has an OPEN session RESUMES the newest one — no duplicate is minted (#79)", async ({ mount, page }) => {
  await freeze(page);
  const trpc = await routeTrpc(page, {
    ...landingRoutes([rosterRow(OLDER_OPEN_SESSION_ID, "active", FROZEN_AT), rosterRow(NEWEST_OPEN_SESSION_ID, "active", FROZEN_AT + 10_000)]),
    // A mint that WOULD SUCCEED, scripted on purpose. Leaving `startSession` unlisted makes the old
    // always-mint behaviour fail on a null response instead of on the count below — a red about the stub
    // rather than about the defect. With the mint working, the only thing separating the two behaviours is
    // WHICH session the pane opens, which is exactly the claim.
    "refinery.startSession": (): unknown => sessionView(MINTED_SESSION_ID),
  });
  await mount(<RefineryStartStory />);
  await pickZephyrine(page);

  // A SETTLED session pane — the resume landed the user in real work, not a blank mint. The hero value is
  // the ledger's latest score, i.e. the pane joined its reads for the session it opened.
  await expect(page.getByTestId(testId("refineryContent"))).toBeVisible();
  await expect(page.getByTestId("refinery-hero-value")).toHaveText("8.2");

  // THE DEFECT, on the wire: nothing was created.
  // ONESHOT-OK: the settled pane above IS the barrier. The pick is synchronous — it either mutates or selects before the surface re-renders — and the pane cannot paint until `getSession` has resolved, so by the time the hero value settled every call this interaction produces is already recorded.
  expect(trpc.count("refinery.startSession")).toBe(0);
  // …and it resumed the NEWEST open session — not the older one on the same card, and not the session the
  // scripted mint above would have handed back.
  // ONESHOT-OK: same settled barrier — the recording is closed once the pane painted (see above).
  expect(trpc.inputs("refinery.getSession")).toContainEqual({ sessionId: NEWEST_OPEN_SESSION_ID });
  // ONESHOT-OK: same settled barrier.
  expect(trpc.inputs("refinery.getSession")).not.toContainEqual({ sessionId: OLDER_OPEN_SESSION_ID });
  // ONESHOT-OK: same settled barrier.
  expect(trpc.inputs("refinery.getSession")).not.toContainEqual({ sessionId: MINTED_SESSION_ID });
});

test("picking a character whose only session is FINISHED mints a fresh one and opens it", async ({ mount, page }) => {
  await freeze(page);
  const trpc = await routeTrpc(page, {
    // The roster is NOT empty — it carries a `completed` session on this very card. Resumable is the OPEN
    // status alone: an applied session is finished work, so picking the card again starts over.
    ...landingRoutes([rosterRow(COMPLETED_SESSION_ID, "completed", FROZEN_AT + 10_000)]),
    "refinery.startSession": (): unknown => sessionView(MINTED_SESSION_ID),
  });
  await mount(<RefineryStartStory />);
  await pickZephyrine(page);

  await expect(page.getByTestId(testId("refineryContent"))).toBeVisible();
  await expect(page.getByTestId("refinery-hero-value")).toHaveText("8.2");

  // ONESHOT-OK: the pane above cannot paint until the mint resolved AND `getSession` answered for what it returned, so the recording is closed at this point (the sibling resume test states the same barrier).
  expect(trpc.count("refinery.startSession")).toBe(1);
  // ONESHOT-OK: same settled barrier.
  expect(trpc.lastInput("refinery.startSession")).toEqual({ characterId: CHARACTER_ID });
  // The MINTED session is the one that opened — the completed row was never reached for.
  // ONESHOT-OK: same settled barrier.
  expect(trpc.inputs("refinery.getSession")).toContainEqual({ sessionId: MINTED_SESSION_ID });
  // ONESHOT-OK: same settled barrier.
  expect(trpc.inputs("refinery.getSession")).not.toContainEqual({ sessionId: COMPLETED_SESSION_ID });
});

// ── THE LANDING IS THE PICKER (#157, owner-ruled) ────────────────────────────────────────────────────
// "I have to go allll the way down going over a bunch of other stuff to pick a character" / "the landing
// for that is wasted". The landing used to open on a promise sentence, a three-cell teaching row, and a
// BUTTON that revealed the picker below all of it. The picker is the landing's job; the teaching material
// follows it.

test("the LANDING leads with the picker: the search box is live at first paint, ABOVE the teaching material", async ({ mount, page }) => {
  await freeze(page);
  await routeTrpc(page, landingRoutes([]));
  await mount(<RefineryStartStory />);

  // No reveal step: the search field and the rows are on screen with nothing pressed.
  const search = page.getByPlaceholder("Search characters…");
  await expect(search).toBeVisible();
  await expect(page.getByRole("option", { name: "Zephyrine Vale" })).toBeVisible();

  // …and it is FIRST. Geometry, not DOM order: the teaching row is what the owner had to scroll past.
  const searchBox = await search.boundingBox();
  const steps = await page.getByTestId(testId("refineryTeachingSteps")).boundingBox();
  expect(searchBox, "the picker's search field is laid out").not.toBeNull();
  expect(steps, "the teaching row is laid out").not.toBeNull();
  expect(searchBox?.y ?? 0, "the picker sits above the teaching material").toBeLessThan(steps?.y ?? 0);
});

test("the landing picker exposes the WHOLE library — a card past the first page is reachable, and it is a real 327-card corpus", async ({ mount, page }) => {
  await freeze(page);
  await routeTrpc(page, {
    ...landingRoutes([]),
    "character.list": characterListResponder(BIG_LIBRARY),
  });
  await mount(<RefineryStartStory />);

  // Page one landed…
  await expect(page.getByRole("option", { name: "Ward 001" })).toBeVisible();
  // …and the tail of the library is NOT on it. Under the old fixed `limit: 100` picker this stayed true
  // forever: cards 101…327 had no affordance that could reach them.
  await expect(page.getByRole("option", { name: DEEPEST_CARD })).toHaveCount(0);

  // The picker's keyboard paging walks to the end with no dead "Load more" chrome (#334). `End` moves the
  // command highlight to the loaded tail, which asks for the next page. Unrolled and barriered so a failure
  // names WHICH page stopped arriving instead of timing out only on the final card.
  const picker = page.getByRole("combobox", { name: "Start a refinery session" });
  // The walk STATES ITSELF: how far it has got against the server's own count over the same scope. Without
  // it navigation has no idea how much more remains, which is what the 3 244px scroll offered.
  await expect(page.getByText(`Showing 100 of ${BIG_LIBRARY_SIZE}`)).toBeVisible();
  await picker.press("End");
  await expect(page.getByRole("option", { name: "Ward 101" })).toBeVisible();
  await picker.press("End");
  await expect(page.getByRole("option", { name: "Ward 201" })).toBeVisible();
  await picker.press("End");
  await expect(page.getByRole("option", { name: DEEPEST_CARD })).toBeVisible();
  // Exhausted: the progress footer retires rather than implying another page exists.
  await expect(page.getByText(new RegExp(`Showing \\d+ of ${BIG_LIBRARY_SIZE}`, "u"))).toHaveCount(0);
});

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
  const hold = trpcHold();
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
const LOCAL_WEIGHTS_PATH = "/media/inktomi/Data/vllm-models/quantized/Huihui-ThinkingCap-Qwen3.6-27B-abliterated-W8A8-Dynamic-Per-Token";
const LOCAL_WEIGHTS_DISPLAY = "Huihui-ThinkingCap-Qwen3.6-27B-abliterated · W8A8";

test("the masthead credits the model by NAME — a local weights path never reaches the credit line", async ({ mount, page }) => {
  await freeze(page);
  await routeTrpc(page, {
    ...baseRoutes(),
    // The masthead reads the REWRITE run's model first, so this is the run that decides the credit line.
    "refinery.listRuns": (): unknown[] => [...ledger().slice(0, 2), { ...(rewriteRun() as Record<string, unknown>), model: LOCAL_WEIGHTS_PATH }],
  });
  await mount(<RefineryContentStory sessionId={SESSION_ID} />);

  const masthead = page.getByTestId(testId("refineryMasthead"));
  await expect(masthead).toContainText(LOCAL_WEIGHTS_DISPLAY);
  await expect(masthead, "the raw path is not printed").not.toContainText(LOCAL_WEIGHTS_PATH);
  // LOSSLESS: the full identifier is still reachable, on the line's own tooltip (the kit's display
  // derivation is for TYPOGRAPHY — nothing routes on it, and nothing may lose it).
  await expect(masthead.getByTitle(LOCAL_WEIGHTS_PATH)).toBeVisible();
});

test("ALL THREE STAGES are on one canvas: the score lane's latest payload, the rewrite island's accept work, and the analyze verdict", async ({
  mount,
  page,
}) => {
  await freeze(page);
  await routeTrpc(page, {
    ...baseRoutes(),
    "refinery.listRuns": (): unknown[] => [...ledger(), analyzeRun(REWRITE_RUN)],
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
    "refinery.listRuns": (): unknown[] => [...ledger(), analyzeRun(ORPHANED_REWRITE)],
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
function emptyLedger(): unknown[] {
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
  await routeTrpc(page, { ...baseRoutes(), "refinery.preflight": (): unknown => preflightOver(["score", "analyze"]) });
  await mount(<RefineryContentStory sessionId={SESSION_ID} />);
  await expect(page.getByTestId(testId("refineryContent"))).toBeVisible();

  // THE DEFECT: the context-overrun sentence is about the SELECTION, so with score and analyze both over
  // it rendered verbatim in two lanes with two identically-named "Narrow the selection" buttons about one
  // selection. Once, now — and the button says what it narrows for.
  await expect(page.getByTestId(testId("refineryPreflightWarn"))).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Narrow the selection for score and analyze" })).toBeVisible();
  // The ⚠ stays per-lane: that mark is about THIS stage's numbers, and suppressing it would lose the
  // reason the hoisted paragraph is on screen at all.
  await expect(page.locator('[data-lane="score"]').getByTestId(testId("refineryFitLine"))).toContainText("⚠");
});

test("…and stages breaching DIFFERENTLY keep their own warnings, each named for its own stage", async ({ mount, page }) => {
  await freeze(page);
  await routeTrpc(page, { ...baseRoutes(), "refinery.preflight": (): unknown => preflightDiverged() });
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
  await expect(
    page.getByText(`A snapshot was taken first — "auto: before refinery apply · ${SESSION_ID}" — reversible from the character's History tab.`),
  ).toBeVisible();
  await expect(page.getByText("replaced")).toBeVisible();
  await expect(page.getByRole("button", { name: "Done" })).toBeVisible();

  // …and the WIRE agrees with the pixels: the discarded field never left the browser. Asserted after the
  // outcome painted, so this reads a settled recording, not a race.
  expect(applyInputs).toHaveLength(1);
  expect(applyInputs[0]?.accepts).toEqual([{ field: "description" }]);
});
