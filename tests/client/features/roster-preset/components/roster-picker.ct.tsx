// The saved-roster picker's LIBRARY plane (RP2): rows render from the routed `rosterPreset.list` (name +
// count + member preview, name-sorted as served), the designed EMPTY state shows when the library is
// bare, delete rides the ConfirmDialog and fires the real `rosterPreset.remove` wire call, and the
// no-active-chat mount hides the chat-scoped affordances ("Add to chat" / "Save this room's roster"). The
// in-room semantics (apply/knobs/config/host gate) are the composed-real int tier's —
// tests/server/entry/compose/roster-preset.int.test.ts — a CT fixture cannot honestly reach them.
//
// PLUS the side-eye 2026-08-29 pins (#810-#813): the row's GEOMETRY across the width range (the name is
// never truncated to nothing and the rules badge never overlaps an action — a mis-tap that mints a room),
// the row controls' accessible NAMES carrying both counts, the apply doors' REPORT (all three doors say
// what landed, skip REASONS included, no "Added 0"), the include-line's four arms, and the started room
// taking the roster's name.

import type { RulePresetView } from "@orb/contracts/automation";
import type { RosterPresetSummary } from "@orb/contracts/roster-preset";
import type { CharacterId, RosterPresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError, trpcHold } from "../../../../support/node/route-trpc.ts";
import { RosterPickerHostStory, RosterPickerStory } from "../_ct-stories.tsx";

const ROSTER_A: RosterPresetSummary = {
  id: castId<RosterPresetId>("roster_preset_ct_a"),
  name: "Adventuring Roster",
  description: "",
  memberCount: 2,
  members: [
    { characterId: castId<CharacterId>("character_ct_1"), position: 0, talkativeness: null, disabled: false, name: "Ash", avatarHash: null },
    { characterId: castId<CharacterId>("character_ct_2"), position: 1, talkativeness: 0.8, disabled: false, name: "Brook", avatarHash: null },
  ],
  anchorPersonaId: null,
  hasGroupConfig: true,
  // B10's rules rider — TWO captured rule presets; the row badge below reads the length.
  rules: [
    { rulePresetId: "sceneVeil", knobs: { veilWord: "((fade))", redirect: "cut" } },
    { rulePresetId: "pacingNudge", knobs: { everyN: 4, steer: "s" } },
  ],
  updatedAt: 1,
};
const ROSTER_B: RosterPresetSummary = {
  id: castId<RosterPresetId>("roster_preset_ct_b"),
  name: "Book Club",
  description: "",
  memberCount: 1,
  members: [{ characterId: castId<CharacterId>("character_ct_3"), position: 0, talkativeness: null, disabled: false, name: "Cinder", avatarHash: null }],
  anchorPersonaId: null,
  hasGroupConfig: false,
  rules: [],
  updatedAt: 1,
};

// The room's captured rule, at a NON-DEFAULT knob (`everyN: 12`; the catalogue default is 8) — the datum
// that makes two rosters carrying the same preset distinguishable, and the whole reason the rider stores a
// bag rather than an id. A partial `automation.listRules` row: the capture reads exactly these four fields
// (`hooks/use-saved-rosters.ts::deriveEnabledRosterRules`).
const ROOM_RULE = {
  id: "rule_ct_pacing",
  name: "Periodic pacing nudge",
  enabled: true,
  rulePresetId: "pacingNudge",
  rulePresetKnobs: { everyN: 12, steer: "Take stock of the pacing: raise a complication, or let the scene breathe." },
  createdAt: 5,
};

/** The catalogue row the gloss reads its knob LABELS off (never hand-spelled per preset). */
const PACING_PRESET: RulePresetView = {
  id: "pacingNudge",
  scope: "chat",
  title: "Periodic pacing nudge",
  summary: "Every few beats, quietly ask the narrator to shift the pacing.",
  ruleCount: 1,
  confirmFirst: false,
  spends: true,
  knobs: [
    { key: "everyN", kind: "number", label: "Every N beats", help: "Counted over the chat's messages.", default: 8, min: 2, max: 40 },
    { key: "steer", kind: "text", label: "Nudge", default: "Take stock of the pacing.", minLength: 1, maxLength: 400 },
  ],
};

/** The open room the host stories act on — `chat.getChat`'s shape, narrowed to what the picker reads. */
const HOST_CHAT = {
  id: "chat_roster_ct",
  viewerIsHost: true,
  anchorPersonaId: null,
  group: null,
  participants: [{ id: "participant_ct_1", kind: "character", characterId: "character_ct_1", talkativeness: 0.5, disabled: false, leftSeq: null }],
};

