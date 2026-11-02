// The inline embed refuses an id that does not parse before it can send it, and says why beside the field.
import { ID_PREFIX } from "@orb/kit/ids";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness } from "@orb/testkit/node/composed";
import type { AdminEmbedCardStory } from "./_admin-ops-section-stories.tsx";

const STORY = "tests/client/features/user-admin/components/_admin-ops-section-stories/AdminEmbedCardStory";
const ANY_TEXT = /\S/u;

test("a character id that does not parse disables the embed with a stated reason; a parseable one enables it", async ({ page, mount }) => {
  await using root = await createServerHarness({ startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, serveCorpusProcedures(caller, ["sessions.me"]));
  await mount<typeof AdminEmbedCardStory>(STORY, {});
  const field = page.getByRole("textbox", { name: "Character id", exact: true });
  const embed = page.getByRole("button", { name: "Embed card", exact: true });

  await expect(embed).toBeDisabled();
  await field.fill("not-a-character-id");
  await expect(embed).toBeDisabled();
  await expect(embed).toHaveAccessibleDescription(ANY_TEXT);

  await field.fill(root.idSource.typeId(ID_PREFIX.character));
  await expect(embed).toBeEnabled();
  await expect(embed).toHaveAccessibleDescription("");
});
