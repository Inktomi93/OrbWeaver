// CT: the room's REGEX section (#1742 — `docs/design/mocks/regex-section/DESIGN.md`, owner-approved
// 2026-09-05). What it pins, and why each one is a pin rather than a screenshot:
//
//   • RUN ORDER IS DISPLAY ORDER. The section's whole claim is "this is what runs, in this order"; a rank
//     that does not match the DOM order of the rows is the claim failing silently.
//   • THE TWO SWITCHES WRITE TWO DIFFERENT THINGS. A tier switch fires `chat.setRegexAllow` naming THAT tier
//     (never the master, never a neighbour's key); the master fires the master lever. Driven through the
//     fake data provider and read off the recorder, because the flip's own repaint is bus-driven (there is
//     no bus in a CT) — the SETTLED post-flip render is pinned separately, by mounting the view the server
//     would answer with.
//   • DEDUP IS VISIBLE. A script two tiers hold draws once, at the tier that claimed its rank, with a `+N`
//     chip; the other tier does not draw it at all.
//   • THE TOAST IS THE ROW SWITCH'S SCOPE WARNING. It appears when the flip reaches beyond this room and is
//     SILENT for a chat-only row — the one case where "off everywhere" and "off here" coincide.
//   • THE MEMBER SEES THE ROOM'S OWN TIER AND NO CONTROLS (D19).
//   • THE UNDRAWN STATES (§7.5) are rendered here because the canvas does not draw them: a preset-less room,
//     the settling read, a failed read, `+2`, a member with broadcast on, a member under a host master off.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc, trpcError, trpcHold } from "../../../../support/ct/route-trpc.ts";
import { RegexSectionStory } from "../_ct-stories.tsx";

const ALICE = "character_ct_alice";
const BO = "character_ct_bo";

/** A library row, minimal but CONTRACT-shaped — the section reads name/enabled/findRegex/placement. */
function script(spec: {
  readonly id: string;
  readonly name: string;
  readonly findRegex: string;
  readonly placement: readonly string[];
  readonly enabled?: boolean;
}): Record<string, unknown> {
  const { id, name, findRegex, placement } = spec;
  return {
    id,
    name,
    enabled: spec.enabled ?? true,
    updatedAt: 1_700_000_000_000,
    findRegex,
    replaceString: "",
    placement,
    markdownOnly: false,
    promptOnly: false,
    runOnEdit: false,
    trimStrings: [],
    substituteRegex: "none",
  };
}

const STRIP_OOC = script({ id: "regex_script_ct_stripooc", name: "Strip OOC", findRegex: "\\(OOC:[^)]*\\)", placement: ["USER_INPUT", "AI_OUTPUT"] });
const EMDASH = script({ id: "regex_script_ct_emdash", name: "Em-dash killer", findRegex: "—", placement: ["AI_OUTPUT"] });
const HEDGES = script({ id: "regex_script_ct_hedges", name: "Trim trailing hedges", findRegex: "\\b(perhaps|maybe)\\b", placement: ["PROMPT_HISTORY"] });
const ALICE_ITAL = script({ id: "regex_script_ct_aliceital", name: "Alice italics", findRegex: "\\*([^*]+)\\*", placement: ["DISPLAY"] });
const BO_SHOUT = script({ id: "regex_script_ct_boshout", name: "Bo shouting", findRegex: "[A-Z]{4,}", placement: ["AI_OUTPUT"] });
const REDACT = script({ id: "regex_script_ct_redact", name: "Redact the address", findRegex: "221B", placement: ["USER_INPUT"] });
const SAILOR = script({ id: "regex_script_ct_sailor", name: "Sailor slang", findRegex: "\\bmatey\\b", placement: ["USER_INPUT"] });

/** The viewer's own library — everything except the PREVIOUS host's chat-tier row (#1739). */
const OWNED = [STRIP_OOC, EMDASH, HEDGES, ALICE_ITAL, BO_SHOUT, REDACT];

function row(entry: Record<string, unknown>, position: number, runsAt: number | null, attachedElsewhere = false): Record<string, unknown> {
  return { script: entry, position, runsAt, attachedElsewhere };
}

