// CT: the persona SWITCHER (#866 S4 — `PersonaPanelSurface`, both lenses). The rail slot carries only
// what travels with a switch (the frequency law): who-head · switch rows (with the inline pin) · the
// contextual in-chat block (bar lens, chat open) · the Manage door · the account foot (the retired
// `account` modal's facts + Log out, owner-ruled F-3). The list/editor/import/export moved to
// Config → Personas — `persona-list.ct.tsx` owns those pins now.
//
// The load-bearing wires proven here, red-first against the rebuilt surface:
//   · the SCOPE routes the switch: Everywhere ⇒ the seed pointer (`settings.updateUserSettingsSection`),
//     This chat ⇒ the per-participant slot (`persona.setActivePersona`) — two different verbs, one row.
//   · the contextual block exists ONLY while a chat room is open.
//   · re-attribute fires `chat.reattributePersona` with the server-resolved `{kind:"mine"}` scope.
//   · the sheet lens is the same grammar MINUS the contextual block, and carries none of the list's
//     management controls.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import type { TrpcFixtureOutput, TrpcRecorder, TrpcRoutes, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { PersonaEditDoorColdStory, PersonaEditDoorStory, PersonaSwitcherBarStory, PersonaYouSheetStory } from "../_ct-stories.tsx";

const NOVA = "persona_nova";
const ORION = "persona_orion";
const LYRA = "persona_lyra";
const CHAT_ID = castId<ChatId>("chat_switcher_ct");

// Orion leads the list on purpose: it is the popover's first tabbable row and is neither current,
// pinned nor hovered — the unrelated row the pin must not show on.
const PERSONAS: TrpcWireOutput<"persona.list"> = [
  { id: ORION, name: "Orion", title: null, description: "", starred: false, avatarAssetId: null, avatarHash: null, metadata: null, createdAt: 2, updatedAt: 2 },
  { id: NOVA, name: "Nova", title: null, description: "", starred: false, avatarAssetId: null, avatarHash: null, metadata: null, createdAt: 1, updatedAt: 1 },
  { id: LYRA, name: "Lyra", title: null, description: "", starred: false, avatarAssetId: null, avatarHash: null, metadata: null, createdAt: 3, updatedAt: 3 },
];

/** The viewer's solo room, playing Nova in-chat. Shaped as `chat.getChat` returns it (the
 *  persona-this-chat-section fixture's shape, title added — the contextual block renders it). */
const CHAT: TrpcFixtureOutput<"chat.getChat"> = {
  id: CHAT_ID,
  title: "The Ashen Spire",
  viewerUserId: "user_ct",
  viewerActivePersonaId: NOVA,
  anchorPersonaId: NOVA,
  viewerIsHost: true,
  participants: [],
  identities: PERSONAS.map((p) => ({ kind: "persona", id: p.id, name: p.name, description: "", avatarHash: null })),
};

const SEED_PROC = "settings.updateUserSettingsSection";
const ACTIVE_PROC = "persona.setActivePersona";
const RESTAMP_PROC = "chat.reattributePersona";

function stub(
  page: Page,
  extra?: Partial<
    TrpcRoutes<"chat.getChat" | "regex.countScripts" | "rosterPreset.count" | "sessions.me" | "settings.getAppSettingsWithOverrides" | "worldInfo.countBooks">
  >,
): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "persona.list": () => PERSONAS,
    "settings.getUserSettings": () => ({
      userId: "user_ct",
      schemaVersion: 1,
      config: { ...DEFAULT_USER_SETTINGS, seeds: { ...DEFAULT_USER_SETTINGS.seeds, currentPersonaId: NOVA, defaultPersonaId: NOVA } },
      updatedAt: 0,
      configUnreadable: null,
    }),
    "settings.updateUserSettingsSection": () => ({
      userId: "user_ct",
      schemaVersion: 1,
      config: { ...DEFAULT_USER_SETTINGS, seeds: { ...DEFAULT_USER_SETTINGS.seeds, currentPersonaId: NOVA, defaultPersonaId: NOVA } },
      updatedAt: 1,
      configUnreadable: null,
    }),
    // The three reads an expanded persona editor makes (the Edit door test opens one).
    "worldInfo.listBooks": () => [],
    "worldInfo.listForPersona": () => [],
    "persona.listConnectedCharacters": () => [],
    "persona.setActivePersona": () => undefined,
    "chat.reattributePersona": () => undefined,
    ...(extra ?? {}),
  });
}

/** The account foot's HTTP reads (they ride `page.route`, not the tRPC seam). */
async function stubAuth(page: Page, mode = "local"): Promise<void> {
  await page.route("**/api/auth/config", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        mode,
        requiresLogin: mode !== "single-user",
        localEnabled: mode === "local",
        oidcEnabled: mode === "oidc",
        discreetLogin: false,
        defaultHandle: "owner",
      }),
    }),
  );
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ authenticated: true, handle: "owner", role: "owner" }) }),
  );
}

