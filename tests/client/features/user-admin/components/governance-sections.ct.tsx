// CT: the OWNER-GATED admin section (SET-SEAMS stage 4) — Multi-user, mounted as the door renders it. The
// property under test is the one §4 constrains by PERMISSION rather than by reader: ONE owner predicate gates
// the D17 governance controls (a delegated admin sees them disabled instead of bouncing off `requireOwner`),
// while the admin-writable neighbour (`discreetLogin`) stays live — and the Reset the section offers names
// only the keys that viewer may actually clear. Plus P1 patch key-minimality on the writes themselves.
//
// SHARED ACCESS IS GONE (`@orb/inference` cut-over, 2026-09-20). Its three keys —
// `allowNonOwnerLocalCompute`, `nonOwnerLocalComputeBudget`, `allowNonOwnerMaxProSub` — left `AppSettings`
// with the in-server vLLM fleet and the owner-compute premise (there is no box-owned compute to share any
// more; a connection is the member's own). The specs that drove that section are DELETED rather than
// re-pointed: their subject does not exist. What survives is the claim this module was written for — ONE
// module-private `useIsBoxOwner()` predicate, per-KEY rather than per-section.

import type { ShareStatus, SignInModeView } from "@orb/contracts/identity";
import { copyActionName } from "@orb/ui/lib";
import { expect, test } from "@playwright/experimental-ct-react";
import type { JSHandle, Locator, Page } from "@playwright/test";
import type { TrpcRecorder, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { GovernanceSectionsStory } from "../_ct-stories.tsx";
import type { EffectiveAppSettings } from "../app-settings-fixtures.ts";
import { appSettingsView, effectiveAppSettings } from "../app-settings-fixtures.ts";
import { refusalSentence, signInModeView } from "../auth-config-fixtures.ts";

const UPDATE_PROC = "settings.updateAppSettings";

type AppSettingsOverrides = TrpcWireOutput<"settings.getAppSettingsWithOverrides">["overrides"];

const OWNER = { userId: "user_owner", handle: "owner", globalRole: "owner" } satisfies TrpcWireOutput<"sessions.me">;
const DELEGATED_ADMIN = { userId: "user_admin", handle: "admin", globalRole: "admin" } satisfies TrpcWireOutput<"sessions.me">;

const SHARE_OFF: ShareStatus = { relay: { state: "off" }, liveSocketCount: 0, publicAddresses: [], certificate: { state: "off" } };

const RESOLVED: Partial<EffectiveAppSettings> = {
  localMultiUser: false,
  discreetLogin: false,
  privateEndpointAllowlist: ["127.0.0.1", "::1"],
};

interface StubOptions {
  readonly overrides?: Partial<AppSettingsOverrides>;
  readonly resolved?: typeof RESOLVED;
  readonly signIn?: SignInModeView;
}

function stub(page: Page, viewer: TrpcWireOutput<"sessions.me">, options: StubOptions = {}): Promise<TrpcRecorder> {
  const { overrides = {}, resolved = RESOLVED, signIn = signInModeView("single-user") } = options;
  return routeTrpc(page, {
    "settings.getAppSettingsWithOverrides": () => appSettingsView(resolved, overrides),
    "sessions.me": () => viewer,
    [UPDATE_PROC]: () => effectiveAppSettings(RESOLVED),
    // The owner's Share card beside the posture panel reads these; its own CT drives them.
    "share.status": () => SHARE_OFF,
    "share.signInMode": () => signIn,
    "admin.listUsers": () => [],
  });
}

function lastPartial(trpc: TrpcRecorder): Record<string, unknown> | undefined {
  return (trpc.lastInput(UPDATE_PROC) as { partial?: Record<string, unknown> } | undefined)?.partial;
}

test("the section stamps its own admin anchor", async ({ mount, page }) => {
  await stub(page, OWNER);
  await mount(<GovernanceSectionsStory />);

  await expect(page.locator("#config-anchor-admin-multi-user")).toBeVisible();
});

// The ONE predicate, per KEY: a delegated admin sees the D17 seating switch disabled while the
// admin-writable login posture beside it stays live — which is exactly what a section-wide gate would get
// wrong, and what a gate copied per control would eventually drift on.
test("a delegated admin sees both owner-gated controls disabled, while the admin-writable control stays live", async ({ mount, page }) => {
  await stub(page, DELEGATED_ADMIN);
  await mount(<GovernanceSectionsStory />);

  await expect(page.getByRole("switch", { name: "Allow multiple humans (local mode)" })).toBeDisabled();
  await expect(page.getByRole("textbox", { name: "Allowed private endpoints" })).toBeDisabled();
  // The admin-writable neighbour is NOT gated — the predicate is per-KEY, not per-section.
  await expect(page.getByRole("switch", { name: "Discreet login" })).toBeEnabled();
});

test("the owner may drive it, and a toggle patches EXACTLY its own key", async ({ mount, page }) => {
  const trpc = await stub(page, OWNER);
  await mount(<GovernanceSectionsStory />);

  const seating = page.getByRole("switch", { name: "Allow multiple humans (local mode)" });
  await expect(seating).toBeEnabled();
  await seating.click();
  await expect.poll(() => lastPartial(trpc), { intervals: [20, 50, 100] }).toStrictEqual({ localMultiUser: true });
});

test("the owner saves the complete private-endpoint list as one sparse override", async ({ mount, page }) => {
  const trpc = await stub(page, OWNER);
  await mount(<GovernanceSectionsStory />);

  const allowlist = page.getByRole("textbox", { name: "Allowed private endpoints" });
  await expect(allowlist).toHaveValue("127.0.0.1\n::1");
  // Entry syntax belongs to the server belt. The client preserves a CIDR+port typo in the submitted list
  // so one bad line cannot make the `.catch(undefined)` contract drop the operator's whole override.
  await allowlist.fill("  ollama.lan:11434\n10.0.0.0/8\n10.0.0.0/8:443\n\n[::1]:8703  ");
  await page.getByRole("button", { name: "Save" }).click();
  await expect
    .poll(() => lastPartial(trpc), { intervals: [20, 50, 100] })
    .toStrictEqual({
      privateEndpointAllowlist: ["ollama.lan:11434", "10.0.0.0/8", "10.0.0.0/8:443", "[::1]:8703"],
    });
});

test("the owner can save an explicitly empty private-endpoint list without resetting the override", async ({ mount, page }) => {
  const trpc = await stub(page, OWNER);
  await mount(<GovernanceSectionsStory />);

  await page.getByRole("textbox", { name: "Allowed private endpoints" }).fill("");
  await page.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => lastPartial(trpc), { intervals: [20, 50, 100] }).toStrictEqual({ privateEndpointAllowlist: [] });
});

