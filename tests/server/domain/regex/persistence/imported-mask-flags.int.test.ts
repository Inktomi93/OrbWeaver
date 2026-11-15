import { regexScripts } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";

// A SillyTavern script with both "alter chat display" and "alter outgoing prompt" set runs on both ephemeral
// passes. Placement 0 is read per list in `tests/server/domain/import/persistence/regex-placement-lists.int.test.ts`.
test("ST imports keep both switches as both passes in stored bytes and library reads", async () => {
  await using root = await createServerHarness({ startJobs: false });
  const principal = await root.principalFor(root.ownerId);
  const fileText = JSON.stringify({
    id: "foreign-mask",
    scriptName: "Imported inert mask",
    findRegex: "x",
    replaceString: "y",
    placement: [1],
    markdownOnly: true,
    promptOnly: true,
    disabled: false,
  });
  expect(await root.services.regex.importScriptFile({ principal, fileText })).toEqual({ created: true, notes: [] });
  const rows = await root.services.regex.listScripts({ principal });
  const script = rows.find((row) => row.name === "Imported inert mask");
  expect(script).toMatchObject({ targets: ["USER_INPUT"], passes: ["display", "prompt"] });
  if (script === undefined) {
    throw new Error("The imported script is absent from its owner's library");
  }
  const stored = await root.db.select().from(regexScripts).where(eq(regexScripts.id, script.id)).get();
  expect(stored?.behavior).toMatchObject({ targets: ["USER_INPUT"], passes: ["display", "prompt"] });
});
