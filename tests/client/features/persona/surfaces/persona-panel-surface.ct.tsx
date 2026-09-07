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
import type { Page } from "@playwright/test";
import type { TrpcRecorder, TrpcRoutes } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { PersonaSwitcherBarStory, PersonaYouSheetStory } from "../_ct-stories.tsx";

const NOVA = "persona_nova";
const ORION = "persona_orion";
const CHAT_ID = castId<ChatId>("chat_switcher_ct");

const PERSONAS = [
  { id: NOVA, name: "Nova", title: null, description: "", starred: false, avatarAssetId: null, avatarHash: null, metadata: null, createdAt: 1, updatedAt: 1 },
  { id: ORION, name: "Orion", title: null, description: "", starred: false, avatarAssetId: null, avatarHash: null, metadata: null, createdAt: 2, updatedAt: 2 },
];

/** The viewer's solo room, playing Nova in-chat. Shaped as `chat.getChat` returns it (the
 *  persona-this-chat-section fixture's shape, title added — the contextual block renders it). */
const CHAT = {
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

function stub(page: Page, extra: TrpcRoutes = {}): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "persona.list": () => PERSONAS,
    "settings.getUserSettings": () => ({
      userId: "user_ct",
      schemaVersion: 1,
      config: { ...DEFAULT_USER_SETTINGS, seeds: { ...DEFAULT_USER_SETTINGS.seeds, currentPersonaId: NOVA, defaultPersonaId: NOVA } },
      updatedAt: 0,
    }),
    [SEED_PROC]: () => ({}),
    [ACTIVE_PROC]: () => ({}),
    [RESTAMP_PROC]: () => ({}),
    ...extra,
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

// ── The SHEET lens ──────────────────────────────────────────────────────────────────────────────────

test("the sheet is the switcher grammar: who-head, switch rows with pins, account foot — no list chrome", async ({ mount, page }) => {
  await stub(page);
  await stubAuth(page);
  await mount(<PersonaYouSheetStory />);

  // The who-head: current persona + the pinned wording (Nova is current AND default here).
  await expect(page.getByText("Playing as · pinned — your default everywhere")).toBeVisible();
  // The switch rows: the current row is named for its state; the other carries the verb + the faint pin.
  await expect(page.getByRole("button", { name: "Nova — current persona" })).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("button", { name: "Switch to Orion", exact: true })).toBeAttached();
  await expect(page.getByRole("button", { name: "Pin Orion as your default", exact: true })).toBeAttached();
  await expect(page.getByRole("img", { name: "Pinned — your default persona" })).toHaveCount(1);
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
  expect(trpc.count(ACTIVE_PROC)).toBe(0); // ONESHOT-OK: settled — the seed write above already resolved
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
  await expect(page.getByRole("group", { name: "Where the next switch applies" })).toBeVisible();

  await page.getByRole("button", { name: "Switch to Orion", exact: true }).dispatchEvent("click");
  await expect.poll(() => trpc.lastInput(SEED_PROC), { intervals: [20, 50, 100] }).toMatchObject({ section: "seeds", patch: { currentPersonaId: ORION } });
  expect(trpc.count(ACTIVE_PROC)).toBe(0); // ONESHOT-OK: settled — the seed write above already resolved
});

test("flipping the scope to This chat routes the SAME row to persona.setActivePersona for THIS room", async ({ mount, page }) => {
  const trpc = await stub(page, { "chat.getChat": () => CHAT });
  await stubAuth(page);
  await mount(<PersonaSwitcherBarStory chatId={CHAT_ID} />);
  await openPopover(page);

  await page.getByRole("button", { name: "This chat" }).click();
  await page.getByRole("button", { name: "Switch to Orion", exact: true }).dispatchEvent("click");
  await expect.poll(() => trpc.lastInput(ACTIVE_PROC), { intervals: [20, 50, 100] }).toMatchObject({ chatId: CHAT_ID, personaId: ORION });
  expect(trpc.count(SEED_PROC)).toBe(0); // ONESHOT-OK: settled — the setActivePersona write above already resolved
});

test("under the This-chat scope the MARKED row is the chat's active persona, not the global pointer", async ({ mount, page }) => {
  // The chat plays ORION while the seed points at NOVA — the two lenses must disagree, visibly.
  await stub(page, { "chat.getChat": () => ({ ...CHAT, viewerActivePersonaId: ORION }) });
  await stubAuth(page);
  await mount(<PersonaSwitcherBarStory chatId={CHAT_ID} />);
  await openPopover(page);

  await expect(page.getByRole("button", { name: "Nova — current persona" })).toBeAttached();
  await page.getByRole("button", { name: "This chat" }).click();
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
  await expect(foot).toContainText("owner");
  await expect(foot).toContainText("local");
  await expect(page.getByTestId("account-logout")).toBeVisible();
});

test("forward-header mode shows the proxy sign-out note instead of a Log out button (no cookie session)", async ({ mount, page }) => {
  await stub(page);
  await stubAuth(page, "forward-header");
  await mount(<PersonaYouSheetStory />);
  await expect(page.getByTestId("account-surface")).toBeVisible();
  await expect(page.getByTestId("account-logout")).toHaveCount(0);
  await expect(page.getByText("Sign out at your identity provider / reverse proxy.")).toBeVisible();
});
