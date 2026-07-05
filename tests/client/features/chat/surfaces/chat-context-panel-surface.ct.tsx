// CT: the chat CONTEXT panel (task #28 — overrides · preview · injections). Drives the production path
// over the stubbed network (routeTrpc): `chat.getChat` supplies the roster (the host gate) + the current
// room overrides; `chat.listChatInjections` + `chat.previewAssembly` feed the tabs. Asserts the host vs
// member split (member loses the Preview tab and edits nothing), the preview trace render, an injection
// add, and an override save (autosave → setRoomOverrides).
//
// The roster stub returns only what the panel reads (`participants` for `resolveViewerIsHost`,
// `roomOverrides` for the form) — a partial `ChatDetail`, the same posture as message-list-surface.ct's
// ROSTER_STUB. Every value crosses the routeTrpc JSON boundary as a plain object.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { ChatContextPanelStory } from "../_ct-stories";

// A human seat in the room — only `kind` + `role` drive the host gate; the rest is filler the panel ignores.
function human(role: "host" | "member"): Record<string, unknown> {
  return { kind: "human", role, userId: "user_ct", characterId: null };
}

// A character seat — only the fields `resolveIsGroupChat` reads (kind/characterId), same shape as
// chat-cast-bar.ct's fixture (the identical roster filter both surfaces share).
function character(key: string): Record<string, unknown> {
  return { kind: "character", userId: null, characterId: `character_${key}`, role: "member" };
}

function chatDetail(
  role: "host" | "member",
  roomOverrides: Record<string, string> = {},
  characters: readonly Record<string, unknown>[] = [],
): unknown {
  return { participants: [human(role), ...characters], roomOverrides };
}

// A minimal AssemblyPreview ({ prompt, trace }) — proves the Preview tab renders the assembled halves +
// the trace without asserting the assembler's own logic (that is the server's read.int.test's lane).
const PREVIEW = {
  prompt: {
    static: "SYSTEM: be a helpful guide",
    dynamic: "",
    afterHistory: [],
    sendHistory: true,
    trace: emptyTrace(),
  },
  trace: emptyTrace(),
};

function emptyTrace(): Record<string, unknown> {
  return {
    staticSections: ["main_prompt"],
    dynamicSections: [],
    worldInfoIncluded: 0,
    worldInfoDropped: [],
    matchedKeys: [],
    compactSummaryIncluded: false,
    memoryIncluded: false,
    guidedInstructionIncluded: false,
    staticCacheBusters: [],
    chatInjectionsIncluded: 0,
    afterHistorySections: [],
    overrideSources: { mainPrompt: "room override" },
  };
}

test("host sees all three tabs (Overrides · Preview · Injections)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getChat": () => chatDetail("host", { mainPrompt: "Be terse." }),
    "chat.listChatInjections": () => [],
    "chat.previewAssembly": () => PREVIEW,
  });

  const component = await mount(<ChatContextPanelStory />);

  await expect(component.getByRole("tab", { name: "Overrides" })).toBeVisible();
  await expect(component.getByRole("tab", { name: "Preview" })).toBeVisible();
  await expect(component.getByRole("tab", { name: "Injections" })).toBeVisible();
});

test("host in a SOLO (1-character) chat sees no Roster tab (D16 size-gate)", async ({
  mount,
  page,
}) => {
  await routeTrpc(page, {
    "chat.getChat": () => chatDetail("host", {}, [character("aria")]),
    "chat.listChatInjections": () => [],
    "chat.previewAssembly": () => PREVIEW,
  });

  const component = await mount(<ChatContextPanelStory />);

  // Preview stays (host-only, not group-gated); Roster is hidden — mute/talkativeness/force-turn are
  // meaningless for one character (mirrors ChatCastBar's identical solo size-gate).
  await expect(component.getByRole("tab", { name: "Preview" })).toBeVisible();
  await expect(component.getByRole("tab", { name: "Roster" })).toHaveCount(0);
});

test("host in a GROUP (2-character) chat sees the Roster tab", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getChat": () => chatDetail("host", {}, [character("aria"), character("bryn")]),
    "chat.listChatInjections": () => [],
    "chat.previewAssembly": () => PREVIEW,
  });

  const component = await mount(<ChatContextPanelStory />);

  await expect(component.getByRole("tab", { name: "Roster" })).toBeVisible();
});