/** Open the bar lens's popover (the rail avatar chip). */
async function openPopover(page: Page, playing = "Nova"): Promise<void> {
  await page.getByRole("button", { name: `Playing as ${playing}` }).click();
  await expect(page.getByRole("dialog", { name: "Account & personas" })).toBeVisible();
}

/** Choose an Applies scope through the select. */
async function pickScope(page: Page, label: string): Promise<void> {
  await page.getByRole("combobox", { name: "Where the next switch applies" }).click();
  await page.getByRole("option", { name: label, exact: true }).click();
}

// ── The SHEET lens ──────────────────────────────────────────────────────────────────────────────────

test("the sheet is the switcher grammar: who-head, switch rows with pins, account foot — no list chrome", async ({ mount, page }) => {
  await stub(page);
  await stubAuth(page);
  await mount(<PersonaYouSheetStory />);

  // The who-head names the current persona once; "pinned" is the pin's pressed state, not a second sentence.
  await expect(page.getByText("Playing as", { exact: true })).toHaveCount(1);
  // The switch rows: the current row is named for its state; the other carries the verb + the faint pin.
  await expect(page.getByRole("button", { name: "Nova — current persona" })).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("button", { name: "Switch to Orion", exact: true })).toBeAttached();
  await expect(page.getByRole("button", { name: "Pin Orion as your default", exact: true })).toBeAttached();
  await expect(page.getByRole("button", { name: DEFAULT_PIN_BUTTON, pressed: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Pin Orion as your default", exact: true, pressed: false })).toBeAttached();
  // The account foot carries the identity facts + Log out (the retired modal's anatomy, F-3).
  await expect(page.getByTestId("account-surface")).toContainText("owner");
  await expect(page.getByTestId("account-logout")).toBeVisible();
  // NONE of the list's management chrome lives here any more (#866 S4 — it moved to Config → Personas).
  await expect(page.getByRole("button", { name: /^Rename / })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Actions for / })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New persona" })).toHaveCount(0);
  // …and no contextual block: a phone switch is the Everywhere mechanism (the board draws none).
  await expect(page.getByText("Applies")).toHaveCount(0);
});

test("a sheet switch writes the SEED pointer (Everywhere is the only sheet scope)", async ({ mount, page }) => {
  const trpc = await stub(page);
  await stubAuth(page);
  await mount(<PersonaYouSheetStory />);
  await page.getByRole("button", { name: "Switch to Orion", exact: true }).dispatchEvent("click");
  await expect.poll(() => trpc.lastInput(SEED_PROC), { intervals: [20, 50, 100] }).toMatchObject({ section: "seeds", patch: { currentPersonaId: ORION } });
  // @orb-waive ct-no-oneshot-live-read-assert(expect): settled — the seed write above already resolved
  expect(trpc.count(ACTIVE_PROC)).toBe(0);
});

test("the pin writes defaultPersonaId — and never the current pointer", async ({ mount, page }) => {
  const trpc = await stub(page);
  await stubAuth(page);
  await mount(<PersonaYouSheetStory />);
  await page.getByRole("button", { name: "Pin Orion as your default", exact: true }).dispatchEvent("click");
  await expect.poll(() => trpc.lastInput(SEED_PROC), { intervals: [20, 50, 100] }).toMatchObject({ section: "seeds", patch: { defaultPersonaId: ORION } });
});

// ── The BAR lens (the rail popover) ─────────────────────────────────────────────────────────────────

test("with NO chat open the popover renders the switcher without the contextual block", async ({ mount, page }) => {
  await stub(page);
  await stubAuth(page);
  await mount(<PersonaSwitcherBarStory />);
  await openPopover(page);

  await expect(page.getByRole("button", { name: "Switch to Orion", exact: true })).toBeAttached();
  await expect(page.getByRole("button", { name: "Manage personas in Settings" })).toBeVisible();
  // The contextual block is chat-scoped chrome — absent here, by derivation (useActiveChatId() === null).
  await expect(page.getByText("Applies")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Re-attribute / })).toHaveCount(0);
});

