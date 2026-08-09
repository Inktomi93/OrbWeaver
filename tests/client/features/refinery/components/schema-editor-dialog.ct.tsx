// CT: the custom-schema EDITOR. It had no coverage at all before this file, which is why the side-eye
// found half of it unreachable (P1-15) and its two doors mis-sized (P1-3). What is pinned here:
//   • the RAW DOOR's three tiers — the belt refusal is elsewhere; this holds the PREFLIGHT tier (stats +
//     advisories) and the honest silence over a draft that isn't a schema yet;
//   • the arm picker is VISIBLY labelled and its choice reaches the wire;
//   • the `needs-raw` honest-refusal arm lands its skeleton in the JSON pane with the reason;
//   • the model-call PENDING arms (P1-10: the feature shipped with zero loading affordance) — the
//     Generate press's busy state and the test drill's PLAN-SHAPED SKELETON;
//   • EDIT-EXISTING, the whole branch P1-15 found dead in the shipped app.
//
// PENDING is driven by a route that never fulfills, registered AFTER `routeTrpc` (Playwright matches the
// most recently registered handler first). That makes the in-flight arm a SETTLED rendered state to
// barrier on, not a flash to race.

import type { RefinerySchemaId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { SchemaEditorStory } from "../_ct-stories.tsx";

/** The JSON pane's landed draft always carries the well-known core — the cheapest "the draft arrived"
 *  assertion, hoisted because a regex literal inside a test body is re-compiled per call. */
const DRAFT_LANDED = /overallScore/;
/** The one card the picker offers in the test-drill story. */
const ARIA_OPTION = /Aria the Archivist/;

/** A schema carrying bounds the hosted wire does not carry — the advisory tier's subject. */
const BOUNDED_SCHEMA = {
  type: "object",
  properties: {
    overallScore: { type: "number", minimum: 1, maximum: 10 },
    summary: { type: "string", maxLength: 400 },
  },
  required: ["overallScore"],
};

/** The same shape with nothing the wire drops — the advisory tier's negative control. */
const PLAIN_SCHEMA = {
  type: "object",
  properties: { overallScore: { type: "number" }, summary: { type: "string" } },
  required: ["overallScore", "summary"],
};

const SCHEMA_PANE = { name: "Schema (JSON — the full vocabulary)" };
const ONE_CARD = { items: [{ id: mintTypeId(ID_PREFIX.character), name: "Aria the Archivist", handle: "aria", avatarHash: null, tags: [] }], nextCursor: null };

/** Hold ONE procedure in flight forever, so its pending arm is a state the test can barrier on. */
async function hang(page: Page, proc: string): Promise<void> {
  await page.route("**/api/trpc/**", async (route) => {
    if (decodeURIComponent(new URL(route.request().url()).pathname).includes(proc)) {
      // Deliberately never fulfilled — the mutation stays pending for the life of the test.
      return;
    }
    await route.fallback();
  });
}

test("the RAW DOOR's preflight: a valid-but-bounded schema still gets its advisory, and the accounting is rendered", async ({ mount, page }) => {
  await routeTrpc(page, {});
  await mount(<SchemaEditorStory />);

  // Nothing typed: no preflight at all — there is no schema to say anything about.
  await expect(page.getByTestId("refinery-schema-preflight")).toHaveCount(0);
  await expect(page.getByText("Generate a draft, or paste a schema to preview it.")).toBeVisible();

  await page.getByRole("textbox", SCHEMA_PANE).fill(JSON.stringify(BOUNDED_SCHEMA));
  // Tier 3: the accounting an author reasons about size with.
  // Two fields, one of which (`summary`) is not in `required` — the accounting states both, because the
  // optional COUNT is what the fan-out advisories are computed from.
  await expect(page.getByTestId("refinery-schema-stats")).toContainText("2 fields · 1 optional");
  // Tier 2: the ADVISORY, keyed by its CLASS (the copy is free to change; the class is the contract).
  const bounds = page.locator('[data-advisory="wire-bounds-stripped"]');
  await expect(bounds).toBeVisible();
  await expect(bounds).toContainText("minimum");
  await expect(bounds).toContainText("maxLength");
  await expect(page.getByTestId("refinery-schema-advisory")).toHaveCount(1);

  // It is ADVISORY, not a refusal: once the row has a name the save press is live (the advisory is not
  // a gate — only the missing name is), and the preview renders the schema it just warned about.
  await expect(page.getByText("Render preview")).toBeVisible();
  await page.getByRole("textbox", { name: "Name" }).fill("cosiness");
  await expect(page.getByRole("button", { name: "Save schema" })).toBeEnabled();
  await expect(page.locator('[data-advisory="wire-bounds-stripped"]')).toBeVisible();
});

test("the preflight stays SILENT when there is nothing to warn about, and disappears on an unparseable draft", async ({ mount, page }) => {
  await routeTrpc(page, {});
  await mount(<SchemaEditorStory />);

  await page.getByRole("textbox", SCHEMA_PANE).fill(JSON.stringify(PLAIN_SCHEMA));
  await expect(page.getByTestId("refinery-schema-preflight")).toBeVisible();
  await expect(page.getByTestId("refinery-schema-advisory")).toHaveCount(0);

  // Mid-keystroke garbage: no preflight, and the preview teaches instead of blanking.
  await page.getByRole("textbox", SCHEMA_PANE).fill('{"type":"obj');
  await expect(page.getByTestId("refinery-schema-preflight")).toHaveCount(0);
  await expect(page.getByText("That JSON doesn't parse yet — fix it to preview.")).toBeVisible();
});

test("the ARM PICKER is visibly labelled and its choice reaches the wire", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "refinery.generateSchema": () => ({ kind: "draft", name: "vibes", schema: PLAIN_SCHEMA, dropped: [] }),
  });
  await mount(<SchemaEditorStory />);

  // P2 "arm picker unlabeled visibly": the question is on screen, not only in the accessible name.
  await expect(page.getByText("How to build it")).toBeVisible();

  await page.getByRole("textbox", { name: "Describe the structure" }).fill("a cosiness rubric");
  await page.getByRole("combobox", { name: "How to build it" }).click();
  await page.getByRole("option", { name: "Field by field — best for big schemas" }).click();
  await page.getByRole("button", { name: "Generate" }).click();

  await expect.poll(() => trpc.lastInput("refinery.generateSchema")).toEqual({ description: "a cosiness rubric", stage: "score", arm: "guided" });
  // The draft lands in BOTH panes: the name the designer chose, and the JSON.
  await expect(page.getByRole("textbox", SCHEMA_PANE)).toHaveValue(DRAFT_LANDED);
  await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue("vibes");
});

