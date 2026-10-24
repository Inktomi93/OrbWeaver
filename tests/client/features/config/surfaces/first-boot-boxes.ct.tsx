import type { ConfigGroupId } from "@orb/client/state";
import { seedThemes } from "@orb/server/entry/boot";
import type { TrpcWireOutput } from "@orb/testkit/ct";
import { routeTrpc, trpcHold } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness } from "@orb/testkit/node/composed";
import { bootGrantFor } from "@orb/testkit/node/helpers";
import { TOKENS } from "@orb/ui/tokens";
import type { Page } from "@playwright/test";
import type { FirstBootStory } from "./_first-boot-stories.tsx";

// A first boot has no remembered box, so the Settings groups reserve the box their `reserveBlock` declares.
// This holds each group's data reads pending, reads the box every boundary reserved, releases the reads and
// compares it with the height the same boundary settles at. Only the surfaces whose settled height is fixed
// by their own controls are asserted (knob stacks, the role rows, the theme grid): a list that settles into
// one row per library item has no settled height until a library is seeded, so snap measures those.

const DESKTOP_WIDTH = 900;
const PHONE_WIDTH = 390;
const PHONE_HEIGHT = 844;
// The declared box is a whole number of skeleton rows, so it can sit half a row off the settled stack.
const ROW_ROUNDING = 0.5;
const SUBPIXEL_PX = 1;

// Group → the reserveKeys whose settled box is determined by structure.
const FIRST_BOOT_GROUPS = ["workloads", "connections", "admin", "appearance"] as const satisfies readonly ConfigGroupId[];
type FirstBootGroup = (typeof FIRST_BOOT_GROUPS)[number];

const FIXED_KEYS: Readonly<Record<FirstBootGroup, readonly string[]>> = {
  workloads: ["config.workloads.tuning"],
  connections: ["config.connections.roles"],
  admin: [
    "config.admin.mediaTrust",
    "config.admin.operations",
    "config.admin.memoryTuning",
    "config.admin.rateLimits",
    "config.admin.systemTuning",
    "config.admin.multiUser",
  ],
  appearance: ["config.appearance.looks"],
};

interface Captured {
  readonly viewer: TrpcWireOutput<"sessions.me">;
  readonly settings: TrpcWireOutput<"settings.getUserSettings">;
  readonly themes: TrpcWireOutput<"settings.listThemes">;
  readonly appSettings: TrpcWireOutput<"settings.getAppSettingsWithOverrides">;
  readonly connections: TrpcWireOutput<"connection.list">;
  readonly bindings: TrpcWireOutput<"connection.listBindings">;
  readonly providers: TrpcWireOutput<"connection.providersAvailable">;
  readonly credentials: TrpcWireOutput<"credentials.list">;
  readonly users: TrpcWireOutput<"admin.listUsers">;
  readonly workloads: TrpcWireOutput<"workloads.list">;
  readonly schedules: TrpcWireOutput<"workloads.listSchedules">;
  readonly signInMode: TrpcWireOutput<"share.signInMode">;
  readonly shareStatus: TrpcWireOutput<"share.status">;
  readonly presets: TrpcWireOutput<"preset.list">;
  readonly spaceStatus: TrpcWireOutput<"search.spaceStatus">;
}

// The wire of a fresh in-process server, read once: what the browser would be served on a first boot.
async function captureReads(): Promise<Captured> {
  await using root = await createServerHarness({ startJobs: false });
  // A deployed server seeds the shipped themes at boot; the harness does not.
  await seedThemes({ db: bootGrantFor(root.db), logger: root.logger, now: root.clock.now });
  const caller = await root.internalCallerFor(root.ownerId);
  return {
    viewer: await caller.sessions.me(),
    settings: await caller.settings.getUserSettings(),
    themes: await caller.settings.listThemes(),
    appSettings: await caller.settings.getAppSettingsWithOverrides(),
    connections: await caller.connection.list(),
    bindings: await caller.connection.listBindings(),
    providers: await caller.connection.providersAvailable(),
    credentials: await caller.credentials.list(),
    users: await caller.admin.listUsers(),
    workloads: await caller.workloads.list({}),
    schedules: await caller.workloads.listSchedules({}),
    signInMode: await caller.share.signInMode(),
    shareStatus: await caller.share.status(),
    presets: await caller.preset.list(),
    spaceStatus: await caller.search.spaceStatus(),
  };
}

