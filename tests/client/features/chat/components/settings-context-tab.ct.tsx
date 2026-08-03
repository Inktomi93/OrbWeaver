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
const CHAT_DETAIL = { id: "chat_ct", viewerIsHost: true, toolRecurseLimit: 7, hostDisplayScripts: false, roomOverrides: {}, participants: [] };

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

// D121-E — the "share my display scripts" host switch (Host controls group). Host-only (the §8.1
// permission-OMIT): the host sees + toggles it; a member never sees the control (the Tool-use precedent).
const UPDATE_HOST_DISPLAY_SCRIPTS = "chat.setHostDisplayScripts";

function stubHostDisplayScripts(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "chat.getGroupConfig": () => ({ ...DEFAULT_GROUP_CONFIG }),
    "chat.setRoomOverrides": () => ({}),
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getChat": () => CHAT_DETAIL,
    [UPDATE_HOST_DISPLAY_SCRIPTS]: () => ({}),
  });
}

test("host: the display-scripts switch renders seeded from getChat.hostDisplayScripts (off)", async ({ mount, page }) => {
  await stubHostDisplayScripts(page);
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={true} />);
  await expect(component.getByRole("switch", { name: "Show my display scripts to everyone" })).not.toBeChecked();
});

test("host: toggling the switch fires chat.setHostDisplayScripts with the new state", async ({ mount, page }) => {
  const trpc = await stubHostDisplayScripts(page);
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={true} />);
  await component.getByRole("switch", { name: "Show my display scripts to everyone" }).click();
  await expect.poll(() => (trpc.lastInput(UPDATE_HOST_DISPLAY_SCRIPTS) as { enabled?: boolean } | undefined)?.enabled, { intervals: [20, 50, 100] }).toBe(true);
});

test("member: the display-scripts switch is ABSENT (host-only omit — a member sees no control)", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.setRoomOverrides": () => ({}), "chat.listChatInjections": () => [], "chat.getUserMacroPicks": () => EMPTY_PICKS });
  const component = await mount(<CommittedSettingsTabStory isHost={false} showGroup={false} />);
  await expect(component.getByRole("switch", { name: "Show my display scripts to everyone" })).toHaveCount(0);
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

// ── SIDE-EYE 08-01 F8: THE PANE'S OWN VOICE, AND THE D-1 HOST-OPS GROUP ───────────────────────────────

test("F8: the section names speak the INSTRUMENT tier's kicker voice, not the form tier's h3 title", async ({ mount, page }) => {
  // The tab lives in the CONTEXT panel viewport, which density-pass-spec §3.1 names as INSTRUMENT tier —
  // beside rpg sections that all name themselves in micro-caps over a hairline. These shipped at the FORM
  // heading (16px/500), so one pane spoke two dialects. COMPUTED, not by class string: `voice` re-spells
  // every axis, so the only honest check is what the browser resolved.
  await routeTrpc(page, {
    "chat.setRoomOverrides": () => ({}),
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getChat": () => CHAT_DETAIL,
  });
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={false} />);
  const heading = component.getByRole("heading", { name: "Field overrides", exact: true, level: 3 });
  await expect(heading).toBeVisible();

  // The kicker step + the form-tier step, both RESOLVED from their tokens in this document — never px
  // literals (a token retune must move the assertion with it, not break it).
  const [micro, title] = await page.evaluate(() => {
    const probe = document.createElement("div");
    document.body.append(probe);
    const px = (value: string): string => {
      probe.style.fontSize = value;
      return getComputedStyle(probe).fontSize;
    };
    const root = getComputedStyle(document.documentElement);
    const out = [px(root.getPropertyValue("--text-micro").trim()), px(root.getPropertyValue("--text-title").trim())];
    probe.remove();
    return out;
  });
  const style = (): Promise<{ readonly size: string; readonly transform: string; readonly tag: string }> =>
    heading.evaluate((el) => {
      const computed = getComputedStyle(el);
      return { size: computed.fontSize, transform: computed.textTransform, tag: el.tagName };
    });
  // Polled: type resolution settles with the stylesheet, and a one-shot read samples whatever the first
  // frame had (the DEF-14 class).
  await expect.poll(() => style().then((s) => s.size), { intervals: [20, 50, 100, 200] }).toBe(micro);
  // ONESHOT-OK: the poll above just proved this element's type resolution has SETTLED, and nothing in this
  // test mutates it afterwards — these are the same read, sampled once it is provably stable.
  const settled = await style();
  expect(settled.size).not.toBe(title);
  expect(settled.transform).toBe("uppercase");
  // …and it is STILL a real h3 (the outline the settings idiom bought is not what was wrong).
  expect(settled.tag).toBe("H3");
});

