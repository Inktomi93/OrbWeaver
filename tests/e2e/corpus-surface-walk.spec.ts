import type { SectionId } from "@orb/client/state";
import { CONFIG_GROUP_IDS, SECTION_IDS } from "@orb/client/state";
import { THEME_CHAT_STYLES } from "@orb/contracts/theme";
import { observeSurfaceSession } from "@orb/testkit/browser/spec";
import { attachNativeFile, SURFACE_BOOT_DIAGNOSTIC_TITLE } from "@orb/testkit/node/helpers";
import { budget } from "@orb/tooling/floor/host/load-budget";
import { authenticateBrowserActor } from "./support/browser-actors.ts";
import { waitForAppReady } from "./support/chat-room.ts";
import { CHARACTER_WALK_AREAS, walkCharacterArea } from "./support/surface-character.ts";
import {
  walkChat,
  walkChatArcade,
  walkChatArrival,
  walkChatCommands,
  walkChatContext,
  walkChatGame,
  walkChatGeneration,
  walkChatGroup,
  walkChatMedia,
  walkChatMessageOperations,
  walkChatOracle,
  walkChatPolish,
  walkChatReading,
} from "./support/surface-chat.ts";
import { walkConfigCategory, walkConfigMap, walkConfigRecovery, walkConfigSettings } from "./support/surface-config.ts";
import { SURFACE_SECTION_IDS, walkRefineryExecution, walkSection } from "./support/surface-sections.ts";
import { expect, test } from "./support/surface-test.ts";

const JOURNEY_OWNER = {
  home: "sections",
  chats: "chat",
  characters: "characters",
  corpus: "sections",
  config: "config",
  extensions: "sections",
  databank: "sections",
  presets: "sections",
  refinery: "sections",
} as const satisfies Record<SectionId, string>;
const CHAT_SECTION: SectionId = "chats";
const CONFIG_SECTION: SectionId = "config";

test.describe("production surface walk @surface-walk", () => {
  test.describe.configure({ timeout: budget(600_000) });
  test.beforeEach(async ({}, info) => {
    await attachNativeFile(info, info, "registered-rail-journeys", {
      body: JSON.stringify(
        SECTION_IDS.map((id) => ({ id, journey: JOURNEY_OWNER[id] })),
        null,
        2,
      ),
      contentType: "application/json",
    });
  });
  for (const area of CHARACTER_WALK_AREAS) {
    test(`Characters independent ${area}`, {
      annotation: [
        { type: "surface-section", description: "characters" },
        { type: "surface-area", description: area },
      ],
    }, async ({ flow, page }) => {
      await walkCharacterArea(flow, area);
      expect(await page.evaluate(() => "__orb" in globalThis), "The real production client has no development bridge").toBe(false);
    });
  }
  for (const journey of [
    { name: "Chat library and primary composer", walk: walkChat, section: CHAT_SECTION },
    { name: "Chat primary Context", walk: walkChatContext, section: CHAT_SECTION },
    { name: "Chat existing group room", walk: walkChatGroup, section: CHAT_SECTION },
    { name: "Chat existing engaged game room", walk: walkChatGame, section: CHAT_SECTION },
    { name: "Chat disposable held arrival", walk: walkChatArrival, section: CHAT_SECTION },
    { name: "Chat maintained polish and undo", walk: walkChatPolish, section: CHAT_SECTION },
    { name: "Chat maintained oracle commands", walk: walkChatOracle, section: CHAT_SECTION },
    { name: "Chat maintained arcade guest", walk: walkChatArcade, section: CHAT_SECTION },
    { name: "Chat disposable generation and cancellation", walk: walkChatGeneration, section: CHAT_SECTION },
    { name: "Chat disposable lifecycle commands", walk: walkChatCommands, section: CHAT_SECTION },
    { name: "Chat disposable message operations", walk: walkChatMessageOperations, section: CHAT_SECTION },
    { name: "Chat original held media", walk: walkChatMedia, section: CHAT_SECTION },
    { name: "Config map and search", walk: walkConfigMap, section: CONFIG_SECTION },
    { name: "Config read recovery", walk: walkConfigRecovery, section: CONFIG_SECTION },
    { name: "Config reversible settings", walk: walkConfigSettings, section: CONFIG_SECTION },
    { name: "Refinery disposable stage execution and versions", walk: walkRefineryExecution, section: "refinery" },
  ]) {
    test(journey.name, { annotation: { type: "surface-section", description: journey.section } }, async ({ flow, page }) => {
      await journey.walk(flow);
      expect(await page.evaluate(() => "__orb" in globalThis), "The real production client has no development bridge").toBe(false);
    });
  }
  for (const category of CONFIG_GROUP_IDS) {
    test(`Config independent category ${category}`, {
      annotation: [
        { type: "surface-section", description: CONFIG_SECTION },
        { type: "surface-category", description: category },
      ],
    }, async ({ flow, page }) => {
      await walkConfigCategory(flow, category);
      expect(await page.evaluate(() => "__orb" in globalThis), "The real production client has no development bridge").toBe(false);
    });
  }
  for (const section of SURFACE_SECTION_IDS) {
    test(`Rail independent ${section}`, { annotation: { type: "surface-section", description: section } }, async ({ flow, page }) => {
      await walkSection(flow, section);
      expect(await page.evaluate(() => "__orb" in globalThis), "The real production client has no development bridge").toBe(false);
    });
  }
  for (const chatStyle of THEME_CHAT_STYLES) {
    test.describe(`Chat reading style ${chatStyle}`, () => {
      test.use({ chatStyle });
      test("original canon reading", {
        annotation: [
          { type: "surface-section", description: CHAT_SECTION },
          { type: "chat-style", description: chatStyle },
        ],
      }, async ({ flow, page }) => {
        await walkChatReading(flow);
        expect(await page.evaluate(() => "__orb" in globalThis), "The completed real production flow has no development bridge").toBe(false);
      });
    });
  }
});

