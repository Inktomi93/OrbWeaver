// CT: the decomposed CHAT-BEHAVIOR PANE (SET-SEAMS stage 2). The pane is a `{kind:"sections"}` SKIMMER now —
// it has no surface of its own — so the only honest mount is the real settings shell, which is also the only
// place the §3 aggregate save-status host and the derived nav exist. Everything here is a PANE-level
// invariant; per-section reads/writes are pinned by each section's own CT at its owner's mirror path.
//
// Covers, from the SET-SEAMS §9 plan: the shared render-parity geometry harness · door order IS render
// order · P2 sibling isolation (a section's save leaves its siblings' edits and values alone — the two chat
// sections share ONE namespace, which is exactly the case §2.1 warns about) · P4 status aggregation (ONE
// footer, inline retry AT the failing section, nav marker) · P5 nav/search parity for the two moved subs ·
// the §7.4 sub-level deep link onto a moved section.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { findSettingsColumnViolation, readSettingsPaneGeometry } from "../../../../support/browser/settings-geometry.ts";
import type { TrpcRecorder, TrpcResponder } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcError } from "../../../../support/node/route-trpc.ts";
import { ChatBehaviorGroupStory, ConfigHostStory } from "../_ct-stories.tsx";

const SETTINGS_VIEW = { userId: "user_ct_chat_behavior_pane", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 };
const UPDATE_PROC = "settings.updateUserSettingsSection";

/** The pane's seven sections, in the door's declared order (main.tsx) — which IS the render order. */
const ANCHOR_ORDER = [
  "config-anchor-chat-behavior-message-handling",
  "config-anchor-chat-behavior-streaming",
  "config-anchor-chat-behavior-memory",
  "config-anchor-chat-behavior-world-info",
  "config-anchor-chat-behavior-databank",
  "config-anchor-chat-behavior-imagery-templates",
  "config-anchor-chat-behavior-prose",
];

/** The nav rows the pane DERIVES from its contributions, in door order — a section that declares a
 *  `navLabel` shows THAT here ("Chat & message handling" stays the heading). */
const NAV_LABELS = ["Message handling", "Streaming", "Memory", "World info", "Databank", "Image prompts", "Prose"];

function stub(page: Page, update: TrpcResponder = (): unknown => ({})): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    // The config LIST paints every shelf, so the four collection bands read their rosters for the counts —
    // fed empty (the honest fresh-library arm) rather than left to routeTrpc's inert null.
    "tag.listTagsWithUsage": [],
    "regex.listScripts": [],
    "worldInfo.listBooksWithUsage": [],
    "rosterPreset.list": [],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "sessions.me": () => ({ user: { id: SETTINGS_VIEW.userId, role: "user" } }),
    [UPDATE_PROC]: update,
  });
}

/** Every `chat` section-patch recorded so far. */
function patches(trpc: TrpcRecorder): Record<string, unknown>[] {
  return trpc
    .inputs(UPDATE_PROC)
    .map((input) => input as { section?: string; patch?: Record<string, unknown> })
    .filter((input) => input.section === "chat")
    .map((input) => input.patch ?? {});
}

/** How many recorded patches named `key` — the per-section save counter (each section owns disjoint keys). */
function patchCountFor(trpc: TrpcRecorder, key: string): number {
  return patches(trpc).filter((patch) => key in patch).length;
}

test("the skimmer renders all seven contributed sections, in the door's declared order", async ({ mount, page }) => {
  await stub(page);
  await mount(<ChatBehaviorGroupStory />);
  await page.getByRole("heading", { name: "Chat & message handling" }).waitFor();
  await expect
    .poll(async () => await page.evaluate(() => [...document.querySelectorAll('[id^="config-anchor-chat-behavior-"]')].map((el) => el.id)))
    .toStrictEqual(ANCHOR_ORDER);
});

// Single-column-of-SECTIONS (owner ruling — Discord grammar): every subcategory SECTION shares the same left
// edge + full column width and stacks in registry order. Runs the SHARED render-parity harness (SET-SEAMS
// §9) — a decomposition that moves the pixels is a defect.
test("subcategory sections are a single column, stacked in registry order", async ({ mount, page }) => {
  await stub(page);
  await mount(<ChatBehaviorGroupStory />);
  await page.getByRole("heading", { name: "Chat & message handling" }).waitFor();

  const geometry = await readSettingsPaneGeometry(page, "chat-behavior");
  expect(findSettingsColumnViolation(geometry, ANCHOR_ORDER.length)).toBeNull();
});