test("with a chat open the contextual block renders, and the DEFAULT scope moves the seat AND the global pointer", async ({ mount, page }) => {
  const trpc = await stub(page, { "chat.getChat": () => CHAT });
  await stubAuth(page);
  await mount(<PersonaSwitcherBarStory chatId={CHAT_ID} />);
  await openPopover(page);

  await expect(page.getByText("In The Ashen Spire")).toBeVisible();
  // Applies is a compact select with exactly the two scopes.
  const applies = page.getByRole("combobox", { name: "Where the next switch applies" });
  await expect(applies).toBeVisible();
  await applies.click();
  await expect(page.getByRole("option", { name: "Everywhere", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "This chat", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Switch to Orion", exact: true }).dispatchEvent("click");
  await expect.poll(() => trpc.lastInput(SEED_PROC), { intervals: [20, 50, 100] }).toMatchObject({ section: "seeds", patch: { currentPersonaId: ORION } });
  // Inside a room a switch always moves the seat too, so the chip, the head and the check follow it.
  await expect.poll(() => trpc.lastInput(ACTIVE_PROC), { intervals: [20, 50, 100] }).toMatchObject({ chatId: CHAT_ID, personaId: ORION });
});

test("flipping the scope to This chat routes the SAME row to persona.setActivePersona for THIS room", async ({ mount, page }) => {
  const trpc = await stub(page, { "chat.getChat": () => CHAT });
  await stubAuth(page);
  await mount(<PersonaSwitcherBarStory chatId={CHAT_ID} />);
  await openPopover(page);

  await pickScope(page, "This chat");
  await page.getByRole("button", { name: "Switch to Orion", exact: true }).dispatchEvent("click");
  await expect.poll(() => trpc.lastInput(ACTIVE_PROC), { intervals: [20, 50, 100] }).toMatchObject({ chatId: CHAT_ID, personaId: ORION });
  // @orb-waive ct-no-oneshot-live-read-assert(expect): settled — the setActivePersona write above already resolved
  expect(trpc.count(SEED_PROC)).toBe(0);
});

test("in a room the playing-as check marks the seat persona under either scope, not the global pointer", async ({ mount, page }) => {
  // The seed points at NOVA while the room's seat persona is ORION (a swap made in the room): the check
  // follows the seat — what preset text and the viewer's lines use — whatever Applies says.
  await stub(page, { "chat.getChat": () => ({ ...CHAT, viewerActivePersonaId: ORION }) });
  await stubAuth(page);
  await mount(<PersonaSwitcherBarStory chatId={CHAT_ID} />);
  // The rail chip names the seat persona too — one derivation for chip, head and check.
  await openPopover(page, "Orion");

  // Everywhere is the default scope.
  await expect(rowOf(page, "Orion").getByRole("img", { name: PLAYING, exact: true })).toBeVisible();
  await expect(rowOf(page, "Nova").getByRole("img", { name: PLAYING, exact: true })).toHaveCount(0);
  await pickScope(page, "This chat");
  await expect(rowOf(page, "Orion").getByRole("img", { name: PLAYING, exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: PLAYING, exact: true })).toHaveCount(1);
});

test("with Everywhere scope a switch still writes the seed pointer, even to the persona the room already plays", async ({ mount, page }) => {
  const trpc = await stub(page, { "chat.getChat": () => ({ ...CHAT, viewerActivePersonaId: ORION }) });
  await stubAuth(page);
  await mount(<PersonaSwitcherBarStory chatId={CHAT_ID} />);
  await openPopover(page, "Orion");
  await page.getByRole("button", { name: "Orion — current persona" }).dispatchEvent("click");
  await expect.poll(() => trpc.lastInput(SEED_PROC), { intervals: [20, 50, 100] }).toMatchObject({ section: "seeds", patch: { currentPersonaId: ORION } });
});

test("the restamp fires chat.reattributePersona with the server-resolved {kind:'mine'} scope and states its scope", async ({ mount, page }) => {
  const trpc = await stub(page, { "chat.getChat": () => CHAT });
  await stubAuth(page);
  await mount(<PersonaSwitcherBarStory chatId={CHAT_ID} />);
  await openPopover(page);

  const restamp = page.getByRole("button", { name: "Restamp my messages to this persona" });
  // The consequence is visible copy bound to the control, never hover-only.
  await expect(page.locator('[data-slot="restamp-scope"]')).toBeVisible();
  await expect(restamp).toHaveAccessibleDescription(/however far back/);
  await restamp.click();
  await expect
    .poll(() => trpc.lastInput(RESTAMP_PROC), { intervals: [20, 50, 100] })
    .toMatchObject({ chatId: CHAT_ID, scope: { kind: "mine" }, personaId: NOVA });
});

// ── The account foot's mode arms (ported from the retired account-surface.ct.tsx — same anatomy, new home) ──

test("the foot renders the viewer identity + Log out in a cookie mode (local)", async ({ mount, page }) => {
  await stub(page);
  await stubAuth(page, "local");
  await mount(<PersonaYouSheetStory />);
  const foot = page.getByTestId("account-surface");
  await expect(foot).toContainText("Signed in as owner");
  // Handle, role and mode coincide here, so neither badge adds anything.
  await expect(foot).not.toContainText("local");
  await expect(page.getByTestId("account-logout")).toBeVisible();
});

test("Log out reaches the bound document host after the CSRF-protected revoke", async ({ mount, page }) => {
  let csrfHeader: string | undefined;
  let navigations = 0;
  await stub(page);
  await stubAuth(page, "local");
  await page.route("**/api/auth/logout", (route) => {
    csrfHeader = route.request().headers()["x-orb-csrf"];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ endSessionUrl: "/signed-out" }) });
  });
  await page.route(
    (url) => url.pathname === "/signed-out",
    (route) => {
      navigations += 1;
      return route.abort("aborted");
    },
  );
  await mount(<PersonaYouSheetStory />);

  await page.getByTestId("account-logout").click();

  await expect.poll(() => navigations).toBe(1);
  expect(csrfHeader).toBe("1");
});