test("the needs-raw HONEST REFUSAL hands over a skeleton and says why, instead of a flattened guess", async ({ mount, page }) => {
  await routeTrpc(page, {
    "refinery.generateSchema": () => ({
      kind: "needs-raw",
      message: "Your rubric needs a field that can be either a number or a phrase.",
      skeleton: PLAIN_SCHEMA,
    }),
  });
  await mount(<SchemaEditorStory />);
  await page.getByRole("textbox", { name: "Describe the structure" }).fill("weird scoring");
  await page.getByRole("button", { name: "Generate" }).click();

  const note = page.getByTestId("refinery-forge-note");
  await expect(note).toContainText("either a number or a phrase");
  await expect(note).toContainText("the raw editor accepts the whole schema vocabulary");
  // The partial design lands in the raw door rather than being discarded.
  await expect(page.getByRole("textbox", SCHEMA_PANE)).toHaveValue(DRAFT_LANDED);
});

test("the generate PENDING arm says so on the control it belongs to (P1-10: the feature had none)", async ({ mount, page }) => {
  await routeTrpc(page, {});
  await hang(page, "refinery.generateSchema");
  await mount(<SchemaEditorStory />);

  await page.getByRole("textbox", { name: "Describe the structure" }).fill("a cosiness rubric");
  const generate = page.getByRole("button", { name: "Generate" });
  await generate.click();

  const busy = page.getByRole("button", { name: "Generating…" });
  await expect(busy).toBeVisible();
  await expect(busy).toHaveAttribute("aria-busy", "true");
  await expect(busy).toBeDisabled();
});

test("the test drill's SKELETON is plan-shaped: the preview shows the answer's anatomy while the model runs", async ({ mount, page }) => {
  await routeTrpc(page, { "character.list": () => ONE_CARD });
  await hang(page, "refinery.testSchema");
  await mount(<SchemaEditorStory />);

  await page.getByRole("textbox", SCHEMA_PANE).fill(JSON.stringify(BOUNDED_SCHEMA));
  await expect(page.getByText("Render preview")).toBeVisible();

  await page.getByTestId("refinery-character-door").click();
  await page.getByRole("option", { name: ARIA_OPTION }).click();
  await expect(page.getByTestId("refinery-character-door")).toHaveText("Aria the Archivist");

  await page.getByRole("button", { name: "Test on this card" }).click();
  // The plan-shaped skeleton, not a spinner: the pane keeps the SHAPE of what is coming.
  const skeleton = page.getByTestId("refinery-payload-skeleton");
  await expect(skeleton).toBeVisible();
  await expect(skeleton).toHaveAttribute("aria-busy", "true");
  await expect(page.getByRole("button", { name: "Running…" })).toBeDisabled();
});

test("EDIT-EXISTING opens populated and saves through the UPDATE verb — the branch P1-15 found unreachable", async ({ mount, page }) => {
  const schemaId = mintTypeId(ID_PREFIX.refinerySchema) as RefinerySchemaId;
  const trpc = await routeTrpc(page, { "refinery.updateSchema": () => ({ id: schemaId }) });
  await mount(<SchemaEditorStory editing={{ id: schemaId, name: "cosiness", description: "how cosy is it", schema: PLAIN_SCHEMA }} />);

  // The dialog names the row it is editing, and every pane opens filled.
  await expect(page.getByText('Edit "cosiness"')).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue("cosiness");
  await expect(page.getByRole("textbox", { name: "Describe the structure" })).toHaveValue("how cosy is it");
  await expect(page.getByRole("textbox", SCHEMA_PANE)).toHaveValue(DRAFT_LANDED);
  // A populated draft means the ITERATE row is live from the first frame (it is gated on a parseable schema).
  await expect(page.getByText("Refine the draft")).toBeVisible();

  await page.getByRole("textbox", { name: "Name" }).fill("cosiness v2");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect.poll(() => trpc.count("refinery.updateSchema")).toBe(1);
  await expect.poll(() => trpc.lastInput("refinery.updateSchema")).toMatchObject({ schemaId, patch: { name: "cosiness v2" } });
  // …and NOT through create — an edit that silently forked a second library row is the defect this pins.
  // ONESHOT-OK: the two calls are alternatives inside ONE click handler (`saveDraft` takes either the
  // create branch or the update branch), and the update's arrival was already awaited above — so at this
  // point the press has provably resolved and no create can still be in flight.
  expect(trpc.count("refinery.createSchema")).toBe(0);
});
