import type { ChatId, MessageId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator } from "@playwright/test";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const ROLES = ["user", "assistant"] as const;
const LONG_PARAGRAPHS = 40;
const INTO_ROW = 70;
const CONTENT = Array.from({ length: LONG_PARAGRAPHS }, () => "The lamp burned low while the rain kept time on the shutters.").join("\n\n");
let root: Awaited<ReturnType<typeof createCorpusHarness>>;
let roomId: ChatId;
let ids: Record<(typeof ROLES)[number], MessageId>;

test.beforeAll(async () => {
  root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  for (const room of (await caller.chat.listChats({ limit: 100 })).items) {
    const { messages } = await caller.chat.listMessages({ chatId: room.id, limit: 6 });
    const assistant = messages.filter((message) => message.role === "assistant").at(-2);
    const user = messages.find((message) => message.role === "user");
    const tail = messages.at(-1);
    if (assistant === undefined || user === undefined || tail?.role !== "assistant" || user.personaId === null || assistant.characterId === null) {
      continue;
    }
    roomId = room.id;
    ids = { user: user.id, assistant: assistant.id };
    await caller.persona.update({ personaId: user.personaId, input: { name: "The extraordinarily meticulous keeper of the observatory archive" } });
    await caller.character.update({ characterId: assistant.characterId, input: { name: "ExtraordinarilyMeticulousObservatoryArchivist" } });
    for (const messageId of [...Object.values(ids), tail.id]) {
      await caller.chat.editMessage({
        chatId: room.id,
        messageId,
        content: messageId === ids.user ? CONTENT.split("\n\n").slice(0, 3).join("\n\n") : CONTENT,
        timeZone: UTC_TIME_ZONE,
      });
    }
    return;
  }
  throw new Error("Corpus needs a room with both roles and an earlier assistant reply");
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

const CASES = [
  { style: "flat", avatars: false, width: 1440 },
  { style: "flat", avatars: false, width: 390 },
  { style: "bubble", avatars: true, width: 390 },
  { style: "bubble", avatars: true, width: 1440 },
  { style: "echo", avatars: true, width: 390 },
  { style: "echo", avatars: true, width: 1440 },
  { style: "whisper", avatars: true, width: 390 },
  { style: "whisper", avatars: true, width: 1440 },
  { style: "hush", avatars: true, width: 390 },
  { style: "hush", avatars: true, width: 1440 },
  { style: "ripple", avatars: true, width: 360 },
  { style: "ripple", avatars: true, width: 390 },
  { style: "ripple", avatars: true, width: 520 },
  { style: "ripple", avatars: true, width: 1440 },
  { style: "tide", avatars: true, width: 390 },
  { style: "tide", avatars: true, width: 1440 },
] as const;
async function expectRippleFits(row: Locator): Promise<void> {
  const facts = await row.evaluate((element) => {
    const scroll = element.closest('[data-slot="message-list-scroll"]');
    if (scroll === null) {
      throw new Error("Missing transcript scrollport");
    }
    const edge = scroll.getBoundingClientRect();
    const boxes = Array.from(element.querySelectorAll('[data-slot="message-bubble"], p, [data-slot="message-name-row"] button'))
      .filter((node) => getComputedStyle(node).display !== "none")
      .map((node) => node.getBoundingClientRect());
    const lines = Array.from(element.querySelectorAll('p, [data-slot="message-attribution"], [data-slot^="message-metadata-"]')).flatMap((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return Array.from(range.getClientRects());
    });
    const bubble = element.querySelector('[data-slot="message-bubble"]');
    if (bubble === null) {
      throw new Error("Missing bubble");
    }
    const probe = document.createElement("span");
    probe.style.cssText = "position:absolute;visibility:hidden;inline-size:var(--reading-bubble-cap)";
    bubble.append(probe);
    const cap = probe.getBoundingClientRect().width;
    probe.remove();
    return {
      cap,
      bubbleWidth: bubble.getBoundingClientRect().width,
      overflow: Math.max(...[...boxes, ...lines].map((box) => Math.max(edge.left - box.left, box.right - edge.right))),
      portrait: element.querySelector('[data-slot="avatar-root"]')?.getBoundingClientRect().width ?? 0,
    };
  });
  expect(facts.overflow).toBeLessThanOrEqual(1);
  expect(facts.portrait).toBeGreaterThan(0);
  expect(facts.bubbleWidth).toBeLessThanOrEqual(facts.cap);
}

async function expectRippleControls(header: Locator): Promise<void> {
  const trigger = header.getByRole("button").last();
  await trigger.press("Enter");
  await expect(header.page().getByRole("menu")).toBeVisible();
  await header.page().keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect.poll(() => trigger.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
}

async function expectFocusedHeaderClearsProse(row: Locator): Promise<void> {
  await expect(row.locator('[data-slot="message-name-row"]')).toHaveAttribute("data-pinned", "");
  const facts = await row.evaluate((element) => {
    const header = element.querySelector('[data-slot="message-name-row"]');
    if (header === null) {
      throw new Error("Missing header");
    }
    const band = header.getBoundingClientRect();
    const controls = Array.from(header.querySelectorAll("button"))
      .filter((button) => getComputedStyle(button).display !== "none")
      .map((button) => {
        const rect = button.getBoundingClientRect();
        const css = getComputedStyle(button);
        const before = getComputedStyle(button, "::before");
        const spread = Math.max(0, ...Array.from(css.boxShadow.matchAll(/0px 0px 0px ([\d.]+)px/g), (match) => Number(match[1])));
        const transform = before.transform === "none" ? null : new DOMMatrixReadOnly(before.transform);
        const translateY = before.translate === "none" ? "0px" : (before.translate.split(" ")[1] ?? "0px");
        const translatedY = Number.parseFloat(translateY) * (translateY.endsWith("%") ? Number.parseFloat(before.height) / 100 : 1);
        const hitBottom =
          before.content === "none" || before.content === "normal"
            ? rect.bottom
            : rect.top + Number.parseFloat(before.top) + (transform?.m42 ?? 0) + translatedY + Number.parseFloat(before.height);
        return {
          left: rect.left - spread,
          right: rect.right + spread,
          top: rect.top - spread,
          bottom: Math.max(rect.bottom + spread, hitBottom),
          focused: button.matches(":focus-visible"),
        };
      });
    const lines = Array.from(element.querySelectorAll("p")).flatMap((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return Array.from(range.getClientRects());
    });
    return {
      focused: controls.filter((control) => control.focused).length,
      escaped: Math.max(
        ...controls.map((control) => Math.max(band.left - control.left, control.right - band.right, band.top - control.top, control.bottom - band.bottom)),
      ),
      textOverlap: Math.max(
        0,
        ...controls.flatMap((control) =>
          lines
            .filter((line) => line.right > control.left && line.left < control.right)
            .map((line) => Math.min(line.bottom, control.bottom) - Math.max(line.top, band.bottom, control.top)),
        ),
      ),
    };
  });
  expect(facts.focused).toBeGreaterThan(0);
  expect(facts.escaped, JSON.stringify(facts)).toBeLessThanOrEqual(0);
  expect(facts.textOverlap).toBe(0);
}

function registerIdentityCase(sample: (typeof CASES)[number]): void {
  test(`${sample.style} at ${sample.width}: short user and long assistant keep row-bounded identities`, async ({ corpus, mount, page }, testInfo) => {
    await page.setViewportSize({ width: sample.width, height: 900 });
    const caller = await root.internalCallerFor(root.ownerId);
    await caller.settings.updateUserSettingsSection({
      section: "appearance",
      patch: {
        chatStyle: sample.style,
        backgroundImageKind: "none",
        showInChatAvatars: sample.avatars,
        messageActions: sample.style === "ripple" ? "expanded" : "hover",
      },
    });
    await seedShellState(page, { activeSection: "chats" });
    await routeTrpc(page, {
      ...createShellAmbientReads(corpus),
      ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, "rpg.getGame", "rpg.listTurnToolCalls"]),
    });
    await mount<typeof ChatRoomShellStory>(STORY, { chatId: roomId });
    const scroller = page.locator('[data-slot="message-list-scroll"]');
    await expect(scroller).toBeVisible();
    for (const role of ROLES) {
      await scroller.locator('[data-slot="message-list-row"]').last().press("Home");
      await scroller.evaluate((element) => element.scrollTo({ top: 0, behavior: "instant" }));
      await expect.poll(async () => scroller.evaluate((element) => element.scrollTop)).toBe(0);
      const row = page.locator(`[data-slot="message-row"][data-message-id="${ids[role]}"]`);
      const header = row.locator('[data-slot="message-name-row"]');
      await expect(row).toHaveCount(1);
      const viewportHeight = (await scroller.boundingBox())?.height ?? 0;
      await expect.poll(async () => (await row.boundingBox())?.height ?? 0).toBeGreaterThan(INTO_ROW);
      const rowHeight = (await row.boundingBox())?.height ?? 0;
      expect(rowHeight > viewportHeight).toBe(role === "assistant");
      await header.evaluate((element, by) => {
        const scroll = element.closest('[data-slot="message-list-scroll"]');
        if (scroll !== null) {
          scroll.scrollTop += element.getBoundingClientRect().top - scroll.getBoundingClientRect().top + by;
        }
      }, INTO_ROW);
      await expect.soft(header).toHaveAttribute("data-pinned", "");
      await expect
        .poll(async () => {
          const box = await header.boundingBox();
          const edge = await scroller.boundingBox();
          return Math.abs((box?.y ?? -1000) - (edge?.y ?? 0) + 1);
        })
        .toBeLessThanOrEqual(1);
      if (sample.style === "ripple") {
        await expectRippleFits(row);
        await expectRippleControls(header);
        await header.evaluate((element, by) => {
          const scroll = element.closest('[data-slot="message-list-scroll"]');
          if (scroll !== null) {
            scroll.scrollTop += element.getBoundingClientRect().top - scroll.getBoundingClientRect().top + by;
          }
        }, INTO_ROW);
        await expectFocusedHeaderClearsProse(row);
      }
      await testInfo.attach(`${role}-pinned`, { body: await scroller.screenshot(), contentType: "image/png" });
      const mask = await scroller.evaluate((element) => getComputedStyle(element).maskImage);
      expect(mask).toMatch(/^linear-gradient\(rgb\(0, 0, 0\) 0%, rgb\(0, 0, 0\) /);
      await row.evaluate((element) => {
        const scroll = element.closest('[data-slot="message-list-scroll"]');
        if (scroll !== null) {
          scroll.scrollTop += element.getBoundingClientRect().bottom - scroll.getBoundingClientRect().top + 2;
        }
      });
      await expect
        .poll(async () => {
          const box = await header.boundingBox();
          const edge = await scroller.boundingBox();
          return box === null || edge === null ? true : box.y + box.height <= edge.y;
        })
        .toBe(true);
    }
  });
}

for (const sample of CASES) {
  registerIdentityCase(sample);
}
