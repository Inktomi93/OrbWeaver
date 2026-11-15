import { regexScripts } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";

// A SillyTavern script with both "alter chat display" and "alter outgoing prompt" set runs on both ephemeral
// passes, and its display-only placement 0 has no target here.
test("ST imports keep both switches as both passes in stored bytes and library reads", async () => {
  await using root = await createServerHarness({ startJobs: false });
  const principal = await root.principalFor(root.ownerId);
  const fileText = JSON.stringify({
    id: "foreign-mask",
    scriptName: "Imported inert mask",
    findRegex: "x",
    replaceString: "y",
    placement: [0, 1],
    markdownOnly: true,
    promptOnly: true,
    disabled: false,
  });
  expect(await root.services.regex.importScriptFile({ principal, fileText })).toEqual({ created: true });
  const rows = await root.services.regex.listScripts({ principal });
  const script = rows.find((row) => row.name === "Imported inert mask");
  expect(script).toMatchObject({ targets: ["USER_INPUT"], passes: ["display", "prompt"] });
  if (script === undefined) {
    throw new Error("The imported script is absent from its owner's library");
  }
  const stored = await root.db.select().from(regexScripts).where(eq(regexScripts.id, script.id)).get();
  expect(stored?.behavior).toMatchObject({ targets: ["USER_INPUT"], passes: ["display", "prompt"] });
});
