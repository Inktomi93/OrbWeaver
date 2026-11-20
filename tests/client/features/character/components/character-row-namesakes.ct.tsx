// Two library rows that share a name are told apart by what differs: the row whose handle is its name's own slug shows the name
// alone, and its namesake shows its handle after the name in the name's own face. The library, its rows and the list read are the
// production ones over a first-boot root, on a coarse phone where the list is the screen.
// @subject packages/client/src/features/character/lib/character-row-qualifier.ts
import { createCharacterSchema } from "@orb/contracts/character";
import { slugifyHandle } from "@orb/kit/slug";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { routeAuthConfig, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createFirstBootHarness } from "@orb/testkit/node/composed";
import { CHARACTER_LIBRARY_NAME } from "#client/features/character/lib/character-names.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const NAME = "Eleni Vance";
const OTHER_HANDLE = "eleni-of-the-harbor";
const DESCRIPTION = "A cartographer.";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test("a name shared by two rows shows only the handle that differs from it, in the name's face", async ({ corpus, mount, page }) => {
  await using root = await createFirstBootHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const derived = slugifyHandle(NAME);
  await caller.character.create({ input: createCharacterSchema.parse({ handle: derived, name: NAME, description: DESCRIPTION }) });
  await caller.character.create({ input: createCharacterSchema.parse({ handle: OTHER_HANDLE, name: NAME, description: DESCRIPTION }) });
  await routeAuthConfig(page, corpus.auth.signedInConfig);
  await routeTrpc(page, serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES]));
  await seedShellState(page, { activeSection: "characters" });
  await mount<typeof ShellAmbientStory>(STORY, {});

  const library = page.getByRole("list", { name: CHARACTER_LIBRARY_NAME, exact: true });
  const plain = library.getByRole("button", { name: NAME, exact: true });
  const namesake = library.getByRole("button", { name: `${NAME} · ${OTHER_HANDLE}`, exact: true });
  await expect(plain).toHaveCount(1);
  await expect(namesake).toHaveCount(1);
  // The derived handle repeats the name, so no row spends it.
  await expect(library.getByRole("button", { name: `${NAME} · ${derived}`, exact: true })).toHaveCount(0);
  await expect(plain.locator('[data-slot="list-row-title-qualifier"]')).toHaveCount(0);

  const qualifier = namesake.locator('[data-slot="list-row-title-qualifier"]');
  await expect(qualifier).toHaveText(OTHER_HANDLE);
  const faces = await namesake.evaluate((row) => {
    const face = (slot: string): string | null => {
      const node = row.querySelector(`[data-slot="${slot}"]`);
      return node === null ? null : getComputedStyle(node).fontFamily;
    };
    return { title: face("list-row-title"), qualifier: face("list-row-title-qualifier") };
  });
  expect(faces.qualifier).not.toBeNull();
  expect(faces.qualifier).toBe(faces.title);
});