/** The canvas's board 01: seven scripts, `Bo shouting` attached at BOTH `Everywhere` and Bo's card. */
function board01(): Record<string, unknown> {
  return {
    enabled: true,
    tiers: [
      { scope: "global", allowed: true, rows: [row(STRIP_OOC, 0, 1), row(EMDASH, 1, 2), row(BO_SHOUT, 2, 3, true)] },
      { scope: "preset", allowed: true, rows: [row(HEDGES, 0, 4)] },
      { scope: `character:${ALICE}`, allowed: true, rows: [row(ALICE_ITAL, 0, 5)] },
      { scope: `character:${BO}`, allowed: true, rows: [row(BO_SHOUT, 0, null, true)] },
      { scope: "chat", allowed: true, rows: [row(REDACT, 0, 6), row(SAILOR, 1, 7)] },
    ],
    effective: [1, 2, 3, 4, 5, 6, 7].map((runsAt) => ({ scriptId: `s${runsAt}`, runsAt })),
  };
}

const CHAT_DETAIL = {
  id: "chat_ct",
  viewerIsHost: true,
  hostDisplayScripts: false,
  roomOverrides: {},
  participants: [
    { id: "p1", characterId: ALICE, displayName: "Alice", leftSeq: null },
    { id: "p2", characterId: BO, displayName: "Bo", leftSeq: null },
  ],
};

/** Every read the host arm makes. `regex.listScripts` doubles as the #1739 ownership set and the `On screen`
 *  roster's provenance source; `listRoomDisplayScripts` is the host's broadcast set (empty unless a test
 *  says otherwise — the toggle is off by default and the server returns `[]`). */
function stubHost(page: Page, view: Record<string, unknown>, broadcast: readonly Record<string, unknown>[] = []): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "chat.listEffectiveRegex": () => view,
    "chat.getChat": () => CHAT_DETAIL,
    "regex.listScripts": () => OWNED,
    "regex.listRoomDisplayScripts": () => broadcast,
    "chat.setRegexAllow": () => ({ enabled: true, tiers: {} }),
    "regex.updateScript": () => STRIP_OOC,
    "regex.detachFromChat": () => ({ detached: true }),
    "regex.attachToChat": () => ({}),
  });
}

test("host: the rows render in RUN ORDER and their ranks are the server's, 1..N down the panel", async ({ mount, page }) => {
  await stubHost(page, board01());
  const component = await mount(<RegexSectionStory />);
  await expect(component.getByRole("heading", { name: /^Everywhere/u })).toBeVisible();
  // The rank cell is the row's leading slot; reading the rows in DOM order IS the display order. POLLED,
  // never one-shot: the tier groups settle as their reads land, and a single read samples mid-arrival.
  await expect
    .poll(
      async () => (await component.locator('[data-slot="regex-tier"] [data-slot="list-row-root"]').allInnerTexts()).map((text) => text.trim().split(/\s/u)[0]),
      { intervals: [20, 50, 100, 250] },
    )
    .toEqual(["1", "2", "3", "4", "5", "6", "7"]);
});

test("host: a script two tiers hold draws ONCE, at the tier that ranked it, with a +1 chip", async ({ mount, page }) => {
  await stubHost(page, board01());
  const component = await mount(<RegexSectionStory />);
  await expect(component.getByText("Bo shouting")).toHaveCount(1);
  await expect(component.locator('[data-tier="global"]').getByText("Bo shouting")).toBeVisible();
  await expect(component.locator('[data-tier="global"]').getByTitle("also attached: From Bo")).toHaveText("+1");
});

test("host: a THIRD tier holding the same row reads +2 (§7.5's undrawn state)", async ({ mount, page }) => {
  const view = board01();
  const tiers = view["tiers"] as Record<string, unknown>[];
  (tiers[4] as { rows: Record<string, unknown>[] }).rows.unshift(row(BO_SHOUT, 0, null, true));
  await stubHost(page, view);
  const component = await mount(<RegexSectionStory />);
  await expect(component.locator('[data-tier="global"]').getByTitle("also attached: From Bo · This chat")).toHaveText("+2");
});

