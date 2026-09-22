// CT: the SETUP context tab's two SCHEMA-EDITOR DOORS (live custom-schema drive, 2026-08-14). The tab
// hardcoded `stage="score"` + `editing={null}`, so two BUILT-AND-WORKING verbs had NO reachable UI path:
// authoring a custom ANALYZE schema, and EDITING a saved schema (`refinery.updateSchema`). The fix wires one
// Setup row per stage, each opening the editor at that stage — over the saved row when the stage is on a
// custom schema (EDIT), or fresh when it is fixed. These prove the doors exist and route correctly, through
// the REAL SetupTabBody on the real data tier over a `page.route`-stubbed network.
//
// Every barrier is a SETTLED rendered state (the tab past its `session.data` gate, the dialog past its own
// title) — never a mid-flight query flash.

import type { RefinerySchemaId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { testId } from "../../../../../packages/client/src/lib/test-ids.ts";
import type { TrpcRoutes, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcError } from "../../../../support/node/route-trpc.ts";
import { makeCharacterDetail } from "../../character/fixtures.ts";
import { RefineryDoorStory, RunsTabBodyStory, SetupTabBodyStory, VersionsTabBodyStory } from "../_ct-stories.tsx";

// MINTED, never hand-written (the `typeIdSchema` 26-char-suffix rule).
const SESSION_ID = mintTypeId(ID_PREFIX.refinerySession);
const CHARACTER_ID = mintTypeId(ID_PREFIX.character);
const SCORE_SCHEMA_ID: RefinerySchemaId = mintTypeId(ID_PREFIX.refinerySchema);
const FROZEN_AT = 1_750_000_000_000;

const CARD = makeCharacterDetail({ id: CHARACTER_ID, name: "Zephyrine Vale" });

/** A minimal valid stored score schema (the editor only JSON.stringifies it into the raw pane). */
const SCORE_SCHEMA = {
  type: "object",
  properties: {
    overallScore: { type: "number", minimum: 1, maximum: 10, "x-orb-ui": { role: "hero" } },
    vividness: { type: "number", minimum: 1, maximum: 10 },
  },
  required: ["overallScore"],
};

/** The session's SCORE stage is on a CUSTOM schema (so the Score row opens the editor to EDIT it); ANALYZE
 *  is fixed (so the Analyze row authors a NEW one — the two verbs the drive found unreachable). */
type RefinerySessionView = NonNullable<TrpcWireOutput<"refinery.getSession">>;

function sessionView(): RefinerySessionView {
  return {
    id: SESSION_ID,
    characterId: CHARACTER_ID,
    name: "Rev",
    status: "active",
    originalCard: CARD,
    selection: { fields: ["description"] },
    stageConfig: {
      score: { kind: "custom", schemaId: SCORE_SCHEMA_ID },
      rewrite: { kind: "fixed", mode: "balanced" },
      analyze: { kind: "fixed", mode: "full" },
    },
    guidance: null,
    iterationCount: 1,
    createdAt: FROZEN_AT,
    updatedAt: FROZEN_AT,
  };
}

function sessionWithSelection(fields: RefinerySessionView["selection"]["fields"]): RefinerySessionView {
  return { ...sessionView(), selection: { fields } };
}

function sessionWithGuidance(guidance: string): RefinerySessionView {
  return { ...sessionView(), guidance };
}

function schemaLibrary(): TrpcWireOutput<"refinery.listSchemas"> {
  return [
    {
      id: SCORE_SCHEMA_ID,
      name: "Vividness scorer",
      description: "Rates how vivid the card reads.",
      stage: "score",
      version: 1,
      schema: SCORE_SCHEMA,
      createdAt: FROZEN_AT,
      updatedAt: FROZEN_AT,
    },
  ];
}

function preflight(): TrpcWireOutput<"refinery.preflight"> {
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

function baseRoutes(): TrpcRoutes<"refinery.getSession" | "refinery.preflight" | "refinery.listSchemas" | "character.get"> {
  return {
    "refinery.getSession": sessionView,
    "refinery.preflight": preflight,
    "refinery.listSchemas": schemaLibrary,
    "character.get": () => CARD,
  };
}

// The describe field's placeholder.
const DESCRIBE_PLACEHOLDER = /rating 1-10, a mood enum/;
/** The Scope row's note, which names scope's ONE editing home (#158 item 1). */
const SCOPE_HOME_NOTE = /Changed on the workbench/;
/** The RAW wire names a user was being shown — the vocabulary this pane must not speak. */
const RAW_WIRE_NAMES = /exampleMessages|creatorNotes/;
/** An authored guidance sentence, distinctive enough that its presence anywhere in the tab is the echo. */
const GUIDANCE_TEXT = "keep her mean, and never soften the last line";

/** The "Change" action inside the Setup row whose kicker is `rowLabel` — each row is one `Card`
 *  (`data-slot="card-root"`), so scoping by the card carrying the unique kicker names exactly one button. */
function rowChangeButton(page: Page, rowLabel: string): Locator {
  return page.locator('[data-slot="card-root"]').filter({ hasText: rowLabel }).getByRole("button", { name: "Change" });
}

// ── DISTINCT ACCESSIBLE NAMES (side-eye #81 P2) ───────────────────────────────────────────────────────
// Three of the Setup rows carry a button whose visible word is "Change" and a fourth says "View". Scoped
// to their cards they are unambiguous ON SCREEN; read as a list of the pane's controls — which is what a
// screen-reader rotor, a voice-control target list, and this very CT's own unscoped locator all do — they
// were three buttons with one name and three destinations. The name derives from the row (`SetupRow`), so
// the pin is on the WHOLE SET being distinct rather than on any one string.
test("#81 P2 — every Setup action names the row it acts on, so no two controls share an accessible name", async ({ mount, page }) => {
  await routeTrpc(page, baseRoutes());
  await mount(<SetupTabBodyStory characterId={CHARACTER_ID} sessionId={SESSION_ID} />);
  await expect(page.getByTestId(testId("refinerySetupTab"))).toBeVisible();

  const actions = page.getByTestId(testId("refinerySetupTab")).getByRole("button");
  const names = await actions.evaluateAll((nodes: Element[]): string[] =>
    nodes.map((node) => node.getAttribute("aria-label") ?? node.textContent?.trim() ?? ""),
  );

  // Every one is distinct — pre-fix this set was ["View", "Change", "Change", "Change"].
  expect(new Set(names).size).toBe(names.length);
  // …and each still STARTS with the word it visibly shows (WCAG 2.5.3 label-in-name — a voice-control user
  // saying "click Change" must still land on one of these, and the row is what disambiguates it).
  //
  // "Change Scope" LEFT THIS SET on 2026-08-17 (#158 item 1). It is not that the name became ambiguous —
  // it is that the row stopped being an editor: scope had TWO independently-editable homes on one screen
  // (here and the workbench masthead), the owner ruled one home, and the workbench won on the tree's
  // evidence (`session-masthead.tsx`'s header records the argument). The row survives as a READOUT naming
  // the door, the same shape Guidance and Stage modes already had — so this set is the pane's remaining
  // editors, and the derivation the pin is actually about is unchanged.
  //
  // "Edit Scope" and "Edit Guidance" REJOINED the set on 2026-08-18 (#171) — as DOORS, not editors. The
  // #158 ruling is untouched (neither opens an editor in this pane; each raises the workbench's own
  // control through the state commons, proven end-to-end below), and the derivation this pin is about is
  // unchanged: two rows both visibly saying "Edit" are still distinct by their row.
  expect(names).toEqual(["View Original card", "Edit Scope", "Change Score schema", "Change Analyze schema", "Edit Guidance"]);
});

// ── ONE HOME PER CONCEPT (#158 items 1-2, owner-ruled 2026-08-17) ────────────────────────────────────

test("Setup states the scope but does not EDIT it — one editable home, reached through a door instead of a sentence", async ({ mount, page }) => {
  await routeTrpc(page, baseRoutes());
  await mount(<SetupTabBodyStory characterId={CHARACTER_ID} sessionId={SESSION_ID} />);
  const setup = page.getByTestId(testId("refinerySetupTab"));
  await expect(setup).toBeVisible();

  // The readout is still here — the pane's job is saying what is in force.
  await expect(setup.getByText("Scope", { exact: true })).toBeVisible();
  // …with NO editor of its own (#158's ruling, unmoved: nothing here mounts a ScopeEditorDialog)…
  await expect(rowChangeButton(page, "Scope")).toHaveCount(0);
  // …and the one home is reached by a DOOR, not described in prose (#171). The sentence that used to sit
  // in this row is gone from the whole tab, and its replacement is proven end-to-end below.
  await expect(setup.getByText(SCOPE_HOME_NOTE)).toHaveCount(0);
  await expect(setup.getByRole("button", { name: "Edit Scope", exact: true })).toBeVisible();
});

// ── #171: NO ROW EXISTS SOLELY TO POINT ELSEWHERE (owner, post-#158: "a fucking cop out") ────────────
// The one-home fix left three of six rows ending in a sentence naming somewhere else. Each still stated
// real in-force state, so the rows survive — what dies is the deferral rendered AS content: two of them
// take the door the sentence described, and the third (Stage modes, which has no editor anywhere in the
// app) keeps its readout and loses a note that named no reachable place at all.
const POINTER_PROSE = [/Changed on the workbench/, /Edited in the run bar/, /Set per stage when a run is configured/];

test("#171 — no Setup row ends in pointer prose, and every row either affords its own action or states state with no editor to point at", async ({
  mount,
  page,
}) => {
  await routeTrpc(page, baseRoutes());
  await mount(<SetupTabBodyStory characterId={CHARACTER_ID} sessionId={SESSION_ID} />);
  const setup = page.getByTestId(testId("refinerySetupTab"));
  await expect(setup).toBeVisible();
  for (const prose of POINTER_PROSE) {
    await expect(setup.getByText(prose)).toHaveCount(0);
  }
  // Stage modes keeps its READOUT — it is the one value with no editor anywhere, so a door would be a lie
  // and a deletion would drop a fact this tab exists to state.
  await expect(setup.getByText("Stage modes", { exact: true })).toBeVisible();
  await expect(setup.getByText("score custom · rewrite balanced · analyze full", { exact: true })).toBeVisible();
});

test("#171 — the Scope door OPENS the workbench's own scope editor (the one home), not a second one in this pane", async ({ mount, page }) => {
  await routeTrpc(page, { ...baseRoutes(), "refinery.listRuns": () => [] });
  await mount(<RefineryDoorStory characterId={CHARACTER_ID} sessionId={SESSION_ID} />);
  const setup = page.getByTestId(testId("refinerySetupTab"));
  await expect(setup).toBeVisible();
  // The workbench is mounted beside it and its dialog is CLOSED — so what opens below is the door's work.
  await expect(page.getByTestId(testId("refineryContent"))).toBeVisible();
  await expect(page.getByRole("heading", { name: "Scope" })).toHaveCount(0);

  await setup.getByRole("button", { name: "Edit Scope", exact: true }).click();

  // The dialog's own settled title — and it is the WORKBENCH's copy, the one the masthead opens.
  await expect(page.getByRole("heading", { name: "Scope" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "description" })).toBeChecked();
});

test("#171 — the Guidance door FOCUSES the run bar's textarea, which is guidance's one editing home", async ({ mount, page }) => {
  await routeTrpc(page, { ...baseRoutes(), "refinery.listRuns": () => [] });
  await mount(<RefineryDoorStory characterId={CHARACTER_ID} sessionId={SESSION_ID} />);
  const setup = page.getByTestId(testId("refinerySetupTab"));
  await expect(setup).toBeVisible();
  const guidance = page.getByRole("textbox", { name: "Guidance · every stage" });
  await expect(guidance).toBeVisible();
  await expect(guidance).not.toBeFocused();

  await setup.getByRole("button", { name: "Edit Guidance", exact: true }).click();

  await expect(guidance).toBeFocused();
});

test("PROMPT FIT is not restated here — the per-stage budget lives beside the verb whose budget it is", async ({ mount, page }) => {
  await routeTrpc(page, baseRoutes());
  await mount(<SetupTabBodyStory characterId={CHARACTER_ID} sessionId={SESSION_ID} />);
  const setup = page.getByTestId(testId("refinerySetupTab"));
  await expect(setup).toBeVisible();
  // It printed `≈ N/M tok` from the SCORE stage's input estimate alone, beside `LaneRunControl`'s
  // per-stage `in ≈ … · out ≈ …` on the same screen — a third of one datum, in a second home.
  await expect(setup.getByText("Prompt fit", { exact: true })).toHaveCount(0);
});

test("the LEDGER's own Run score is the quiet twin — the loud one belongs to the work pane (§14)", async ({ mount, page }) => {
  await routeTrpc(page, { ...baseRoutes(), "refinery.listRuns": () => [] });
  await mount(<RunsTabBodyStory characterId={CHARACTER_ID} sessionId={SESSION_ID} />);

  // THE DEFECT: "Run score" existed twice on one screen and the FILLED one was HERE, in the pane that
  // records what happened, while the SCORE lane's own verb sat secondary. Asserted as the resolved
  // background — a ghost paints none — because a class list cannot see a skin that stopped applying.
  const run = page.getByRole("button", { name: "Run score" });
  await expect(run).toBeVisible();
  const background = await run.evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(background, "the ledger's twin is unfilled").toBe("rgba(0, 0, 0, 0)");
});

// ── ONE VOCABULARY, AND NO SECOND HOME FOR AN AUTHORED VALUE (side-eye 2026-08-19 P2) ────────────────

test("the scope readout speaks the user's words, never the wire's field names", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...baseRoutes(),
    "refinery.getSession": () => sessionWithSelection(["exampleMessages", "creatorNotes"]),
  });
  await mount(<SetupTabBodyStory characterId={CHARACTER_ID} sessionId={SESSION_ID} />);
  const setup = page.getByTestId(testId("refinerySetupTab"));
  await expect(setup).toBeVisible();

  // THE DEFECT: this row printed the raw wire names while the masthead's chips, describing the SAME
  // selection four inches away, printed the humanized ones. Both readouts derive from `scopeChipLabelOf`
  // now, so they cannot drift apart again.
  await expect(setup.getByText("Example messages · Creator notes")).toBeVisible();
  await expect(setup.getByText(RAW_WIRE_NAMES)).toHaveCount(0);
});

