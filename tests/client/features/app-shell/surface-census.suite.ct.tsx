// The hierarchy and boundary census: every registered section, modal and settings group is mounted through the
// production door and read for the rendered rules the law states (UI-Architecture-and-Layout.md §4.3 rule 3, UI-Density-Law.md
// §3 and §3.2) and for a suspending read outside a QueryBoundary (client-architecture-state-and-gates.md §11).
// The rosters are the production tuples, never a list here.

import type { ImageSubject } from "@orb/client/state";
import { CONFIG_GROUP_IDS, MODAL_SLOT_IDS, SECTION_IDS } from "@orb/client/state";
import { presetIdInputSchema } from "@orb/contracts/preset";
import type { ChatId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId, typeIdSchema } from "@orb/kit/ids";
import { densityFindings, formatDensityFindings, settleSurface } from "@orb/testkit/browser/spec";
import { serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusWire } from "@orb/testkit/iso";
import { createCorpusReadResponder, createSeededIds } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import type { SurfaceRouteOverrides } from "./_surface-harness.ts";
import { routeSurfaceReads } from "./_surface-harness.ts";
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
  await routeSurfaceReads(page, corpus, await root.internalCallerFor(root.ownerId));
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

/** Empty when the surface settled with every read under a boundary and no density finding. */
async function censusReport(page: Page, boundary: readonly string[]): Promise<string> {
  await settleSurface(page);
  return [...boundary, formatDensityFindings(await densityFindings(page))].filter((line) => line !== "").join("\n");
}

test.describe("planted defects", () => {
  test("a second primary control in one region, a same-tier Surface and a boxed card in a boxed card each fail", async ({ page }) => {
    const box = "border:1px solid #888;border-radius:8px;background:#eee;padding:4px";
    await page.setContent(
      '<aside class="shell-panel"><button data-slot="button" data-cta>Save</button><button data-slot="button" data-cta>Send</button></aside>' +
        '<section data-surface-tier="form"><div data-surface-tier="form">inner</div></section>' +
        `<div data-slot="card-root" style="${box}">outer<div data-slot="card-root" style="${box}">inner</div></div>`,
    );
    expect((await densityFindings(page)).map((finding) => finding.rule).toSorted()).toEqual(["nested-box", "same-tier-surface", "second-primary"]);
  });

  test("one primary per region, a different tier inside a tier and an unboxed well in a card all pass", async ({ page }) => {
    const box = "border:1px solid #888;border-radius:8px;background:#eee;padding:4px";
    await page.setContent(
      '<aside class="shell-panel"><button data-slot="button" data-cta>Save</button></aside>' +
        '<main class="shell-content"><button data-slot="button" data-cta>Send</button><button data-slot="button" data-cta disabled>Off</button></main>' +
        '<section data-surface-tier="instrument"><div data-surface-tier="form">inner</div></section>' +
        `<div data-slot="card-root" style="${box}">outer<div data-slot="card-root" style="background:#ddd;border-radius:6px">well</div></div>`,
    );
    expect(await densityFindings(page)).toEqual([]);
    // The census reads this page: the same call reports a defect planted into it.
    await page.setContent(
      '<aside class="shell-panel"><button data-slot="button" data-cta>Save</button><button data-slot="button" data-cta>Send</button></aside>',
    );
    expect((await densityFindings(page)).map((finding) => finding.rule)).toEqual(["second-primary"]);
  });
});

for (const section of SECTION_IDS) {
  test(`section ${section} reads clean`, async ({ mount, page }) => {
    const boundary = watchMissingBoundary(page);
    await mount<typeof SectionShellStory>(`${STORIES}/SectionShellStory`, { section });
    expect(await censusReport(page, boundary)).toBe("");
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
  expect(await censusReport(page, boundary)).toBe("");
});

for (const modal of MODAL_SLOT_IDS) {
  test(`modal ${modal} reads clean`, async ({ mount, page }) => {
    const boundary = watchMissingBoundary(page);
    await mount<typeof ModalShellStory>(`${STORIES}/ModalShellStory`, { modal });
    expect(await censusReport(page, boundary)).toBe("");
  });
}

for (const group of CONFIG_GROUP_IDS) {
  test(`settings group ${group} reads clean`, async ({ mount, page }) => {
    const boundary = watchMissingBoundary(page);
    await mount<typeof ConfigGroupStory>(`${STORIES}/ConfigGroupStory`, { group });
    expect(await censusReport(page, boundary)).toBe("");
  });
}

// A modal that opens on a subject renders its "nothing selected" arm unseeded, so each is opened on the data the
// corpus holds: a room, and the plugin's own dialog surface.
const SEEDED_MODALS = ["imagine", "imageDetail", "imageEdit", "pluginDialog"] as const;

/** The shared reads plus the ones a seeded surface needs; the later registration is the one that answers. */
async function routeSeeded(page: Page, corpus: CorpusWire, overrides: SurfaceRouteOverrides): Promise<void> {
  await routeSurfaceReads(page, corpus, await root.internalCallerFor(root.ownerId), overrides);
}

/** The listed procedures, answered by the corpus root's own server. */
async function served(paths: Parameters<typeof serveCorpusProcedures>[1]): Promise<SurfaceRouteOverrides> {
  return serveCorpusProcedures(await root.internalCallerFor(root.ownerId), paths);
}

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
  expect(await censusReport(page, boundary)).toBe("");
});

for (const modal of ["imageDetail", "imageEdit"] as const) {
  test(`the ${modal} modal reads clean on an image`, async ({ corpus, mount, page }) => {
    await routeSeeded(page, corpus, await served(["imagery.readProvenance"]));
    const boundary = watchMissingBoundary(page);
    await mount<typeof ImageSubjectModalStory>(`${STORIES}/ImageSubjectModalStory`, { modal, subject: imageSubject(corpusChatId(corpus)) });
    const [role, name] = IMAGE_FORM[modal];
    await expect(page.getByRole("dialog").getByRole(role, { name })).toBeVisible();
    expect(await censusReport(page, boundary)).toBe("");
  });
}

test("the pluginDialog modal reads clean on the plugin's dialog surface", async ({ corpus, mount, page }) => {
  const stage = corpus.pluginLibrary?.ownerActive;
  const surface = stage?.reads.surfaces.output.find((candidate) => candidate.anchor === "dialog");
  if (stage === undefined || surface === undefined) {
    throw new Error("The corpus has no active plugin with a dialog surface");
  }
  await routeSeeded(page, corpus, {
    "plugin.list": createCorpusReadResponder("plugin.list", [stage.reads.plugins]),
    "plugin.listSurfaces": createCorpusReadResponder("plugin.listSurfaces", [stage.reads.surfaces]),
    ...(await served(["plugin.getSurfaceState"])),
    "plugin.listBundleAssets": createCorpusReadResponder("plugin.listBundleAssets", [stage.reads.assets]),
  });
  const boundary = watchMissingBoundary(page);
  await mount<typeof PluginDialogModalStory>(`${STORIES}/PluginDialogModalStory`, {
    subject: { pluginId: typeIdSchema(ID_PREFIX.plugin).parse(surface.pluginId), surfaceId: surface.id },
  });
  await expect(page.getByRole("dialog")).not.toContainText("no longer available");
  expect(await censusReport(page, boundary)).toBe("");
});
