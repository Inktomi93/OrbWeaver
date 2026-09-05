// CT: the Members panel (members-panel.tsx + member-row-menu.tsx — the §7.1 Roster+People merge and
// its BINDING row-interaction contract). Tested as the PURE source-agnostic component it is (fixed
// rows in, actions observed via the `members-last-action` readout). Proves:
//   • the two sections in ONE list (People above Characters) with the identity+state accessible names
//     ("Riley — host, you" · "Bryn — character, muted") and the state chips (Host/you/Nominated/Muted);
//   • the roving tabindex: ONE tab stop, ArrowUp/Down cross the People→Characters boundary, Home/End,
//     typeahead-by-name;
//   • the per-row Menu as the canonical action home (Enter opens; items fire the callbacks; the
//     destructive Kick sits behind an AlertDialog);
//   • post-destructive focus: after a kick's bus echo removes the row, focus lands on a neighbor
//     (never `body`);
//   • the talkativeness popover (labeled slider, commit-on-release, prop re-seed / failed-write
//     snap-back via the weight chip);
//   • authority mirroring: a member view exposes only View character; the draft case drops force-turn.

import { expect, test } from "@playwright/experimental-ct-react";
import { MembersKickFocusStory, MembersPanelStory, MembersReseedStory } from "../_ct-stories.tsx";

const LAST_ACTION = '[data-testid="members-last-action"]';
const HANDOFF_RE = /Hand off host…/u;
const KICK_RE = /Kick…/u;
const REMOVE_ARIA_RE = /Remove Aria from chat/u;
// The chip's name carries the visible word "talks" (WCAG 2.5.3 — UI-Primitives-and-Reuse §13.10); the
// stable `Talkativeness: <who>` identity still LEADS, which is why every other lookup here is unaffected.
// #490 dropped the PERCENT SIGN: the value is a relative sampling weight (`select-speakers.ts`), not a
// share, and three seats at "50%" summed to 150 in the panel. The name still carries the visible word
// "talks" and the visible number; the unit it names is the dial, not a percentage.
const CHIP_50_RE = /Talkativeness: Aria — talks at level 50 of 100/u;
const CHIP_80_RE = /Talkativeness: Aria — talks at level 80 of 100/u;

