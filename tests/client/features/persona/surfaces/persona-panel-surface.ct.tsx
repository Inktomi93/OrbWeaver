// CT: the persona SWITCHER (`PersonaPanelSurface`, both lenses) — the PLAY surface. Its stack: the who-head
// (who you play, with the description read-only), the rows (✓ 📌 🔗 👑 Edit ⋯), the room block while a room is
// open, the Manage door, the account foot. Room writes are pinned in `persona-room-block.ct.tsx`; this file
// owns the shape: no room ⇒ rows are not switches and the head says who new chats start as; the glyphs' reveal
// and order; the Edit door; the account foot; the keyboard grammar.

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
const LONG_DESCRIPTION = Array.from({ length: 12 }, (_, i) => `Line ${i + 1} of a long persona description that keeps going.`).join(" ");

// Orion leads the list on purpose: it is the first row and is neither current, default nor hovered.
const PERSONAS: TrpcWireOutput<"persona.list"> = [
  {
    id: ORION,
    name: "Orion",
    title: null,
    description: "A short line.",
    starred: false,
    avatarAssetId: null,
    avatarHash: null,
    metadata: null,
    createdAt: 2,
    updatedAt: 2,
  },
  {
    id: NOVA,
    name: "Nova",
    title: null,
    description: LONG_DESCRIPTION,
    starred: false,
    avatarAssetId: null,
    avatarHash: null,
    metadata: null,
    createdAt: 1,
    updatedAt: 1,
  },
  { id: LYRA, name: "Lyra", title: null, description: "", starred: false, avatarAssetId: null, avatarHash: null, metadata: null, createdAt: 3, updatedAt: 3 },
];

/** The viewer's solo room, playing Nova, the card pinned to Nova. */
const CHAT: TrpcFixtureOutput<"chat.getChat"> = {
  id: CHAT_ID,
  title: "The Ashen Spire",
  viewerUserId: "user_ct",
  viewerActivePersonaId: NOVA,
  anchorPersonaId: NOVA,
  anchorState: "live",
  viewerIsHost: true,
  viewerOwnedCharacterIds: [],
  participants: [],
  identities: PERSONAS.map((p) => ({ kind: "persona", id: p.id, name: p.name, description: "", avatarHash: null })),
};

const SEED_PROC = "settings.updateUserSettingsSection";
const PLAYING = "Playing as";
const DEFAULT_MARKER = "Your default persona";
const DEFAULT_BUTTON = /is your default — press to clear$/u;

function settingsWith(seeds: { currentPersonaId: string | null; defaultPersonaId: string | null }): TrpcFixtureOutput<"settings.getUserSettings"> {
  return {
    userId: "user_ct",
    schemaVersion: 1,
    config: { ...DEFAULT_USER_SETTINGS, seeds: { ...DEFAULT_USER_SETTINGS.seeds, ...seeds } },
    updatedAt: 0,
    configUnreadable: null,
  };
}

function stub(
  page: Page,
  extra?: Partial<
    TrpcRoutes<
      | "chat.getChat"
      | "regex.countScripts"
      | "settings.getUserSettings"
      | "settings.updateUserSettingsSection"
      | "rosterPreset.count"
      | "sessions.me"
      | "settings.getAppSettingsWithOverrides"
      | "worldInfo.countBooks"
      | "persona.listConnectedToCharacter"
    >
  >,
): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "persona.list": () => PERSONAS,
    "settings.getUserSettings": () => settingsWith({ currentPersonaId: NOVA, defaultPersonaId: NOVA }),
    "settings.updateUserSettingsSection": () => settingsWith({ currentPersonaId: NOVA, defaultPersonaId: NOVA }),
    // The three reads an expanded persona editor makes (the Edit door tests open one).
    "worldInfo.listBooks": () => [],
    "worldInfo.listForPersona": () => [],
    "persona.listConnectedCharacters": () => [],
    "persona.setActivePersona": () => undefined,
    "chat.setChatAnchorPersona": () => undefined,
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

