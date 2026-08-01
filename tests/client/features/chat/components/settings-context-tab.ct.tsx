// CT: the consolidated "This chat" CONTEXT tab (settings-context-tab.tsx, panel-redesign) mounted DIRECTLY
// as the component — its OWN section-composition contract, distinct from chats-section.ct's registry-resolve
// matrix. Pins: Field overrides + Injections + (host+group) Group behavior render as real h3 sections; the
// "Group behavior" section is ABSENT for a non-host and ABSENT for a solo roster while "Field overrides"
// persists; the section headings are real h3s with the right accessible names (the settings-modal idiom).
// The committed arm routeTrpc-stubs `chat.getGroupConfig` (the Group-behavior section's suspense read) +
// `chat.setRoomOverrides` + `chat.listChatInjections` (the folded-in Injections section's read); the draft
// arm is store-backed (no network).

import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { setNumber } from "../../../../support/ct/set-number";
import { CommittedSettingsTabStory, DraftSettingsTabStory } from "../_ct-stories";

// The getChat stub the host-only Tool-use section suspends on (⑦). `toolRecurseLimit` is the current cap the
// control displays; `viewerIsHost` mirrors the story's isHost. Minimal — the section only reads the cap.
const CHAT_DETAIL = { id: "chat_ct", viewerIsHost: true, toolRecurseLimit: 7, roomOverrides: {}, participants: [] };

// The Macro-picks section's own suspense read (#24) — this tab is its production mount, so every committed
// arm must stub it or the section's boundary would swallow the failure and the tab's composition contract
// would silently stop covering it. Empty declarations = the section's teaching empty state.
const EMPTY_PICKS = { macros: [], values: {} };

test("committed host + group: BOTH sections render as h3 headings", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getGroupConfig": () => ({ ...DEFAULT_GROUP_CONFIG }),
    "chat.setRoomOverrides": () => ({}),
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getChat": () => CHAT_DETAIL,
  });

  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={true} />);

  await expect(component.getByRole("heading", { name: "Field overrides", level: 3 })).toBeVisible();
  await expect(component.getByRole("heading", { name: "Injections", level: 3 })).toBeVisible();
  await expect(component.getByRole("heading", { name: "Group behavior", level: 3 })).toBeVisible();
  // Macro picks (#24) — member-reachable, so it renders for host and non-host alike.
  await expect(component.getByRole("heading", { name: "Macro picks", level: 3 })).toBeVisible();
});

// The Group-behavior section's suspense read (chat.getGroupConfig) held pending: the QueryBoundary
// fallback must be the shape-matched skeleton (house loading law, UIP-309 / UI-Arch §4.3 rule 7), never
// the old spinner/text void. Hang the query with a route registered BEFORE routeTrpc so it wins the match.
test("committed host + group: the Group-behavior section shows a skeleton (never a spinner void) while loading", async ({ mount, page }) => {
  await page.route("**/api/trpc/**", async (route) => {
    const url = new URL(route.request().url());
    const procs = decodeURIComponent(url.pathname.split("/api/trpc/")[1] ?? "");
    // Hold the group-config read pending forever so the QueryBoundary stays in its fallback.
    if (procs.includes("chat.getGroupConfig")) {
      return; // never fulfilled — the request hangs
    }
    await route.fallback();
  });
  await routeTrpc(page, {
    "chat.setRoomOverrides": () => ({}),
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getChat": () => CHAT_DETAIL,
  });

  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={true} />);

  // The section heading renders immediately; its body is the skeleton region while the read is pending. tRPC
  // batches getGroupConfig with the tool-use getChat, so both boundaries skeleton together — `.first()` pins
  // the group section's (declared first); the point is a SKELETON renders, never a spinner/text void.
  await expect(component.getByRole("heading", { name: "Group behavior", level: 3 })).toBeVisible();
  const busy = component.locator('[aria-busy="true"]').first();
  await expect(busy).toBeVisible();
  await expect(busy.locator('[data-slot="skeleton"]').first()).toBeVisible();
  // The old text-only fallback is gone.
  await expect(component.getByText("Loading group settings…")).toHaveCount(0);
});

test("committed non-host: Group behavior is ABSENT, Field overrides persists (read-only)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.setRoomOverrides": () => ({}),
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
  });

  const component = await mount(<CommittedSettingsTabStory isHost={false} showGroup={false} />);

  await expect(component.getByRole("heading", { name: "Field overrides", level: 3 })).toBeVisible();
  await expect(component.getByRole("heading", { name: "Group behavior", level: 3 })).toHaveCount(0);
  // The §8.1 host-only omit is at SECTION level — the overrides field is present but disabled for a member.
  // The field is a collapse-until-needed row: expand Main prompt, then the (disabled) editor is reachable.
  await component.getByRole("button", { name: "Main prompt" }).click();
  await expect(component.getByLabel("Main prompt", { exact: true })).toBeDisabled();
});

