// CT: the Operations admin SECTION (SET-SEAMS stage 4) — background corpus indexing + the live log level.
// Both controls write IMMEDIATELY (no draft), which is the shape worth pinning: the shared row must offer
// Reset ALONE (a permanently-disabled Save button would be dead chrome), and each write must still be
// key-minimal.

import { once } from "node:events";
import type { ServerResponse } from "node:http";
import { createServer } from "node:http";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { isOrbSocketRequest } from "../../../../support/node/route-orb-socket.ts";
import type { TrpcRecorder, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcError, trpcHold } from "../../../../support/node/route-trpc.ts";
import { OperationsRestartStory, OperationsSectionStory } from "../_ct-stories.tsx";
import type { EffectiveAppSettings } from "../app-settings-fixtures.ts";
import { appSettingsView, effectiveAppSettings } from "../app-settings-fixtures.ts";

const UPDATE_PROC = "settings.updateAppSettings";
const RESTART_PROC = "admin.restart";
const SERVER_A = "10000000-0000-4000-8000-000000000001";
const SERVER_B = "10000000-0000-4000-8000-000000000002";
const SERVER_C = "10000000-0000-4000-8000-000000000003";
const OWNER = { userId: "user_owner", handle: "owner", globalRole: "owner" } satisfies TrpcWireOutput<"sessions.me">;

type AppSettingsOverrides = TrpcWireOutput<"settings.getAppSettingsWithOverrides">["overrides"];

const RESOLVED: Partial<EffectiveAppSettings> = { corpusAutoindex: false, logLevel: "info" };

function stub(page: Page, overrides: Partial<AppSettingsOverrides> = {}): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "settings.getAppSettingsWithOverrides": () => appSettingsView(RESOLVED, overrides),
    "sessions.me": () => OWNER,
    [UPDATE_PROC]: () => effectiveAppSettings(RESOLVED),
    "stream.attach": () => undefined,
    "stream.detach": () => undefined,
  });
}

function lastPartial(trpc: TrpcRecorder): Record<string, unknown> | undefined {
  return (trpc.lastInput(UPDATE_PROC) as { partial?: Record<string, unknown> } | undefined)?.partial;
}

const socketCleanupByPage = new Map<Page, () => Promise<void>>();

test.afterEach(async ({ page }) => {
  await socketCleanupByPage.get(page)?.();
  socketCleanupByPage.delete(page);
});

interface ParagraphGeometry {
  readonly paragraphWidth: number;
  readonly tokenWidth: number;
  readonly wrapperWidth: number;
}

async function assertParagraphMeasure(paragraph: Locator): Promise<void> {
  await expect(paragraph).toBeVisible();
  const geometry = (): Promise<ParagraphGeometry> =>
    paragraph.evaluate((element) => {
      const probe = document.createElement("span");
      probe.setAttribute("aria-hidden", "true");
      probe.style.position = "absolute";
      probe.style.display = "block";
      probe.style.visibility = "hidden";
      probe.style.width = "var(--reading-measure-prose)";
      element.append(probe);
      const measured = {
        paragraphWidth: element.getBoundingClientRect().width,
        tokenWidth: probe.getBoundingClientRect().width,
        wrapperWidth: element.parentElement?.getBoundingClientRect().width ?? 0,
      };
      probe.remove();
      return measured;
    });
  await expect.poll(async () => (await geometry()).tokenWidth).toBeGreaterThan(0);
  await expect
    .poll(async () => {
      const measured = await geometry();
      return measured.paragraphWidth - measured.tokenWidth;
    })
    .toBeLessThanOrEqual(0);
  // The cap belongs to the paragraph: the button's enclosing control surface stays wider.
  await expect
    .poll(async () => {
      const measured = await geometry();
      return measured.wrapperWidth - measured.tokenWidth;
    })
    .toBeGreaterThan(0);
}

test("mounts on the resolved values, stamps its anchor, and offers no dead Save button", async ({ mount, page }) => {
  await stub(page);
  await mount(<OperationsSectionStory />);

  await expect(page.getByRole("switch", { name: "Background corpus indexing" })).not.toBeChecked();
  await expect(page.getByRole("combobox", { name: "Log level" })).toContainText("Info");
  await expect(page.locator("#config-anchor-admin-operations")).toBeVisible();
  // Every control here writes immediately — there is no draft, so there is no Save.
  await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
});

