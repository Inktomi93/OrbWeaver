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
import type { TrpcRoutes } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { makeCharacterDetail } from "../../character/fixtures.ts";
import { SetupTabBodyStory } from "../_ct-stories.tsx";

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
function sessionView(): unknown {
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

function schemaLibrary(): unknown[] {
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

function baseRoutes(): TrpcRoutes {
  return {
    "refinery.getSession": sessionView,
    "refinery.preflight": preflight,
    "refinery.listSchemas": schemaLibrary,
    "character.get": (): unknown => CARD,
  };
}

// The describe field's placeholder — hoisted (biome `useTopLevelRegex`).
const DESCRIBE_PLACEHOLDER = /rating 1-10, a mood enum/;

/** The "Change" action inside the Setup row whose kicker is `rowLabel` — each row is one `Card`
 *  (`data-slot="card-root"`), so scoping by the card carrying the unique kicker names exactly one button. */
function rowChangeButton(page: Page, rowLabel: string): Locator {
  return page.locator('[data-slot="card-root"]').filter({ hasText: rowLabel }).getByRole("button", { name: "Change" });
}

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
