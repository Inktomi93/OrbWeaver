// CT: the full-fidelity ENTRY editor over the stubbed network (D78 — an AUTOSAVE editor on the session
// boundary). Proves the "everything included" claim end to end — every contract field renders seeded from
// the entry, the BUILT `@orb/ui/combobox` keyword picker commits a new chip, and the store-driven autosave
// (NO Save button) fires `worldInfo.updateEntry` whose input carries EVERY field back (title / content /
// keys incl. the added chip / enabled / priority / metadata.scopeMode / metadata.position) PLUS the unknown
// ST-imported metadata key (`extra`) the save mapper preserves. The second test is the F1 SWITCH pin: the
// book surface swaps the `entry` prop on ONE mounted editor, so the boundary must key its Session by entry
// id — else entry A's frozen form leaks into B. The Combobox input portals within the mounted root, so
// `page` locators address it by accessible name.

import { removeActionName } from "@orb/client/lib";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc, trpcError } from "../../../../support/node/route-trpc.ts";
import { EntryEditorStory, EntryEditorSwitchStory } from "../_ct-stories.tsx";

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
  await expect(page.getByRole("button", { name: removeActionName("eldoria") })).toBeVisible();
  await expect(page.getByRole("button", { name: removeActionName("capital") })).toBeVisible();

  // Commit a new keyword chip through the picker (type → Enter). This is a valid values change, so the
  // boundary's store-subscription driver debounces then autosaves — NO Save button.
  const keywords = page.getByLabel("Keyword triggers");
  await keywords.fill("walls");
  await keywords.press("Enter");
  await expect(page.getByRole("button", { name: removeActionName("walls") })).toBeVisible();

  // Autosave → updateEntry fires with the FULL input (every field + the added chip + the preserved key).
  await expect.poll(() => trpc.count("worldInfo.updateEntry"), { intervals: [100, 200, 300, 500] }).toBeGreaterThanOrEqual(1);
  await expect
    .poll(
      async () =>
        (
          trpc.lastInput("worldInfo.updateEntry") as {
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
          }
        ).entryId,
    )
    .toBe("world_entry_ctstory0001");
  await expect
    .poll(
      async () =>
        (
          trpc.lastInput("worldInfo.updateEntry") as {
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
          }
        ).input.title,
    )
    .toBe("Eldoria");
  await expect
    .poll(
      async () =>
        (
          trpc.lastInput("worldInfo.updateEntry") as {
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
          }
        ).input.keys,
    )
    .toEqual(["eldoria", "capital", "walls"]);
  await expect
    .poll(
      async () =>
        (
          trpc.lastInput("worldInfo.updateEntry") as {
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
          }
        ).input.enabled,
    )
    .toBe(true);
  await expect
    .poll(
      async () =>
        (
          trpc.lastInput("worldInfo.updateEntry") as {
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
          }
        ).input.priority,
    )
    .toBe(5);
  await expect
    .poll(
      async () =>
        (
          trpc.lastInput("worldInfo.updateEntry") as {
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
          }
        ).input.metadata["scopeMode"],
    )
    .toBe("keyword");
  await expect
    .poll(
      async () =>
        (
          trpc.lastInput("worldInfo.updateEntry") as {
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
          }
        ).input.metadata["position"],
    )
    .toBe("after");
  // The unknown ST-imported metadata key rides through untouched (the save mapper preserves it).
  await expect
    .poll(
      async () =>
        (
          trpc.lastInput("worldInfo.updateEntry") as {
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
          }
        ).input.metadata["extra"],
    )
    .toBe("keep-me");
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
  await expect
    .poll(async () => (trpc.lastInput("worldInfo.updateEntry") as { entryId: string; input: { title: string; content: string } }).input.title)
    .toBe("B edited");
  await expect
    .poll(async () => (trpc.lastInput("worldInfo.updateEntry") as { entryId: string; input: { title: string; content: string } }).input.content)
    .toBe("B-content");
  await expect
    .poll(async () => (trpc.lastInput("worldInfo.updateEntry") as { entryId: string; input: { title: string; content: string } }).input.content)
    .not.toBe("A-content");
});

// ── #1501 · THE EDITOR CLOSES WHEN THE ENTRY IS GONE, NOT WHEN THE DELETE IS SENT ────────────────
// `remove.mutate(...)` and `onDeleted(entry.id)` ran back to back, so a REJECTED delete still tore the
// editor down: the entry survived, the reader was ejected from it, and the only trace was a toast over a
// list that still had the row.
async function confirmDelete(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: /^Delete/ })
    .first()
    .click();
  const confirm = page.getByRole("alertdialog");
  if (await confirm.isVisible()) {
    await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  }
}

test("a REJECTED delete keeps the editor open on the entry that still exists (#1501)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "worldInfo.removeEntry": () => trpcError({ message: "delete failed" }) });
  const editor = await mount(<EntryEditorStory />);
  const deleted = editor.getByRole("status", { name: "Deleted entry" });
  await expect(deleted).toHaveText("none");

  await confirmDelete(page);

  await expect.poll(() => trpc.count("worldInfo.removeEntry"), { intervals: [20, 50, 100] }).toBe(1);
  await expect(deleted).toHaveText("none");
});

test("a SUCCESSFUL delete DOES close it — the host must not hold a dead editor (#1501, the other direction)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "worldInfo.removeEntry": () => null });
  const editor = await mount(<EntryEditorStory />);
  const deleted = editor.getByRole("status", { name: "Deleted entry" });

  await confirmDelete(page);

  await expect.poll(() => trpc.count("worldInfo.removeEntry"), { intervals: [20, 50, 100] }).toBe(1);
  await expect(deleted).not.toHaveText("none");
});
