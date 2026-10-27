// The hierarchy and boundary census: every registered section, modal and settings group is mounted through the
// production door and read for the rendered rules the law states (UI-Architecture-and-Layout.md §4.3 rule 3, UI-Density-Law.md
// §3 and §3.2) and for a suspending read outside a QueryBoundary (client-architecture-state-and-gates.md §11).
// The rosters are the production tuples, never a list here.

import { BLANK_CHAT_NAME } from "@orb/client/lib";
import type { ImageSubject } from "@orb/client/state";
import { CONFIG_GROUP_IDS, MODAL_SLOT_IDS, SECTION_IDS } from "@orb/client/state";
import { presetIdInputSchema } from "@orb/contracts/preset";
import type { ChatId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId, typeIdSchema } from "@orb/kit/ids";
import { auditSurface, formatDensityFindings, settledBox } from "@orb/testkit/browser/spec";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusWire } from "@orb/testkit/iso";
import { createSeededIds } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { channelName } from "../../lib/appearance-channel-names.ts";
import { routeSurfaceReads } from "./_surface-harness.ts";
import { groupScenario, modalScenario, sectionScenario } from "./_surface-scenarios.ts";
import type {
  ConfigGroupStory,
  ImageSubjectModalStory,
  ImagineModalStory,
  ModalShellStory,
  PluginDialogModalStory,
  PresetDetailShellStory,
  SectionShellStory,
} from "./_surface-stories.tsx";

const STORIES = "tests/client/features/app-shell/_surface-stories";
/** The message `requireQueryBoundary` makes a read outside a QueryBoundary throw. */
const MISSING_BOUNDARY = "[query-boundary]";

let root: Awaited<ReturnType<typeof createCorpusHarness>>;
test.beforeAll(async () => {
  root = await createCorpusHarness();
});

test.beforeEach(async ({ corpus, page }) => {
  await routeSurfaceReads(page, corpus, root);
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

/** The messages a page raised that name the missing boundary, from the console and from uncaught errors. */
function watchMissingBoundary(page: Page): readonly string[] {
  const raised: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes(MISSING_BOUNDARY)) {
      raised.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    if (error.message.includes(MISSING_BOUNDARY)) {
      raised.push(error.message);
    }
  });
  return raised;
}

for (const section of SECTION_IDS) {
  test(`section ${section} reads clean`, async ({ mount, page }) => {
    const boundary = watchMissingBoundary(page);
    await mount<typeof SectionShellStory>(`${STORIES}/SectionShellStory`, { section });
    const report = await auditSurface({ ...sectionScenario(page, section), checks: ["density"] });
    expect(boundary).toEqual([]);
    expect(formatDensityFindings(report.density)).toBe("");
  });
}

test("the loaded preset detail reads clean", async ({ corpus, mount, page }) => {
  const captured = corpus.libraryRelations?.reads.presetDetail.input;
  if (captured === undefined) {
    throw new Error("The corpus has no captured preset detail");
  }
  const { id: presetId } = presetIdInputSchema.parse(captured);
  const boundary = watchMissingBoundary(page);
  await mount<typeof PresetDetailShellStory>(`${STORIES}/PresetDetailShellStory`, { presetId });
  const report = await auditSurface({
    name: "loaded preset detail",
    scope: page.locator("body"),
    state: "loaded",
    witnesses: [page.getByRole("button", { name: "Rename preset", exact: true })],
    checks: ["density"],
  });
  expect(boundary).toEqual([]);
  expect(formatDensityFindings(report.density)).toBe("");
});

for (const modal of MODAL_SLOT_IDS) {
  test(`modal ${modal} reads clean`, async ({ mount, page }) => {
    const boundary = watchMissingBoundary(page);
    await mount<typeof ModalShellStory>(`${STORIES}/ModalShellStory`, { modal });
    const report = await auditSurface({ ...modalScenario(page, modal), checks: ["density"] });
    expect(boundary).toEqual([]);
    expect(formatDensityFindings(report.density)).toBe("");
  });
}

test.describe("scaled new-chat footer", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("each action owns its painted label at narrow and wider container widths", async ({ mount, page }, testInfo) => {
    await mount<typeof ModalShellStory>(`${STORIES}/ModalShellStory`, { modal: "newChat" });
    const dialog = page.getByRole("dialog");
    const blank = dialog.getByRole("button", { name: BLANK_CHAT_NAME, exact: true });
    await expect(blank).toBeVisible();
    await page.evaluate((property) => document.documentElement.style.setProperty(property, "1.25"), channelName("fontScale"));
    for (const width of [390, 900]) {
      await page.setViewportSize({ width, height: 844 });
      await settledBox(blank);
      const geometry = await blank.evaluate((button) => {
        const footer = button.parentElement;
        if (footer === null) {
          throw new Error("New-chat action footer missing");
        }
        const frame = footer.getBoundingClientRect();
        const style = getComputedStyle(footer);
        return [...footer.querySelectorAll("button")].map((action) => {
          const box = action.getBoundingClientRect();
          const walker = document.createTreeWalker(action, NodeFilter.SHOW_TEXT);
          const ink: DOMRect[] = [];
          for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
            if (node.textContent?.trim() === "" || node.parentElement?.checkVisibility() !== true) {
              continue;
            }
            const range = document.createRange();
            range.selectNodeContents(node);
            ink.push(range.getBoundingClientRect());
          }
          return {
            text: action.textContent,
            left: box.left,
            right: box.right,
            height: box.height,
            inkLeft: Math.min(...ink.map((rect) => rect.left)),
            inkRight: Math.max(...ink.map((rect) => rect.right)),
            floorLeft: frame.left + Number.parseFloat(style.paddingLeft),
            floorRight: frame.right - Number.parseFloat(style.paddingRight),
          };
        });
      });
      await testInfo.attach(`footer-${width}`, { body: JSON.stringify(geometry), contentType: "application/json" });
      expect(geometry).toHaveLength(2);
      for (const action of geometry) {
        expect.soft(action.inkLeft, action.text).toBeGreaterThanOrEqual(action.left - 1);
        expect.soft(action.inkRight, action.text).toBeLessThanOrEqual(action.right + 1);
        expect.soft(action.left).toBeGreaterThanOrEqual(action.floorLeft - 1);
        expect.soft(action.right).toBeLessThanOrEqual(action.floorRight + 1);
        expect.soft(action.height).toBeGreaterThanOrEqual(44);
      }
    }
  });
});