test("host: a tier switch writes THAT tier's key — never the master, never a neighbour", async ({ mount, page }) => {
  const trpc = await stubHost(page, board01());
  const component = await mount(<RegexSectionStory />);
  await component.getByRole("switch", { name: "Preset — in this chat" }).click();
  await expect
    .poll(() => trpc.lastInput("chat.setRegexAllow") as { lever?: { kind?: string; tier?: string; enabled?: boolean } } | undefined, {
      intervals: [20, 50, 100],
    })
    .toMatchObject({ lever: { kind: "tier", tier: "preset", enabled: false } });
});

test("host: the master writes the master lever", async ({ mount, page }) => {
  const trpc = await stubHost(page, board01());
  const component = await mount(<RegexSectionStory />);
  await component.getByRole("switch", { name: "Run regex in this chat" }).click();
  await expect
    .poll(() => trpc.lastInput("chat.setRegexAllow") as { lever?: { kind?: string; enabled?: boolean } } | undefined, { intervals: [20, 50, 100] })
    .toMatchObject({ lever: { kind: "master", enabled: false } });
});

test("host: with the preset tier OFF its rows stay readable, lose their ranks, and the group says `off here`", async ({ mount, page }) => {
  const view = board01();
  const tiers = view["tiers"] as Record<string, unknown>[];
  tiers[1] = { scope: "preset", allowed: false, rows: [row(HEDGES, 0, null)] };
  await stubHost(page, view);
  const component = await mount(<RegexSectionStory />);
  await expect(component.getByRole("heading", { name: /^From the preset/u })).toContainText("off here");
  const hedges = component.locator('[data-tier="preset"] [data-slot="list-row-root"]').first();
  await expect(hedges).toContainText("Trim trailing hedges");
  await expect(hedges).toContainText("—");
  // The row's OWN switch stays live: it is the library's flag, which the room's lever never gated.
  await expect(component.getByRole("switch", { name: "Trim trailing hedges — everywhere" })).toBeEnabled();
});

test("host: with the MASTER off every tier switch is disabled and no row claims a rank", async ({ mount, page }) => {
  const view = board01();
  view["enabled"] = false;
  view["effective"] = [];
  for (const tier of view["tiers"] as { rows: { runsAt: number | null }[] }[]) {
    for (const entry of tier.rows) {
      entry.runsAt = null;
    }
  }
  await stubHost(page, view);
  const component = await mount(<RegexSectionStory />);
  await expect(component.getByRole("switch", { name: "Everywhere — in this chat" })).toBeDisabled();
  await expect(component.getByRole("switch", { name: "This chat — in this chat" })).toBeDisabled();
  await expect(component.locator('[data-slot="regex-tier"] [data-slot="list-row-root"]').first()).toContainText("—");
});

test("host: flipping a row that reaches beyond this chat raises the `everywhere` toast WITH Undo", async ({ mount, page }) => {
  const trpc = await stubHost(page, board01());
  const component = await mount(<RegexSectionStory />);
  await component.getByRole("switch", { name: "Strip OOC — everywhere" }).click();
  const toast = page.locator('[data-slot="toast-root"]').filter({ hasText: "Turned Strip OOC off everywhere" });
  await expect(toast).toHaveAttribute("role", "status");
  await expect(toast).toBeVisible();
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect
    .poll(() => trpc.inputs("regex.updateScript").map((input) => (input as { input?: { enabled?: boolean } }).input?.enabled), {
      intervals: [20, 50, 100],
    })
    .toEqual([false, true]);
});