/** The switch row holding the control named for `persona` (its stretched button is the row's direct child). */
function rowOf(page: Page, persona: string): Locator {
  return page.getByRole("button", { name: new RegExp(`^(Switch to ${persona}|${persona} — current persona)$`, "u") }).locator("..");
}

// ── No room open: rows are not switches ────────────────────────────────────────────────────────────

test("with no room open the head says who new chats start as, and rows carry the crown and Edit but no switch", async ({ mount, page }) => {
  await stub(page);
  await stubAuth(page);
  await mount(<PersonaYouSheetStory />);

  const head = page.locator('[data-slot="persona-who-head"]');
  await expect(head).toContainText("Nova");
  await expect(head).toContainText("New chats start as (your default)");
  await expect(page.locator("[data-switch-row-button]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: DEFAULT_BUTTON, pressed: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Make Orion your default", exact: true })).toBeAttached();
  await expect(page.getByRole("button", { name: "Edit Orion", exact: true })).toBeAttached();
  await expect(page.locator('[data-slot="persona-chat-scope"]')).toHaveCount(0);
  // The account foot carries the identity facts + Log out.
  await expect(page.getByTestId("account-surface")).toContainText("owner");
});

test("with no default the head names the last-played persona", async ({ mount, page }) => {
  await stub(page, { "settings.getUserSettings": () => settingsWith({ currentPersonaId: LYRA, defaultPersonaId: null }) });
  await stubAuth(page);
  await mount(<PersonaYouSheetStory />);
  const head = page.locator('[data-slot="persona-who-head"]');
  await expect(head).toContainText("Lyra");
  await expect(head).toContainText("New chats start as (last played)");
});

test("the crown writes only the default", async ({ mount, page }) => {
  const trpc = await stub(page);
  await stubAuth(page);
  await mount(<PersonaYouSheetStory />);
  await page.getByRole("button", { name: "Make Orion your default", exact: true }).dispatchEvent("click");
  await expect.poll(() => trpc.lastInput(SEED_PROC)).toEqual({ section: "seeds", patch: { defaultPersonaId: ORION } });
});

test("the head shows the playing persona's description clamped, with More only when it is cut", async ({ mount, page }) => {
  await stub(page, { "chat.getChat": () => CHAT });
  await stubAuth(page);
  await mount(<PersonaYouSheetStory chatId={CHAT_ID} />);
  const description = page.locator('[data-slot="persona-who-description"]');
  await expect(description).toBeVisible();
  const more = page.getByRole("button", { name: "More", exact: true });
  await expect(more).toBeVisible();
  const clampedHeight = await description.evaluate((el: HTMLElement) => el.clientHeight);
  await more.click();
  await expect.poll(() => description.evaluate((el: HTMLElement) => el.clientHeight)).toBeGreaterThan(clampedHeight);
});

test("a short description gets no More", async ({ mount, page }) => {
  await stub(page, { "chat.getChat": () => ({ ...CHAT, viewerActivePersonaId: ORION }) });
  await stubAuth(page);
  await mount(<PersonaYouSheetStory chatId={CHAT_ID} />);
  await expect(page.locator('[data-slot="persona-who-description"]')).toHaveText("A short line.");
  await expect(page.getByRole("button", { name: "More", exact: true })).toHaveCount(0);
});

// ── The BAR lens (the rail popover) ─────────────────────────────────────────────────────────────────

test("with NO chat open the popover has no room block and keeps the Manage door", async ({ mount, page }) => {
  await stub(page);
  await stubAuth(page);
  await mount(<PersonaSwitcherBarStory />);
  await openPopover(page);
  await expect(page.getByRole("button", { name: "Manage personas in Settings" })).toBeVisible();
  await expect(page.locator('[data-slot="persona-chat-scope"]')).toHaveCount(0);
  await expect(page.getByRole("combobox")).toHaveCount(0);
});

