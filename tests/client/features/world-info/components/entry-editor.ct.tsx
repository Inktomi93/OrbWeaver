// CT: the full-fidelity ENTRY editor over the stubbed network. Proves the "everything included" claim end to
// end — every contract field renders seeded from the entry, the BUILT `@orb/ui/combobox` keyword picker
// commits a new chip, and Save fires `worldInfo.updateEntry` whose input carries EVERY field back (title /
// content / keys incl. the added chip / enabled / priority / metadata.scopeMode / metadata.position) PLUS the
// unknown ST-imported metadata key (`extra`) the save mapper preserves. The Combobox input + the Save button
// portal within the mounted root, so `page` locators address them by their accessible names.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { EntryEditorStory } from "../_ct-stories";

test("renders every field, commits a keyword chip, and saves the full input", async ({
  mount,
  page,
}) => {
  const trpc = await routeTrpc(page, {
    "worldInfo.updateEntry": (input: unknown) => {
      const { entryId } = input as { entryId: string };
      return {
        id: entryId,
        worldBookId: "world_book_ctstory0001",
        title: "Eldoria",
        description: "the shining capital",
        content: "Eldoria is the capital city, ringed by white walls.",
        keys: ["eldoria", "capital", "walls"],
        enabled: true,
        priority: 5,
        ignoreBudget: false,
        metadata: { scopeMode: "keyword", position: "after", extra: "keep-me" },
      };
    },
  });

  await mount(<EntryEditorStory />);

  // Seeded fields render (by ROLE — the `hint` info-tooltip button also carries the field name).
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue("Eldoria");
  await expect(page.getByRole("textbox", { name: "Content" })).toHaveValue(
    "Eldoria is the capital city, ringed by white walls.",
  );
  // The two seeded keyword chips render (each Combobox chip carries a "Remove <chip>" button).
  await expect(page.getByRole("button", { name: "Remove eldoria" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove capital" })).toBeVisible();

  // Commit a new keyword chip through the picker (type → Enter).
  const keywords = page.getByLabel("Keyword triggers");
  await keywords.fill("walls");
  await keywords.press("Enter");
  await expect(page.getByRole("button", { name: "Remove walls" })).toBeVisible();

  // Save → updateEntry fires with the FULL input (every field + the added chip + the preserved unknown key).
  await page.getByRole("button", { name: "Save entry" }).click();
  await expect
    .poll(() => trpc.count("worldInfo.updateEntry"), { intervals: [20, 50, 100] })
    .toBeGreaterThanOrEqual(1);

  const saved = trpc.lastInput("worldInfo.updateEntry") as {
    entryId: string;
    input: {
      title: string;
      content: string;
      keys: string[];
      enabled: boolean;
      priority: number;
      ignoreBudget: boolean;
      metadata: Record<string, unknown>;
    };
  };
  expect(saved.entryId).toBe("world_entry_ctstory0001");
  expect(saved.input.title).toBe("Eldoria");
  expect(saved.input.keys).toEqual(["eldoria", "capital", "walls"]);
  expect(saved.input.enabled).toBe(true);
  expect(saved.input.priority).toBe(5);
  expect(saved.input.metadata["scopeMode"]).toBe("keyword");
  expect(saved.input.metadata["position"]).toBe("after");
  // The unknown ST-imported metadata key rides through untouched (the save mapper preserves it).
  expect(saved.input.metadata["extra"]).toBe("keep-me");
});

test("delete: the icon trigger opens an uncontrolled confirm with no description, and confirming removes the entry", async ({
  mount,
  page,
}) => {
  const trpc = await routeTrpc(page, {
    "worldInfo.removeEntry": () => ({ ok: true }),
  });

  await mount(<EntryEditorStory />);

  await page.getByRole("button", { name: "Delete Eldoria" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Delete "Eldoria"?');
  // Title-only confirm: no description paragraph renders (the M5 optional-description extension).
  await expect(dialog.locator("p")).toHaveCount(0);

  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect
    .poll(() => trpc.count("worldInfo.removeEntry"), { intervals: [20, 50, 100] })
    .toBeGreaterThanOrEqual(1);
  expect((trpc.lastInput("worldInfo.removeEntry") as { entryId: string }).entryId).toBe(
    "world_entry_ctstory0001",
  );
});