test("host: flipping a chat-ONLY row raises no toast — the flip cannot reach another room", async ({ mount, page }) => {
  const trpc = await stubHost(page, board01());
  const component = await mount(<RegexSectionStory />);
  await component.getByRole("switch", { name: "Redact the address — everywhere" }).click();
  // The WRITE still fires — the flip is real, it just has nothing to warn about. (The switch's own repaint
  // is bus-driven: `setRegexAllow`/`updateScript` carry no optimistic arm, by design — see the mutations
  // file's header — so the settled post-flip render is pinned by mounting the view the server would answer.)
  await expect
    .poll(() => trpc.lastInput("regex.updateScript") as { input?: { enabled?: boolean } } | undefined, { intervals: [20, 50, 100] })
    .toMatchObject({ input: { enabled: false } });
  // The TOAST, not any live region — the list surfaces mount an aria-announcer (role=status) of their own.
  await expect(page.locator('[data-slot="toast-root"]')).toHaveCount(0);
});

test("host: a PREVIOUS host's chat-tier row is marked, has no switch, and its menu says so (#1739)", async ({ mount, page }) => {
  await stubHost(page, board01());
  const component = await mount(<RegexSectionStory />);
  const sailor = component.locator('[data-tier="chat"] [data-slot="list-row-root"]').filter({ hasText: "Sailor slang" });
  await expect(sailor).toContainText("previous host");
  await expect(component.getByRole("switch", { name: "Sailor slang — everywhere" })).toHaveCount(0);
  // The kebab's name carries the row's disambiguated SUBJECT (`rowQualifiers`), so it is matched by shape:
  // `More for "Sailor slang" · <stamp>: not yours …`.
  await expect(component.getByRole("button", { name: /^More for .*Sailor slang.*not yours/u })).toBeVisible();
});

test("host: a PREVIOUS host's row can still be DETACHED — the room gate, not the script's owner (#1739)", async ({ mount, page }) => {
  const trpc = await stubHost(page, board01());
  const component = await mount(<RegexSectionStory />);
  await component.getByRole("button", { name: /^More for .*Sailor slang.*not yours/u }).click();
  // The switch's absence is the OWNER gate (`enabled` is the library row's); the detach is the ROOM gate,
  // which `detachFromChat` no longer re-checks ownership against. Both facts live in this one menu.
  await expect(page.getByRole("menuitem", { name: /Only its owner can switch it off/u })).toBeDisabled();
  await page.getByRole("menuitem", { name: "Detach from this chat" }).click();
  await expect
    .poll(() => trpc.lastInput("regex.detachFromChat") as { scriptId?: string } | undefined, { intervals: [20, 50, 100] })
    .toMatchObject({ scriptId: "regex_script_ct_sailor" });
});

// ── #1754 — the preset tier's NAME comes off the wire ────────────────────────────────────────────────
// The section must never name the wrong preset. The only client-side route to a preset name is the
// VIEWER's active-preset chip (`chat-context-band.tsx` → `settings.getUserSettings` + `preset.list`), and
// on a GM-redirect room that is a DIFFERENT preset from the one this room's turn assembles. So the read
// carries the label, and these two pin that the rendered heading is the wire's answer and nothing else.

/** The viewer's OWN active preset, seeded as a DECOY: any name that leaks from here into a tier heading is
 *  the exact defect #1754 exists for. `chat-context-band` resolves it from these two reads. */
const VIEWER_ACTIVE_PRESET = "Viewer's own preset";

function stubHostWithViewerPreset(page: Page, view: Record<string, unknown>): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "chat.listEffectiveRegex": () => view,
    "chat.getChat": () => CHAT_DETAIL,
    "regex.listScripts": () => OWNED,
    "regex.listRoomDisplayScripts": () => [],
    "settings.getUserSettings": () => ({ seeds: { defaultPresetId: "preset_ct_viewer" } }),
    "preset.list": () => [{ id: "preset_ct_viewer", name: VIEWER_ACTIVE_PRESET }],
  });
}