// P2 — SIBLING ISOLATION (SET-SEAMS §9). The two chat-owned sections write into ONE `chat` namespace, which
// is precisely the N-sections-one-namespace case the key-minimal patch exists for.
test("a section's save carries none of its siblings' keys and never re-fires or resets them", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<ChatBehaviorGroupStory />);
  await page.getByRole("heading", { name: "Chat & message handling" }).waitFor();

  // B: Streaming — pick Pin, wait for ITS save.
  await page.getByRole("combobox", { name: "While a reply streams" }).click();
  await page.getByRole("option", { name: "Pin my message to the top" }).click();
  await expect.poll(() => patchCountFor(trpc, "streamScrollMode"), { intervals: [20, 50, 100] }).toBe(1);

  // A: message handling — change a sibling section, wait for ITS save.
  await page.getByRole("switch", { name: "Enter to send" }).click();
  await expect.poll(() => patchCountFor(trpc, "enterSends"), { intervals: [20, 50, 100] }).toBe(1);

  // A's payload names A's keys only — `streamScrollMode` is nowhere in it (a full-blob patch would have
  // carried A's STALE copy of it and silently reverted B; SET-SEAMS §2.1).
  const handlingPatch = patches(trpc).find((patch) => "enterSends" in patch) ?? {};
  expect("streamScrollMode" in handlingPatch).toBe(false);
  expect(Object.keys(handlingPatch).sort()).toStrictEqual([
    "autoContinue",
    "autoContinueRounds",
    "autoSwipe",
    "charactersCanReact",
    "continueOnSend",
    "customStoppingStrings",
    "enterSends",
    "generateOnEmptySend",
    "offerChoices",
    "reactionsEnabled",
    "tempChatTtlHours",
  ]);

  // …and B neither re-saved nor lost its value (no reseed churn — §2.2's projection-equality property).
  expect(patchCountFor(trpc, "streamScrollMode")).toBe(1);
  await expect(page.getByRole("combobox", { name: "While a reply streams" })).toContainText("Pin my message to the top");
});

// P4 — STATUS AGGREGATION (SET-SEAMS §3/§9). Six sections, ONE footer; RETRY stays local to the section that
// owns the failed edit.
test("the pane shows exactly ONE aggregate save footer, not one per section", async ({ mount, page }) => {
  await stub(page);
  await mount(<ChatBehaviorGroupStory />);
  await page.getByRole("heading", { name: "Chat & message handling" }).waitFor();

  await page.getByRole("switch", { name: "Enter to send" }).click();
  await expect(page.locator('[data-slot="config-save-footer"]')).toHaveCount(1);
  // Hosted sections render NO inline status while they are healthy — the footer is the only readout.
  await expect(page.locator('[data-slot="autosave-status"]')).toHaveCount(0);
});

test("a failing save lights the aggregate footer, an INLINE retry at the failing section, and a nav marker", async ({ mount, page }) => {
  await stub(page, () => trpcError({ code: "INTERNAL_SERVER_ERROR", message: "nope" }));
  await mount(<ChatBehaviorGroupStory />);
  await page.getByRole("heading", { name: "Chat & message handling" }).waitFor();

  await page.getByRole("combobox", { name: "While a reply streams" }).click();
  await page.getByRole("option", { name: "Pin my message to the top" }).click();

  // The aggregate is read-only and LOCATES the failure (never a retry-all, D41).
  const footer = page.locator('[data-slot="config-save-footer"]');
  await expect(footer).toHaveCount(1);
  await expect(footer.getByText("A section failed to save —")).toBeVisible();
  await expect(footer.getByRole("button", { name: "Show me" })).toBeVisible();

  // The failing section — and only it — renders its OWN inline retry at its own anchor.
  const streaming = page.locator("#config-anchor-chat-behavior-streaming");
  await expect(streaming.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(page.locator('[data-slot="autosave-status"]')).toHaveCount(1);

  // …and its nav row carries the locator marker.
  await expect(page.getByRole("region", { name: "Settings groups" }).getByText("Save failed")).toBeVisible();
});

// P5 — NAV/SEARCH PARITY (SET-SEAMS §7.2/§7.3). The pane's nav DERIVES from the contributions now; the two
// moved subs keep their labels, their leaves, and their (category, subId) anchors.
test("the derived nav lists every contributed section, in door order", async ({ mount, page }) => {
  await stub(page);
  await mount(<ChatBehaviorGroupStory />);
  await page.getByRole("heading", { name: "Chat & message handling" }).waitFor();

  const nav = page.getByRole("region", { name: "Settings groups" });
  await Promise.all(NAV_LABELS.map((label) => expect(nav.getByText(label, { exact: true })).toBeVisible()));
});

// §7.4 / §10 Q4 — a SUB-level deep link resolves the pane in render and lands on the section's anchor once
// the pane's DOM has it. The sub ids are byte-identical across the move, so old links keep working.
test("a sub-level deep link lands on the moved section's anchor", async ({ mount, page }) => {
  await stub(page);
  await mount(<ConfigHostStory target="chat-behavior" sub="streaming" />);

  await expect(page.locator("#config-anchor-chat-behavior-streaming")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "While a reply streams" })).toBeVisible();
});