/** The apply result's arms, defaulted — a test names only the arm it drives. */
function applyResult(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { added: [], alreadyPresent: [], skipped: [], configApplied: false, rulesMinted: [], rulesAlreadyPresent: [], rulesSkipped: [], ...over };
}

test("renders the routed library: names, member counts, previews; chat-scoped affordances stay hidden with no room open", async ({ mount, page }) => {
  await routeTrpc(page, { "rosterPreset.list": [ROSTER_A, ROSTER_B], "automation.listRulePresets": [PACING_PRESET], "automation.listRules": [] });

  await mount(<RosterPickerStory />);

  await expect(page.getByText("Adventuring Roster")).toBeVisible();
  await expect(page.getByText("Book Club")).toBeVisible();
  await expect(page.getByText("Ash, Brook")).toBeVisible();
  // B10's rules rider — the badge names the count on a ruled roster and is ABSENT on a rules-free one
  // (copy says "rules", never bare "preset" — the 2026-08-24 vocabulary ruling).
  await expect(page.getByText("2 rules")).toBeVisible();
  await expect(page.getByText(/rule/).filter({ hasText: "0" })).toHaveCount(0);
  // Per-row START is reachable…
  await expect(page.getByRole("button", { name: "Start a chat with Adventuring Roster" })).toBeEnabled();
  // …while the chat-scoped affordances are ABSENT (no room open): no add-to-chat, no save-current.
  await expect(page.getByRole("button", { name: /Add .* to this chat/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save this room's roster" })).toHaveCount(0);
});

test("the empty library shows the designed empty state, not a bare list", async ({ mount, page }) => {
  await routeTrpc(page, { "rosterPreset.list": [], "automation.listRulePresets": [PACING_PRESET], "automation.listRules": [] });

  await mount(<RosterPickerStory />);

  await expect(page.getByText("No saved rosters yet")).toBeVisible();
  // No room open ⇒ this viewer cannot save from here, so the empty state's CTA is honest and stays.
  await expect(page.getByRole("button", { name: "Start a new chat" })).toBeVisible();
});

// #848 — THE EMPTY STATE MAY NOT SEND A HOST OUT OF THE ROOM THEY OPENED IT FROM. Shipped, the host's
// empty arm led with an emphasised "Start a new chat" — which closes this modal AND abandons the room
// being configured — while the only action the surface can complete, "Save this room's roster", sat below as a
// dim ghost with nothing saying a name enables it (side-eye 2026-08-30 §Taste: "the hierarchy is
// inverted"). The two halves are pinned together because either alone leaves the inversion standing.
test("#848: a HOST's empty library offers no room-abandoning CTA, and says why Save is dim", async ({ mount, page }) => {
  await routeTrpc(page, {
    "rosterPreset.list": [],
    "chat.getChat": HOST_CHAT,
    "automation.listRules": [],
    "automation.listRulePresets": [PACING_PRESET],
  });

  await mount(<RosterPickerHostStory />);

  await expect(page.getByText("No saved rosters yet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start a new chat" })).toHaveCount(0);
  // The dim Save now carries its reason, and the reason CLEARS the moment the condition does.
  await expect(page.getByRole("button", { name: "Save this room's roster" })).toBeDisabled();
  await expect(page.getByText("Name this roster to save it.")).toBeVisible();
  await page.getByRole("textbox", { name: "New roster name" }).fill("Fresh roster");
  await expect(page.getByText("Name this roster to save it.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save this room's roster" })).toBeEnabled();
});

test("delete rides the ConfirmDialog and fires the REAL remove wire call with the row's presetId", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "rosterPreset.list": [ROSTER_A],
    "rosterPreset.remove": {},
    "automation.listRulePresets": [PACING_PRESET],
    "automation.listRules": [],
  });

  await mount(<RosterPickerStory />);

  await page.getByRole("button", { name: "Delete Adventuring Roster" }).click();
  // The confirm ceremony — a destructive action never fires off the row click alone. The dialog's
  // visibility is the settled barrier; the zero read is retrying-form for the oneshot gate, and the
  // ==1 transition below is what gives it teeth (a fired-early remove can never come back to 0).
  await expect(page.getByText("Delete this roster?")).toBeVisible();
  await expect.poll(() => trpc.count("rosterPreset.remove")).toBe(0);
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  await expect.poll(() => trpc.count("rosterPreset.remove")).toBe(1);
  await expect.poll(() => trpc.lastInput("rosterPreset.remove")).toEqual({ presetId: "roster_preset_ct_a" });
});