test(SURFACE_BOOT_DIAGNOSTIC_TITLE, { annotation: { type: "surface-section", description: "home" } }, async ({ page, run, browserName }, info) => {
  test.skip(browserName !== "chromium", "The public boot-trace engine requires Chromium CDP; other engines are not measured by this diagnostic");
  expect(page.url(), "The boot capture must start before any document navigation").toBe("about:blank");
  const { beginBootTrace } = await import("@orb/tooling/cpu-profile");
  const trace = await beginBootTrace(page);
  try {
    await test.step("Production boot with official trace-engine receipts", async (step) => {
      await page.goto(run.origin);
      await waitForAppReady(page);
      expect(await page.evaluate(() => "__orb" in globalThis)).toBe(false);
      const rawPath = info.outputPath("boot.trace.json");
      const receipt = await trace.finish(rawPath, async (retained) => {
        await step.attach("boot-trace-events", { path: rawPath, contentType: "application/json" });
        step.annotations.push({ type: "boot-trace-retention", description: JSON.stringify(retained) });
      });
      await attachNativeFile(info, step, "official-boot-trace-receipt", { body: JSON.stringify(receipt, null, 2), contentType: "application/json" });
      step.annotations.push({ type: "official-boot-trace", description: JSON.stringify(receipt) });
      step.annotations.push({
        type: "diagnostic-boundary",
        description:
          "Separate traced diagnostic, not clean CWV. Official six-family summary does not retain complete culprit frames or dependency graph; raw trace is optional depth. Lighthouse snapshot/cascade/CPU profile not requested by this fixture.",
      });
    });
  } finally {
    await trace.abort();
  }
});

test("local humans keep isolated native sessions before production navigation @surface-walk", async ({ browser, run }, info) => {
  test.skip(info.project.name !== "desktop-1440-all-panes-evidence", "The shared multi-human admission control runs once on the baseline composition");
  test.skip(run.authentication.mode !== "local", "This data/auth capability does not execute password-based multi-human sessions");
  const accounts = run.authentication.subjects.filter((subject) => subject.password !== null);
  const owner = accounts.find(({ viewer }) => viewer.userId === run.owner.userId);
  const member = accounts.find(({ viewer }) => viewer.userId !== run.owner.userId);
  if (owner === undefined || member === undefined || owner.password === null || member.password === null) {
    throw new Error("The declared local multi-human capability has no prepared owner/member credentials");
  }
  const first = await authenticateBrowserActor(browser, run.origin, {
    handle: owner.viewer.handle,
    password: owner.password,
    expectedUserId: owner.viewer.userId,
  });
  try {
    const second = await authenticateBrowserActor(browser, run.origin, {
      handle: member.viewer.handle,
      password: member.password,
      expectedUserId: member.viewer.userId,
    });
    try {
      expect(first.page.url()).toBe("about:blank");
      expect(second.page.url()).toBe("about:blank");
      expect(first.viewer.userId).not.toBe(second.viewer.userId);
      expect(await first.context.cookies(run.origin)).not.toEqual(await second.context.cookies(run.origin));
      await using _firstObservation = await observeSurfaceSession(first.context, info, "multi-human-owner");
      await using _secondObservation = await observeSurfaceSession(second.context, info, "multi-human-member");
      await first.page.goto(run.origin);
      await second.page.goto(run.origin);
      await waitForAppReady(first.page);
      await waitForAppReady(second.page);
      expect(await first.page.evaluate(() => "__orb" in globalThis)).toBe(false);
      expect(await second.page.evaluate(() => "__orb" in globalThis)).toBe(false);
    } finally {
      await second.close();
    }
  } finally {
    await first.close();
  }
  const contextsBeforeFailure = browser.contexts().length;
  await expect(authenticateBrowserActor(browser, run.origin, { handle: member.viewer.handle, password: `${member.password}-invalid` })).rejects.toThrow(
    "login failed",
  );
  expect(browser.contexts()).toHaveLength(contextsBeforeFailure);
});