test("member loses the Preview tab and the overrides are read-only", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getChat": () => chatDetail("member", { mainPrompt: "Be terse." }),
    "chat.listChatInjections": () => [],
  });

  const component = await mount(<ChatContextPanelStory />);

  await expect(component.getByRole("tab", { name: "Overrides" })).toBeVisible();
  await expect(component.getByRole("tab", { name: "Injections" })).toBeVisible();
  // Preview is host-only (previewAssembly is a host debug surface) — hidden for a member.
  await expect(component.getByRole("tab", { name: "Preview" })).toHaveCount(0);
  // The main-prompt field seeded from the server value, but disabled (a member cannot edit).
  const mainPrompt = component.getByLabel("Main prompt");
  await expect(mainPrompt).toHaveValue("Be terse.");
  await expect(mainPrompt).toBeDisabled();
});

test("the Preview tab renders the assembled prompt + trace", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getChat": () => chatDetail("host"),
    "chat.listChatInjections": () => [],
    "chat.previewAssembly": () => PREVIEW,
  });

  const component = await mount(<ChatContextPanelStory />);
  await component.getByRole("tab", { name: "Preview" }).click();

  // The static prompt text and the trace section both render (read-only).
  await expect(component.getByText("SYSTEM: be a helpful guide")).toBeVisible();
  await expect(component.getByText("Trace")).toBeVisible();
  // The override-source attribution line (orbweaver's richer-than-neo trace).
  await expect(component.getByText("room override")).toBeVisible();
});

test("host adds an injection (setChatInjection fires with no id ⇒ create)", async ({
  mount,
  page,
}) => {
  const trpc = await routeTrpc(page, {
    "chat.getChat": () => chatDetail("host"),
    "chat.listChatInjections": () => [],
    "chat.setChatInjection": () => ({
      id: "chat_injection_new",
      position: "in_chat",
      depth: 0,
      role: "system",
      content: "",
    }),
  });

  const component = await mount(<ChatContextPanelStory />);
  await component.getByRole("tab", { name: "Injections" }).click();
  await expect(component.getByText("No injections yet.")).toBeVisible();

  await component.getByRole("button", { name: "Add injection" }).click();

  await expect.poll(() => trpc.count("chat.setChatInjection")).toBeGreaterThanOrEqual(1);
  const input = trpc.lastInput("chat.setChatInjection") as { id?: unknown; position?: unknown };
  // A create carries NO id (the server mints it) and the default position.
  expect(input.id).toBeUndefined();
  expect(input.position).toBe("in_chat");
});

test("host removes an injection (deleteChatInjection fires with the row id)", async ({
  mount,
  page,
}) => {
  const trpc = await routeTrpc(page, {
    "chat.getChat": () => chatDetail("host"),
    "chat.listChatInjections": () => [
      {
        id: "chat_injection_a",
        position: "in_chat",
        depth: 2,
        role: "system",
        content: "It is raining.",
      },
    ],
    "chat.deleteChatInjection": () => null,
  });

  const component = await mount(<ChatContextPanelStory />);
  await component.getByRole("tab", { name: "Injections" }).click();
  await expect(component.getByText("It is raining.")).toBeVisible();

  await component.getByRole("button", { name: "Remove injection" }).click();

  await expect.poll(() => trpc.count("chat.deleteChatInjection")).toBeGreaterThanOrEqual(1);
  const input = trpc.lastInput("chat.deleteChatInjection") as { injectionId?: unknown };
  expect(input.injectionId).toBe("chat_injection_a");
});

test("host editing an override autosaves (setRoomOverrides fires, empty ⇒ omitted)", async ({
  mount,
  page,
}) => {
  const trpc = await routeTrpc(page, {
    "chat.getChat": () => chatDetail("host"),
    "chat.listChatInjections": () => [],
    "chat.previewAssembly": () => PREVIEW,
    "chat.setRoomOverrides": () => ({ scenario: "A rainy dock." }),
  });

  const component = await mount(<ChatContextPanelStory />);
  await component.getByLabel("Scenario").fill("A rainy dock.");

  await expect.poll(() => trpc.count("chat.setRoomOverrides")).toBeGreaterThanOrEqual(1);
  const input = trpc.lastInput("chat.setRoomOverrides") as {
    overrides?: { scenario?: string; mainPrompt?: string };
  };
  expect(input.overrides?.scenario).toBe("A rainy dock.");
  // Empty fields are omitted (inherit), not sent as "".
  expect(input.overrides).not.toHaveProperty("mainPrompt");
});
