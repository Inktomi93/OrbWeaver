// CT: the composer's next-turn line (composer-next-turn-line.tsx), mounted through the real composer so the
// line reads the same pre-send verdict the Send gate reads. The chat page names no model or connection
// (owner ruling), so a room that can reply shows no line at any width; an unbound role reads as unset and a
// failed check as failed. A member never fires the chat-role read. The refusal line wraps inside the
// composer at desktop, narrow and mobile widths.

import { MODEL_ROLES_PATH_TEXT } from "@orb/client/lib";
import type { UserConnectionId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { modelDisplayName } from "@orb/kit/model-name";
import { hitExtent, touchFloorPx } from "@orb/testkit/browser/touch-floor.ts";
import { testModelId, testProviderId } from "@orb/testkit/iso/inference-identities.ts";
import { makeChatDetail } from "@orb/testkit/node/factories/chat-view.ts";
import { makeConnectionRow } from "@orb/testkit/node/factories/connection-view.ts";
import { makeResolvedView } from "@orb/testkit/node/factories/resolved-connection.ts";
import { resolvedTokenColor } from "@orb/testkit/node/resolved-token-color.ts";
import type { TrpcWireOutput } from "@orb/testkit/node/route-trpc.ts";
import { routeTrpc, trpcError, trpcHold } from "@orb/testkit/node/route-trpc.ts";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import { ComposerStory } from "../_ct-stories.tsx";
import { CHAT_AMBIENT_ROUTES, CHAT_ROOM_DETAIL, CHAT_ROOM_ROUTES } from "../fixtures.ts";

const LINE = '[data-slot="composer-next-turn"]';
const WORK_KEY_ID = "user_connection_ctnextturn01";
const MODEL = "anthropic/claude-sonnet-5";
const MODEL_ROLES_GUIDANCE = `Choose one under ${MODEL_ROLES_PATH_TEXT}`;
const FAILED_SENTENCE = "Next reply: the connection couldn't be checked.";
// Type steps are authored in rem; computed font-size resolves to px at the 16px root.
const ROOT_PX = 16;

const WORK_KEY = makeConnectionRow({
  id: WORK_KEY_ID,
  label: "Work key",
  providerId: "openrouter",
  providerLabel: "OpenRouter",
  model: MODEL,
  tasks: ["chat"],
});

const EMBED_ONLY = makeConnectionRow({
  id: "user_connection_ctnextturnembed",
  label: "Built-in embeddings",
  providerId: "local-light",
  providerLabel: "Built-in (this device)",
  model: "jinaai/jina-clip-v2",
  tasks: ["embed", "imageEmbed"],
});

const RESOLVED = makeResolvedView({
  connectionId: castId<UserConnectionId>(WORK_KEY_ID),
  providerId: testProviderId("openrouter"),
  model: testModelId(MODEL),
});

const HOST_ROOM = makeChatDetail({ ...CHAT_ROOM_DETAIL, viewerIsHost: true });
const MEMBER_ROOM = makeChatDetail({ ...CHAT_ROOM_DETAIL, viewerIsHost: false });
const NO_CONNECTION = { available: false, cause: "no-connection" } satisfies TrpcWireOutput<"chat.checkSendAvailability">;
const UNBOUND = trpcError({ code: "BAD_REQUEST", message: 'no connection is bound for "chat"' });

function line(component: Locator): Locator {
  return component.locator(LINE);
}

for (const viewport of [
  { name: "desktop", width: 1280, height: 800, touch: false },
  { name: "phone", width: 390, height: 844, touch: true },
] as const) {
  test.describe(`${viewport.name}: a room that can reply`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.touch });

    test("shows no line: the chat page names no connection or model", async ({ mount, page }) => {
      const trpc = await routeTrpc(page, {
        ...CHAT_AMBIENT_ROUTES,
        ...CHAT_ROOM_ROUTES,
        "chat.getChat": HOST_ROOM,
        "connection.list": [WORK_KEY],
        "connection.resolveChatCapability": RESOLVED,
      });
      const component = await mount(<ComposerStory />);
      // The read the named state needs has answered, so the absence below is the settled verdict.
      await expect.poll(() => trpc.count("connection.resolveChatCapability")).toBeGreaterThan(0);
      await expect(line(component)).toHaveCount(0);
      await expect(component.getByText(modelDisplayName(MODEL))).toHaveCount(0);
    });
  });
}