test("host: the preset tier is named by the WIRE's label, never by the viewer's own active preset (#1754)", async ({ mount, page }) => {
  const view = board01();
  const tiers = view["tiers"] as Record<string, unknown>[];
  tiers[1] = { scope: "preset", allowed: true, label: "Grimdark GM", rows: [row(HEDGES, 0, 4)] };
  await stubHostWithViewerPreset(page, view);
  const component = await mount(<RegexSectionStory />);
  // The group heading and the lever both say the ROOM's preset…
  await expect(component.getByRole("heading", { name: /^From the preset · Grimdark GM/u })).toBeVisible();
  await expect(component.getByRole("switch", { name: "Preset · Grimdark GM — in this chat" })).toBeVisible();
  // …and the viewer's own preset name appears nowhere in the section.
  await expect(component.getByText(VIEWER_ACTIVE_PRESET)).toHaveCount(0);
});

test("host: a LONG preset name reaches BOTH voices whole — the lever clips visually, never in its name (#1754)", async ({ mount, page }) => {
  // A preset name is user-authored, so the design's short `Grimdark GM` proves nothing about the range.
  // This is the other end. What is pinned is the ACCESSIBLE side: the lever truncates on screen (the label
  // carries `truncate`), and a truncated NAME would leave a voice-control user unable to say the control's
  // words (WCAG 2.5.3) — so the switch's accessible name must still carry the whole preset name.
  //
  // NOT a geometry arm, deliberately: containment is not measurable from this story. `boundingBox()` on the
  // section grows with its own content and the 380px wrapper is not the mount root, so a width assertion
  // here PASSES with `truncate` AND with `min-w-0` planted off (both controls run, both green) — it would be
  // a fence wearing a receipt's clothes.
  const longName = "Grimdark GM voice — long-context table rules v3";
  const view = board01();
  const tiers = view["tiers"] as Record<string, unknown>[];
  tiers[1] = { scope: "preset", allowed: true, label: longName, rows: [row(HEDGES, 0, 4)] };
  await stubHostWithViewerPreset(page, view);
  const component = await mount(<RegexSectionStory />);
  await expect(component.getByRole("heading", { name: new RegExp(`^From the preset · ${longName}`, "u") })).toBeVisible();
  await expect(component.getByRole("switch", { name: `Preset · ${longName} — in this chat` })).toBeVisible();
});

test("host: with NO label on the wire the preset tier says the bare `From the preset` (#1754)", async ({ mount, page }) => {
  await stubHostWithViewerPreset(page, board01());
  const component = await mount(<RegexSectionStory />);
  await expect(component.getByRole("heading", { name: /^From the preset\s+\d/u })).toBeVisible();
  await expect(component.getByRole("switch", { name: "Preset — in this chat" })).toBeVisible();
});

test("host: a preset-less room's group says so instead of naming a preset it cannot name (§7.5)", async ({ mount, page }) => {
  const view = board01();
  const tiers = view["tiers"] as Record<string, unknown>[];
  tiers[1] = { scope: "preset", allowed: true, rows: [] };
  await stubHost(page, view);
  const component = await mount(<RegexSectionStory />);
  await expect(component.locator('[data-tier="preset"]')).toContainText("Nothing from here.");
});

test("the SETTLING read renders the boundary's fallback, never a void", async ({ mount, page }) => {
  const hold = trpcHold();
  await routeTrpc(page, {
    "chat.listEffectiveRegex": hold,
    "chat.getChat": () => CHAT_DETAIL,
    "regex.listScripts": () => OWNED,
    "regex.listRoomDisplayScripts": () => [],
  });
  const component = await mount(<RegexSectionStory />);
  await hold.requested;
  await expect(component.getByText("Loading this chat's regex…")).toBeVisible();
});

test("a FAILED read renders the section's own retry arm, named", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.listEffectiveRegex": () => trpcError({ code: "INTERNAL_SERVER_ERROR" }),
    "chat.getChat": () => CHAT_DETAIL,
    "regex.listScripts": () => OWNED,
    "regex.listRoomDisplayScripts": () => [],
  });
  const component = await mount(<RegexSectionStory />);
  await expect(component.getByText("Couldn't load this chat's regex", { exact: false })).toBeVisible();
});