let captured: Promise<Captured> | undefined;
function reads(): Promise<Captured> {
  captured ??= captureReads();
  return captured;
}

interface Held {
  /** Resolves when every held read is in flight. */
  readonly requested: Promise<unknown>;
  readonly release: () => void;
  /** Reads that sit inside a surface under test; released after the assertions so the page can finish. */
  readonly releaseNested?: () => void;
}

async function routeGroup(page: Page, group: FirstBootGroup, c: Captured): Promise<Held> {
  // Every read any Settings group fires, answered at once; a group then holds the reads it measures.
  const answered = {
    "sessions.me": c.viewer,
    "settings.getUserSettings": c.settings,
    "settings.listThemes": c.themes,
    "settings.getAppSettingsWithOverrides": c.appSettings,
    "connection.list": c.connections,
    "connection.listBindings": c.bindings,
    "connection.providersAvailable": c.providers,
    "credentials.list": c.credentials,
    "admin.listUsers": c.users,
    "workloads.list": c.workloads,
    "workloads.listSchedules": c.schedules,
    "share.signInMode": c.signInMode,
    "share.status": c.shareStatus,
    "preset.list": c.presets,
    "search.spaceStatus": c.spaceStatus,
  };
  switch (group) {
    case "workloads": {
      const settings = trpcHold<"settings.getUserSettings">();
      const list = trpcHold<"workloads.list">();
      const schedules = trpcHold<"workloads.listSchedules">();
      await routeTrpc(page, {
        ...answered,
        "settings.getUserSettings": () => settings,
        "workloads.list": () => list,
        "workloads.listSchedules": () => schedules,
      });
      return {
        requested: Promise.all([settings.requested, list.requested, schedules.requested]),
        release: (): void => {
          settings.release(c.settings);
          list.release(c.workloads);
          schedules.release(c.schedules);
        },
      };
    }
    case "connections": {
      const list = trpcHold<"connection.list">();
      const bindings = trpcHold<"connection.listBindings">();
      const providers = trpcHold<"connection.providersAvailable">();
      const credentials = trpcHold<"credentials.list">();
      await routeTrpc(page, {
        ...answered,
        "connection.list": () => list,
        "connection.listBindings": () => bindings,
        "connection.providersAvailable": () => providers,
        "credentials.list": () => credentials,
      });
      return {
        requested: Promise.all([list.requested, bindings.requested, providers.requested, credentials.requested]),
        release: (): void => {
          list.release(c.connections);
          bindings.release(c.bindings);
          providers.release(c.providers);
          credentials.release(c.credentials);
        },
      };
    }
    case "admin": {
      const appSettings = trpcHold<"settings.getAppSettingsWithOverrides">();
      const users = trpcHold<"admin.listUsers">();
      // The Share card reads inside Multi-user. Held past the assertion, Multi-user settles with the card's own
      // reservation pending, which is the order a first boot paints in.
      const status = trpcHold<"share.status">();
      await routeTrpc(page, {
        ...answered,
        "settings.getAppSettingsWithOverrides": () => appSettings,
        "admin.listUsers": () => users,
        "share.status": () => status,
      });
      return {
        requested: Promise.all([appSettings.requested, users.requested]),
        release: (): void => {
          appSettings.release(c.appSettings);
          users.release(c.users);
        },
        releaseNested: (): void => {
          status.release(c.shareStatus);
        },
      };
    }
    case "appearance": {
      const themes = trpcHold<"settings.listThemes">();
      const settings = trpcHold<"settings.getUserSettings">();
      await routeTrpc(page, {
        ...answered,
        "settings.getUserSettings": () => settings,
        "settings.listThemes": () => themes,
      });
      return {
        requested: Promise.all([themes.requested, settings.requested]),
        release: (): void => {
          themes.release(c.themes);
          settings.release(c.settings);
        },
      };
    }
  }
}