test("with a chat open the room block renders under the rows, and there is no Applies picker", async ({ mount, page }) => {
  await stub(page, { "chat.getChat": () => CHAT });
  await stubAuth(page);
  await mount(<PersonaSwitcherBarStory chatId={CHAT_ID} />);
  await openPopover(page);
  await expect(page.getByText("In The Ashen Spire")).toBeVisible();
  await expect(page.getByText("Card sees you as Nova")).toBeVisible();
  await expect(page.getByRole("combobox")).toHaveCount(0);
});

test("in a room the check marks the seat persona, not the default", async ({ mount, page }) => {
  await stub(page, { "chat.getChat": () => ({ ...CHAT, viewerActivePersonaId: ORION }) });
  await stubAuth(page);
  await mount(<PersonaSwitcherBarStory chatId={CHAT_ID} />);
  await openPopover(page, "Orion");
  await expect(rowOf(page, "Orion").getByRole("img", { name: PLAYING, exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: PLAYING, exact: true })).toHaveCount(1);
});

test("after a swap the check, the pressed pin and the pressed crown sit on their own rows", async ({ mount, page }) => {
  // Nova is the default; the chat opened as Lyra (the pin) and was swapped to Orion.
  await stub(page, { "chat.getChat": () => ({ ...CHAT, viewerActivePersonaId: ORION, anchorPersonaId: LYRA }) });
  await stubAuth(page);
  await mount(<PersonaSwitcherBarStory chatId={CHAT_ID} />);
  await openPopover(page, "Orion");
  await expect(rowOf(page, "Orion").getByRole("img", { name: PLAYING, exact: true })).toBeVisible();
  await expect(rowOf(page, "Lyra").getByRole("button", { name: "Card is pinned to Lyra — press to unpin", pressed: true })).toBeVisible();
  await expect(rowOf(page, "Nova").getByRole("button", { name: DEFAULT_BUTTON, pressed: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /— press to unpin$/u, pressed: true })).toHaveCount(1);
});

test("the glyph order on a row is ✓ 📌 🔗 👑, then Edit", async ({ mount, page }) => {
  await stub(page, {
    "chat.getChat": () => ({
      ...CHAT,
      viewerOwnedCharacterIds: ["character_aria"],
      participants: [{ kind: "character", characterId: "character_aria", displayName: "Aria" }],
    }),
    "persona.listConnectedToCharacter": () => [PERSONAS[1] as TrpcWireOutput<"persona.list">[number]],
  });
  await stubAuth(page);
  await mount(<PersonaSwitcherBarStory chatId={CHAT_ID} />);
  await openPopover(page);
  const nova = rowOf(page, "Nova");
  const order = [
    nova.getByRole("img", { name: PLAYING, exact: true }),
    nova.getByRole("button", { name: "Card is pinned to Nova — press to unpin" }),
    nova.getByRole("img", { name: "Connected to Aria", exact: true }),
    nova.getByRole("button", { name: DEFAULT_BUTTON }),
    nova.getByRole("button", { name: "Edit Nova", exact: true }),
  ];
  const xs = await Promise.all(order.map((locator) => locator.evaluate((el: HTMLElement) => el.getBoundingClientRect().x)));
  expect(xs).toEqual([...xs].sort((a, b) => a - b));
});

test("the check's seat binding: solo room covers lines and preset text; another member's pin, lines only", async ({ mount, page }) => {
  await stub(page, {
    "chat.getChat": () => ({
      ...CHAT,
      anchorPersonaId: "persona_zara",
      participants: [
        { kind: "human", userId: "user_ct", displayName: "You", activePersonaId: NOVA, leftSeq: null },
        { kind: "human", userId: "user_member", displayName: "Rowan", activePersonaId: "persona_zara", leftSeq: null },
      ],
    }),
  });
  await stubAuth(page);
  await mount(<PersonaSwitcherBarStory chatId={CHAT_ID} />);
  await openPopover(page);
  await expect(rowOf(page, "Nova").getByRole("img", { name: PLAYING, exact: true })).toHaveAttribute("data-seat-binds", "lines");
});