test("People + Characters render in one list with identity+state accessible names and chips", async ({ mount }) => {
  const component = await mount(<MembersPanelStory withPeople={true} />);

  // People rows: viewer-host Riley ("you") + pending-nominated Kestrel.
  await expect(component.getByRole("button", { name: "Riley — host, you" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Kestrel — member, nominated as host" })).toBeVisible();
  await expect(component.getByText("Nominated", { exact: true })).toBeVisible();
  // Character rows: responding Aria (visual mark aria-hidden) + muted Bryn.
  await expect(component.getByRole("button", { name: "Aria — character" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Bryn — character, muted" })).toBeVisible();
  await expect(component.getByText("Muted", { exact: true })).toBeVisible();
  // The responding mark is aria-hidden (state rides the description, never aria-live).
  await expect(component.getByText("responding…")).toHaveAttribute("aria-hidden", "true");
});

test("roving tabindex: one tab stop; arrows cross the People→Characters boundary; Home/End; typeahead", async ({ mount, page }) => {
  const component = await mount(<MembersPanelStory withPeople={true} />);

  // Exactly ONE row body in the tab order.

  await expect(component.locator('[data-slot="member-row"] button[tabindex="0"]')).toHaveCount(1);

  // Walk: Riley → Kestrel → (boundary) → Aria.
  await component.getByRole("button", { name: "Riley — host, you" }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(component.getByRole("button", { name: "Kestrel — member, nominated as host" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(component.getByRole("button", { name: "Aria — character" })).toBeFocused();

  // End → the last row; Home → the first.
  await page.keyboard.press("End");
  await expect(component.getByRole("button", { name: "Bryn — character, muted" })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(component.getByRole("button", { name: "Riley — host, you" })).toBeFocused();

  // Typeahead-by-name: "k" jumps to Kestrel.
  await page.keyboard.press("k");
  await expect(component.getByRole("button", { name: "Kestrel — member, nominated as host" })).toBeFocused();
});

// ── #208: the roving composite is ANNOUNCED, and its trailing controls answer to a key ─────────────────
// The defect these pin, measured live on 2026-08-18 by Tab-walking the open context panel: Tab reached the
// first PERSON row and then left the panel — the CHARACTER_SECTION rows were reachable only by ArrowDown, which nothing
// in the DOM advertised (the list carried no container role at all). And the per-row trailing controls (the
// ⋯ menu shortcut, the inline mute/force-turn, the talkativeness chip) are `tabIndex={-1}` siblings with no
// arrow handler, so they answered to a POINTER ONLY. Both assert through user-visible affordances (roles,
// accessible names, focus) so they red on the pre-fix source rather than failing to compile against it.

test("#208: the roster announces as a vertical toolbar, with People and Characters as named groups", async ({ mount }) => {
  const component = await mount(<MembersPanelStory withPeople={true} />);

  const toolbar = component.getByRole("toolbar", { name: "Members and characters" });
  await expect(toolbar).toBeVisible();
  await expect(toolbar).toHaveAttribute("aria-orientation", "vertical");
  // Each section's group NAME is its own on-screen kicker — no second copy of the word to drift.
  await expect(component.getByRole("group", { name: "People" })).toBeVisible();
  await expect(component.getByRole("group", { name: "Characters" })).toBeVisible();
  // The rows are still the ONE roving tab stop (§7.1 unchanged — the mechanism was right, the silence was not).
  await expect(component.locator('[data-slot="member-row"] button[tabindex="0"]')).toHaveCount(1);
});

test("#208: ArrowRight/ArrowLeft reach a character row's trailing controls and clamp at both ends", async ({ mount, page }) => {
  const component = await mount(<MembersPanelStory />);
  const row = component.getByRole("button", { name: "Aria — character" });

  await row.focus();
  // Rightward: the inline mute, then force-turn — the fine-pointer shortcuts that were pointer-only.
  await page.keyboard.press("ArrowRight");
  await expect(component.getByRole("button", { name: "Mute Aria" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(component.getByRole("button", { name: "Make Aria speak next" })).toBeFocused();
  // …then the talkativeness chip, then the ⋯ shortcut into the canonical Menu — the row's last control.
  // Press past it and focus CLAMPS inside the row (crossing rows is ArrowUp/Down's job, §7.1). Home/End
  // are deliberately NOT used here: they belong to the vertical arm (first/last ROW).
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  const kebab = component.getByRole("button", { name: "Actions for Aria" });
  await expect(kebab).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(kebab).toBeFocused();

  // Leftward walks all the way back to the row body, and clamps there.
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(row).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(row).toBeFocused();
});

test("Enter opens the per-row Menu (the canonical action home); Mute fires the callback", async ({ mount, page }) => {
  const component = await mount(<MembersPanelStory />);

  await component.getByRole("button", { name: "Aria — character" }).focus();
  await page.keyboard.press("Enter");

  // The menu carries ALL the row's actions (portal → page locator).
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "Mute Aria" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Talkativeness…" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Make Aria speak next" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "View character" })).toBeVisible();

  await menu.getByRole("menuitem", { name: "Mute Aria" }).click();
  await expect(component.locator(LAST_ACTION)).toHaveText("disabled:character_aria:true");
});

test("Remove from chat sits LAST on a character row and dispatches with the character id (host)", async ({ mount, page }) => {
  const component = await mount(<MembersPanelStory />);

  await component.getByRole("button", { name: "Aria — character" }).focus();
  await page.keyboard.press("Enter");

  const menu = page.getByRole("menu");
  const remove = menu.getByRole("menuitem", { name: "Remove Aria from chat" });
  await expect(remove).toBeVisible();
  // Destructive row LAST (the symmetric drop for the character-bar add).
  await expect(menu.getByRole("menuitem").last()).toHaveText(REMOVE_ARIA_RE);

  // Reversible (leftSeq-stamp) → a direct action, no AlertDialog; the seam fires with the exact id
  // the real tab hands to `chat.removeCharacterFromChat({ chatId, characterId })`.
  await remove.click();
  await expect(component.locator(LAST_ACTION)).toHaveText("remove:character_aria");
});

test("a MEMBER view has no Remove from chat item on a character row (host-only seam absent, §8.1)", async ({ mount, page }) => {
  const component = await mount(<MembersPanelStory memberView={true} />);

  await component.getByRole("button", { name: "Aria — character" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "View character" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Remove Aria from chat" })).toHaveCount(0);
});

test("force-turn stays enabled for a MUTED member (#29) and the draft case drops it", async ({ mount, page }) => {
  const component = await mount(<MembersPanelStory />);

  await component.getByRole("button", { name: "Bryn — character, muted" }).focus();
  await page.keyboard.press("Enter");
  const force = page.getByRole("menuitem", { name: "Make Bryn speak next" });
  await expect(force).toBeVisible(); // mute is passive arbitration exclusion — still summonable.
  await force.click();
  await expect(component.locator(LAST_ACTION)).toHaveText("force:character_bryn");
});

test("a DRAFT roster (no onForceTurn) has no force-turn menu item", async ({ mount, page }) => {
  const component = await mount(<MembersPanelStory omitForceTurn={true} />);

  await component.getByRole("button", { name: "Aria — character" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Mute Aria" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Make Aria speak next" })).toHaveCount(0);
});

test("Kick sits LAST behind an AlertDialog; confirm fires onKick", async ({ mount, page }) => {
  const component = await mount(<MembersPanelStory withPeople={true} />);

  await component.getByRole("button", { name: "Kestrel — member, nominated as host" }).focus();
  await page.keyboard.press("Enter");
  const items = page.getByRole("menuitem");
  // Hand off host… first, Kick… last (destructive rows sit last).
  await expect(items.first()).toHaveText(HANDOFF_RE);
  await expect(items.last()).toHaveText(KICK_RE);

  await items.last().click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Remove" }).click();
  await expect(component.locator(LAST_ACTION)).toHaveText("kick:user_kestrel");
});

// The D16 join-history toggle — the only write path into `chat_participants.joinHistoryVisibility`.
// Asserts the DISPATCH (userId + the target enum value), not a UI reaction: the panel is a pure component
// and the mutation's payload is what the server clamps on.
test("the join-history item dispatches the RESTRICT direction with the member's userId (host)", async ({ mount, page }) => {
  const component = await mount(<MembersPanelStory withPeople={true} />);

  await component.getByRole("button", { name: "Kestrel — member, nominated as host" }).focus();
  await page.keyboard.press("Enter");
  // Kestrel is at the `full` default, so the item offers the restriction (never a mode name).
  await page.getByRole("menuitem", { name: "Hide messages sent before Kestrel joined" }).click();
  await expect(component.locator(LAST_ACTION)).toHaveText("history:user_kestrel:from-join");
});

test("a RESTRICTED member shows the state chip + accessible-name suffix, and the item offers the RESTORE direction", async ({ mount, page }) => {
  const component = await mount(<MembersPanelStory withPeople={true} restrictedMember={true} />);

  const row = component.getByRole("button", { name: "Kestrel — member, nominated as host, limited history" });
  await expect(row).toBeVisible();
  await expect(component.getByText("Limited history")).toBeVisible();

  await row.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: "Let Kestrel read all earlier messages" }).click();
  await expect(component.locator(LAST_ACTION)).toHaveText("history:user_kestrel:full");
});

test("the host's OWN row carries no join-history item (you cannot clamp yourself) — only Leave", async ({ mount, page }) => {
  const component = await mount(<MembersPanelStory withPeople={true} />);

  await component.getByRole("button", { name: "Riley — host, you" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Hide messages sent before Riley joined" })).toHaveCount(0);
  await expect(page.getByRole("menuitem")).toHaveCount(1);
});

test("the viewer's own row carries Leave behind an AlertDialog with the sole-host archive copy", async ({ mount, page }) => {
  const component = await mount(<MembersPanelStory withPeople={true} />);

  await component.getByRole("button", { name: "Riley — host, you" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: "Leave chat…" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByText("You're the host — leaving archives this chat")).toBeVisible();
  await dialog.getByRole("button", { name: "Leave" }).click();
  await expect(component.locator(LAST_ACTION)).toHaveText("leave");
});

test("post-destructive focus: the bus echo removes the kicked row and focus lands on a neighbor", async ({ mount, page }) => {
  const component = await mount(<MembersKickFocusStory />);

  // Arm the removal intent through the REAL kick path (menu → AlertDialog → confirm)…
  await component.getByRole("button", { name: "Kestrel — member" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: "Kick…" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();

  // …then simulate the bus echo dropping the row (the verb is busDriven — the panel reacts to data).
  await component.getByTestId("remove-kestrel").click();

  // Focus lands on the row now at the removed index (Aria — the next row), never on `body`.
  await expect(component.getByRole("button", { name: "Aria — character" })).toBeFocused();
});

test("a MEMBER view exposes only View character on character rows and no menu on other humans", async ({ mount, page }) => {
  const component = await mount(<MembersPanelStory withPeople={true} memberView={true} />);

  // A character row's menu: only the cross-section View character remains (host controls absent — §8.1).
  await component.getByRole("button", { name: "Aria — character" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "View character" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Mute Aria" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Another human's row: no actions ⇒ no menu popup at all.
  await component.getByRole("button", { name: "Kestrel — host" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toHaveCount(0);

  // No inline mute/force cluster anywhere (host-only callbacks are absent).
  await expect(component.getByRole("button", { name: "Mute Aria" })).toHaveCount(0);
});

test("the People header 'Invite people' action fires (host)", async ({ mount }) => {
  const component = await mount(<MembersPanelStory withPeople={true} />);

  await component.getByRole("button", { name: "Invite people" }).click();
  await expect(component.locator(LAST_ACTION)).toHaveText("invite");
});

// ── #162: the roster is BOTH member kinds, and it never renders a login handle ──────────────────────────
//
// Owner, live on an AUTH_MODE=oidc install (2026-08-17): "Chat Members lost detail/function … now it just
// shows my email and invite people only shows a way to invite other humans when its supposed to be a shared
// feature to add more characters or add people into it."

test("a human row renders IDENTITY ONLY — no login handle beside the name", async ({ mount }) => {
  const component = await mount(<MembersPanelStory withPeople={true} />);
  const people = component.locator('[data-slot="members-people"]');

  await expect(people.getByRole("button", { name: "Riley — host, you" })).toBeVisible();
  // The row body used to append ` · ${handle}` — a raw login handle, an EMAIL under OIDC. The projection no
  // longer even carries one, so the People section's whole text is names + state chips.
  await expect(people).not.toContainText("·");
  await expect(people).not.toContainText("@");
});

test("a SOLO-character room still renders its Characters section (the >=2 floor hid the whole roster)", async ({ mount }) => {
  const component = await mount(<MembersPanelStory soloCharacters={true} />);

  await expect(component.locator('[data-slot="members-characters"]')).toBeVisible();
  await expect(component.getByRole("button", { name: "Aria — character" })).toBeVisible();
});

test("the Characters header carries the ADD-CHARACTER door — the roster's other add arm", async ({ mount }) => {
  const component = await mount(<MembersPanelStory soloCharacters={true} withAddCharacter={true} />);
  const characterSection = component.locator('[data-slot="members-characters"]');

  await characterSection.getByRole("button", { name: "Add a character" }).click();
  await expect(component.locator(LAST_ACTION)).toHaveText("add-character");
});

test("with no characters the section survives for its add door and states the empty room honestly", async ({ mount }) => {
  const component = await mount(<MembersPanelStory emptyCharacters={true} withAddCharacter={true} />);
  const characterSection = component.locator('[data-slot="members-characters"]');

  await expect(characterSection).toContainText("No characters in this chat yet");
  await expect(characterSection.getByRole("button", { name: "Add a character" })).toBeVisible();
});

test("a viewer with no add door and no characters sees no Characters section at all", async ({ mount }) => {
  const component = await mount(<MembersPanelStory emptyCharacters={true} />);
  await expect(component.locator('[data-slot="members-characters"]')).toHaveCount(0);
});

test("Talkativeness… opens the anchored popover; the slider commits on release", async ({ mount, page }) => {
  const component = await mount(<MembersPanelStory />);

  await component.getByRole("button", { name: "Aria — character" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: "Talkativeness…" }).click();

  const thumb = page.getByRole("slider", { name: "Talkativeness: Aria" });
  await expect(thumb).toBeVisible();
  await thumb.focus();
  await thumb.press("ArrowRight");
  await expect(component.locator(LAST_ACTION)).toContainText("talkativeness:character_aria:");
});

test("the weight chip RE-SEEDS from the prop on a value-only change (bus/other-device echo)", async ({ mount }) => {
  const component = await mount(<MembersReseedStory />);
  const chip = component.getByRole("button", { name: CHIP_50_RE });
  // The chip is a labeled value (CP-1 ride-along): the "Talks" label names WHAT the number is; the dial
  // level stays the glance readout. `toContainText` tolerates the label + the mono span split. #490 took
  // the PERCENT SIGN off that readout — the value is a relative sampling weight, not a share, and three
  // seats reading "50%" summed to 150 — so the visible text is the bare level.
  await expect(chip).toContainText("50");

  // A value-only prop change (the row's key is unchanged, so React never remounts it).
  await component.getByTestId("bump-aria").click();
  await expect(component.getByRole("button", { name: CHIP_80_RE })).toContainText("80");
});

test("the popover thumb SNAPS BACK to the prop after a failed write (no stale local value)", async ({ mount, page }) => {
  const component = await mount(<MembersReseedStory />);

  await component.getByRole("button", { name: CHIP_50_RE }).click();
  const thumb = page.getByRole("slider", { name: "Talkativeness: Aria" });
  await thumb.focus();
  // Commit is a NO-OP (busDriven/failed write) → on release the thumb falls back to the prop.
  await thumb.press("ArrowRight");
  await expect(thumb).toHaveAttribute("aria-valuenow", "0.5");
});

test.describe("coarse pointer", () => {
  test.use({ hasTouch: true, viewport: { width: 420, height: 800 } });

  test("the inline shortcut cluster never renders at a coarse pointer (row tap opens the Menu)", async ({ mount, page }) => {
    const component = await mount(<MembersPanelStory />);
    const row = component.getByRole("button", { name: "Aria — character" });

    // Hover cannot reveal the fine-pointer cluster on a touch context; the inline Mute stays hidden.
    await row.hover();
    await expect(component.getByRole("button", { name: "Mute Aria" })).toBeHidden();

    // Row tap = the Menu (the ≥44px touch path).
    await row.tap();
    await expect(page.getByRole("menuitem", { name: "Mute Aria" })).toBeVisible();
  });
});

// The reveal is PAINT-only (`ROW_REVEAL`): the cluster holds its box at rest and fades in, so the row's
// geometry is identical hovered and un-hovered. A `hidden` → `flex` swap here was the hit-test OSCILLATOR
// class (packages/client/src/components/row-reveal.ts; gate `no-hover-display-swap`) — layout entering under
// a stationary pointer re-hit-tests the row at frame rate. So rest-state is asserted as opacity, not as
// Playwright visibility.
test("the fine-pointer inline cluster reveals on hover (paint-only) and duplicates the Menu items' labels", async ({ mount }) => {
  const component = await mount(<MembersPanelStory />);
  const inlineMute = component.getByRole("button", { name: "Mute Aria" });
  const row = component.getByRole("button", { name: "Aria — character" });
  // ROW_REVEAL paints the CLUSTER (the button's wrapper Row), not each control.
  const cluster = inlineMute.locator("xpath=..");

  await expect(cluster).toHaveCSS("opacity", "0"); // unpainted at rest (progressive disclosure, §4.3 rule 4)
  const restBox = await row.boundingBox();
  await row.hover();
  await expect(cluster).toHaveCSS("opacity", "1");
  // THE LAW: the row's geometry is byte-identical rest ⇄ hovered — nothing enters or leaves layout.
  await expect.poll(() => row.boundingBox()).toEqual(restBox);
  await inlineMute.click();
  await expect(component.locator(LAST_ACTION)).toHaveText("disabled:character_aria:true");
});

// ── HOST HANDOFF × THE PROPERTY OFFER (stickler 2026-08-03 §5) ──────────────────────────────────────────
// Handing off the room is irreversible from the departing host's side and may hand over COPIES of their
// characters and worldbooks, so it confirms — the menu label has always ended in "…" and now tells the truth.
// The three arms below are the whole contract of the affordance: the offer DEFAULTS OFF (an unchanged box
// reproduces the built D64 drop exactly), a checked box reaches the wire, and dismissing does neither.

const OFFER_RE = /also give copies of your characters/iu;

test("Hand off host… opens a confirm whose offer DEFAULTS OFF — confirming gives nothing", async ({ mount, page }) => {
  const component = await mount(<MembersPanelStory withPeople={true} />);

  await component.getByRole("button", { name: "Kestrel — member, nominated as host" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: HANDOFF_RE }).click();

  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  const offer = dialog.getByRole("checkbox", { name: OFFER_RE });
  await expect(offer).not.toBeChecked();

  await dialog.getByRole("button", { name: "Hand off" }).click();
  await expect(component.locator(LAST_ACTION)).toHaveText("nominate:user_kestrel:characters=false:preset=false");
});

test("checking the offer reaches the wire (both classes ride the one opt-in)", async ({ mount, page }) => {
  const component = await mount(<MembersPanelStory withPeople={true} />);

  await component.getByRole("button", { name: "Kestrel — member, nominated as host" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: HANDOFF_RE }).click();

  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("checkbox", { name: OFFER_RE }).click();
  await dialog.getByRole("button", { name: "Hand off" }).click();

  await expect(component.locator(LAST_ACTION)).toHaveText("nominate:user_kestrel:characters=true:preset=true");
});

test("dismissing the confirm nominates NOBODY and forgets the box (a checked-then-cancelled offer cannot leak)", async ({ mount, page }) => {
  const component = await mount(<MembersPanelStory withPeople={true} />);
  const row = component.getByRole("button", { name: "Kestrel — member, nominated as host" });

  await row.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: HANDOFF_RE }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("checkbox", { name: OFFER_RE }).click();
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await expect(component.locator(LAST_ACTION)).toHaveText("");

  // Re-opening starts from give-nothing again — a dismissed decision must not lie in wait.
  await row.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: HANDOFF_RE }).click();
  await expect(page.getByRole("alertdialog").getByRole("checkbox", { name: OFFER_RE })).not.toBeChecked();
});

// ── #1039: the roster PRESENCE dot ─────────────────────────────────────────────────────────────────────
//
// The presence read is a new DISCLOSURE surface, so the rendered half owes three things: the state reaches
// a screen reader as a WORD (the dot is aria-hidden decoration — an aria-label inside the row Button would
// be swallowed by the Button's own aria-label and announce nothing), the two states are distinguishable
// with COLOUR REMOVED, and UNKNOWN renders nothing at all rather than being drawn as offline.

const PRESENCE_DOT = '[data-slot="member-presence"]';

test("#1039: presence reaches AT as a WORD, and the dot itself is aria-hidden decoration", async ({ mount }) => {
  const component = await mount(<MembersPanelStory withPeople={true} presence="mixed" />);
  const people = component.locator('[data-slot="members-people"]');

  await expect(people.getByRole("button", { name: "Riley — host, you, online" })).toBeVisible();
  await expect(people.getByRole("button", { name: "Kestrel — member, nominated as host, offline" })).toBeVisible();
  // Two dots, both hidden from the a11y tree: the announcement is the row name, never the indicator.
  await expect(people.locator(PRESENCE_DOT)).toHaveCount(2);
  for (const dot of await people.locator(PRESENCE_DOT).all()) {
    await expect(dot).toHaveAttribute("aria-hidden", "true");
  }
});

test("#1039: the two states differ with COLOUR REMOVED — online is filled, offline is a hollow ring", async ({ mount }) => {
  const component = await mount(<MembersPanelStory withPeople={true} presence="mixed" />);

  // Read the SHAPE channel off the resolved styles, not the class string: a fill and a ring are the two
  // things a colour-blind reader can still tell apart, so that difference is what the pin is about.
  const shape = await component.locator(PRESENCE_DOT).evaluateAll((nodes) =>
    nodes.map((node) => {
      const style = globalThis.getComputedStyle(node);
      return {
        online: node.getAttribute("data-online"),
        filled: style.backgroundColor !== "rgba(0, 0, 0, 0)" && style.backgroundColor !== "transparent",
        ringed: Number.parseFloat(style.borderTopWidth) > 0 && style.borderTopStyle !== "none",
      };
    }),
  );

  expect(shape).toEqual([
    { online: "true", filled: true, ringed: false },
    { online: "false", filled: false, ringed: true },
  ]);
});

test("#1039: UNKNOWN presence renders NO dot and says NOTHING — a read that never landed is not 'offline'", async ({ mount }) => {
  // The default story leaves presence unresolved (`online: null`), which is what a surface that never asked,
  // an in-flight read, and a deployment that refuses the read all produce.
  const component = await mount(<MembersPanelStory withPeople={true} />);
  const people = component.locator('[data-slot="members-people"]');

  await expect(people.locator(PRESENCE_DOT)).toHaveCount(0);
  await expect(people.getByRole("button", { name: "Riley — host, you" })).toBeVisible();
  await expect(people).not.toContainText("offline");
});

test("#1039: the dot is a PEOPLE-row affordance — a character seat never grows one", async ({ mount }) => {
  const component = await mount(<MembersPanelStory withPeople={true} presence="mixed" />);

  await expect(component.locator('[data-slot="members-characters"]').locator(PRESENCE_DOT)).toHaveCount(0);
});