test("D-1: the host-ops trio sits under a 'Host controls' group — and a member sees neither the group nor its rows", async ({ mount, page }) => {
  // The merge had stacked five unrelated concerns in one flat list (the fidelity audit's structural root of
  // "a whole menu got garbled together"). Background / Group behavior / Tool use are now one named group,
  // which is also exactly the permission line.
  await routeTrpc(page, {
    "chat.getGroupConfig": () => ({ ...DEFAULT_GROUP_CONFIG }),
    "chat.setRoomOverrides": () => ({}),
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getChat": () => CHAT_DETAIL,
  });
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={true} />);

  await expect(component.getByRole("heading", { name: "Host controls", exact: true, level: 3 })).toBeVisible();
  const group = component.locator("section").filter({ hasText: "Host controls" }).first();
  // CONTAINMENT is the claim — a heading rendered anywhere near them would prove nothing.
  await Promise.all(
    ["Background", "Group behavior", "Tool use"].map((name) => expect(group.getByRole("heading", { name, exact: true, level: 3 })).toBeVisible()),
  );
  // The member-reachable sections stay OUTSIDE it (Macro picks is play state any member may set).
  await expect(group.getByRole("heading", { name: "Macro picks", exact: true, level: 3 })).toHaveCount(0);
});

// BG-C honest echo (owner-reported 08-03): the Background row read "None" in a chat whose card-carried
// background was VISIBLY painting — the picker echoed only the chat-set field and was blind to the cascade's
// card arm (the S4 override-echoed-as-default class). The row must name the EFFECTIVE source + where it came
// from. Asserted through the rendered text a user reads, never through the resolver.
const SOLO_ROSTER_WITH_CARD_BG = [
  { id: "p_human", kind: "human", characterId: null, displayName: "You" },
  {
    id: "p_birdie",
    kind: "character",
    characterId: "character_birdie",
    displayName: "Birdie Mae Holloway",
    backgroundOverride: { kind: "seeded", seededId: "birdie-bg", externalUrl: "", assetId: "", assetHash: "", mime: "", provenanceUrl: "" },
  },
];

test("BG-C: with no chat-set background, the Background row names the CARD-carried source that is painting", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.setRoomOverrides": () => ({}),
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getChat": () => ({ ...CHAT_DETAIL, participants: SOLO_ROSTER_WITH_CARD_BG }),
  });
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={false} />);

  const group = component.locator("section").filter({ hasText: "Host controls" }).first();
  await expect(group.getByText("Hobby & Repair", { exact: false })).toBeVisible();
  await expect(group.getByText("from Birdie Mae Holloway's card", { exact: false })).toBeVisible();
});

test("BG-C: a room with NO carried background gets no provenance gloss (never an invented origin)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.setRoomOverrides": () => ({}),
    "chat.listChatInjections": () => [],
    "chat.getUserMacroPicks": () => EMPTY_PICKS,
    "chat.getChat": () => CHAT_DETAIL,
  });
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={false} />);

  const group = component.locator("section").filter({ hasText: "Host controls" }).first();
  await expect(group.getByText("card", { exact: false })).toHaveCount(0);
});

test("D-1: a member's tab has no Host controls group at all (PERMISSION-omit, never an empty group)", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.setRoomOverrides": () => ({}), "chat.listChatInjections": () => [], "chat.getUserMacroPicks": () => EMPTY_PICKS });
  const component = await mount(<CommittedSettingsTabStory isHost={false} showGroup={false} />);
  await expect(component.getByRole("heading", { name: "Macro picks", exact: true, level: 3 })).toBeVisible();
  await expect(component.getByRole("heading", { name: "Host controls", exact: true, level: 3 })).toHaveCount(0);
  await expect(component.getByRole("heading", { name: "Background", exact: true, level: 3 })).toHaveCount(0);
});