test("forward-header mode shows the proxy sign-out note instead of a Log out button (no cookie session)", async ({ mount, page }) => {
  await stub(page);
  await stubAuth(page, "forward-header");
  await mount(<PersonaYouSheetStory />);
  await expect(page.getByTestId("account-surface")).toBeVisible();
  await expect(page.getByTestId("account-logout")).toHaveCount(0);
  await expect(page.getByText("Sign out at your identity provider / reverse proxy.")).toBeVisible();
});

// ── Row affordances (the switcher rows) ─────────────────────────────────────────────────────────────

function pinOf(page: Page, name: string): Locator {
  return page.getByRole("button", { name, exact: true });
}

test("a row's pin shows only while THAT row is hovered or keyboard-focused; the pinned row's always shows", async ({ mount, page }) => {
  await stub(page, { "chat.getChat": () => CHAT });
  await stubAuth(page);
  await mount(<PersonaSwitcherBarStory chatId={CHAT_ID} />);
  await openPopover(page);
  const orion = pinOf(page, "Pin Orion as your default");
  const lyra = pinOf(page, "Pin Lyra as your default");

  // The pinned row (Nova) carries its state at rest; the unrelated rows carry nothing.
  await expect(page.getByRole("button", { name: DEFAULT_PIN_BUTTON, pressed: true })).toHaveCSS("opacity", "1");
  await page.mouse.move(0, 0);
  await expect(orion).toHaveCSS("opacity", "0");
  await expect(lyra).toHaveCSS("opacity", "0");

  // Hovering Lyra's row reveals Lyra's pin only.
  await page.getByRole("button", { name: "Switch to Lyra", exact: true }).hover();
  await expect(lyra).not.toHaveCSS("opacity", "0");
  await expect(orion).toHaveCSS("opacity", "0");

  // A mouse click leaves focus on the row without :focus-visible — the pin goes again once the pointer leaves.
  await page.getByRole("button", { name: "Switch to Orion", exact: true }).click();
  await page.mouse.move(0, 0);
  await expect(orion).toHaveCSS("opacity", "0");

  // Keyboard focus on a row is a legitimate reveal.
  await page.getByRole("button", { name: "Switch to Lyra", exact: true }).focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(lyra).not.toHaveCSS("opacity", "0");
});

test("hovering a persona's name leaves the name painted above the row's hover fill", async ({ mount, page }) => {
  await stub(page, { "chat.getChat": () => CHAT });
  await stubAuth(page);
  await mount(<PersonaSwitcherBarStory chatId={CHAT_ID} />);
  await openPopover(page);
  await page.getByRole("button", { name: "Switch to Orion", exact: true }).hover();
  // The name is pointer-transparent by design; lift that only to ask what is painted on top at its centre.
  const name = page.getByRole("dialog").getByText("Orion", { exact: true });
  await expect
    .poll(() =>
      name.evaluate((el: HTMLElement) => {
        el.style.pointerEvents = "auto";
        const box = el.getBoundingClientRect();
        return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === el;
      }),
    )
    .toBe(true);
});

test("no raw {{macro}} renders in the visible rows, even with a different persona pinned", async ({ mount, page }) => {
  // Orion plays while Nova is the pinned default — the old pinned pill read "pinned · {{user}}" on Nova's row.
  await routeTrpc(page, {
    "persona.list": () => PERSONAS,
    "settings.getUserSettings": () => ({
      userId: "user_ct",
      schemaVersion: 1,
      config: { ...DEFAULT_USER_SETTINGS, seeds: { ...DEFAULT_USER_SETTINGS.seeds, currentPersonaId: ORION, defaultPersonaId: NOVA } },
      updatedAt: 0,
      configUnreadable: null,
    }),
    "chat.getChat": () => ({ ...CHAT, viewerActivePersonaId: ORION }),
  });
  await stubAuth(page);
  await mount(<PersonaSwitcherBarStory chatId={CHAT_ID} />);
  await page.getByRole("button", { name: "Playing as Orion" }).click();
  await expect(page.getByRole("dialog", { name: "Account & personas" })).toBeVisible();
  // The pin's tooltip names {{user}} on purpose; its always-mounted description is not row text, so it is cut out.
  const visibleText = (): Promise<string> =>
    page.getByRole("dialog").evaluate((dialog) => {
      const copy = dialog.cloneNode(true) as HTMLElement;
      for (const hint of copy.querySelectorAll('[data-slot="tooltip-description"]')) {
        hint.remove();
      }
      return copy.textContent ?? "";
    });
  await expect.poll(visibleText).toContain("Nova");
  await expect.poll(visibleText).not.toContain("{{");
});

