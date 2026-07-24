// CT: the full-fidelity ENTRY editor over the stubbed network (D78 — an AUTOSAVE editor on the session
// boundary). Proves the "everything included" claim end to end — every contract field renders seeded from
// the entry, the BUILT `@orb/ui/combobox` keyword picker commits a new chip, and the store-driven autosave
// (NO Save button) fires `worldInfo.updateEntry` whose input carries EVERY field back (title / content /
// keys incl. the added chip / enabled / priority / metadata.scopeMode / metadata.position) PLUS the unknown
// ST-imported metadata key (`extra`) the save mapper preserves. The second test is the F1 SWITCH pin: the
// book surface swaps the `entry` prop on ONE mounted editor, so the boundary must key its Session by entry
// id — else entry A's frozen form leaks into B. The Combobox input portals within the mounted root, so
// `page` locators address it by accessible name.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { EntryEditorStory, EntryEditorSwitchStory } from "../_ct-stories";

test("renders every field, commits a keyword chip, and autosaves the full input", async ({ mount, page }) => {
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
  await expect(page.getByRole("textbox", { name: "Content" })).toHaveValue("Eldoria is the capital city, ringed by white walls.");
  // The two seeded keyword chips render (each Combobox chip carries a "Remove <chip>" button).
  await expect(page.getByRole("button", { name: "Remove eldoria" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove capital" })).toBeVisible();

  // Commit a new keyword chip through the picker (type → Enter). This is a valid values change, so the
  // boundary's store-subscription driver debounces then autosaves — NO Save button.
  const keywords = page.getByLabel("Keyword triggers");
  await keywords.fill("walls");
  await keywords.press("Enter");
  await expect(page.getByRole("button", { name: "Remove walls" })).toBeVisible();

  // Autosave → updateEntry fires with the FULL input (every field + the added chip + the preserved key).
  await expect.poll(() => trpc.count("worldInfo.updateEntry"), { intervals: [100, 200, 300, 500] }).toBeGreaterThanOrEqual(1);

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

test("delete: the icon trigger opens an uncontrolled confirm with no description, and confirming removes the entry", async ({ mount, page }) => {
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
  await expect.poll(() => trpc.count("worldInfo.removeEntry"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  await expect.poll(() => (trpc.lastInput("worldInfo.removeEntry") as { entryId: string }).entryId).toBe("world_entry_ctstory0001");
});

// F1 SWITCH pin (autosave-form-doctrine.md §8/§10) — the book surface swaps the `entry` prop on ONE mounted
// EntryEditor when the selected entry changes (no route/component remount), the exact F1 identity case. The
// boundary keys its Session by entry id, so switching entries is a fresh mount seeded from the NEW entry.
// A seeds content="A-content" (a field this test never edits — the tell of which seed is live); B seeds
// content="B-content". Dirty A via Title, switch to B, edit B's Title: the autosave for B must carry B's own
// untouched content ("B-content"), never A's frozen "A-content" (which a leaked A instance would re-save).
test("SWITCH pin — switching entries autosaves the new entry, never the previous entry's frozen fields", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "worldInfo.updateEntry": (input: unknown) => {
      const { entryId } = input as { entryId: string };
      return {
        id: entryId,
        worldBookId: "world_book_ctstory0001",
        title: "saved",
        description: null,
        content: "saved",
        keys: [],
        enabled: true,
        priority: 0,
        ignoreBudget: false,
        metadata: {},
      };
    },
  });

  await mount(<EntryEditorSwitchStory />);

  // Entry A is live — dirty it via Title so A's FormApi is non-default; the debounced autosave carries A's
  // whole row (incl. content="A-content").
  await page.getByRole("textbox", { name: "Title" }).fill("A edited");
  await expect
    .poll(() => (trpc.lastInput("worldInfo.updateEntry") as { entryId: string } | undefined)?.entryId, { intervals: [100, 200, 300, 500] })
    .toBe("world_entry_ctswitch0a");

  // Switch to entry B (same mount, new `entry` prop). Edit B's Title; the autosave must be for B, carrying
  // B's OWN content — a leaked A instance would autosave entryId A with content="A-content".
  await page.getByRole("button", { name: "switch entry" }).click();
  await expect(page.getByRole("textbox", { name: "Content" })).toHaveValue("B-content");
  await page.getByRole("textbox", { name: "Title" }).fill("B edited");

  await expect
    .poll(() => (trpc.lastInput("worldInfo.updateEntry") as { entryId: string } | undefined)?.entryId, { intervals: [100, 200, 300, 500] })
    .toBe("world_entry_ctswitch0b");
  const saved = trpc.lastInput("worldInfo.updateEntry") as { entryId: string; input: { title: string; content: string } };
  expect(saved.input.title).toBe("B edited");
  expect(saved.input.content).toBe("B-content");
  expect(saved.input.content).not.toBe("A-content");
});
