// An edited regex library member saves through the real update verb: the strict input refuses any key the editor
// carries beyond the script's authored fields (its id and edit stamp included).
import { routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { RegexMemberSaveStory } from "./_member-save-stories.tsx";

const STORY = "tests/client/features/regex/surfaces/_member-save-stories/RegexMemberSaveStory";
const NAME = "Member save witness";

test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });

test("an edited replacement saves through the update verb and the stored script carries it", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const script = await caller.regex.createScript({ input: { name: NAME, findRegex: "witness", replaceString: "before", placement: ["AI_OUTPUT"] } });
  const calls = await routeTrpc(page, serveCorpusProcedures(caller, [...SECTION_PROCEDURES, "regex.listScripts", "regex.listGlobal", "regex.updateScript"]));
  await mount<typeof RegexMemberSaveStory>(STORY, { scriptId: script.id });
  const field = page.getByRole("textbox", { name: "Replace with", exact: true });
  await expect(field).toHaveValue("before");
  await field.fill("after");
  await field.press("Tab");
  await expect.poll(async () => (await caller.regex.listScripts()).find((row) => row.id === script.id)?.replaceString).toBe("after");
  expect(calls.count("regex.updateScript")).toBeGreaterThan(0);
});
