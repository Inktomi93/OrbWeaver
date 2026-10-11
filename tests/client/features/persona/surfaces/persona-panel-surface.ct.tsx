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
import { PersonaEditDoorStory, PersonaSwitcherBarStory, PersonaYouSheetStory } from "../_ct-stories.tsx";

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

function stub(page: Page, extra?: TrpcRoutes<"chat.getChat">): Promise<TrpcRecorder> {
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
async function openPopover(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Playing as Nova" }).click();
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
  await expect(page.getByRole("button", { name: "Pinned — your default persona", pressed: true })).toHaveCount(1);
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

test("with a chat open the contextual block renders, and the DEFAULT scope still routes a switch to the seed pointer", async ({ mount, page }) => {
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
  // @orb-waive ct-no-oneshot-live-read-assert(expect): settled — the seed write above already resolved
  expect(trpc.count(ACTIVE_PROC)).toBe(0);
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

test("under the This-chat scope the MARKED row is the chat's active persona, not the global pointer", async ({ mount, page }) => {
  // The chat plays ORION while the seed points at NOVA — the two lenses must disagree, visibly.
  await stub(page, { "chat.getChat": () => ({ ...CHAT, viewerActivePersonaId: ORION }) });
  await stubAuth(page);
  await mount(<PersonaSwitcherBarStory chatId={CHAT_ID} />);
  await openPopover(page);

  await expect(page.getByRole("button", { name: "Nova — current persona" })).toBeAttached();
  await pickScope(page, "This chat");
  await expect(page.getByRole("button", { name: "Orion — current persona" })).toBeAttached();
  await expect(page.getByRole("button", { name: "Switch to Nova", exact: true })).toBeAttached();
});

test("re-attribute fires chat.reattributePersona with the server-resolved {kind:'mine'} scope", async ({ mount, page }) => {
  const trpc = await stub(page, { "chat.getChat": () => CHAT });
  await stubAuth(page);
  await mount(<PersonaSwitcherBarStory chatId={CHAT_ID} />);
  await openPopover(page);

  await page.getByRole("button", { name: "Re-attribute your messages here → Nova" }).click();
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
  await expect(pinOf(page, "Pinned — your default persona")).toHaveCSS("opacity", "1");
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
    "chat.getChat": () => CHAT,
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

/** The switch row holding the control named `persona` (its stretched button is the row's direct child). */
function rowOf(page: Page, persona: string): Locator {
  return page.getByRole("button", { name: new RegExp(`^(Switch to ${persona}|${persona} — current persona)$`) }).locator("..");
}

const PLAYING = "Playing as";
const CARD_PIN = "Pinned to this chat";
const DEFAULT_PIN = "Pinned — your default persona";

test("after a swap the playing-as and card-pin markers sit on different rows, each state shown once", async ({ mount, page }) => {
  // Nova is the global default; the chat opened as Lyra (the anchor) and was swapped to Orion for this room.
  await stub(page, { "chat.getChat": () => ({ ...CHAT, viewerActivePersonaId: ORION, anchorPersonaId: LYRA }) });
  await stubAuth(page);
  await mount(<PersonaSwitcherBarStory chatId={CHAT_ID} />);
  await openPopover(page);
  await pickScope(page, "This chat");

  await expect(rowOf(page, "Orion").getByRole("img", { name: PLAYING, exact: true })).toBeVisible();
  await expect(rowOf(page, "Lyra").getByRole("img", { name: CARD_PIN, exact: true })).toBeVisible();
  await expect(rowOf(page, "Nova").getByRole("button", { name: DEFAULT_PIN, pressed: true })).toBeVisible();
  // One marker per state across the whole list, and none doubled onto a row that does not own the state.
  await expect(page.getByRole("img", { name: PLAYING, exact: true })).toHaveCount(1);
  await expect(page.getByRole("img", { name: CARD_PIN, exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: DEFAULT_PIN, pressed: true })).toHaveCount(1);
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
  await expect(nova.getByRole("button", { name: DEFAULT_PIN, pressed: true })).toBeVisible();
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
  await expect(page.getByText("Card sees you as Zara")).toBeVisible();
  await expect(page.getByRole("img", { name: CARD_PIN, exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Re-pin" })).toBeVisible();
});

test("a non-host sees the card-pin room line but no Re-pin", async ({ mount, page }) => {
  await stub(page, { "chat.getChat": () => ({ ...ROOM, viewerIsHost: false }) });
  await stubAuth(page);
  await mount(<PersonaSwitcherBarStory chatId={CHAT_ID} />);
  await openPopover(page);
  await expect(page.getByText("Card sees you as Zara")).toBeVisible();
  await expect(page.getByRole("button", { name: "Re-pin" })).toHaveCount(0);
});