// ── #810 — the row's geometry across the WIDTH RANGE (side-eye P1-1) ─────────────────────────────────
// 316px is the row's real width inside the 430×932 coarse dialog, where the measured defect was: roster name
// `clientWidth` 0 (natural 57), the rules badge overlapping Start by 48px, and `elementFromPoint` at the
// badge's own centre returning Start's `<svg>` — a tap on "2 rules" mints a room. 480 is the desktop
// dialog and 768 the tablet arm: a point measurement never proves a range property, so the widths run as
// a matrix — and under BOTH pointers, because the defect is a coarse-pointer property: the touch floor is
// an unbudgeted WIDTH tax (`hasTouch` flips `matchMedia("(pointer: coarse)")` in chromium, which is what
// grows the action cluster), and at a fine pointer the identical 316px row fits.
// The geometry mount is the HOSTED room, which is where the defect lives and where a host meets it: the
// picker is reached from the room's Members toolbar, so the row carries THREE actions (Start · Add to this
// chat · Delete), not the library plane's two.
const GEOMETRY_ROUTES = {
  "rosterPreset.list": [ROSTER_A, ROSTER_B],
  "chat.getChat": HOST_CHAT,
  "automation.listRules": [ROOM_RULE],
  "automation.listRulePresets": [PACING_PRESET],
};

async function expectRowIsLegible(page: import("@playwright/test").Page): Promise<void> {
  const name = page.getByText("Adventuring Roster");
  await expect(name).toBeVisible();
  // TRUNCATED-TO-NOTHING: a label that exists in the DOM at 0px is invisible to the user, and neither
  // `design-audit --mobile` nor `--expect-no-overflow` reports it (the collision is INSIDE the dialog).
  // Polled, not sampled: layout settles across frames (fonts, the ResizeObserver behind the container query).
  await expect.poll(() => name.evaluate((el) => el.clientWidth)).toBeGreaterThan(0);

  const badge = page.getByText("2 rules");
  const start = page.getByRole("button", { name: /^Start a chat with Adventuring Roster/ });
  // The rects' worst-axis overlap: ≤ 0 means they do not intersect. A missing box (not laid out yet) reads
  // as maximally overlapping so the poll keeps waiting rather than passing on an absence.
  await expect
    .poll(async () => {
      const badgeBox = await badge.boundingBox();
      const startBox = await start.boundingBox();
      if (badgeBox === null || startBox === null) {
        return Number.POSITIVE_INFINITY;
      }
      const overlapX = Math.min(badgeBox.x + badgeBox.width, startBox.x + startBox.width) - Math.max(badgeBox.x, startBox.x);
      const overlapY = Math.min(badgeBox.y + badgeBox.height, startBox.y + startBox.height) - Math.max(badgeBox.y, startBox.y);
      return Math.min(overlapX, overlapY);
    })
    .toBeLessThanOrEqual(0);

  // The MIS-TAP signature: a rect check alone cannot see who wins the hit test.
  await expect
    .poll(async () => {
      const badgeBox = await badge.boundingBox();
      if (badgeBox === null) {
        return "no-box";
      }
      return page.evaluate(
        ({ x, y }) => {
          const el = document.elementFromPoint(x, y);
          return el === null ? "none" : (el.closest("button")?.getAttribute("aria-label") ?? "not-a-button");
        },
        { x: badgeBox.x + badgeBox.width / 2, y: badgeBox.y + badgeBox.height / 2 },
      );
    })
    .toBe("not-a-button");
}