for (const group of CONFIG_GROUP_IDS) {
  test(`settings group ${group} reads clean`, async ({ mount, page }) => {
    const boundary = watchMissingBoundary(page);
    await mount<typeof ConfigGroupStory>(`${STORIES}/ConfigGroupStory`, { group });
    const report = await auditSurface({ ...groupScenario(page, group), checks: ["density"] });
    expect(boundary).toEqual([]);
    expect(formatDensityFindings(report.density)).toBe("");
  });
}

// A modal that opens on a subject renders its "nothing selected" arm unseeded, so each is opened on the data the
// corpus holds: a room, and the plugin's own dialog surface.
const SEEDED_MODALS = ["imagine", "imageDetail", "imageEdit", "pluginDialog"] as const;

// The control that shows the real form rendered, not the "nothing selected" arm.
const IMAGE_FORM = { imageDetail: ["button", "Edit image"], imageEdit: ["textbox", "Edit instruction"] } as const;

function corpusChatId(corpus: CorpusWire): ChatId {
  const chatId = corpus.reads["chat.listChats"][0]?.output.items[0]?.id;
  if (chatId === undefined) {
    throw new Error("The corpus has no room to open an image modal in");
  }
  return typeIdSchema(ID_PREFIX.chat).parse(chatId);
}

function imageSubject(chatId: ChatId): ImageSubject {
  return { assetId: mintTypeId(ID_PREFIX.asset, createSeededIds().next), chatId, url: "/census-image.png", alt: "Census image", dims: { w: 64, h: 64 } };
}

test("the seeded modal list names modals the registry holds", () => {
  expect(SEEDED_MODALS.every((modal) => MODAL_SLOT_IDS.includes(modal))).toBe(true);
});

test("the imagine modal reads clean on a seeded prompt", async ({ corpus, mount, page }) => {
  const boundary = watchMissingBoundary(page);
  await mount<typeof ImagineModalStory>(`${STORIES}/ImagineModalStory`, {
    seed: { chatId: corpusChatId(corpus), mode: "free", prompt: "A lantern over a harbour" },
  });
  await expect(page.getByRole("dialog")).not.toContainText("Nothing to imagine");
  const report = await auditSurface({
    name: "seeded image prompt",
    scope: page.getByRole("dialog"),
    state: "loaded",
    witnesses: [page.getByRole("textbox", { name: "Image prompt", exact: true })],
    checks: ["density"],
  });
  expect(boundary).toEqual([]);
  expect(formatDensityFindings(report.density)).toBe("");
});

for (const modal of ["imageDetail", "imageEdit"] as const) {
  test(`the ${modal} modal reads clean on an image`, async ({ corpus, mount, page }) => {
    const boundary = watchMissingBoundary(page);
    await mount<typeof ImageSubjectModalStory>(`${STORIES}/ImageSubjectModalStory`, { modal, subject: imageSubject(corpusChatId(corpus)) });
    const [role, name] = IMAGE_FORM[modal];
    await expect(page.getByRole("dialog").getByRole(role, { name })).toBeVisible();
    const report = await auditSurface({
      name: `seeded ${modal}`,
      scope: page.getByRole("dialog"),
      state: "loaded",
      witnesses: [page.getByRole("dialog").getByRole(role, { name })],
      checks: ["density"],
    });
    expect(boundary).toEqual([]);
    expect(formatDensityFindings(report.density)).toBe("");
  });
}

test("the pluginDialog modal reads clean on the plugin's dialog surface", async ({ corpus, mount, page }) => {
  const stage = corpus.pluginLibrary?.ownerActive;
  const surface = stage?.reads.surfaces.output.find((candidate) => candidate.anchor === "dialog");
  if (stage === undefined || surface === undefined) {
    throw new Error("The corpus has no active plugin with a dialog surface");
  }
  const plugin = stage.reads.plugins.output.find((candidate) => candidate.id === surface.pluginId);
  if (plugin === undefined || surface.tier !== "static" || surface.spec?.kind !== "text" || typeof surface.spec.value !== "string") {
    throw new Error("The corpus dialog has no owning plugin or static detail text");
  }
  await routeSurfaceReads(page, corpus, root, { pluginDialog: stage });
  const boundary = watchMissingBoundary(page);
  await mount<typeof PluginDialogModalStory>(`${STORIES}/PluginDialogModalStory`, {
    subject: { pluginId: typeIdSchema(ID_PREFIX.plugin).parse(surface.pluginId), surfaceId: surface.id },
  });
  await expect(page.getByRole("dialog")).not.toContainText("no longer available");
  const report = await auditSurface({
    name: "seeded plugin dialog",
    scope: page.getByRole("dialog"),
    state: "loaded",
    witnesses: [page.getByRole("dialog").getByText(plugin.name, { exact: true }), page.getByRole("dialog").getByText(surface.spec.value, { exact: true })],
    checks: ["density"],
  });
  expect(boundary).toEqual([]);
  expect(formatDensityFindings(report.density)).toBe("");
});
