// CT: the About SECTION (Settings → Admin → About this install) — the build identity a bug report quotes,
// its copy affordance, and the MANUAL update check.
//
// Every assertion here is a user-visible affordance: the rendered version line, the button's accessible
// name, the verdict badge's text, and the trpc call record. The two properties worth a browser rather than
// a unit test are exactly the ones that cannot be asserted from source:
//   1. NOTHING CALLS GITHUB UNTIL THE BUTTON IS PRESSED. The check is a `enabled: false` query; a regression
//      to a mount-time fetch (or a poll) would be invisible to tsc and to every server-side spec, and it is
//      the difference between a manual check and a phone-home.
//   2. "COULDN'T CHECK" NEVER PAINTS LIKE "UP TO DATE". The unknown arm renders its own reason; a reader
//      glancing at a green line on an offline box is the failure this feature exists to avoid.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder, TrpcRoutes, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { AboutSectionStory } from "../_ct-stories.tsx";

const LOCAL_COMMIT = "823d76f4343a1cea086b17a1b5bf212b44c17a7d";
const REMOTE_COMMIT = "f00dcafe1234567890abcdef1234567890abcdef";

const VERSION = {
  version: "0.4.1",
  commit: LOCAL_COMMIT,
  short: LOCAL_COMMIT.slice(0, 12),
  source: "checkout",
} satisfies TrpcWireOutput<"settings.getVersion">;
const CHECK_BUTTON = "Check for updates";

function stub(page: Page, extra: Partial<TrpcRoutes<"settings.checkForUpdate" | "settings.getVersion">> = {}): Promise<TrpcRecorder> {
  return routeTrpc(page, { "settings.getVersion": () => VERSION, ...extra });
}

test("renders the version line a bug report quotes, anchored at the admin pane's about anchor", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<AboutSectionStory />);

  // The exact string the issue form asks for — release, SHORT commit, and where the answer came from.
  await expect(component.getByTestId("about-version-line")).toHaveText("v0.4.1 (823d76f4343a, checkout)");
  await expect(component.getByText("Read from this checkout's git refs at startup.")).toBeVisible();
  await expect(component.getByRole("button", { name: "Copy version for a bug report" })).toBeVisible();
  await expect(page.locator("#config-anchor-admin-about")).toBeVisible();
});

test("a container build reports its stamp INSTEAD of a checkout, and says when it was built", async ({ mount, page }) => {
  await stub(page, {
    "settings.getVersion": () => ({ ...VERSION, builtAt: "2026-09-18T09:30:00.000Z", source: "container" }),
  });
  const component = await mount(<AboutSectionStory />);

  await expect(component.getByTestId("about-version-line")).toHaveText("v0.4.1 (823d76f4343a, container)");
  await expect(component.getByText(/Stamped into the container image when it was built/u)).toBeVisible();
});

test("NOTHING reaches GitHub until the button is pressed — then exactly one check runs", async ({ mount, page }) => {
  const trpc = await stub(page, { "settings.checkForUpdate": () => ({ status: "up-to-date", local: LOCAL_COMMIT, remote: null, reason: null }) });
  const component = await mount(<AboutSectionStory />);

  // Barrier on the SETTLED arm the story produces: the version line painted, the button idle (not
  // "Checking…"), and NO verdict slot in the DOM — the rendered proof that nothing has been asked yet.
  await expect(component.getByTestId("about-version-line")).toBeVisible();
  await expect(component.getByRole("button", { name: CHECK_BUTTON })).toBeEnabled();
  await expect(component.getByTestId("about-update-verdict")).toHaveCount(0);

  await component.getByRole("button", { name: CHECK_BUTTON }).click();
  await expect(component.getByTestId("about-update-verdict")).toBeVisible();
  // ONE call TOTAL: this is what makes "no mount-time fetch" airtight rather than a race — a mount-time
  // call would have made this 2. Polled rather than sampled once, because a recorder read is node-side
  // state the browser updates asynchronously (the rendered verdict above is the settle, this is the count).
  await expect.poll(() => trpc.count("settings.checkForUpdate"), { intervals: [20, 50, 100] }).toBe(1);
});

test("up-to-date renders as up-to-date", async ({ mount, page }) => {
  await stub(page, { "settings.checkForUpdate": () => ({ status: "up-to-date", local: LOCAL_COMMIT, remote: null, reason: null }) });
  const component = await mount(<AboutSectionStory />);

  await component.getByRole("button", { name: CHECK_BUTTON }).click();
  const verdict = component.getByTestId("about-update-verdict");
  await expect(verdict).toContainText("Up to date");
  await expect(verdict).toContainText("newest commit on GitHub");
});

test("behind NAMES the upstream commit and its date — the reader can go look at it", async ({ mount, page }) => {
  await stub(page, {
    "settings.checkForUpdate": () => ({
      status: "behind",
      local: LOCAL_COMMIT,
      remote: { commit: REMOTE_COMMIT, short: REMOTE_COMMIT.slice(0, 12), committedAt: "2026-09-17T12:00:00.000Z" },
      reason: null,
    }),
  });
  const component = await mount(<AboutSectionStory />);

  await component.getByRole("button", { name: CHECK_BUTTON }).click();
  const verdict = component.getByTestId("about-update-verdict");
  await expect(verdict).toContainText("Update available");
  await expect(verdict).toContainText("f00dcafe1234");
  await expect(verdict).toContainText("committed");
});

test("an UNREACHABLE check says so WITH its reason — never a silent up-to-date", async ({ mount, page }) => {
  await stub(page, {
    "settings.checkForUpdate": () => ({
      status: "unknown",
      local: LOCAL_COMMIT,
      remote: null,
      reason: "couldn't reach GitHub — this box may be offline",
    }),
  });
  const component = await mount(<AboutSectionStory />);

  await component.getByRole("button", { name: CHECK_BUTTON }).click();
  const verdict = component.getByTestId("about-update-verdict");
  await expect(verdict).toContainText("Couldn't check");
  await expect(verdict).toContainText("may be offline");
  // The distinguishing property: the reassuring words are ABSENT, not merely accompanied by a warning.
  await expect(verdict).not.toContainText("Up to date");
});
