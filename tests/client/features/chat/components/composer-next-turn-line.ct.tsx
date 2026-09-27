// CT: the composer's next-turn line (composer-next-turn-line.tsx), mounted through the real composer so the
// line reads the same pre-send verdict the Send gate reads. A turn runs on the room HOST's chat role, so a
// host viewer sees their own resolved connection and model, a member sees "the host's connection" and never
// fires the chat-role read, and an unbound role reads as unset for both. Covered at desktop, narrow and
// mobile widths: the line wraps inside the composer and never overflows it.

import { MODEL_ROLES_PATH_TEXT } from "@orb/client/lib";
import { modelDisplayName } from "@orb/kit/model-name";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import { resolvedTokenColor } from "../../../../support/node/resolved-token-color.ts";
import type { TrpcFixtureOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcError, trpcHold } from "../../../../support/node/route-trpc.ts";
import { ComposerStory } from "../_ct-stories.tsx";
import { CHAT_AMBIENT_ROUTES, CHAT_ROOM_ROUTES } from "../fixtures.ts";

const LINE = '[data-slot="composer-next-turn"]';
const WORK_KEY_ID = "user_connection_ctnextturn01";
const MODEL = "anthropic/claude-sonnet-5";
const MODEL_ROLES_GUIDANCE = `Choose one under ${MODEL_ROLES_PATH_TEXT}`;
const FAILED_SENTENCE = "Next reply: the connection couldn't be checked.";

const WORK_KEY = {
  id: WORK_KEY_ID,
  label: "Work key",
  providerId: "openrouter",
  providerLabel: "OpenRouter",
  model: MODEL,
  tasks: ["chat"],
} satisfies TrpcFixtureOutput<"connection.list">[number];

const RESOLVED = {
  task: "chat",
  connectionId: WORK_KEY_ID,
  providerId: "openrouter",
  model: MODEL,
} satisfies TrpcFixtureOutput<"connection.resolveChatCapability">;

const HOST_ROOM = { ...CHAT_ROOM_ROUTES["chat.getChat"], viewerIsHost: true } satisfies TrpcFixtureOutput<"chat.getChat">;
const MEMBER_ROOM = { ...CHAT_ROOM_ROUTES["chat.getChat"], viewerIsHost: false } satisfies TrpcFixtureOutput<"chat.getChat">;
const NO_CONNECTION = { available: false, cause: "no-connection" } satisfies TrpcFixtureOutput<"chat.checkSendAvailability">;
const UNBOUND = trpcError({ code: "BAD_REQUEST", message: 'no connection is bound for "chat"' });

function line(component: Locator): Locator {
  return component.locator(LINE);
}

test("a host sees the connection and model their own chat role resolves to", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHAT_ROOM_ROUTES,
    "chat.getChat": HOST_ROOM,
    "connection.list": [WORK_KEY],
    "connection.resolveChatCapability": RESOLVED,
  });
  const component = await mount(<ComposerStory />);

  await expect(line(component)).toHaveText(`Next reply: Work key · ${modelDisplayName(MODEL)}`);
  await expect(line(component)).not.toHaveAttribute("data-unset");
});

test("a host with no chat connection set reads the unset state and where to fix it", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHAT_ROOM_ROUTES,
    "chat.getChat": HOST_ROOM,
    "chat.checkSendAvailability": NO_CONNECTION,
    "connection.list": [],
    "connection.resolveChatCapability": UNBOUND,
  });
  const component = await mount(<ComposerStory />);

  await expect(line(component)).toHaveText(`Next reply: no chat connection is set. ${MODEL_ROLES_GUIDANCE}`);
  await expect(line(component)).toHaveAttribute("data-unset", "");
  await expect(line(component)).toHaveCSS("color", resolvedTokenColor("color.warning"));
});

test("a host in a no-connection room never asks for the chat role, which could only answer 400", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHAT_ROOM_ROUTES,
    "chat.getChat": HOST_ROOM,
    "chat.checkSendAvailability": NO_CONNECTION,
    "connection.list": [],
    "connection.resolveChatCapability": UNBOUND,
  });
  const component = await mount(<ComposerStory />);

  // The unset line means the room read and the verdict have both landed: the read had every chance to fire.
  await expect(line(component)).toHaveAttribute("data-unset", "");
  await expect.poll(() => trpc.count("chat.getChat")).toBeGreaterThan(0);
  await expect.poll(() => trpc.count("chat.checkSendAvailability")).toBeGreaterThan(0);
  await expect.poll(() => trpc.count("connection.resolveChatCapability")).toBe(0);
});

test("the unset line's Model roles door lands on the chat model role in Settings", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHAT_ROOM_ROUTES,
    "chat.getChat": HOST_ROOM,
    "chat.checkSendAvailability": NO_CONNECTION,
    "connection.list": [],
  });
  const component = await mount(<ComposerStory />);

  await line(component).getByRole("button", { name: "Model roles", exact: true }).click();
  await expect(component.getByTestId("composer-config-target")).toHaveText("config|connections|model-roles|chat-model");
});