test("a row's Edit door closes the popover and lands in that persona's open, focused editor", async ({ mount, page }) => {
  await stub(page, { "chat.getChat": () => CHAT });
  await stubAuth(page);
  await mount(<PersonaEditDoorStory />);
  await page.getByRole("button", { name: "Playing as Nova" }).click();
  await expect(page.getByRole("dialog", { name: "Account & personas" })).toBeVisible();
  await page.getByRole("button", { name: "Edit Lyra", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Account & personas" })).toHaveCount(0);
  const editor = page.getByRole("group", { name: "Edit Lyra", exact: true });
  await expect(editor).toBeVisible();
  await expect(editor).toBeFocused();
});

// ── The three persona states, one marker each ───────────────────────────────────────────────────────

const ZARA = "persona_zara";
const PLAYING = "Playing as";
const CARD_PIN = "Card's persona in this chat";
const DEFAULT_PIN = "Pinned — your default persona";
// The pressed pin's BUTTON names its persona; the coarse marker (an image) keeps the plain state name above.
const DEFAULT_PIN_BUTTON = /is pinned as your default$/;

/** The switch row holding the control named `persona` (its stretched button is the row's direct child). */
function rowOf(page: Page, persona: string): Locator {
  return page.getByRole("button", { name: new RegExp(`^(Switch to ${persona}|${persona} — current persona)$`) }).locator("..");
}

test("after a swap the playing-as and card-pin markers sit on different rows, each state shown once", async ({ mount, page }) => {
  // Nova is the global default; the chat opened as Lyra (the anchor) and was swapped to Orion for this room.
  await stub(page, { "chat.getChat": () => ({ ...CHAT, viewerActivePersonaId: ORION, anchorPersonaId: LYRA }) });
  await stubAuth(page);
  await mount(<PersonaSwitcherBarStory chatId={CHAT_ID} />);
  await openPopover(page, "Orion");
  await pickScope(page, "This chat");

  await expect(rowOf(page, "Orion").getByRole("img", { name: PLAYING, exact: true })).toBeVisible();
  await expect(rowOf(page, "Lyra").getByRole("img", { name: CARD_PIN, exact: true })).toBeVisible();
  await expect(rowOf(page, "Nova").getByRole("button", { name: DEFAULT_PIN_BUTTON, pressed: true })).toBeVisible();
  // One marker per state across the whole list, and none doubled onto a row that does not own the state.
  await expect(page.getByRole("img", { name: PLAYING, exact: true })).toHaveCount(1);
  await expect(page.getByRole("img", { name: CARD_PIN, exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: DEFAULT_PIN_BUTTON, pressed: true })).toHaveCount(1);
  await expect(rowOf(page, "Orion").getByRole("img", { name: CARD_PIN, exact: true })).toHaveCount(0);
  // The anchor is on your own row, so there is no separate room line.
  await expect(page.getByText(/^Card sees you as/)).toHaveCount(0);
});

test("one persona can own playing-as and card-pin: both markers sit on that one row", async ({ mount, page }) => {
  await stub(page, { "chat.getChat": () => CHAT });
  await stubAuth(page);
  await mount(<PersonaSwitcherBarStory chatId={CHAT_ID} />);
  await openPopover(page);
  await pickScope(page, "This chat");
  const nova = rowOf(page, "Nova");
  await expect(nova.getByRole("img", { name: PLAYING, exact: true })).toBeVisible();
  await expect(nova.getByRole("img", { name: CARD_PIN, exact: true })).toBeVisible();
  await expect(nova.getByRole("button", { name: DEFAULT_PIN_BUTTON, pressed: true })).toBeVisible();
});

const ROOM: TrpcFixtureOutput<"chat.getChat"> = {
  ...CHAT,
  anchorPersonaId: ZARA,
  participants: [
    { kind: "human", userId: "user_ct", displayName: "You", activePersonaId: NOVA, leftSeq: null },
    { kind: "human", userId: "user_member", displayName: "Rowan", activePersonaId: ZARA, leftSeq: null },
  ],
  identities: [
    ...PERSONAS.map((p) => ({ kind: "persona" as const, id: p.id, name: p.name, description: "", avatarHash: null })),
    { kind: "persona", id: ZARA, name: "Zara", description: "", avatarHash: null },
  ],
};

test("a member's persona as the card pin gets a room line, no row marker, and Re-pin only for the host", async ({ mount, page }) => {
  await stub(page, { "chat.getChat": () => ROOM });
  await stubAuth(page);
  await mount(<PersonaSwitcherBarStory chatId={CHAT_ID} />);
  await openPopover(page);
  await expect(page.getByText("Card's persona: Zara (Rowan)")).toBeVisible();
  await expect(page.getByRole("img", { name: CARD_PIN, exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Re-pin" })).toBeVisible();
});

test("a non-host sees the card-pin room line but no Re-pin", async ({ mount, page }) => {
  await stub(page, { "chat.getChat": () => ({ ...ROOM, viewerIsHost: false }) });
  await stubAuth(page);
  await mount(<PersonaSwitcherBarStory chatId={CHAT_ID} />);
  await openPopover(page);
  await expect(page.getByText("Card's persona: Zara (Rowan)")).toBeVisible();
  await expect(page.getByRole("button", { name: "Re-pin" })).toHaveCount(0);
});

test("expanding a persona's editor with its chevron does not move focus", async ({ mount, page }) => {
  await stub(page, { "chat.getChat": () => CHAT });
  await stubAuth(page);
  await mount(<PersonaEditDoorStory />);
  const chevron = page.getByRole("button", { name: "Show details for Lyra", exact: true });
  await chevron.click();
  await expect(page.getByRole("group", { name: "Edit Lyra", exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "Edit Lyra", exact: true })).not.toBeFocused();
  await expect(page.getByRole("button", { name: "Hide details for Lyra", exact: true })).toBeFocused();
});

test("the check's seat binding tells whether preset text follows it: solo room yes, another member's anchor no", async ({ mount, page }) => {
  await stub(page, { "chat.getChat": () => ROOM });
  await stubAuth(page);
  await mount(<PersonaSwitcherBarStory chatId={CHAT_ID} />);
  await openPopover(page);
  // The anchor is Rowan's persona, so preset {{user}} follows Rowan's seat and this seat speaks only my lines.
  await expect(rowOf(page, "Nova").getByRole("img", { name: PLAYING, exact: true })).toHaveAttribute("data-seat-binds", "lines");
});

test("the check's seat binding in a solo room covers lines and preset text", async ({ mount, page }) => {
  await stub(page, { "chat.getChat": () => CHAT });
  await stubAuth(page);
  await mount(<PersonaSwitcherBarStory chatId={CHAT_ID} />);
  await openPopover(page);
  await expect(rowOf(page, "Nova").getByRole("img", { name: PLAYING, exact: true })).toHaveAttribute("data-seat-binds", "lines-and-presets");
});

test("in a room a switch to the persona the global pointer already names still moves the seat", async ({ mount, page }) => {
  // Room seat Orion, global pointer Nova, Everywhere scope: the Nova row is a live switch, never an inert one.
  const trpc = await stub(page, { "chat.getChat": () => ({ ...CHAT, viewerActivePersonaId: ORION }) });
  await stubAuth(page);
  await mount(<PersonaSwitcherBarStory chatId={CHAT_ID} />);
  await openPopover(page, "Orion");
  await expect(page.getByRole("button", { name: "Switch to Nova", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Switch to Nova", exact: true }).dispatchEvent("click");
  await expect.poll(() => trpc.lastInput(ACTIVE_PROC), { intervals: [20, 50, 100] }).toMatchObject({ chatId: CHAT_ID, personaId: NOVA });
  // @orb-waive ct-no-oneshot-live-read-assert(expect): settled — the seat write above already resolved
  expect(trpc.count(SEED_PROC)).toBe(0);
});

test("an empty room seat shows no persona as playing: head and chip say none, no check anywhere", async ({ mount, page }) => {
  await stub(page, { "chat.getChat": () => ({ ...CHAT, viewerActivePersonaId: null }) });
  await stubAuth(page);
  await mount(<PersonaSwitcherBarStory chatId={CHAT_ID} />);
  await page.getByRole("button", { name: "Account & personas", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Account & personas" })).toBeVisible();
  await expect(page.locator('[data-slot="persona-who-head"]')).not.toContainText("Nova");
  await expect(page.getByRole("img", { name: PLAYING, exact: true })).toHaveCount(0);
});

test("Edit focuses the editor even when that persona's editor is already open", async ({ mount, page }) => {
  await stub(page, { "chat.getChat": () => CHAT });
  await stubAuth(page);
  await mount(<PersonaEditDoorStory />);
  await openPopover(page);
  await page.getByRole("button", { name: "Edit Lyra", exact: true }).click();
  const editor = page.getByRole("group", { name: "Edit Lyra", exact: true });
  await expect(editor).toBeFocused();
  // Focus leaves the editor; the second Edit on the already-selected persona must pull it back.
  await page.getByRole("button", { name: "Hide details for Lyra", exact: true }).focus();
  await expect(editor).not.toBeFocused();
  await openPopover(page);
  await page.getByRole("button", { name: "Edit Lyra", exact: true }).click();
  await expect(editor).toBeFocused();
});

test("the pressed pin clears the default; the unpressed one sets it", async ({ mount, page }) => {
  const trpc = await stub(page);
  await stubAuth(page);
  await mount(<PersonaYouSheetStory />);
  await page.getByRole("button", { name: DEFAULT_PIN_BUTTON, pressed: true }).dispatchEvent("click");
  await expect.poll(() => trpc.lastInput(SEED_PROC), { intervals: [20, 50, 100] }).toMatchObject({ section: "seeds", patch: { defaultPersonaId: null } });
});

test("the phone sheet in a room follows the seat and marks the card persona, and a switch moves the seat", async ({ mount, page }) => {
  const trpc = await stub(page, { "chat.getChat": () => ({ ...CHAT, viewerActivePersonaId: ORION, anchorPersonaId: LYRA }) });
  await stubAuth(page);
  await mount(<PersonaYouSheetStory chatId={CHAT_ID} />);
  await expect(rowOf(page, "Orion").getByRole("img", { name: PLAYING, exact: true })).toBeVisible();
  await expect(rowOf(page, "Lyra").getByRole("img", { name: CARD_PIN, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Switch to Lyra", exact: true }).dispatchEvent("click");
  await expect.poll(() => trpc.lastInput(ACTIVE_PROC), { intervals: [20, 50, 100] }).toMatchObject({ chatId: CHAT_ID, personaId: LYRA });
});

test("the pin tooltip wraps at the prose measure instead of spanning the viewport", async ({ mount, page }) => {
  await stub(page, { "chat.getChat": () => CHAT });
  await stubAuth(page);
  await mount(<PersonaSwitcherBarStory chatId={CHAT_ID} />);
  await openPopover(page);
  await pinOf(page, "Pin Orion as your default").hover();
  const popup = page.locator('[data-slot="tooltip-popup"]');
  await expect(popup).toBeVisible();
  await expect
    .poll(() =>
      popup.evaluate((el: HTMLElement) => {
        const max = Number.parseFloat(getComputedStyle(el).maxWidth);
        return Number.isFinite(max) && el.getBoundingClientRect().width <= max + 1;
      }),
    )
    .toBe(true);
});

test("hovering a row paints a different fill than the selected row", async ({ mount, page }) => {
  await stub(page, { "chat.getChat": () => CHAT });
  await stubAuth(page);
  await mount(<PersonaSwitcherBarStory chatId={CHAT_ID} />);
  await openPopover(page);
  // Read each fill once its hover transition has settled, so a half-faded colour never decides the answer.
  const settledFill = (locator: Locator): Promise<string> =>
    locator.evaluate(async (el: HTMLElement) => {
      await Promise.all(el.getAnimations().map((animation) => animation.finished));
      return getComputedStyle(el).backgroundColor;
    });
  await page.getByRole("button", { name: "Switch to Lyra", exact: true }).hover();
  const [hovered, selected] = [await settledFill(rowOf(page, "Lyra")), await settledFill(rowOf(page, "Nova"))];
  expect(hovered).not.toBe(selected);
  expect(hovered).not.toBe("rgba(0, 0, 0, 0)");
});

test("with all three markers on one row the pin sits beside them, not across a hidden Edit slot", async ({ mount, page }) => {
  await stub(page, { "chat.getChat": () => CHAT });
  await stubAuth(page);
  await mount(<PersonaSwitcherBarStory chatId={CHAT_ID} />);
  await openPopover(page);
  const nova = rowOf(page, "Nova");
  const card = nova.getByRole("img", { name: CARD_PIN, exact: true });
  const pin = nova.getByRole("button", { name: DEFAULT_PIN_BUTTON });
  const edit = nova.getByRole("button", { name: "Edit Nova", exact: true });
  await expect(card).toBeVisible();
  const box = (locator: Locator): Promise<{ x: number; width: number }> =>
    locator.evaluate((el: HTMLElement) => {
      const { x, width } = el.getBoundingClientRect();
      return { x, width };
    });
  const [cardBox, pinBox, editBox] = await Promise.all([box(card), box(pin), box(edit)]);
  expect(pinBox.x - (cardBox.x + cardBox.width)).toBeLessThan(editBox.width);
});

test("the cold Edit door keeps focus in the editor — Settings mounting later does not take it", async ({ mount, page }) => {
  // Settings mounts for real here, so the reads its list and bands make are fed rather than left to answer null.
  await stub(page, {
    "chat.getChat": () => CHAT,
    "sessions.me": () => ({ userId: "user_ct", handle: "owner", globalRole: "owner" }),
    "regex.countScripts": () => 0,
    "rosterPreset.count": () => 0,
    "worldInfo.countBooks": () => 0,
    "settings.getAppSettingsWithOverrides": () => ({ resolved: { privateEndpointAllowlist: [] }, overrides: { privateEndpointAllowlist: null } }),
  });
  await stubAuth(page);
  await mount(<PersonaEditDoorColdStory />);
  await openPopover(page);
  await page.getByRole("button", { name: "Edit Lyra", exact: true }).click();
  const editor = page.getByRole("group", { name: "Edit Lyra", exact: true });
  await expect(editor).toBeFocused();
  // The Config list mounts a beat after the editor: its arrival focus runs once the band exists, and it must
  // stand down rather than take focus from the editor.
  const band = page.locator('[data-slot="config-band"]').first();
  await expect(band).toBeVisible();
  await expect(editor).toBeFocused();
  await expect(band).not.toBeFocused();
});

test.describe("coarse pointer", () => {
  test.use({ hasTouch: true });

  test("an uninvolved row wears no glyphs: one actions menu holds Edit and Set as default; markers stay as state", async ({ mount, page }) => {
    await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    await stub(page, { "chat.getChat": () => CHAT });
    await stubAuth(page);
    await mount(<PersonaYouSheetStory chatId={CHAT_ID} />);
    // The pressed pin and the markers are state and stay; the unpressed pin and the pencil stand down.
    await expect(rowOf(page, "Nova").getByRole("img", { name: DEFAULT_PIN })).toBeVisible();
    await expect(page.getByRole("button", { name: DEFAULT_PIN_BUTTON })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Pin Orion as your default", exact: true })).toBeHidden();
    await expect(page.getByRole("button", { name: "Edit Orion", exact: true })).toBeHidden();
    await page.getByRole("button", { name: "Actions for Orion", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: "Edit", exact: true })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Set as default", exact: true })).toBeVisible();
  });
});

test("clearing the default raises a notice with Undo, and Undo pins the persona again", async ({ mount, page }) => {
  const trpc = await stub(page);
  await stubAuth(page);
  await mount(<PersonaYouSheetStory />);
  await page.getByRole("button", { name: DEFAULT_PIN_BUTTON, pressed: true }).dispatchEvent("click");
  await expect.poll(() => trpc.lastInput(SEED_PROC), { intervals: [20, 50, 100] }).toMatchObject({ patch: { defaultPersonaId: null } });
  await expect(page.getByTestId("notified")).not.toBeEmpty();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => trpc.lastInput(SEED_PROC), { intervals: [20, 50, 100] }).toMatchObject({ patch: { defaultPersonaId: NOVA } });
});

test("the Edit door's focused editor shows a keyboard focus ring", async ({ mount, page }) => {
  await stub(page, { "chat.getChat": () => CHAT });
  await stubAuth(page);
  await mount(<PersonaEditDoorStory />);
  await openPopover(page);
  await page.getByRole("button", { name: "Edit Lyra", exact: true }).focus();
  await page.keyboard.press("Enter");
  const editor = page.getByRole("group", { name: "Edit Lyra", exact: true });
  await expect(editor).toBeFocused();
  await expect.poll(() => editor.evaluate((el: HTMLElement) => getComputedStyle(el).boxShadow)).not.toBe("none");
});

test("the persona list is ONE tab stop: arrow keys rove between rows and each row's controls stay reachable", async ({ mount, page }) => {
  await stub(page);
  await stubAuth(page);
  await mount(<PersonaYouSheetStory />);
  await expect(page.getByRole("button", { name: "Nova — current persona" })).toBeVisible();
  const stops = (): Promise<number> =>
    page.evaluate(() => {
      const rowControl = /^(Switch to |Pin |Pinned|Edit |.+ — current persona$)/u;
      return [...document.querySelectorAll("button")].filter(
        (b) => b.tabIndex >= 0 && b.offsetParent !== null && rowControl.test(b.getAttribute("aria-label") ?? ""),
      ).length;
    });
  // One row's main button + its pin + its Edit; the other rows' controls are out of the tab order.
  await expect.poll(stops).toBeLessThanOrEqual(3);
  await page.getByRole("button", { name: "Nova — current persona" }).focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("button", { name: "Switch to Orion", exact: true })).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("button", { name: "Switch to Lyra", exact: true })).toBeFocused();
  // Tab from the row's main button reaches that row's own pin.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Pin Lyra as your default", exact: true })).toBeFocused();
});