test("a host with no chat connection set reads the unset state and where to fix it", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHAT_ROOM_ROUTES,
    "chat.getChat": HOST_ROOM,
    "chat.checkSendAvailability": NO_CONNECTION,
    "connection.list": [WORK_KEY],
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

// The two recovery paths. The Model roles picker can only offer a connection the host already has, so a host
// with none is sent to the add flow; a host with connections but no chat role is sent to the role.
for (const recovery of [
  {
    name: "with connections but no chat role, the door lands on the chat model role",
    label: "Model roles",
    rows: [WORK_KEY],
    target: "config|connections|model-roles|chat-model",
  },
  {
    name: "with no connection at all, the door lands on the add-connection flow",
    label: "Add connection",
    rows: [],
    target: "config|connections|connections|add-connection",
  },
  // A fresh account carries built-in embedding rows, none of which the Chat picker can offer.
  {
    name: "with only embedding connections, the door lands on the add-connection flow",
    label: "Add connection",
    rows: [EMBED_ONLY],
    target: "config|connections|connections|add-connection",
  },
] as const) {
  test(`the unset line: ${recovery.name}`, async ({ mount, page }) => {
    await routeTrpc(page, {
      ...CHAT_AMBIENT_ROUTES,
      ...CHAT_ROOM_ROUTES,
      "chat.getChat": HOST_ROOM,
      "chat.checkSendAvailability": NO_CONNECTION,
      "connection.list": [...recovery.rows],
    });
    const component = await mount(<ComposerStory />);

    const door = line(component).getByRole("button");
    await expect(door).toHaveCount(1);
    await expect(door).toHaveAccessibleName(recovery.label);
    await door.click();
    await expect(component.getByTestId("composer-config-target")).toHaveText(recovery.target);
  });
}

test("the line reads at the body type step", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHAT_ROOM_ROUTES,
    "chat.getChat": HOST_ROOM,
    "chat.checkSendAvailability": NO_CONNECTION,
    "connection.list": [WORK_KEY],
    "connection.resolveChatCapability": UNBOUND,
  });
  const component = await mount(<ComposerStory />);

  await expect(line(component)).toHaveCSS("font-size", `${Number.parseFloat(TOKENS["text.body"].value) * ROOT_PX}px`);
});

test("a member in a room that can reply sees no line, and the member's own chat role is never read", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHAT_ROOM_ROUTES,
    "chat.getChat": MEMBER_ROOM,
    "connection.list": [WORK_KEY],
    "connection.resolveChatCapability": RESOLVED,
  });
  const component = await mount(<ComposerStory />);

  await expect(line(component)).toHaveCount(0);
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

test("an unknown viewer in a no-connection room reads a neutral unset line, with no door to settings that may not be theirs", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHAT_ROOM_ROUTES,
    "chat.getChat": trpcError({ message: "room boom" }),
    "chat.checkSendAvailability": NO_CONNECTION,
    "connection.list": [],
  });
  const component = await mount(<ComposerStory />);

  await expect(line(component)).toHaveText("Next reply: this chat has no chat connection set.");
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

test("a member whose room verdict read fails is not shown a failure that is not theirs to fix", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHAT_ROOM_ROUTES,
    "chat.getChat": MEMBER_ROOM,
    "chat.checkSendAvailability": trpcError({ message: "verdict boom" }),
    "connection.list": [WORK_KEY],
  });
  const component = await mount(<ComposerStory />);

  await expect(line(component)).toHaveCount(0);
});

test("while the host's chat-role read is in flight the line stays away rather than say it is checking", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHAT_ROOM_ROUTES,
    "chat.getChat": HOST_ROOM,
    "connection.list": [WORK_KEY],
    "connection.resolveChatCapability": trpcHold(),
  });
  const component = await mount(<ComposerStory />);

  await expect(line(component)).toHaveCount(0);
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
      "connection.list": [WORK_KEY],
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

// The recovery door is the line's one control, so it holds the interactive floors: the label type step and a
// touch-target hit area on a coarse pointer, measured by walking `elementFromPoint` out from its centre.
test.describe("coarse pointer", () => {
  test.use({ hasTouch: true, viewport: { width: 360, height: 780 } });

  test("the Model roles door meets the touch-target and interactive-text floors", async ({ mount, page }) => {
    await routeTrpc(page, {
      ...CHAT_AMBIENT_ROUTES,
      ...CHAT_ROOM_ROUTES,
      "chat.getChat": HOST_ROOM,
      "chat.checkSendAvailability": NO_CONNECTION,
      "connection.list": [WORK_KEY],
    });
    const component = await mount(<ComposerStory />);
    const door = line(component).getByRole("button", { name: "Model roles", exact: true });
    await expect(door).toBeInViewport();

    // The size the label's glyphs actually paint at: the element that owns the text node, not the button box.
    const paintedSize = (): Promise<string> =>
      door.evaluate((el: HTMLElement): string => {
        const owner = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode()?.parentElement;
        return owner === null || owner === undefined ? "" : getComputedStyle(owner).fontSize;
      });
    await expect.poll(paintedSize).toBe(`${Number.parseFloat(TOKENS["text.body"].value) * ROOT_PX}px`);
    const floor = await touchFloorPx(page);
    await expect.poll(() => hitExtent(door, "x")).toBeGreaterThanOrEqual(floor);
    await expect.poll(() => hitExtent(door, "y")).toBeGreaterThanOrEqual(floor);
  });
});