test("the check's seat binding in a solo room covers lines and preset text", async ({ mount, page }) => {
  await stub(page, { "chat.getChat": () => CHAT });
  await stubAuth(page);
  await mount(<PersonaSwitcherBarStory chatId={CHAT_ID} />);
  await openPopover(page);
  await expect(rowOf(page, "Nova").getByRole("img", { name: PLAYING, exact: true })).toHaveAttribute("data-seat-binds", "lines-and-presets");
});

test("an empty room seat shows no persona as playing: head and chip say none, no check anywhere", async ({ mount, page }) => {
  await stub(page, { "chat.getChat": () => ({ ...CHAT, viewerActivePersonaId: null }) });
  await stubAuth(page);
  await mount(<PersonaSwitcherBarStory chatId={CHAT_ID} />);
  await page.getByRole("button", { name: "Account & personas", exact: true }).click();
  const head = page.locator('[data-slot="persona-who-head"]');
  await expect(head).not.toContainText("Nova");
  await expect(head).toContainText("No persona set — pick one below.");
  await expect(page.getByRole("img", { name: PLAYING, exact: true })).toHaveCount(0);
});

// ── Reveal, paint and tooltip ───────────────────────────────────────────────────────────────────────

test("a row's crown shows only while THAT row is hovered or keyboard-focused; the default's always shows", async ({ mount, page }) => {
  await stub(page, { "chat.getChat": () => CHAT });
  await stubAuth(page);
  await mount(<PersonaSwitcherBarStory chatId={CHAT_ID} />);
  await openPopover(page);
  const orion = page.getByRole("button", { name: "Make Orion your default", exact: true });
  const lyra = page.getByRole("button", { name: "Make Lyra your default", exact: true });

  await expect(page.getByRole("button", { name: DEFAULT_BUTTON, pressed: true })).toHaveCSS("opacity", "1");
  await page.mouse.move(0, 0);
  await expect(orion).toHaveCSS("opacity", "0");
  await expect(lyra).toHaveCSS("opacity", "0");

  await page.getByRole("button", { name: "Switch to Lyra", exact: true }).hover();
  await expect(lyra).not.toHaveCSS("opacity", "0");
  await expect(orion).toHaveCSS("opacity", "0");

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

test("hovering a row paints a different fill than the selected row", async ({ mount, page }) => {
  await stub(page, { "chat.getChat": () => CHAT });
  await stubAuth(page);
  await mount(<PersonaSwitcherBarStory chatId={CHAT_ID} />);
  await openPopover(page);
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

test("no raw {{macro}} renders in the visible rows", async ({ mount, page }) => {
  await stub(page, { "chat.getChat": () => ({ ...CHAT, viewerActivePersonaId: ORION }) });
  await stubAuth(page);
  await mount(<PersonaSwitcherBarStory chatId={CHAT_ID} />);
  await openPopover(page, "Orion");
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

test("the crown tooltip wraps at the prose measure instead of spanning the viewport", async ({ mount, page }) => {
  await stub(page, { "chat.getChat": () => CHAT });
  await stubAuth(page);
  await mount(<PersonaSwitcherBarStory chatId={CHAT_ID} />);
  await openPopover(page);
  await page.getByRole("button", { name: "Make Orion your default", exact: true }).hover();
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

// ── The Edit door ───────────────────────────────────────────────────────────────────────────────────

test("a row's Edit door closes the popover and lands in that persona's open, focused editor", async ({ mount, page }) => {
  await stub(page, { "chat.getChat": () => CHAT });
  await stubAuth(page);
  await mount(<PersonaEditDoorStory />);
  await openPopover(page);
  await page.getByRole("button", { name: "Edit Lyra", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Account & personas" })).toHaveCount(0);
  const editor = page.getByRole("group", { name: "Edit Lyra", exact: true });
  await expect(editor).toBeVisible();
  await expect(editor).toBeFocused();
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

test("Edit focuses the editor even when that persona's editor is already open", async ({ mount, page }) => {
  await stub(page, { "chat.getChat": () => CHAT });
  await stubAuth(page);
  await mount(<PersonaEditDoorStory />);
  await openPopover(page);
  await page.getByRole("button", { name: "Edit Lyra", exact: true }).click();
  const editor = page.getByRole("group", { name: "Edit Lyra", exact: true });
  await expect(editor).toBeFocused();
  await page.getByRole("button", { name: "Hide details for Lyra", exact: true }).focus();
  await expect(editor).not.toBeFocused();
  await openPopover(page);
  await page.getByRole("button", { name: "Edit Lyra", exact: true }).click();
  await expect(editor).toBeFocused();
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

test("the cold Edit door keeps focus in the editor — Settings mounting later does not take it", async ({ mount, page }) => {
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
  const band = page.locator('[data-slot="config-band"]').first();
  await expect(band).toBeVisible();
  await expect(editor).toBeFocused();
  await expect(band).not.toBeFocused();
});

// ── The account foot's mode arms ────────────────────────────────────────────────────────────────────

test("the foot renders the viewer identity + Log out in a cookie mode (local)", async ({ mount, page }) => {
  await stub(page);
  await stubAuth(page, "local");
  await mount(<PersonaYouSheetStory />);
  const foot = page.getByTestId("account-surface");
  await expect(foot).toContainText("Signed in as owner");
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

// ── Keyboard and coarse pointer ─────────────────────────────────────────────────────────────────────

test("in a room the list is ONE tab stop: arrows rove between rows and each row's controls stay reachable", async ({ mount, page }) => {
  await stub(page, { "chat.getChat": () => CHAT });
  await stubAuth(page);
  await mount(<PersonaYouSheetStory chatId={CHAT_ID} />);
  await expect(page.getByRole("button", { name: "Nova — current persona" })).toBeVisible();
  const stopRows = (): Promise<{ mains: number; siblings: number }> =>
    page.evaluate(() => {
      const mains = [...document.querySelectorAll<HTMLElement>("[data-switch-row-button]")].filter((b) => b.tabIndex >= 0);
      const row = mains[0]?.parentElement;
      const siblings =
        row === null || row === undefined ? 0 : [...row.querySelectorAll("button")].filter((b) => b.tabIndex >= 0 && b.offsetParent !== null).length - 1;
      return { mains: mains.length, siblings };
    });
  // One main button; its row's 📌, 👑 and Edit stay in the tab order.
  await expect.poll(stopRows).toEqual({ mains: 1, siblings: 3 });
  await page.getByRole("button", { name: "Nova — current persona" }).focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("button", { name: "Switch to Orion", exact: true })).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("button", { name: "Switch to Lyra", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Pin the card to Lyra", exact: true })).toBeFocused();
});

test.describe("coarse pointer", () => {
  test.use({ hasTouch: true });

  test("an uninvolved row wears no faint toggles: its menu holds Edit, the crown verb and the pin verb", async ({ mount, page }) => {
    await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    await stub(page, { "chat.getChat": () => CHAT });
    await stubAuth(page);
    await mount(<PersonaYouSheetStory chatId={CHAT_ID} />);
    // The pressed states stay visible; the unpressed toggles and the pencil stand down.
    await expect(rowOf(page, "Nova").getByRole("img", { name: DEFAULT_MARKER, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Make Orion your default", exact: true })).toBeHidden();
    await expect(page.getByRole("button", { name: "Pin the card to Orion", exact: true })).toBeHidden();
    await expect(page.getByRole("button", { name: "Edit Orion", exact: true })).toBeHidden();
    await page.getByRole("button", { name: "Actions for Orion", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: "Edit", exact: true })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Set as default", exact: true })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Pin card here", exact: true })).toBeVisible();
  });
});

test("at a fine pointer a row has no ⋯: Edit and the crown are its own controls", async ({ mount, page }) => {
  await stub(page, { "chat.getChat": () => CHAT });
  await stubAuth(page);
  await mount(<PersonaSwitcherBarStory chatId={CHAT_ID} />);
  await openPopover(page);
  await expect(page.getByRole("button", { name: "Actions for Orion", exact: true })).toBeHidden();
});