test.describe("the roster row under a COARSE pointer (the phone arm)", () => {
  test.use({ hasTouch: true });

  test("the CT context reports a coarse pointer (the emulation's own positive control)", async ({ mount, page }) => {
    await routeTrpc(page, { "rosterPreset.list": [ROSTER_A], "automation.listRulePresets": [PACING_PRESET], "automation.listRules": [] });
    await mount(<RosterPickerStory width={316} />);

    // ONESHOT-OK: the pointer media is a browser-CONTEXT option (`hasTouch`) fixed before this page existed — not mutable async state.
    expect(await page.evaluate(() => globalThis.matchMedia("(pointer: coarse)").matches)).toBe(true);
  });

  for (const width of [316, 480]) {
    test(`keeps its name legible and its badges clear of the actions at ${width}px`, async ({ mount, page }) => {
      await routeTrpc(page, GEOMETRY_ROUTES);

      await mount(<RosterPickerHostStory width={width} />);

      // The settled barrier before any geometry read (a same-tick read of an unpainted row is a false
      // negative by construction); the width matrix's real assertions are in the helper.
      await expect(page.getByRole("button", { name: /^Add Adventuring Roster to this chat/ })).toBeVisible();
      await expectRowIsLegible(page);
    });
  }
});

for (const width of [316, 480, 768]) {
  test(`the roster row keeps its name legible and its badges clear of the actions at ${width}px (fine pointer)`, async ({ mount, page }) => {
    await routeTrpc(page, GEOMETRY_ROUTES);

    await mount(<RosterPickerHostStory width={width} />);

    // The settled barrier before any geometry read; the matrix's real assertions are in the helper.
    await expect(page.getByRole("button", { name: /^Add Adventuring Roster to this chat/ })).toBeVisible();
    await expectRowIsLegible(page);
  });
}

// ── #812 P2-1 — both counts ride the row controls' ACCESSIBLE NAMES ──────────────────────────────────
test("the row's apply doors announce the member and rule counts; a rules-free roster says only its members", async ({ mount, page }) => {
  await routeTrpc(page, { "rosterPreset.list": [ROSTER_A, ROSTER_B], "automation.listRulePresets": [PACING_PRESET], "automation.listRules": [] });

  await mount(<RosterPickerStory />);

  // #1032 adds the THIRD carried thing: ROSTER_A has `hasGroupConfig: true`, so its apply also rewrites the
  // room's reply mode / speaker labels / card visibility, and the door that does it now says so. ROSTER_B
  // carries neither rules nor group config and still announces only its members.
  await expect(page.getByRole("button", { name: "Start a chat with Adventuring Roster — 2 members, 2 rules, group behavior", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start a chat with Book Club — 1 member", exact: true })).toBeVisible();
  // Delete stays a bare name: the counts inform CONSENT at the apply doors, not the destructive one.
  await expect(page.getByRole("button", { name: "Delete Adventuring Roster", exact: true })).toBeVisible();
});

// #1032 — the badge half of the same fact. A `<span>` badge carries no accessible name, which is exactly
// why the fact ALSO rides the door names above; this pins that the visual signal exists and is per-row.
test("the group-behavior badge shows on the roster that carries one, and only on that roster", async ({ mount, page }) => {
  await routeTrpc(page, { "rosterPreset.list": [ROSTER_A, ROSTER_B], "automation.listRulePresets": [PACING_PRESET], "automation.listRules": [] });

  await mount(<RosterPickerStory />);

  const rows = page.locator('[data-slot="roster-row"]');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("group behavior");
  await expect(rows.nth(1)).toContainText("Book Club");
  await expect(rows.nth(1)).not.toContainText("group behavior");
});

// ── #811 — the Start door REPORTS, and the started room takes the roster's name (#813 P3-4) ────────────
test("Start reports the rules it switched on plus each skipped rule's REASON, and names the room after the roster", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "rosterPreset.list": [ROSTER_A],
    "automation.listRulePresets": [PACING_PRESET],
    "automation.listRules": [],
    "chat.startChat": { chat: { ...HOST_CHAT, id: "chat_started_ct" } },
    "rosterPreset.applyToChat": applyResult({
      added: ["character_ct_1", "character_ct_2"],
      rulesMinted: ["pacingNudge"],
      rulesSkipped: [{ rulePresetId: "loreAutoAdd", reason: "this chat has no world book attached" }],
    }),
  });

  await mount(<RosterPickerStory />);
  await page.getByRole("button", { name: /^Start a chat with Adventuring Roster/ }).click();

  const notice = page.getByTestId("cbcf-notice");
  await expect(notice).toContainText("Adventuring Roster:");
  await expect(notice).toContainText("1 rule on");
  // The build record §6.4 law: a skipped rule is reported WITH its reason, not as a count.
  await expect(notice).toContainText("this chat has no world book attached");
  await expect.poll(() => trpc.lastInput("chat.startChat")).toMatchObject({ title: "Adventuring Roster" });
});