async function rememberedBoxes(page: Page): Promise<Readonly<Record<string, number>>> {
  return await page.evaluate(() => {
    const entry = Object.entries(localStorage).find(([name]) => name.endsWith("surface-box"));
    const parsed: unknown = entry === undefined ? null : JSON.parse(entry[1]);
    const boxes = (parsed as { state?: { boxes?: Record<string, number> } } | null)?.state?.boxes;
    return boxes ?? {};
  });
}

// One skeleton row's pitch, resolved from the live tokens the way the skeleton paints it.
async function rowPitch(page: Page): Promise<number> {
  return await page.evaluate(
    ([control, gap]) => {
      const measure = (cssVar: string): number => {
        const probe = document.createElement("div");
        probe.style.cssText = `position:absolute;visibility:hidden;block-size:var(${cssVar})`;
        document.body.append(probe);
        const size = probe.getBoundingClientRect().height;
        probe.remove();
        return size;
      };
      return measure(control as string) + measure(gap as string);
    },
    [TOKENS["size.control-lg"].cssVar, TOKENS["spacing.row"].cssVar],
  );
}

// The boxes the pending boundaries hold, each tagged as declared (no measurement exists on a first boot).
async function declaredBoxes(page: Page, keys: readonly string[]): Promise<ReadonlyMap<string, number>> {
  const out = new Map<string, number>();
  for (const key of keys) {
    const box = page.locator(`[data-reserve-key="${key}"]`);
    await expect(box, `${key} reserves a box while its read is pending`).toBeAttached();
    await expect(box).toHaveAttribute("data-tile-reserve-source", "declared");
    out.set(key, Number(await box.getAttribute("data-tile-reserved")));
  }
  return out;
}

// The heights the same boundaries remember once their reads land and the reservation gives way.
async function settledBoxes(page: Page, keys: readonly string[]): Promise<ReadonlyMap<string, number>> {
  const out = new Map<string, number>();
  for (const key of keys) {
    await expect(page.locator(`[data-reserve-key="${key}"]`)).toHaveCount(0);
    await expect.poll(async () => (await rememberedBoxes(page))[key], { message: `${key} was remembered once settled` }).toBeGreaterThan(0);
    out.set(key, (await rememberedBoxes(page))[key] ?? Number.NaN);
  }
  return out;
}

const WIDTH_CLASSES = [
  { name: "desktop", phone: false, width: DESKTOP_WIDTH },
  { name: "phone", phone: true, width: PHONE_WIDTH },
] as const;

for (const widthClass of WIDTH_CLASSES) {
  test.describe(`${widthClass.name} first boot`, () => {
    if (widthClass.phone) {
      test.use({ viewport: { width: PHONE_WIDTH, height: PHONE_HEIGHT }, hasTouch: true, isMobile: true });
    }

    for (const group of FIRST_BOOT_GROUPS) {
      const keys = FIXED_KEYS[group];
      test(`${group} settles inside the box it declared`, async ({ mount, page }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        const c = await reads();
        const held = await routeGroup(page, group, c);
        await mount<typeof FirstBootStory>("tests/client/features/config/surfaces/_first-boot-stories/FirstBootStory", {
          group,
          phone: widthClass.phone,
          width: widthClass.width,
        });
        await held.requested;
        const pitch = await rowPitch(page);
        const declared = await declaredBoxes(page, keys);
        held.release();
        const settled = await settledBoxes(page, keys);
        const tolerance = pitch * ROW_ROUNDING + SUBPIXEL_PX;
        for (const key of keys) {
          expect(
            Math.abs((settled.get(key) ?? Number.NaN) - (declared.get(key) ?? Number.NaN)),
            `${key} settled at ${settled.get(key)}px against ${declared.get(key)}px declared`,
          ).toBeLessThanOrEqual(tolerance);
        }
        held.releaseNested?.();
      });
    }
  });
}