test("a member is told the reply runs on the host's connection, and the member's own chat role is never read", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHAT_ROOM_ROUTES,
    "chat.getChat": MEMBER_ROOM,
    "connection.list": [WORK_KEY],
    "connection.resolveChatCapability": RESOLVED,
  });
  const component = await mount(<ComposerStory />);

  await expect(line(component)).toHaveText("Next reply: the host's chat connection.");
  // The member's own binding would name the wrong row: the read must not fire at all.
  await expect.poll(() => trpc.count("connection.resolveChatCapability")).toBe(0);
});

test("a member in a room whose host has no chat connection reads the unset state, with no door to their own settings", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHAT_ROOM_ROUTES,
    "chat.getChat": MEMBER_ROOM,
    "chat.checkSendAvailability": NO_CONNECTION,
    "connection.list": [],
  });
  const component = await mount(<ComposerStory />);

  await expect(line(component)).toHaveText("Next reply: the host has no chat connection set.");
  await expect(line(component)).toHaveAttribute("data-unset", "");
  await expect(line(component).getByRole("button")).toHaveCount(0);
});

test("a host whose chat-role read fails, in a serveable room, reads the failed state in the error ink", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHAT_ROOM_ROUTES,
    "chat.getChat": HOST_ROOM,
    "connection.list": [WORK_KEY],
    "connection.resolveChatCapability": trpcError({ code: "INTERNAL_SERVER_ERROR", message: "boom" }),
  });
  const component = await mount(<ComposerStory />);

  await expect(line(component)).toHaveText(FAILED_SENTENCE);
  await expect(line(component)).toHaveAttribute("data-failed", "");
  await expect(line(component)).not.toHaveAttribute("data-unset");
  await expect(line(component)).toHaveCSS("color", resolvedTokenColor("color.destructive"));
});

test("a host whose chat-role read AND the room's verdict read both fail is told the check failed, not left checking", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHAT_ROOM_ROUTES,
    "chat.getChat": HOST_ROOM,
    "chat.checkSendAvailability": trpcError({ message: "verdict boom" }),
    "connection.list": [WORK_KEY],
    "connection.resolveChatCapability": trpcError({ message: "resolve boom" }),
  });
  const component = await mount(<ComposerStory />);

  await expect(line(component)).toHaveText(FAILED_SENTENCE);
  await expect(line(component)).toHaveAttribute("data-failed", "");
});

test("a failed room read, the read a member's line depends on, reads the same failure and never reads a chat role", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHAT_ROOM_ROUTES,
    "chat.getChat": trpcError({ message: "room boom" }),
    "connection.list": [WORK_KEY],
    "connection.resolveChatCapability": RESOLVED,
  });
  const component = await mount(<ComposerStory />);

  await expect(line(component)).toHaveText(FAILED_SENTENCE);
  await expect(line(component)).toHaveAttribute("data-failed", "");
  // Host or member is unknown, so the viewer's own chat role is not a safe thing to name.
  await expect.poll(() => trpc.count("connection.resolveChatCapability")).toBe(0);
});

test("a member whose room verdict read fails still names the host's connection, never stuck checking", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHAT_ROOM_ROUTES,
    "chat.getChat": MEMBER_ROOM,
    "chat.checkSendAvailability": trpcError({ message: "verdict boom" }),
    "connection.list": [WORK_KEY],
  });
  const component = await mount(<ComposerStory />);

  await expect(line(component)).toHaveText("Next reply: the host's chat connection.");
  await expect(line(component)).not.toHaveAttribute("data-failed");
});

test("while the host's chat-role read is in flight the line says it is checking", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHAT_ROOM_ROUTES,
    "chat.getChat": HOST_ROOM,
    "connection.list": [WORK_KEY],
    "connection.resolveChatCapability": trpcHold(),
  });
  const component = await mount(<ComposerStory />);

  await expect(line(component)).toHaveText("Next reply: checking the connection…");
});

for (const viewport of [
  { name: "desktop", width: 1280, height: 800 },
  { name: "narrow", width: 900, height: 800 },
  { name: "mobile", width: 390, height: 844 },
] as const) {
  test(`${viewport.name}: the unset line wraps inside the composer and never overflows it`, async ({ mount, page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await routeTrpc(page, {
      ...CHAT_AMBIENT_ROUTES,
      ...CHAT_ROOM_ROUTES,
      "chat.getChat": HOST_ROOM,
      "chat.checkSendAvailability": NO_CONNECTION,
      "connection.list": [],
    });
    const component = await mount(<ComposerStory />);
    const target = line(component);
    await expect(target).toContainText(MODEL_ROLES_GUIDANCE);

    await expect
      .poll(() =>
        target.evaluate((el: HTMLElement) => {
          const composer = el.closest('[data-testid="composer"]');
          const own = el.getBoundingClientRect();
          const host = composer === null ? own : composer.getBoundingClientRect();
          return {
            noOverflow: el.scrollWidth <= el.clientWidth,
            insideComposer: own.left >= host.left && own.right <= host.right,
            insideViewport: own.right <= window.innerWidth,
          };
        }),
      )
      .toEqual({ noOverflow: true, insideComposer: true, insideViewport: true });
  });
}