test("the add-to-chat door reports an idempotent re-apply without a leading 'Added 0'", async ({ mount, page }) => {
  await routeTrpc(page, {
    "rosterPreset.list": [ROSTER_A],
    "chat.getChat": HOST_CHAT,
    "automation.listRules": [ROOM_RULE],
    "automation.listRulePresets": [PACING_PRESET],
    "rosterPreset.applyToChat": applyResult({ alreadyPresent: ["character_ct_1", "character_ct_2"], rulesAlreadyPresent: ["pacingNudge"] }),
  });

  await mount(<RosterPickerHostStory />);
  await page.getByRole("button", { name: /^Add Adventuring Roster to this chat/ }).click();

  const notice = page.getByTestId("cbcf-notice");
  await expect(notice).toHaveText("Adventuring Roster: everything is already here · 1 rule on");
});

// ── #812 P2-2/P2-3 — the include-line's four arms ────────────────────────────────────────────────────
test("the include-line names each rule WITH its resolved knobs", async ({ mount, page }) => {
  await routeTrpc(page, {
    "rosterPreset.list": [ROSTER_A],
    "chat.getChat": HOST_CHAT,
    "automation.listRules": [ROOM_RULE],
    "automation.listRulePresets": [PACING_PRESET],
  });

  await mount(<RosterPickerHostStory />);

  const include = page.locator("[data-slot=roster-rules-include]");
  await expect(include).toContainText("Includes 1 enabled rule:");
  await expect(include).toContainText("Periodic pacing nudge");
  // The knob bag is the entire reason the rider stores more than an id: two rosters carrying this preset at
  // `everyN: 8` and `everyN: 12` rendered byte-identically before this.
  await expect(include).toContainText("Every N beats: 12");
});

test("a room with no enabled rules says so instead of rendering nothing", async ({ mount, page }) => {
  await routeTrpc(page, {
    "rosterPreset.list": [ROSTER_A],
    "chat.getChat": HOST_CHAT,
    "automation.listRules": [],
    "automation.listRulePresets": [PACING_PRESET],
  });

  await mount(<RosterPickerHostStory />);

  await expect(page.getByText("No enabled rules to include.")).toBeVisible();
  // The name is FILLED first, so the enabled/disabled reads below are about the CAPTURE and not about an
  // empty input (which disables Save for its own reason and would make both arms pass vacuously).
  await page.getByRole("textbox", { name: "New roster name" }).fill("Fresh roster");
  await expect(page.getByRole("button", { name: "Save this room's roster" })).toBeEnabled();
});

test("the capture's LOADING arm says it is checking, and Save waits", async ({ mount, page }) => {
  const hold = trpcHold();
  await routeTrpc(page, {
    "rosterPreset.list": [ROSTER_A],
    "chat.getChat": HOST_CHAT,
    "automation.listRules": hold,
    "automation.listRulePresets": [PACING_PRESET],
  });

  await mount(<RosterPickerHostStory />);
  await hold.requested;

  // A held request is an indefinitely STABLE pending state — not a flash.
  await expect(page.getByText("Checking this room's rules…")).toBeVisible();
  // Named first, so Save being disabled can only be the capture (an empty name disables it anyway).
  await page.getByRole("textbox", { name: "New roster name" }).fill("Fresh roster");
  await expect(page.getByRole("button", { name: "Save this room's roster" })).toBeDisabled();

  hold.release([]);
  await expect(page.getByText("No enabled rules to include.")).toBeVisible();
});

test("a FAILED capture says so and offers a retry, instead of disabling Save forever in silence", async ({ mount, page }) => {
  let attempts = 0;
  const trpc = await routeTrpc(page, {
    "rosterPreset.list": [ROSTER_A],
    "chat.getChat": HOST_CHAT,
    "automation.listRules": () => (attempts++ === 0 ? trpcError({ message: "scripted listRules failure" }) : []),
    "automation.listRulePresets": [PACING_PRESET],
  });

  await mount(<RosterPickerHostStory />);

  await expect(page.getByText("Couldn't check this room's rules.")).toBeVisible();
  await page.getByRole("button", { name: "Retry", exact: true }).click();

  // The retry's proof is the room's SETTLED zero arm — the same read, asked AGAIN and answered. Two calls
  // exactly: the CT QueryClient runs `retry: false`, so nothing but this click can produce the second.
  await expect(page.getByText("No enabled rules to include.")).toBeVisible();
  await expect.poll(() => trpc.count("automation.listRules")).toBe(2);
});
