// @subject packages/client/src/features/rpg/components/rpg-takeover-header.tsx
// The populated Waystone band at rest, measured on the real header: the stone's painted bounds sit on whole pixels with no
// resting translate or scale (integer-line-boxes §9), no promoted layer inside the band starts off the pixel grid (§10),
// and every figure in the satellite row answers a pointer over its whole painted box.

import { contextToggleLabel } from "@orb/client/lib";
import { rpgTrackerDefSchema } from "@orb/contracts/rpg";
import { DEFAULT_APPEARANCE_SETTINGS, DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { ChatId } from "@orb/kit/ids";
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, seedRpgGame } from "@orb/testkit/node/composed";
import type { RpgRoomStory } from "./_own-key-panels-stories.tsx";

const STORY = "tests/client/features/rpg/components/_own-key-panels-stories/RpgRoomStory";
const GRIT = rpgTrackerDefSchema.parse({ key: "grit", label: "Grit", shape: "meter", write: "delta", subject: "actor", pinned: true });
const GRIT_VALUE = 7;
const WALLET = { name: "Gold", amount: 40 } as const;
// Device pixels per CSS pixel is 1 in this host, so a whole pixel is a whole CSS pixel.
const WHOLE_PIXEL_TOLERANCE = 0.01;

test.use({ viewport: { width: 1280, height: 800 } });

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

async function prepareRoom(root: Root): Promise<ChatId> {
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: DEFAULT_USER_SETTINGS.theme });
  const chatId = (await caller.chat.startChat({ characterIds: [], opening: "none" })).chat.id;
  await seedRpgGame(root, { principal: await root.principalFor(root.ownerId), chatId, mode: "lite", ruleset: "d20" });
  const config = await caller.rpg.getConfigView({ chatId });
  await caller.rpg.updateConfig({ chatId, patch: { dateMode: "structured", trackers: [...config.trackers, GRIT] } });
  expect(
    await caller.rpg.patchActor({
      chatId,
      targetRef: { kind: "user", userId: root.ownerId },
      ops: [
        { op: "setTracker", key: GRIT.key, value: { value: GRIT_VALUE } },
        { op: "setWalletAmount", ...WALLET },
      ],
    }),
  ).toEqual({ ok: true });
  expect(
    await caller.rpg.editSnapshot({
      chatId,
      patch: { location: "The observatory", clock: { day: 4, hour: 12, minute: 30 }, weather: { type: "rain", label: "Steady rain" } },
    }),
  ).toEqual({ ok: true });
  return chatId;
}

test("the populated band's stone, promoted layers and satellite figures meet the pixel-grid and hit-area rules at rest", async ({
  corpus,
  mount,
  page,
}, testInfo) => {
  await using root = await createCorpusHarness();
  const chatId = await prepareRoom(root);
  const caller = await root.internalCallerFor(root.ownerId);
  await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "collapsed" } } });
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [
      ...SECTION_PROCEDURES,
      ...ROOM_PROCEDURES,
      "rpg.getGame",
      "rpg.getTrackerView",
      "rpg.revealHidden",
      "rpg.listTurnToolCalls",
    ]),
  });
  await mount<typeof RpgRoomStory>(STORY, { chatId });
  await page.getByRole("button", { name: contextToggleLabel(true), exact: true }).click();
  const header = page.locator('[data-slot="rpg-takeover-header"]');
  const stone = header.locator('[data-slot="waystone"]');
  await expect(stone).toBeVisible();
  await expect(header.getByText(GRIT.label, { exact: false }).first()).toBeVisible();

  const report = await header.evaluate((band, tolerance) => {
    const whole = (value: number): boolean => Math.abs(value - Math.round(value)) <= tolerance;
    const boxOf = (node: Element): { x: number; y: number; width: number; height: number } => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const stoneNode = band.querySelector('[data-slot="waystone"]');
    const stoneBox = stoneNode === null ? null : boxOf(stoneNode);
    // A resting translate or scale on the stone or any ancestor up to the band is a Law 2 finding; a rotation is out of scope.
    const transforms: { slot: string; transform: string; translate: string; scale: string }[] = [];
    for (let node: Element | null = stoneNode; node !== null && node !== band.parentElement; node = node.parentElement) {
      const style = getComputedStyle(node);
      transforms.push({ slot: node.getAttribute("data-slot") ?? node.tagName, transform: style.transform, translate: style.translate, scale: style.scale });
    }
    const promoted: { slot: string; x: number; y: number; wholeX: boolean; wholeY: boolean }[] = [];
    for (const node of [band, ...band.querySelectorAll("*")]) {
      const style = getComputedStyle(node);
      const isPromoted =
        style.backdropFilter !== "none" || style.willChange !== "auto" || style.transformStyle === "preserve-3d" || style.transform.startsWith("matrix3d");
      if (isPromoted) {
        const box = boxOf(node);
        promoted.push({ slot: node.getAttribute("data-slot") ?? node.tagName, x: box.x, y: box.y, wholeX: whole(box.x), wholeY: whole(box.y) });
      }
    }
    // Every figure in the satellite row: the pointer over any painted corner and the centre lands in it.
    const figures = [...band.querySelectorAll('[data-slot^="coin"], [data-slot^="ring"], [data-slot="rpg-satellite-row"] > *')].map((node) => {
      const box = boxOf(node);
      const probes = [
        [box.x + box.width / 2, box.y + box.height / 2],
        [box.x + 1, box.y + 1],
        [box.x + box.width - 1, box.y + box.height - 1],
      ] as const;
      return {
        slot: node.getAttribute("data-slot") ?? node.tagName,
        box,
        hits: probes.map(([x, y]) => {
          const hit = document.elementFromPoint(x, y);
          return hit !== null && node.contains(hit);
        }),
      };
    });
    const type = [...band.querySelectorAll("[data-slot]")].flatMap((node) => {
      const text = node.textContent.trim();
      if (text === "" || node.children.length > 0) {
        return [];
      }
      const style = getComputedStyle(node);
      return [{ slot: node.getAttribute("data-slot"), text: text.slice(0, 32), size: style.fontSize, weight: style.fontWeight, line: style.lineHeight }];
    });
    return {
      stoneBox,
      stoneWhole: stoneBox === null ? false : [stoneBox.x, stoneBox.y, stoneBox.width, stoneBox.height].every(whole),
      transforms,
      promoted,
      figures,
      type,
    };
  }, WHOLE_PIXEL_TOLERANCE);
  await testInfo.attach("populated-band", { body: JSON.stringify(report, null, 2), contentType: "application/json" });

  expect(report.stoneWhole).toBe(true);
  for (const entry of report.transforms) {
    expect(entry.transform).toBe("none");
    expect(entry.translate).toBe("none");
    expect(entry.scale).toBe("none");
  }
  for (const layer of report.promoted) {
    expect(layer.wholeX && layer.wholeY).toBe(true);
  }
  expect(report.figures.length).toBeGreaterThan(0);
  for (const figure of report.figures) {
    expect(figure.hits).toEqual([true, true, true]);
  }
});
