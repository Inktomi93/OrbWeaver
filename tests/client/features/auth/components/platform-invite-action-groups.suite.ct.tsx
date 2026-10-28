import { SIGNUP_MAX_TTL_MS } from "@orb/contracts/chat";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { actionGroupGeometry } from "@orb/testkit/browser/spec";
import { expect, test } from "@orb/testkit/ct-corpus";
import { ENLARGED_APPEARANCE_SETTINGS } from "@orb/testkit/iso";
import { createServerHarness, readAccounts } from "@orb/testkit/node/composed";
import type { AuthActionGroupsStory } from "./_pending-join-stories.tsx";
import {
  APPROVAL_RESPONSE,
  JOIN_CONFIRM_LABEL,
  JOIN_NAME_LABEL,
  JOIN_PERSONA,
  PENDING_AUTH_CONFIG,
  PENDING_CONFIRM_PATH,
  PENDING_PREVIEW_PATH,
  PENDING_ROOM,
} from "./pending-join-fixtures.ts";

const STORY = "tests/client/features/auth/components/_pending-join-stories/AuthActionGroupsStory";
const REGIMES = [
  { name: "wide desktop", width: 960, viewport: { width: 1280, height: 900 }, coarse: false, appearance: appearanceSettingsSchema.parse({}) },
  { name: "narrow desktop enlarged", width: 300, viewport: { width: 1280, height: 900 }, coarse: false, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone portrait enlarged", width: 390, viewport: { width: 390, height: 844 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone landscape enlarged", width: 844, viewport: { width: 844, height: 390 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
] as const;

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, isMobile: regime.coarse, hasTouch: regime.coarse });
    for (const confirming of [false, true]) {
      test(`pending join keeps ${confirming ? "Joining" : "Create account and join"} and Not now reachable`, async ({ mount, page }, testInfo) => {
        await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
        await page.route("**/api/auth/config", (route) => route.fulfill({ json: PENDING_AUTH_CONFIG }));
        await page.route(PENDING_PREVIEW_PATH, (route) => route.fulfill({ json: PENDING_ROOM }));
        const release = Promise.withResolvers<void>();
        const arrived = Promise.withResolvers<void>();
        const delivered = Promise.withResolvers<void>();
        let writes = 0;
        await page.route(PENDING_CONFIRM_PATH, async (route) => {
          writes += 1;
          expect(route.request().postDataJSON()).toEqual({ persona: { ...JOIN_PERSONA, description: "" } });
          expect(route.request().headers()[CSRF_HEADER]).toBe("1");
          arrived.resolve();
          try {
            await release.promise;
            await route.fulfill({ json: APPROVAL_RESPONSE });
          } finally {
            delivered.resolve();
          }
        });
        await page.addInitScript(() => globalThis.history.replaceState(null, "", "/login?pendingJoin=1"));
        try {
          await mount<typeof AuthActionGroupsStory>(STORY, { width: regime.width, appearance: regime.appearance });
          const create = page.getByRole("button", { name: JOIN_CONFIRM_LABEL, exact: true });
          const dismiss = page.getByRole("button", { name: "Not now", exact: true });
          await expect(create).toBeVisible();
          await create.focus();
          await expect(create).toBeFocused();
          await page.keyboard.press("Tab");
          await expect(dismiss).toBeFocused();
          if (confirming) {
            await page.getByRole("textbox", { name: JOIN_NAME_LABEL, exact: true }).fill(JOIN_PERSONA.name);
            await create.click();
            await arrived.promise;
          }
          const primary = page.getByRole("button", { name: confirming ? "Joining…" : JOIN_CONFIRM_LABEL, exact: true });
          const geometry = await actionGroupGeometry(page.locator('[data-slot="auth-action-host"]'), [primary, dismiss]);
          await testInfo.attach("pending-join-action-boxes", { body: JSON.stringify(geometry), contentType: "application/json" });
          expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
          const controlFloor = await dismiss.evaluate((button) => Number.parseFloat(getComputedStyle(button).blockSize));
          expect(Math.min(...geometry.controls.map((box) => box.height))).toBeGreaterThanOrEqual(controlFloor);
          const originalMinimum = await primary.evaluate((button) => {
            const previous = button.style.minInlineSize;
            button.style.minInlineSize = "200vw";
            return previous;
          });
          try {
            expect((await actionGroupGeometry(page.locator('[data-slot="auth-action-host"]'), [primary, dismiss])).inlineOverflow).toBeGreaterThan(1);
          } finally {
            await primary.evaluate((button, previous) => {
              button.style.minInlineSize = previous;
            }, originalMinimum);
          }
          await expect(primary).toBeEnabled({ enabled: !confirming });
          await dismiss.focus();
          await expect(dismiss).toBeFocused();
          await page.keyboard.press("Enter");
          await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
          expect(writes).toBe(confirming ? 1 : 0);
        } finally {
          release.resolve();
          if (writes > 0) {
            await delivered.promise;
          }
        }
      });
    }
    for (const destination of ["existing account", "dismiss"] as const) {
      test(`local signup keeps existing-account and Not now actions contained: ${destination}`, async ({ mount, page }, testInfo) => {
        await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
        await using root = await createServerHarness({ startJobs: false, env: { ["AUTH_MODE"]: "local", ["AUTH_FALLBACK"]: "deny" } });
        const setup = await root.internalCallerFor(root.ownerId);
        await setup.admin.resetPassword({ userId: root.ownerId, password: "synthetic-layout-owner-password" });
        await setup.settings.updateAppSettings({ partial: { localMultiUser: true } });
        const caller = await root.internalCallerFor(root.ownerId);
        const room = (await caller.chat.startChat({ characterIds: [], title: PENDING_ROOM.roomName, opening: "none" })).chat;
        const invite = await caller.invites.createInvite({
          chatId: room.id,
          input: { allowSignup: true, maxUses: 1, expiresAt: root.clock.now() + SIGNUP_MAX_TTL_MS },
        });
        const accounts = await readAccounts(root);
        let writes = 0;
        await page.route("**/api/auth/**", async (route) => {
          const request = route.request();
          const path = new URL(request.url()).pathname;
          if (path === "/api/auth/signup") {
            writes += 1;
          }
          const body = request.postData();
          const response = await root.http.request(path, { method: request.method(), headers: request.headers(), ...(body === null ? {} : { body }) });
          await route.fulfill({ status: response.status, body: Buffer.from(await response.arrayBuffer()), headers: Object.fromEntries(response.headers) });
        });
        await page.addInitScript(() => globalThis.history.replaceState(null, "", "/login"));
        await mount<typeof AuthActionGroupsStory>(STORY, { width: regime.width, appearance: regime.appearance, signupToken: invite.token });
        const existing = page.getByRole("button", { name: "I already have an account", exact: true });
        const dismiss = page.getByRole("button", { name: "Not now", exact: true });
        await expect(existing).toBeVisible();
        await expect(page.getByText(PENDING_ROOM.roomName, { exact: false })).toBeVisible();
        const geometry = await actionGroupGeometry(page.locator('[data-slot="auth-action-host"]'), [existing, dismiss]);
        await testInfo.attach("signup-secondary-action-boxes", { body: JSON.stringify(geometry), contentType: "application/json" });
        expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
        const controlFloor = await dismiss.evaluate((button) => Number.parseFloat(getComputedStyle(button).blockSize));
        expect(Math.min(...geometry.controls.map((box) => box.height))).toBeGreaterThanOrEqual(controlFloor);
        await existing.focus();
        await expect(existing).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(dismiss).toBeFocused();
        await (destination === "dismiss" ? dismiss : existing).press("Enter");
        await expect(page.getByRole("heading", { name: destination === "dismiss" ? "Sign in" : "Sign in to join", exact: true })).toBeVisible();
        expect(writes).toBe(0);
        expect(await readAccounts(root)).toEqual(accounts);
        expect((await caller.invites.listInvites({ chatId: room.id })).find((row) => row.id === invite.invite.id)?.remainingUses).toBe(1);
      });
    }
  });
}