// Multi-user's Reset is viewer-shaped: an owner clears all three keys, a delegated admin only the one they may
// write — a blanket clear would name `localMultiUser` and bounce off `requireOwner` with nothing saved.
test("Multi-user's Reset clears only the keys the viewer may clear — owner", async ({ mount, page }) => {
  const trpc = await stub(page, OWNER, {
    overrides: { localMultiUser: true, discreetLogin: true, privateEndpointAllowlist: ["ollama.lan:11434"] },
    resolved: { ...RESOLVED, privateEndpointAllowlist: ["ollama.lan:11434"] },
  });
  await mount(<GovernanceSectionsStory />);

  await page.locator("#config-anchor-admin-multi-user").getByRole("button", { name: "Reset to defaults" }).click();
  await expect
    .poll(() => lastPartial(trpc), { intervals: [20, 50, 100] })
    .toStrictEqual({
      localMultiUser: null,
      discreetLogin: null,
      privateEndpointAllowlist: null,
    });
  await expect(page.getByRole("textbox", { name: "Allowed private endpoints" })).toHaveValue("127.0.0.1\n::1");
});

test("Multi-user's Reset clears only the keys the viewer may clear — delegated admin", async ({ mount, page }) => {
  const trpc = await stub(page, DELEGATED_ADMIN, {
    overrides: { localMultiUser: true, discreetLogin: true, privateEndpointAllowlist: ["ollama.lan:11434"] },
  });
  await mount(<GovernanceSectionsStory />);

  await page.locator("#config-anchor-admin-multi-user").getByRole("button", { name: "Reset to defaults" }).click();
  await expect.poll(() => lastPartial(trpc), { intervals: [20, 50, 100] }).toStrictEqual({ discreetLogin: null });
});

// The read-only sharing panel beside the seating switch: letting other devices sign in is an env change
// (AUTH_MODE), never a runtime switch, so the panel states the mode, where it came from, and the lines that switch it.
function signInPanel(page: Page): Locator {
  return page.getByTestId("admin-sharing-panel");
}

/** The env how-tos sit behind this disclosure; every assertion about the lines they hold opens it first. */
async function openHowTo(page: Page): Promise<void> {
  await signInPanel(page).getByRole("button", { name: "How to change sign-in mode" }).click();
  const panel = signInPanel(page).locator('[data-slot="collapsible-panel"]');
  await expect(panel).toHaveAttribute("data-open", "");
  await expect(panel).not.toHaveAttribute("data-starting-style");
  // Copy controls move with the disclosure and with late fonts; neither may move during the next click.
  await panel.evaluate(async (element) => {
    await document.fonts.ready;
    await Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => undefined)));
  });
}