test("restart requires confirmation; cancel makes no request", async ({ mount, page }) => {
  const trpc = await stub(page);
  await socketSchedule(page);
  await mount(<OperationsRestartStory />);
  await expect(page.getByRole("combobox", { name: "Log level" })).toBeVisible();
  await page.getByRole("button", { name: "Restart server", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Active requests stop");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => trpc.count(RESTART_PROC)).toBe(0);
});

for (const role of ["admin", "user"] as const) {
  test(`${role} does not receive the owner restart control`, async ({ mount, page }) => {
    await routeTrpc(page, {
      "sessions.me": () => ({ ...OWNER, globalRole: role }),
      "settings.getAppSettingsWithOverrides": () => appSettingsView(RESOLVED, {}),
    });
    await mount(<OperationsSectionStory />);
    await expect(page.getByRole("combobox", { name: "Log level" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Restart server", exact: true })).toHaveCount(0);
  });
}

test("unsupervised restart refuses visibly and leaves confirmation open", async ({ mount, page }) => {
  const message = "This server was not started by pnpm start, so nothing would start it again. Restart it the way you started it.";
  await routeTrpc(page, {
    "sessions.me": () => OWNER,
    "settings.getAppSettingsWithOverrides": () => appSettingsView(RESOLVED, {}),
    [RESTART_PROC]: () => trpcError({ code: "BAD_REQUEST", message }),
    "stream.attach": () => undefined,
    "stream.detach": () => undefined,
  });
  await socketSchedule(page);
  await mount(<OperationsRestartStory />);
  await page.getByRole("button", { name: "Restart server", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: "Restart server", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(message);
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
});

async function socketSchedule(
  page: Page,
  blockFirst = false,
  oldProcessReconnect = false,
): Promise<{
  firstRequested: Promise<void>;
  reconnectRequested: Promise<void>;
  releaseFirst: () => void;
  dropFirst: () => void;
  releaseReconnect: () => void;
  repeatReconnectIdentity: () => void;
  releaseRestarted: () => void;
}> {
  let connects = 0;
  let disposed = false;
  const responses = new Map<number, ServerResponse>();
  const firstRequested = Promise.withResolvers<void>();
  const reconnectRequested = Promise.withResolvers<void>();
  const first = Promise.withResolvers<void>();
  const reconnect = Promise.withResolvers<void>();
  const restarted = Promise.withResolvers<void>();
  const ids = oldProcessReconnect ? [SERVER_A, SERVER_A, SERVER_C] : [SERVER_A, SERVER_B, SERVER_C];
  const writeIdentity = (response: ServerResponse, id: string): void => {
    response.write(`id: 1\ndata: ${JSON.stringify({ channel: "control", type: "serverReady", serverInstanceId: id })}\n\n`);
  };
  // Finite route.fulfill bodies hit EOF immediately. A real open stream makes down/readiness ordering observable.
  const server = createServer(async (_request, response) => {
    const connection = ++connects;
    responses.set(connection, response);
    if (connection === 1) {
      firstRequested.resolve();
      if (blockFirst) {
        await first.promise;
      }
    } else if (connection === 2) {
      reconnectRequested.resolve();
      await reconnect.promise;
    } else {
      await restarted.promise;
    }
    if (disposed) {
      response.end();
      return;
    }
    response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    response.write("event: connected\ndata: {}\n\n");
    writeIdentity(response, ids[Math.min(connection - 1, ids.length - 1)] ?? SERVER_C);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected loopback streaming fixture port");
  }
  await page.route("**/api/trpc/**", async (route) => {
    if (isOrbSocketRequest(route.request())) {
      if (disposed) {
        await route.abort("aborted");
        return;
      }
      await route.continue({ url: `http://127.0.0.1:${address.port}/socket` });
      return;
    }
    await route.fallback();
  });
  socketCleanupByPage.set(page, async () => {
    disposed = true;
    first.resolve();
    reconnect.resolve();
    restarted.resolve();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });
  return {
    firstRequested: firstRequested.promise,
    reconnectRequested: reconnectRequested.promise,
    releaseFirst: () => first.resolve(),
    dropFirst: () => responses.get(1)?.end(),
    releaseReconnect: (): void => {
      responses.get(1)?.end();
      reconnect.resolve();
    },
    repeatReconnectIdentity: (): void => {
      const response = responses.get(2);
      if (response !== undefined) {
        writeIdentity(response, ids[1] ?? SERVER_B);
      }
    },
    releaseRestarted: (): void => {
      responses.get(2)?.end();
      restarted.resolve();
    },
  };
}

test("an admission instance mismatch stays a visible refusal and is never automatically retried", async ({ mount, page }) => {
  const message = "The server changed before this request arrived. Wait for live updates, then confirm the restart again.";
  const trpc = await routeTrpc(page, {
    "sessions.me": () => OWNER,
    "settings.getAppSettingsWithOverrides": () => appSettingsView(RESOLVED, {}),
    [RESTART_PROC]: () => trpcError({ code: "BAD_REQUEST", reason: "restart_instance_changed", message }),
    "stream.attach": () => undefined,
    "stream.detach": () => undefined,
  });
  const socket = await socketSchedule(page);
  await mount(<OperationsRestartStory />);
  await expect(page.getByTestId("operations-connections")).toHaveText("1");
  await page.getByRole("button", { name: "Restart server", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: "Restart server", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(message);
  await expect.poll(() => trpc.lastInput(RESTART_PROC)).toEqual({ confirm: true, expectedServerInstanceId: SERVER_A });
  socket.releaseReconnect();
  await expect(page.getByTestId("operations-connections")).toHaveText("2", { timeout: 15_000 });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect.poll(() => trpc.count(RESTART_PROC)).toBe(1);
});

test("restart reconciles ACK-first without duplicate dispatch", async ({ mount, page }) => {
  const hold = trpcHold();
  const trpc = await routeTrpc(page, {
    "sessions.me": () => OWNER,
    "settings.getAppSettingsWithOverrides": () => appSettingsView(RESOLVED, {}),
    [RESTART_PROC]: hold,
    "stream.attach": () => undefined,
    "stream.detach": () => undefined,
  });
  const socket = await socketSchedule(page);
  await mount(<OperationsRestartStory />);
  await expect(page.getByTestId("operations-connections")).toHaveText("1");
  await page.getByRole("button", { name: "Restart server", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  const confirm = dialog.getByRole("button", { name: "Restart server", exact: true });
  await confirm.click();
  await hold.requested;
  await expect(confirm).toBeDisabled();
  await expect(dialog.getByRole("status")).toHaveText("Sending the restart request…");
  await expect(dialog).toHaveAccessibleDescription(/Sending the restart request….*Active requests stop/u);
  await page.keyboard.press("Enter");
  await expect.poll(() => trpc.count(RESTART_PROC)).toBe(1);
  await expect.poll(() => trpc.lastInput(RESTART_PROC)).toEqual({ confirm: true, expectedServerInstanceId: SERVER_A });
  hold.release({ restarting: true });
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("status")).toContainText("Restart accepted");
  await expect(page.getByRole("button", { name: "Restart server", exact: true })).toBeDisabled();
  socket.releaseReconnect();
  await expect(page.getByRole("status")).toContainText("Server is back online", { timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Restart server", exact: true })).toBeEnabled();
  await expect.poll(() => trpc.count(RESTART_PROC)).toBe(1);
});

test("restart reconciles reconnect-first without duplicate dispatch", async ({ mount, page }) => {
  const hold = trpcHold();
  const trpc = await routeTrpc(page, {
    "sessions.me": () => OWNER,
    "settings.getAppSettingsWithOverrides": () => appSettingsView(RESOLVED, {}),
    [RESTART_PROC]: hold,
    "stream.attach": () => undefined,
    "stream.detach": () => undefined,
  });
  const socket = await socketSchedule(page);
  await mount(<OperationsRestartStory />);
  await expect(page.getByTestId("operations-connections")).toHaveText("1");
  await page.getByRole("button", { name: "Restart server", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  const confirm = dialog.getByRole("button", { name: "Restart server", exact: true });
  await confirm.click();
  await hold.requested;
  await expect(confirm).toBeDisabled();
  await expect(dialog.getByRole("status")).toHaveText("Sending the restart request…");
  await expect(dialog).toHaveAccessibleDescription(/Sending the restart request….*Active requests stop/u);
  await page.keyboard.press("Enter");
  await expect.poll(() => trpc.count(RESTART_PROC)).toBe(1);
  await expect.poll(() => trpc.lastInput(RESTART_PROC)).toEqual({ confirm: true, expectedServerInstanceId: SERVER_A });
  socket.releaseReconnect();
  await expect(page.getByTestId("operations-connections")).toHaveText("2", { timeout: 15_000 });
  await expect(dialog).toBeVisible();
  await expect(confirm).toBeDisabled();
  hold.release({ restarting: true });
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("status")).toContainText("Server is back online", { timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Restart server", exact: true })).toBeEnabled();
  await expect.poll(() => trpc.count(RESTART_PROC)).toBe(1);
});

test("an old-process reconnect during held admission cannot complete restart recovery", async ({ mount, page }) => {
  const hold = trpcHold();
  const trpc = await routeTrpc(page, {
    "sessions.me": () => OWNER,
    "settings.getAppSettingsWithOverrides": () => appSettingsView(RESOLVED, {}),
    [RESTART_PROC]: hold,
    "stream.attach": () => undefined,
    "stream.detach": () => undefined,
  });
  const socket = await socketSchedule(page, false, true);
  await mount(<OperationsRestartStory />);
  await expect(page.getByTestId("operations-connections")).toHaveText("1");
  await page.getByRole("button", { name: "Restart server", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  const confirm = dialog.getByRole("button", { name: "Restart server", exact: true });
  await confirm.click();
  await hold.requested;
  // This reconnect is still the old process: the real verb may be awaiting its audit before scheduling shutdown.
  socket.releaseReconnect();
  await expect(page.getByTestId("operations-connections")).toHaveText("2", { timeout: 15_000 });
  await expect(confirm).toBeDisabled();
  hold.release({ restarting: true });
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("status")).toContainText("Restart accepted");
  await expect(page.getByRole("status")).not.toContainText("Server is back online");
  const trigger = page.getByRole("button", { name: "Restart server", exact: true });
  await expect(trigger).toBeDisabled();
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => trpc.count(RESTART_PROC)).toBe(1);
  socket.releaseRestarted();
  await expect(page.getByRole("status")).toContainText("Server is back online", { timeout: 15_000 });
  await expect(trigger).toBeEnabled();
  await expect.poll(() => trpc.count(RESTART_PROC)).toBe(1);
});

test("a mounted control refuses confirmation after A goes down, then B must recover on C", async ({ mount, page }) => {
  const hold = trpcHold();
  const trpc = await routeTrpc(page, {
    "sessions.me": () => OWNER,
    "settings.getAppSettingsWithOverrides": () => appSettingsView(RESOLVED, {}),
    [RESTART_PROC]: hold,
    "stream.attach": () => undefined,
    "stream.detach": () => undefined,
  });
  const socket = await socketSchedule(page);
  await mount(<OperationsRestartStory />);
  await expect(page.getByTestId("operations-connections")).toHaveText("1");
  await page.getByRole("button", { name: "Restart server", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  const confirm = dialog.getByRole("button", { name: "Restart server", exact: true });
  socket.dropFirst();
  await socket.reconnectRequested;
  await expect(confirm).toBeDisabled();
  await expect(dialog).toContainText("Waiting for live updates before restart becomes available.");
  await confirm.dispatchEvent("click");
  await expect(dialog).toBeVisible();
  await expect.poll(() => trpc.count(RESTART_PROC)).toBe(0);
  socket.releaseReconnect();
  await expect(page.getByTestId("operations-connections")).toHaveText("2", { timeout: 15_000 });
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await hold.requested;
  await expect.poll(() => trpc.lastInput(RESTART_PROC)).toEqual({ confirm: true, expectedServerInstanceId: SERVER_B });
  socket.repeatReconnectIdentity();
  await expect(page.getByTestId("operations-connections")).toHaveText("3");
  hold.release({ restarting: true });
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("status")).toContainText("Restart accepted");
  await expect(page.getByRole("status")).not.toContainText("Server is back online");
  const trigger = page.getByRole("button", { name: "Restart server", exact: true });
  await expect(trigger).toBeDisabled();
  socket.releaseRestarted();
  await expect(page.getByRole("status")).toContainText("Server is back online", { timeout: 15_000 });
  await expect(trigger).toBeEnabled();
  await expect.poll(() => trpc.count(RESTART_PROC)).toBe(1);
});

test("a cold page explains the first-connection requirement, then can restart and recover", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "sessions.me": () => OWNER,
    "settings.getAppSettingsWithOverrides": () => appSettingsView(RESOLVED, {}),
    [RESTART_PROC]: () => ({ restarting: true }),
    "stream.attach": () => undefined,
    "stream.detach": () => undefined,
  });
  const socket = await socketSchedule(page, true);
  await mount(<OperationsRestartStory />);
  await socket.firstRequested;
  const trigger = page.getByRole("button", { name: "Restart server", exact: true });
  await expect(trigger).toBeDisabled();
  await expect(page.getByText("Waiting for live updates before restart becomes available.")).toBeVisible();
  await expect.poll(() => trpc.count(RESTART_PROC)).toBe(0);
  socket.releaseFirst();
  await expect(trigger).toBeEnabled();
  await trigger.click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Restart server", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Restart accepted");
  socket.releaseReconnect();
  await expect(page.getByRole("status")).toContainText("Server is back online", { timeout: 15_000 });
  await expect.poll(() => trpc.count(RESTART_PROC)).toBe(1);
});

test("admission followed by lost ACK stays uncertain and guarded until reconnect, without retrying", async ({ mount, page }) => {
  await routeTrpc(page, {
    "sessions.me": () => OWNER,
    "settings.getAppSettingsWithOverrides": () => appSettingsView(RESOLVED, {}),
    "stream.attach": () => undefined,
    "stream.detach": () => undefined,
  });
  const socket = await socketSchedule(page, false, true);
  let restartRequests = 0;
  await page.route("**/api/trpc/**", async (route) => {
    if (route.request().url().includes(RESTART_PROC)) {
      restartRequests += 1;
      await route.abort("aborted");
      return;
    }
    await route.fallback();
  });
  await mount(<OperationsRestartStory />);
  await expect(page.getByTestId("operations-connections")).toHaveText("1");
  await page.getByRole("button", { name: "Restart server", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: "Restart server", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("status")).toContainText("The restart response was lost");
  await assertParagraphMeasure(page.getByRole("status"));
  await expect(page.getByText("That didn't go through", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Restart server", exact: true })).toBeDisabled();
  await expect.poll(() => restartRequests).toBe(1);
  socket.releaseReconnect();
  await expect(page.getByTestId("operations-connections")).toHaveText("2", { timeout: 15_000 });
  await expect(page.getByRole("status")).toContainText("The restart response was lost");
  await expect(page.getByRole("button", { name: "Restart server", exact: true })).toBeDisabled();
  socket.releaseRestarted();
  await expect(page.getByRole("status")).toContainText("Server is back online", { timeout: 15_000 });
  await expect(page.getByRole("status")).toContainText("restart itself could not be confirmed");
  await expect(page.getByRole("button", { name: "Restart server", exact: true })).toBeEnabled();
  await expect.poll(() => restartRequests).toBe(1);
});

test("toggling the indexer patches EXACTLY that key", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<OperationsSectionStory />);

  await page.getByRole("switch", { name: "Background corpus indexing" }).click();
  await expect.poll(() => lastPartial(trpc), { intervals: [20, 50, 100] }).toStrictEqual({ corpusAutoindex: true });
});

test("picking a log level patches EXACTLY that key", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<OperationsSectionStory />);

  await page.getByRole("combobox", { name: "Log level" }).click();
  await page.getByRole("option", { name: "Debug" }).click();
  await expect.poll(() => lastPartial(trpc), { intervals: [20, 50, 100] }).toStrictEqual({ logLevel: "debug" });
});

test("Reset appears only with an override and clears both of this section's keys", async ({ mount, page }) => {
  const trpc = await stub(page, { logLevel: "debug" });
  await mount(<OperationsSectionStory />);

  await expect(page.getByText("Overridden. Reset to fall back to this deployment's default.")).toBeVisible();
  await page.getByRole("button", { name: "Reset to defaults" }).click();
  await expect.poll(() => lastPartial(trpc), { intervals: [20, 50, 100] }).toStrictEqual({ corpusAutoindex: null, logLevel: null });
});