test("member: only the room's own tier, no switches, and the line saying whose regex this is", async ({ mount, page }) => {
  await routeTrpc(page, {
    "regex.listForChat": () => [REDACT, SAILOR],
    "regex.listScripts": () => OWNED,
    "regex.listRoomDisplayScripts": () => [],
  });
  const component = await mount(<RegexSectionStory isHost={false} />);
  await expect(component.getByText("The host’s regex applies to this room. Only the host can change it.")).toBeVisible();
  await expect(component.getByRole("heading", { name: /^This chat/u })).toBeVisible();
  await expect(component.getByRole("heading", { name: /^Everywhere/u })).toHaveCount(0);
  // Scoped to the TIER groups: the `On screen` roster below is the viewer's OWN display library and keeps
  // its switches for a member (§7.5) — what a member never gets is a lever or a row switch over the ROOM's
  // regex, which is what this counts.
  await expect(component.locator('[data-slot="regex-tier"]').getByRole("switch")).toHaveCount(0);
  await expect(component.locator('[data-slot="regex-levers"]')).toHaveCount(0);
  await expect(component.getByText("Redact the address")).toBeVisible();
});

test("member with the host BROADCASTING: the host's display scripts are listed, as the host's, unswitchable (§7.5)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "regex.listForChat": () => [REDACT],
    "regex.listScripts": () => [],
    "regex.listRoomDisplayScripts": () => [ALICE_ITAL],
  });
  const component = await mount(<RegexSectionStory isHost={false} />);
  const roster = component.locator('[data-slot="regex-on-screen"]');
  await expect(roster).toContainText("Alice italics");
  await expect(roster).toContainText("the host’s");
  await expect(component.getByRole("switch")).toHaveCount(0);
});

test("the viewer's OWN switched-off display script still lists, marked OFF, so its switch can be flipped back", async ({ mount, page }) => {
  const off = script({ id: "regex_script_ct_offdisp", name: "Italic thoughts", findRegex: "\\*([^*]+)\\*", placement: ["DISPLAY"], enabled: false });
  await routeTrpc(page, {
    "regex.listForChat": () => [],
    "regex.listScripts": () => [off],
    "regex.listRoomDisplayScripts": () => [],
  });
  const component = await mount(<RegexSectionStory isHost={false} />);
  const roster = component.locator('[data-slot="regex-on-screen"]');
  await expect(roster).toContainText("Italic thoughts");
  await expect(roster).toContainText("OFF");
  await expect(component.getByRole("switch", { name: "Italic thoughts — everywhere" })).not.toBeChecked();
});

test("host: `Attach a script` offers the library, marks what is already here, and attaches the ticked ones", async ({ mount, page }) => {
  const trpc = await stubHost(page, board01());
  const component = await mount(<RegexSectionStory />);
  await component.getByRole("button", { name: "Attach a script" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Attach a script to this chat")).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: /already attached to this chat/u })).toBeDisabled();
  // The filter narrows by name, so a 30-script library stays a glance.
  await dialog.getByRole("textbox", { name: "Filter your scripts" }).fill("hedges");
  await expect(dialog.getByRole("checkbox")).toHaveCount(1);
  await dialog.getByRole("checkbox", { name: "Attach Trim trailing hedges to this chat" }).click();
  await dialog.getByRole("button", { name: "Attach to this chat" }).click();
  await expect
    .poll(() => trpc.lastInput("regex.attachToChat") as { scriptId?: string } | undefined, { intervals: [20, 50, 100] })
    .toMatchObject({ scriptId: "regex_script_ct_hedges" });
});

test("host: the room's own tier offers Detach, and no other tier does", async ({ mount, page }) => {
  const trpc = await stubHost(page, board01());
  const component = await mount(<RegexSectionStory />);
  await expect(component.getByRole("button", { name: /^More for .*Strip OOC.*: Open in library$/u })).toBeVisible();
  await component.getByRole("button", { name: /^More for .*Redact the address.*: Open in library, Detach from this chat$/u }).click();
  await page.getByRole("menuitem", { name: "Detach from this chat" }).click();
  await expect
    .poll(() => trpc.lastInput("regex.detachFromChat") as { scriptId?: string } | undefined, { intervals: [20, 50, 100] })
    .toMatchObject({ scriptId: "regex_script_ct_redact" });
});