function targetBlocks(page: Page): Locator {
  return signInPanel(page).getByTestId("admin-sign-in-target");
}

test("the how-to drive settles the disclosure before exposing copy targets to another gesture", async ({ mount, page }) => {
  await stub(page, OWNER);
  await mount(<GovernanceSectionsStory />);
  await openHowTo(page);
  const panel = signInPanel(page).locator('[data-slot="collapsible-panel"]');
  // @orb-waive ct-no-oneshot-live-read-assert(expect): openHowTo awaits this panel's animation.finished; retrying here would conceal a broken return-time barrier.
  expect(await panel.evaluate((element) => element.getAnimations().filter((animation) => animation.playState === "running").length)).toBe(0);
});

interface NativeClipboardWrite {
  text: string;
  settled: boolean;
  error: string | null;
}

interface NativeClipboardObservation {
  calls: NativeClipboardWrite[];
  events: { type: string; target: string; trusted: boolean; timeStamp: number }[];
}

/** Observe the real browser write without replacing its permission or clipboard channel. */
function observeNativeClipboardWrites(page: Page): Promise<JSHandle<NativeClipboardObservation>> {
  return page.evaluateHandle(() => {
    const calls: NativeClipboardWrite[] = [];
    const events: NativeClipboardObservation["events"] = [];
    for (const type of ["pointerdown", "pointerup", "click"]) {
      document.addEventListener(
        type,
        (event) => {
          const element = event.target instanceof Element ? event.target : null;
          events.push({
            type: event.type,
            target: element?.closest("button")?.getAttribute("aria-label") ?? element?.tagName ?? "",
            trusted: event.isTrusted,
            timeStamp: event.timeStamp,
          });
        },
        { capture: true, passive: true },
      );
    }
    const write = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = (text): Promise<void> => {
      const call: NativeClipboardWrite = { text, settled: false, error: null };
      calls.push(call);
      return write(text).then(
        () => {
          call.settled = true;
        },
        (error: Error) => {
          call.settled = true;
          call.error = error.message;
          throw error;
        },
      );
    };
    return { calls, events };
  });
}

async function copyWithNativeEvidence(page: Page, what: string): Promise<void> {
  const writes = await observeNativeClipboardWrites(page);
  const target = signInPanel(page)
    .locator('[data-slot="copy-button-root"]')
    .filter({ has: page.getByRole("button", { name: copyActionName(what), exact: true }) });
  try {
    await target.getByRole("button", { name: copyActionName(what), exact: true }).click();
    await expect(target.getByRole("status")).toHaveAttribute("data-outcome", "copied");
  } finally {
    const observation = await writes.evaluate((recorded) => recorded);
    const state = await target.getAttribute("data-state");
    const pageState = await page.evaluate(() => ({ focused: document.hasFocus(), secure: globalThis.isSecureContext, visibility: document.visibilityState }));
    await test.info().attach("native-clipboard", { body: JSON.stringify({ ...observation, state, pageState }, null, 2), contentType: "application/json" });
  }
}

test("single-user on bare metal: the setup command, then a switch for each login mode", async ({ mount, page }) => {
  await stub(page, OWNER);
  await mount(<GovernanceSectionsStory />);
  await openHowTo(page);

  const panel = signInPanel(page);
  await expect(panel).toHaveAttribute("data-auth-mode", "single-user");
  await expect(panel).toHaveAttribute("data-install", "bare-metal");
  await expect(panel.getByTestId("admin-sharing-line")).toHaveText("pnpm start --setup");
  await expect(targetBlocks(page)).toHaveCount(3);
  await expect(targetBlocks(page).nth(0)).toHaveAttribute("data-target-mode", "local");
});

test("a container never offers the setup command, which it cannot run", async ({ mount, page }) => {
  await stub(page, OWNER, { signIn: signInModeView("single-user", { install: "container", source: "process-env" }) });
  await mount(<GovernanceSectionsStory />);
  await openHowTo(page);

  const panel = signInPanel(page);
  await expect(panel).toHaveAttribute("data-auth-mode-source", "process-env");
  await expect(panel.getByTestId("admin-sharing-line")).toHaveCount(0);
  await expect(targetBlocks(page)).toHaveCount(3);
});