test("Setup says guidance is IN FORCE — it does not reprint the sentence the workbench holds", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...baseRoutes(),
    "refinery.getSession": () => sessionWithGuidance(GUIDANCE_TEXT),
  });
  await mount(<SetupTabBodyStory characterId={CHARACTER_ID} sessionId={SESSION_ID} />);
  const setup = page.getByTestId(testId("refinerySetupTab"));
  await expect(setup).toBeVisible();

  // The anti-echo law (`lib/refinery-section.tsx:5-7`): no CONTEXT tab restates CONTENT's payload. This
  // row quoted the guidance verbatim — the exact string the run bar's textarea holds live and editable on
  // the same screen, one of the two read-only. The row still states real in-force state, and its door
  // (proven above) is what makes that actionable.
  await expect(setup.getByText(GUIDANCE_TEXT)).toHaveCount(0);
  await expect(setup.getByText("in force on every stage")).toBeVisible();
});

test("the Setup tab reaches custom-ANALYZE authoring — a stage the single old door never offered", async ({ mount, page }) => {
  await routeTrpc(page, baseRoutes());
  await mount(<SetupTabBodyStory characterId={CHARACTER_ID} sessionId={SESSION_ID} />);

  // The settled tab (past the session gate) carries a row per stage — the analyze row exists at all.
  await expect(page.getByTestId(testId("refinerySetupTab"))).toBeVisible();
  await expect(page.getByText("Analyze schema", { exact: true })).toBeVisible();

  // Its door opens the editor AT THE ANALYZE STAGE — and analyze is fixed, so it authors a NEW schema.
  await rowChangeButton(page, "Analyze schema").click();
  await expect(page.getByText("New analyze schema", { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder(DESCRIBE_PLACEHOLDER)).toBeVisible();
});

test("the Setup tab reaches EDITING a saved schema — the update verb had no door before", async ({ mount, page }) => {
  await routeTrpc(page, baseRoutes());
  await mount(<SetupTabBodyStory characterId={CHARACTER_ID} sessionId={SESSION_ID} />);

  await expect(page.getByTestId(testId("refinerySetupTab"))).toBeVisible();
  // The score stage is on a custom schema, so its row opens the editor in EDIT mode over the saved row —
  // the title names the row and the JSON pane is pre-seeded, which authoring-new can never produce.
  await rowChangeButton(page, "Score schema").click();
  await expect(page.getByText('Edit "Vividness scorer"', { exact: true })).toBeVisible();
  await expect(page.getByText('"x-orb-ui"')).toBeVisible();
});

test("an edited library schema deletes only after a named destructive confirmation, then reports success and closes", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { ...baseRoutes(), "refinery.deleteSchema": (): null => null });
  await mount(<SetupTabBodyStory characterId={CHARACTER_ID} sessionId={SESSION_ID} />);

  await expect(page.getByTestId(testId("refinerySetupTab"))).toBeVisible();
  await rowChangeButton(page, "Score schema").click();
  await expect(page.getByText('Edit "Vividness scorer"', { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Delete schema" }).click();
  await expect(page.getByRole("heading", { name: 'Delete "Vividness scorer"?' })).toBeVisible();
  await expect(page.getByText(/Past refinery runs keep their embedded results/)).toBeVisible();
  await expect.poll(() => trpc.count("refinery.deleteSchema")).toBe(0);

  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect.poll(() => trpc.lastInput("refinery.deleteSchema")).toEqual({ schemaId: SCORE_SCHEMA_ID });
  // SETTLED rendered outcome: the mutation resolved, the nested confirm and editor both closed, and the
  // real app toast surface reports which library row left. A wire count alone is not a browser barrier.
  await expect(page.locator('[data-slot="toast-root"]')).toContainText("Deleted “Vividness scorer”.");
  await expect(page.getByText('Edit "Vividness scorer"', { exact: true })).toHaveCount(0);
});

test("a failed schema delete keeps its confirmation open with the server reason and the hook's error feedback", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...baseRoutes(),
    "refinery.deleteSchema": () => trpcError({ message: "That schema is already gone." }),
  });
  await mount(<SetupTabBodyStory characterId={CHARACTER_ID} sessionId={SESSION_ID} />);

  await expect(page.getByTestId(testId("refinerySetupTab"))).toBeVisible();
  await rowChangeButton(page, "Score schema").click();
  await page.getByRole("button", { name: "Delete schema" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  await expect(page.locator('[data-slot="confirm-dialog-failure"]')).toContainText("That schema is already gone.");
  await expect(page.locator('[data-slot="toast-root"]')).toContainText("Couldn't delete that schema.");
  await expect(page.getByRole("heading", { name: 'Delete "Vividness scorer"?' })).toBeVisible();
  await expect(page.getByText('Edit "Vividness scorer"', { exact: true })).toBeVisible();
});

// ── #1500 · "NO VERSIONS YET" IS A CLAIM ABOUT THE SNAPSHOT LOG ──────────────────────────────────
// `snapshots.data ?? []` collapsed pending, empty and FAILED into one sentence — and the empty arm offers
// to MINT the first snapshot, so a reader whose list merely failed to load was invited to write a version
// of a card that already has a dozen. The list is a plain `useQuery`, so both non-empty arms are this
// body's own to render.
test("a FAILED snapshot list never says 'No versions yet', and its Retry re-reads (#1500)", async ({ mount, page }) => {
  let attempts = 0;
  const trpc = await routeTrpc(page, {
    "character.get": () => CARD,
    "character.listSnapshots": () => (attempts++ === 0 ? trpcError({ message: "snapshot list failed" }) : []),
  });
  const tab = await mount(<VersionsTabBodyStory characterId={CHARACTER_ID} sessionId={SESSION_ID} />);

  await expect(tab.getByText("Couldn't load this card's versions.")).toBeVisible();
  await expect(tab.getByText("No versions yet")).toHaveCount(0);
  // The offer to mint the first snapshot belongs to a KNOWN-empty log, never an unread one.
  await expect(tab.getByRole("button", { name: "Snapshot the card now" })).toHaveCount(0);

  await tab.getByRole("button", { name: "Retry" }).click();
  await expect.poll(() => trpc.count("character.listSnapshots"), { intervals: [20, 50, 100] }).toBe(2);
  // A log that really IS empty is a different answer, and the tab is entitled to make its offer then.
  await expect(tab.getByText("No versions yet")).toBeVisible();
  await expect(tab.getByRole("button", { name: "Snapshot the card now" })).toBeVisible();
});
