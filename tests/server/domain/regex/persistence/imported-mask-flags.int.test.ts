import { regexScripts } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";

// A SillyTavern script with both "alter chat display" and "alter outgoing prompt" set runs on both ephemeral
// passes. Placement 0 is SillyTavern's retired display member, which its loader drops beside another member, so no
// placement is lost.
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

// SillyTavern's loader reads a lone retired display placement as every placement with both ephemeral switches, even
// when the file sets neither.
test("a script on the retired display placement alone imports on every target and both ephemeral passes, switched on", async () => {
  await using root = await createServerHarness({ startJobs: false });
  const principal = await root.principalFor(root.ownerId);
  const fileText = JSON.stringify({ id: "retired-display", scriptName: "Old display script", findRegex: "x", replaceString: "y", placement: [0] });
  expect(await root.services.regex.importScriptFile({ principal, fileText })).toEqual({ created: true, notes: [] });
  const rows = await root.services.regex.listScripts({ principal });
  expect(rows.find((row) => row.name === "Old display script")).toMatchObject({
    enabled: true,
    targets: ["USER_INPUT", "AI_OUTPUT", "WORLD_INFO", "REASONING"],
    passes: ["display", "prompt"],
  });
});