test("the running mode gets no switch, and a refused mode carries the server's own refusal sentence", async ({ mount, page }) => {
  await stub(page, DELEGATED_ADMIN, { signIn: signInModeView("oidc") });
  await mount(<GovernanceSectionsStory />);
  await openHowTo(page);

  await expect(signInPanel(page)).toHaveAttribute("data-auth-mode", "oidc");
  await expect(targetBlocks(page)).toHaveCount(2);
  await expect(page.locator('[data-target-mode="oidc"]')).toHaveCount(0);
  await expect(page.locator('[data-target-mode="forward-header"]')).toContainText(refusalSentence("forward-header"));
});

test.describe("the sharing panel's copy", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("bare metal copies only the mode line into .env: the fallback keys stay out", async ({ mount, page }) => {
    await stub(page, OWNER);
    await mount(<GovernanceSectionsStory />);
    await openHowTo(page);

    await copyWithNativeEvidence(page, "the local lines");
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("AUTH_MODE=local");
  });

  test("a container copies the mode with the fallback pair the shipped env file needs overridden", async ({ mount, page }) => {
    await stub(page, OWNER, { signIn: signInModeView("single-user", { install: "container", source: "process-env" }) });
    await mount(<GovernanceSectionsStory />);
    await openHowTo(page);

    await copyWithNativeEvidence(page, "the forward-header lines");
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe("AUTH_MODE=forward-header\nAUTH_FALLBACK=deny\nAUTH_FALLBACK_TRUSTED_PEERS=\nFORWARD_AUTH_TRUSTED_PROXIES=172.18.0.100/32");
  });
});

test.describe("the sharing panel's manual-copy fallback at 360px", () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test("the field takes the panel's full width and replaces the chip it repeats", async ({ mount, page }) => {
    await stub(page, OWNER);
    await mount(<GovernanceSectionsStory width={360} />);
    await openHowTo(page);
    // What an insecure (plain http) origin looks like: the [SecureContext] Clipboard API is absent.
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
      Object.defineProperty(globalThis, "isSecureContext", { configurable: true, value: false });
    });

    const panel = signInPanel(page);
    await panel.getByRole("button", { name: copyActionName("the command pnpm start --setup"), exact: true }).click();
    const field = panel.getByRole("textbox", { name: "the command pnpm start --setup", exact: true });
    await expect(field).toBeFocused();
    await expect(panel.getByTestId("admin-sharing-line")).toBeHidden();
    await expect
      .poll(async () => {
        const [fieldBox, panelBox] = await Promise.all([field.boundingBox(), panel.boundingBox()]);
        return fieldBox !== null && panelBox !== null && fieldBox.width >= panelBox.width - 1;
      })
      .toBe(true);
  });
});

// Read-only by ruling: the auth mode is a boot fact, so the panel offers nothing to toggle, for any viewer.
// P3-7: the panel is a real heading, and every command, key and file a sentence names reads as code on ONE line:
// a command broken across two lines reads as two commands.
test.describe("at a 360px viewport", () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test("oidc: 'Who can sign in' is a heading, and no command in a sentence breaks across lines", async ({ mount, page }) => {
    await stub(page, OWNER, { signIn: signInModeView("oidc") });
    await mount(<GovernanceSectionsStory />);
    await openHowTo(page);
    const panel = signInPanel(page);
    await expect(panel.getByRole("heading", { level: 4, name: "Who can sign in" })).toBeVisible();
    const commands = panel.locator("p kbd");
    await expect(commands.first()).toBeVisible();
    // One line box each, all the height of the shortest: a wrapped command is two boxes and twice as tall.
    await expect
      .poll(async () => {
        const boxes = await commands.evaluateAll((nodes) =>
          nodes.map((node) => ({ rects: node.getClientRects().length, height: node.getBoundingClientRect().height })),
        );
        const line = Math.min(...boxes.map((box) => box.height));
        return boxes.every((box) => box.rects === 1 && box.height <= line + 1);
      })
      .toBe(true);
  });
});

test("the sharing panel is read-only: no switch, no field, only copy buttons, even for the owner", async ({ mount, page }) => {
  await stub(page, OWNER);
  await mount(<GovernanceSectionsStory />);

  const panel = signInPanel(page);
  await expect(panel).toBeVisible();
  await openHowTo(page);
  await expect(panel.getByRole("switch")).toHaveCount(0);
  await expect(panel.getByRole("textbox")).toHaveCount(0);
  // The disclosure, the setup command and one block per login mode.
  await expect(panel.getByRole("button")).toHaveCount(5);
  await expect(panel.getByRole("button", { name: copyActionName("the command pnpm start --setup"), exact: true })).toBeVisible();
});