test("committed host + SOLO (non-group): Group behavior is ABSENT, Field overrides persists", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.setRoomOverrides": () => ({}),
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getChat": () => CHAT_DETAIL,
  });

  // A host of a NON-group chat: showGroup=false (resolveIsGroupChat is false at <2 cast) — the section is
  // omitted even though the viewer is host (the gate is host AND group, both required).
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={false} />);

  await expect(component.getByRole("heading", { name: "Field overrides", level: 3 })).toBeVisible();
  await expect(component.getByRole("heading", { name: "Group behavior", level: 3 })).toHaveCount(0);
  // Host copy — the overrides field is editable for the host (expand the collapse row to reach the editor).
  await component.getByRole("button", { name: "Main prompt" }).click();
  await expect(component.getByLabel("Main prompt", { exact: true })).toBeEnabled();
});

test("draft: Field overrides always renders; Group behavior gates on showGroup", async ({ mount }) => {
  const solo = await mount(<DraftSettingsTabStory showGroup={false} />);
  await expect(solo.getByRole("heading", { name: "Field overrides", level: 3 })).toBeVisible();
  await expect(solo.getByRole("heading", { name: "Injections", level: 3 })).toBeVisible();
  await expect(solo.getByRole("heading", { name: "Group behavior", level: 3 })).toHaveCount(0);
});

test("draft ≥2 cast: BOTH sections render as h3 headings", async ({ mount }) => {
  const group = await mount(<DraftSettingsTabStory showGroup={true} />);
  await expect(group.getByRole("heading", { name: "Field overrides", level: 3 })).toBeVisible();
  await expect(group.getByRole("heading", { name: "Group behavior", level: 3 })).toBeVisible();
});

// ⑦ — the per-chat tool-call recursion cap control (Phase A L3 client half). Host-only (the §8.1
// permission-OMIT): the host sees + edits it; a member never sees the section (the Group-section precedent).
const UPDATE_TOOL_LIMIT = "chat.setToolRecurseLimit";

function stubToolUse(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "chat.getGroupConfig": () => ({ ...DEFAULT_GROUP_CONFIG }),
    "chat.setRoomOverrides": () => ({}),
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getChat": () => CHAT_DETAIL,
    [UPDATE_TOOL_LIMIT]: () => ({}),
  });
}

test("⑦ host: the Tool-use section renders the cap control seeded from getChat.toolRecurseLimit", async ({ mount, page }) => {
  await stubToolUse(page);
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={true} />);
  await expect(component.getByRole("heading", { name: "Tool use", level: 3 })).toBeVisible();
  await expect(component.getByRole("textbox", { name: "Tool rounds per turn" })).toHaveValue("7"); // CHAT_DETAIL.toolRecurseLimit
});

test("⑦ host: editing the cap fires chat.setToolRecurseLimit with the new limit", async ({ mount, page }) => {
  const trpc = await stubToolUse(page);
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={true} />);
  await setNumber(component.getByRole("textbox", { name: "Tool rounds per turn" }), "10");
  await expect.poll(() => (trpc.lastInput(UPDATE_TOOL_LIMIT) as { limit?: number } | undefined)?.limit, { intervals: [20, 50, 100] }).toBe(10);
});

test("⑦ member: the Tool-use section is ABSENT (host-only omit — a member sees no control)", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.setRoomOverrides": () => ({}), "chat.listChatInjections": () => [], "chat.getUserMacroPicks": () => EMPTY_PICKS });
  const component = await mount(<CommittedSettingsTabStory isHost={false} showGroup={false} />);
  await expect(component.getByRole("heading", { name: "Tool use", level: 3 })).toHaveCount(0);
  // Role-agnostic on purpose: an ABSENCE assertion keyed to `spinbutton` would go blind the day the control
  // becomes an @orb/ui NumberField (Base UI renders those as a TEXTBOX, never a spinbutton).
  await expect(component.getByLabel("Tool rounds per turn")).toHaveCount(0);
});

// The at-a-glance kicker-count chips (panel-redesign): a "N set" chip on Field overrides (count of set
// override fields, from the roomOverrides prop) and a "N" chip on Injections (from listChatInjections).
test("count chips: Field overrides shows 'N set' and Injections shows its count when non-empty", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.setRoomOverrides": () => ({}),
    "chat.listChatInjections": () => [
      { id: "inj_1", position: "in_prompt", role: "system", depth: 0, content: "a" },
      { id: "inj_2", position: "in_chat", role: "system", depth: 3, content: "b" },
    ],
    "chat.getChat": () => CHAT_DETAIL,
  });

  // Two set override fields (mainPrompt + scenario) → "2 set"; two injections → "2".
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={false} roomOverrides={{ mainPrompt: "hi", scenario: "there" }} />);

  await expect(component.getByRole("heading", { name: "Field overrides 2 set", level: 3 })).toBeVisible();
  await expect(component.getByRole("heading", { name: "Injections 2", level: 3 })).toBeVisible();
});

test("count chips: no chip when nothing is set (a '0' chip would be noise)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.setRoomOverrides": () => ({}),
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getChat": () => CHAT_DETAIL,
  });

  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={false} />);

  // The heading names are the bare labels — no trailing count (substring match would still hit "Field
  // overrides", so assert the exact name has no chip suffix via the accessible name).
  await expect(component.getByRole("heading", { name: "Field overrides", exact: true, level: 3 })).toBeVisible();
  await expect(component.getByRole("heading", { name: "Injections", exact: true, level: 3 })).toBeVisible();
});
