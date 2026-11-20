// The Imagine dialog's mode toggles stay whole inside the dialog body on a phone at the browser's 300% text size, so a mode is
// never painted past the dialog's edge before a paid image request (WCAG 1.4.10 reflow).
// @subject packages/client/src/features/imagery/hooks/use-imagine-commit.tsx
import { LAYOUT_SUBPIXEL_PX, PLATFORM_TEXT_SCALES, setPlatformTextSize, settledBox } from "@orb/testkit/browser/spec";
import { routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { IMAGINE_DIALOG_TITLE, IMAGINE_MODE_NAME } from "#client/features/imagery/lib/imagine-names.ts";
import { dialogBodyAnchor } from "../../../components/_dialog-landing.ts";
import type { ImagineDialogStory } from "./_imagine-dialog-stories.tsx";

const STORY = "tests/client/features/imagery/components/_imagine-dialog-stories/ImagineDialogStory";
// The shell's own mount reads, and the imagine body's room read.
const READS = [
  "persona.list",
  "notifications.list",
  "plugin.listCommands",
  "databank.bankHealth",
  "rosterPreset.count",
  "connection.list",
  "connection.listBindings",
  "chat.getChat",
] as const;

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("every mode toggle lies inside the Imagine dialog body at 300% text", async ({ mount, page, browserName }) => {
  test.skip(browserName !== "chromium", "Only Chromium exposes the browser's default font size; WebKit has no text-size door");
  await using _textSize = await setPlatformTextSize(page, PLATFORM_TEXT_SCALES[2]);
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const [room] = (await caller.chat.listChats({})).items;
  if (room === undefined) {
    throw new Error("The committed corpus holds no owner room");
  }
  await routeTrpc(page, serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES, ...READS]));
  await mount<typeof ImagineDialogStory>(STORY, { seed: { chatId: room.id, mode: "free", prompt: "" } });
  await expect(page.getByRole("dialog", { name: IMAGINE_DIALOG_TITLE, exact: true })).toBeVisible();

  const body = await settledBox(dialogBodyAnchor(page));
  const toggles = page.getByRole("group", { name: IMAGINE_MODE_NAME, exact: true }).getByRole("button");
  // Positive control: the strip holds several modes, so the bound below is measured on each of them.
  const count = await toggles.count();
  expect(count).toBeGreaterThan(1);
  for (let index = 0; index < count; index += 1) {
    const box = await settledBox(toggles.nth(index));
    expect(box.x).toBeGreaterThanOrEqual(body.x - LAYOUT_SUBPIXEL_PX);
    expect(box.x + box.width).toBeLessThanOrEqual(body.x + body.width + LAYOUT_SUBPIXEL_PX);
  }
});
