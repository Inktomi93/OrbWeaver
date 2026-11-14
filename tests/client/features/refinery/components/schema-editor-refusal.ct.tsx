// The schema editor runs the contracts belt before the Save press and names each refusal at the field the author fixes it in, so a bad
// name or a score schema with no overall score is never told it is fine and then failed with an error nobody can act on. A refusal the
// server still answers after the press, such as a taken name, is stated in the dialog's refusal note.
// @subject packages/client/src/features/refinery/components/schema-editor-dialog.tsx
// @subject packages/client/src/features/refinery/components/refusal-note.tsx
import { REFINERY_SCHEMA_DESCRIPTION_MAX, REFINERY_SCHEMA_STAGES, refinerySchemaDocumentSchema } from "@orb/contracts/refinery";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { REFINERY_SCHEMA_DESCRIBE_NAME, REFINERY_SCHEMA_JSON_NAME, REFINERY_SCHEMA_NAME_FIELD_NAME } from "#client/features/refinery/lib/refinery-names.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import { SCORE_MAX, SCORE_MIN } from "#contracts/refinery/core.ts";
import type { SchemaPreviewStory } from "./_payload-stories.tsx";

const STORY = "tests/client/features/refinery/components/_payload-stories/SchemaPreviewStory";
const [STAGE] = REFINERY_SCHEMA_STAGES;
const READS = ["settings.getUserSettings", "sessions.me", "character.list", "refinery.schemaPlan"] as const;
const SCORE_SCHEMA = {
  type: "object",
  properties: { overallScore: { type: "integer", minimum: SCORE_MIN, maximum: SCORE_MAX } },
  required: ["overallScore"],
};
const NO_OVERALL_SCORE = { type: "object", properties: { mood: { type: "string" } }, required: ["mood"] };
const VALID_NAME = "mood_scorer";

function documentOf(overrides: { readonly name?: string; readonly description?: string; readonly schema?: Record<string, unknown> }): unknown {
  return { name: VALID_NAME, description: "", stage: STAGE, schema: SCORE_SCHEMA, ...overrides };
}

/** The belt's own first sentence for `doc`: what the editor must say at the field, from the production schema the server also runs. */
function beltSentence(doc: unknown): string {
  const parsed = refinerySchemaDocumentSchema.safeParse(doc);
  const [issue] = parsed.success ? [] : parsed.error.issues;
  if (issue === undefined) {
    throw new Error("The draft was meant to fail the belt");
  }
  return issue.message;
}

function editorFields(page: Page): {
  readonly name: Locator;
  readonly description: Locator;
  readonly schema: Locator;
  readonly save: Locator;
} {
  return {
    name: page.getByRole("textbox", { name: REFINERY_SCHEMA_NAME_FIELD_NAME, exact: true }),
    description: page.getByRole("textbox", { name: REFINERY_SCHEMA_DESCRIBE_NAME, exact: true }),
    schema: page.getByRole("textbox", { name: REFINERY_SCHEMA_JSON_NAME, exact: true }),
    save: page.getByRole("button", { name: DIALOG_VERBS.save, exact: true }),
  };
}

const PROFILES = [
  { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false },
  { label: "phone with a touch pointer", viewport: { width: 390, height: 844 }, touch: true },
] as const;

for (const profile of PROFILES) {
  test.describe(profile.label, () => {
    test.use({ viewport: profile.viewport, hasTouch: profile.touch, isMobile: profile.touch });

    test("a name outside the identifier grammar is refused at the Name field before the press, and a valid one lifts the refusal", async ({ mount, page }) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      await routeTrpc(page, serveCorpusProcedures(caller, READS));
      await mount<typeof SchemaPreviewStory>(STORY, {});
      const { name, schema, save } = editorFields(page);
      await schema.fill(JSON.stringify(SCORE_SCHEMA));

      await name.fill("my schema");
      await expect(name).toHaveAccessibleDescription(beltSentence(documentOf({ name: "my schema" })));
      await expect(name).toHaveAttribute("aria-invalid", "true");
      await expect(save).toBeDisabled();

      await name.fill(VALID_NAME);
      await expect(name).toHaveAccessibleDescription("");
      await expect(save).toBeEnabled();
    });

    test("a score schema with no overall score is refused at the JSON pane before the press, and a complete one lifts the refusal", async ({ mount, page }) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      await routeTrpc(page, serveCorpusProcedures(caller, READS));
      await mount<typeof SchemaPreviewStory>(STORY, {});
      const { name, schema, save } = editorFields(page);
      await name.fill(VALID_NAME);

      await schema.fill(JSON.stringify(NO_OVERALL_SCORE));
      await expect(schema).toHaveAccessibleDescription(beltSentence(documentOf({ schema: NO_OVERALL_SCORE })));
      await expect(save).toBeDisabled();

      await schema.fill(JSON.stringify(SCORE_SCHEMA));
      await expect(schema).toHaveAccessibleDescription("");
      await expect(save).toBeEnabled();
    });

    test("a description past its limit is refused at the description field", async ({ mount, page }) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      await routeTrpc(page, serveCorpusProcedures(caller, READS));
      await mount<typeof SchemaPreviewStory>(STORY, {});
      const { name, description, schema, save } = editorFields(page);
      await name.fill(VALID_NAME);
      await schema.fill(JSON.stringify(SCORE_SCHEMA));
      const tooLong = "x".repeat(REFINERY_SCHEMA_DESCRIPTION_MAX + 1);

      await description.fill(tooLong);
      await expect(description).toHaveAccessibleDescription(beltSentence(documentOf({ description: tooLong })));
      await expect(save).toBeDisabled();

      await description.fill("");
      await expect(description).toHaveAccessibleDescription("");
      await expect(save).toBeEnabled();
    });

    test("a taken name is answered by the server and stated in the refusal note, where the editor's own check passes it", async ({ mount, page }) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      await caller.refinery.createSchema({ name: VALID_NAME, description: "", stage: STAGE, schema: SCORE_SCHEMA });
      await routeTrpc(page, {
        ...serveCorpusProcedures(caller, READS),
        ...serveCorpusProcedures(caller, ["refinery.createSchema"]),
      });
      await mount<typeof SchemaPreviewStory>(STORY, {});
      const { name, schema, save } = editorFields(page);
      await name.fill(VALID_NAME);
      await schema.fill(JSON.stringify(SCORE_SCHEMA));
      await expect(save).toBeEnabled();
      await save.click();

      await expect(page.getByRole("dialog").getByRole("alert")).toContainText(VALID_NAME);
      await expect(name).toHaveAccessibleDescription("");
    });
  });
}
