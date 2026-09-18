// CT: the `data-app-ready` readiness signal (`lib/app-ready-signal.ts`) — the flag EVERY verification instrument
// waits on (snap's nav gate, design-audit, motion-audit, the e2e browser actors).
//
// WHY IT EXISTS. The signal used to hand the flag over unconditionally 3s after install, whether or not the
// initial reads had settled. Every instrument that waited on it then captured a MID-HYDRATION app while
// reporting a clean wait — the instrument failing open. It is how `snap --isolated` came to screenshot the
// Corpus home stuck on "Loading your corpus…" and hand back a report that read like a product defect.
//
// The contract pinned here is PRESENCE + VALUE: presence means "stop waiting" (so no waiter can ever hang);
// the value says whether that was a real settle (`""`) or the ceiling giving up with reads still in flight
// (`degraded`). A waiter selecting on presence alone is unaffected; an instrument owes the value a read.
//
// The story drives the real `<html>` element and a real query cache; the test barriers on a RENDERED marker
// past the grace rather than sleeping, then asks what the flag did.

import { expect, test } from "@playwright/experimental-ct-react";
import { AppearanceMessageRegistryStory } from "../features/chat/_ct-stories.tsx";
import { AgentBridgeStory, AppReadyBootReadStory, AppReadyRouteResolutionStory, AppReadySignalStory } from "./_ct-stories.tsx";

const READY_FLAG = "html[data-app-ready]";

// @agent-bridge-proof: a real install must expose exactly the exhaustive typed capability registry at runtime.
test("the mounted bridge publishes every typed capability and every evidence lifetime", async ({ mount, page }) => {
  await page.route("**/api/_debug/automation/fires", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, rows: [] }) });
  });
  await mount(<AgentBridgeStory />);
  await expect(page.getByTestId("bridge-installed")).toBeVisible();
  await expect(page.getByTestId("bridge-ready-shared")).toHaveText("shared");
  await expect(page.locator(READY_FLAG)).toBeAttached();
  const receipt = await page.evaluate(async () => {
    const orb = globalThis.__orb;
    if (orb === undefined) {
      throw new Error("__orb was not installed");
    }
    await orb.ready;
    const capabilities = orb.capabilities();
    const namedRingRefusal = orb.resetRing("not-indexed");
    orb.resetFlags();
    orb.resetEvidence();
    await orb.motionFlaggersSettled();
    const drain = await orb.motionFlaggersDrain();
    orb.setMotionAuditDropTrackingPaused(true);
    orb.setMotionAuditDropTrackingPaused(false);
    const answers = {
      ready: typeof orb.ready.then === "function",
      isReady: orb.isReady(),
      queries: Array.isArray(orb.queries()),
      bus: typeof orb.bus().live === "number" && Array.isArray(orb.bus().events),
      shell: typeof orb.shell().chatOpen === "boolean",
      perf: Array.isArray(orb.perf()),
      renders: Array.isArray(orb.renders()),
      motion: Array.isArray(orb.motion().loafs),
      animations: Array.isArray(orb.animations()),
      flags: Array.isArray(orb.flags()),
      // #1095 — the browser-failure ring. Asserted through its OWN shape (records + the drop tally), because a
      // capped ring that does not count its evictions reads complete when it is not.
      consoleErrors: Array.isArray(orb.consoleErrors().records) && typeof orb.consoleErrors().dropped === "number",
      resetFlags: true,
      resetEvidence: true,
      motionFlaggersSettled: true,
      motionFlaggersDrain: drain.completedGeneration >= drain.requestedGeneration,
      appearanceMatrixContract:
        orb.appearanceMatrixContract().declared === 40 &&
        orb.appearanceMatrixContract().executable === 36 &&
        orb.appearanceMatrixContract().rows.some((row) => row.key === "fontScale" && row.reached >= 1),
      setMotionAuditDropTrackingPaused: true,
      snap: typeof orb.snap() === "object",
      nav: typeof orb.nav.capabilities().contextTabsPublished === "boolean" && orb.nav.section("anything").ok,
      seed: (await orb.seed.game({ profile: "freeform" })).chatId.length > 0 && (await orb.seed.richGame()).chatId.length > 0,
      rpg: Array.isArray((await orb.rpg()).journal),
      pluginLog: typeof (await orb.pluginLog()).ok === "boolean",
      css: typeof orb.css.read().calls === "number",
      automationFires: typeof (await orb.automationFires()) === "object",
      durableLocalUserId: orb.durableLocalUserId() === null,
      capabilities: Object.keys(capabilities).length > 0,
      rings: orb.rings().length > 0,
      resetRing: !namedRingRefusal.ok && namedRingRefusal.reason.includes("not-indexed"),
    } satisfies Record<keyof typeof orb, boolean>;
    return {
      capabilityKeys: Object.keys(capabilities).sort(),
      handleKeys: Object.keys(orb).sort(),
      answerKeys: Object.keys(answers).sort(),
      allAnswer: Object.values(answers).every(Boolean),
      descriptions: Object.values(capabilities),
      discoveryDescriptions: { nav: capabilities.nav, seed: capabilities.seed, rpg: capabilities.rpg },
      rings: orb.rings(),
      // #1122: the panel rows carry the section's PANE DECLARATION, tri-state. An UNDECLARED row reads
      // `null` and NEVER `true` — a defaulted declaration is exactly the silent guess design-audit's
      // SURFACE-AXIS census used to make (calling a structurally unreachable mode WITHHELD instead of
      // EXCLUDED), and `null` is what lets the instrument refuse the run instead.
      panelDeclarations: orb.shell().panels.map((panel) => ({ side: panel.side, available: panel.available })),
    };
  });
  await expect
    .poll(() => ({
      capabilityKeys: receipt.capabilityKeys,
      answerKeys: receipt.answerKeys,
      allAnswer: receipt.allAnswer,
      capabilityCount: receipt.capabilityKeys.length,
      descriptionsPresent: receipt.descriptions.every((description) => description.trim().length > 0),
      discoveryDescriptions: receipt.discoveryDescriptions,
      rings: receipt.rings,
      panelDeclarations: receipt.panelDeclarations,
    }))
    .toEqual({
      capabilityKeys: receipt.handleKeys,
      answerKeys: receipt.handleKeys,
      allAnswer: true,
      capabilityCount: 28,
      descriptionsPresent: true,
      discoveryDescriptions: {
        nav: expect.stringMatching(
          /__orb\.nav\.capabilities\(\).*contextTab\(id\).*openChat\(id\|title\|first\|latest\|current\).*\{ok:true\}\|\{ok:false,reason\}/u,
        ),
        seed: expect.stringMatching(/await __orb\.seed\.game\(\{profile:'d20'\|'freeform',title\?\}\) -> \{chatId\}/u),
        rpg: expect.stringMatching(/await __orb\.rpg\(\) -> \{chatId,game,tracker,journal,turnToolCalls\}/u),
      },
      rings: [
        expect.objectContaining({ name: "bus-events", read: "bus().events", lifetime: "checkpoint", resettable: true }),
        expect.objectContaining({ name: "flags", lifetime: "checkpoint", resettable: true }),
        expect.objectContaining({ name: "motion", lifetime: "checkpoint", resettable: true }),
        expect.objectContaining({ name: "renders", lifetime: "checkpoint", resettable: true }),
        expect.objectContaining({ name: "css-merges", lifetime: "checkpoint", resettable: true }),
        expect.objectContaining({ name: "animations", lifetime: "session", resettable: false }),
        expect.objectContaining({ name: "perf", lifetime: "session", resettable: false }),
        expect.objectContaining({ name: "plugin-log", lifetime: "server-runtime", resettable: false }),
        expect.objectContaining({ name: "automation-fires", lifetime: "durable", resettable: false }),
        expect.objectContaining({ name: "console-errors", read: "consoleErrors()", lifetime: "checkpoint", resettable: true }),
      ],
      panelDeclarations: [
        { side: "list", available: true },
        { side: "context", available: false },
        { side: "undeclared", available: null },
      ],
    });
});

test("shell chatOpen ignores retained hidden chat DOM and follows the rendered section", async ({ mount, page }) => {
  await mount(<AgentBridgeStory />);
  await expect(page.getByTestId("bridge-installed")).toBeVisible();
  await expect(page.getByTestId("retained-chat-section")).toBeHidden();
  await expect.poll(async () => page.evaluate(() => globalThis.__orb?.shell().chatOpen)).toBe(false);
  await page.getByRole("button", { name: "toggle visible chat" }).click();
  await expect.poll(async () => page.evaluate(() => globalThis.__orb?.shell().chatOpen)).toBe(true);
});

test("the Appearance bridge samples actual values from every mounted real MessageRow", async ({ mount, page }) => {
  await mount(
    <>
      <AgentBridgeStory />
      <AppearanceMessageRegistryStory />
    </>,
  );
  await expect(page.getByTestId("bridge-installed")).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const contract = globalThis.__orb?.appearanceMatrixContract();
        const row = (key: string): { readonly reached: number; readonly samples: readonly unknown[] } | undefined =>
          contract?.rows.find((candidate) => candidate.key === key);
        return {
          registry: contract?.messageRegistry,
          avatarSize: row("avatarSize"),
          chatStyle: row("chatStyle"),
          showTimestamps: row("showTimestamps"),
        };
      }),
    )
    .toEqual({
      registry: { mounted: 2, registered: 2, matched: 2, missingIds: [], staleIds: [] },
      avatarSize: expect.objectContaining({ reached: 2, samples: ["sm", "lg"] }),
      chatStyle: expect.objectContaining({ reached: 2, samples: ["bubble", "document"] }),
      showTimestamps: expect.objectContaining({ reached: 2, samples: [true, false] }),
    });
});

// @agent-ring-proof: seeded checkpoint rings clear independently while live, session, server, and durable evidence refuses reset.
test("safe ring resets are isolated, preserve bus liveness, and unsafe names refuse loudly", async ({ mount, page }) => {
  await mount(<AgentBridgeStory />);
  await expect(page.getByTestId("bridge-installed")).toBeVisible();
  await page.getByRole("button", { name: "seed bridge evidence" }).click();
  await expect.poll(async () => page.evaluate(() => (globalThis.__orb?.flags().length ?? 0) > 0)).toBe(true);
  await expect.poll(async () => page.evaluate(() => (globalThis.__orb?.motion().loafs.length ?? 0) > 0)).toBe(true);
  await expect.poll(async () => page.evaluate(() => (globalThis.__orb?.animations().length ?? 0) > 0)).toBe(true);
  const receipt = await page.evaluate(() => {
    const orb = globalThis.__orb;
    if (orb === undefined) {
      throw new Error("__orb was not installed");
    }
    const before = structuredClone({
      bus: orb.bus(),
      flags: orb.flags(),
      motion: orb.motion(),
      renders: orb.renders(),
      css: orb.css.read(),
      animations: orb.animations(),
      perf: orb.perf(),
    });
    const busReset = orb.resetRing("bus-events");
    const afterBus = structuredClone({ bus: orb.bus(), flags: orb.flags(), motion: orb.motion(), renders: orb.renders(), css: orb.css.read() });
    const flagsReset = orb.resetRing("flags");
    const afterFlags = structuredClone({ flags: orb.flags(), motion: orb.motion(), renders: orb.renders(), css: orb.css.read() });
    const motionReset = orb.resetRing("motion");
    const afterMotion = structuredClone({ motion: orb.motion(), renders: orb.renders(), css: orb.css.read() });
    const rendersReset = orb.resetRing("renders");
    const afterRenders = structuredClone({ renders: orb.renders(), css: orb.css.read() });
    const cssReset = orb.resetRing("css-merges");
    const unsafe = [
      orb.resetRing("animations"),
      orb.resetRing("perf"),
      orb.resetRing("plugin-log"),
      orb.resetRing("automation-fires"),
      orb.resetRing("missing"),
      orb.resetRing("toString"),
    ];
    return {
      before,
      busReset,
      afterBus,
      flagsReset,
      afterFlags,
      motionReset,
      afterMotion,
      rendersReset,
      afterRenders,
      cssReset,
      unsafe,
      after: {
        bus: orb.bus(),
        flags: orb.flags(),
        motion: orb.motion(),
        renders: orb.renders(),
        css: orb.css.read(),
        animations: orb.animations(),
        perf: orb.perf(),
      },
    };
  });
  await expect
    .poll(() => receipt)
    .toEqual(
      expect.objectContaining({
        before: expect.objectContaining({
          bus: { live: 1, events: [expect.objectContaining({ type: "ct.bridge" })] },
          flags: expect.arrayContaining([expect.anything()]),
          motion: expect.objectContaining({ loafs: expect.arrayContaining([expect.anything()]) }),
          renders: [expect.anything()],
          css: expect.objectContaining({ calls: 1 }),
          animations: expect.arrayContaining([expect.anything()]),
          perf: expect.arrayContaining([expect.objectContaining({ name: "ct-bridge" })]),
        }),
        busReset: { ok: true, name: "bus-events" },
        afterBus: expect.objectContaining({
          bus: { live: 1, events: [] },
          flags: expect.arrayContaining([expect.anything()]),
          motion: expect.objectContaining({ loafs: expect.arrayContaining([expect.anything()]) }),
          renders: [expect.anything()],
          css: expect.objectContaining({ calls: 1 }),
        }),
        flagsReset: { ok: true, name: "flags" },
        afterFlags: expect.objectContaining({
          flags: [],
          motion: expect.objectContaining({ loafs: expect.arrayContaining([expect.anything()]) }),
          renders: [expect.anything()],
          css: expect.objectContaining({ calls: 1 }),
        }),
        motionReset: { ok: true, name: "motion" },
        afterMotion: expect.objectContaining({
          motion: expect.objectContaining({ loafs: [] }),
          renders: [expect.anything()],
          css: expect.objectContaining({ calls: 1 }),
        }),
        rendersReset: { ok: true, name: "renders" },
        afterRenders: expect.objectContaining({ renders: [], css: expect.objectContaining({ calls: 1 }) }),
        cssReset: { ok: true, name: "css-merges" },
        after: expect.objectContaining({
          bus: { live: 1, events: [] },
          flags: [],
          motion: expect.objectContaining({ loafs: [] }),
          renders: [],
          css: expect.objectContaining({ calls: 0 }),
          animations: expect.arrayContaining([expect.anything()]),
          perf: receipt.before.perf,
        }),
        unsafe: expect.arrayContaining([
          expect.objectContaining({ ok: false, name: "animations" }),
          expect.objectContaining({ ok: false, name: "perf" }),
          expect.objectContaining({ ok: false, name: "plugin-log" }),
          expect.objectContaining({ ok: false, name: "automation-fires" }),
          expect.objectContaining({ ok: false, name: "missing" }),
          expect.objectContaining({ ok: false, name: "toString" }),
        ]),
      }),
    );
});

test("the flag does NOT go up while the initial reads are still in flight — the grace is a CHECK, not a hand-out", async ({ mount, page }) => {
  await mount(<AppReadySignalStory />);

  // The barrier is the story's own rendered marker, fired past app-ready-signal's 3s grace. Under the old
  // hand-out the flag was already up by now, on an app whose only read had not landed.
  await expect(page.getByTestId("grace-elapsed")).toBeVisible();
  await expect(page.locator(READY_FLAG)).toHaveCount(0);

  // Land the read: the SAME signal now fires, because the cache actually went idle.
  await page.getByRole("button", { name: "land the read" }).click();
  await expect(page.locator(READY_FLAG)).toHaveCount(1);
  // `""`, never "degraded" — this was a real settle, and an instrument reading the value must be able to
  // tell the two apart.
  await expect(page.locator("html")).toHaveAttribute("data-app-ready", "");
});

// ISSUE #145 — the OTHER way an idle query cache lies. Above, the read was in flight; here there is no read
// AT ALL, because the route component that owns it has not mounted: on a cold `snap --isolated` stage vite
// takes longer than the grace to serve `/`'s lazy `compose/authed-app.tsx` chunk. The install-armed grace
// fired against the router's pending glyph, the flag went up SETTLED with an EMPTY cache, and every
// instrument screenshotted the boot glyph and reported a clean wait. The grace window now STARTS at route
// resolution, so "this app has no initial reads" is only claimable once the route is actually mounted.
test("the flag does NOT go up while the ROUTE is still resolving — an idle cache with no route is not a settle", async ({ mount, page }) => {
  await mount(<AppReadyRouteResolutionStory />);

  // Past the 3s grace with the route still resolving and ZERO queries ever created. This is the state the
  // stage sat in for the whole of `--isolated`'s existence; the flag must still be down.
  await expect(page.getByTestId("grace-elapsed")).toBeVisible();
  await expect(page.locator(READY_FLAG)).toHaveCount(0);

  // Resolve the route: its component mounts and issues the initial read. Still not ready — that read is in
  // flight, which is the rule the sibling test above pins.
  await page.getByRole("button", { name: "resolve the route" }).click();
  await expect(page.getByTestId("route-mounted")).toBeVisible();
  await expect(page.locator(READY_FLAG)).toHaveCount(0);

  // Land it: NOW the cache is idle for a reason, and the flag goes up as a real settle.
  await page.getByRole("button", { name: "land the read" }).click();
  await expect(page.locator(READY_FLAG)).toHaveCount(1);
  await expect(page.locator("html")).toHaveAttribute("data-app-ready", "");
});

// #282 — the CHAINED-QUERY false idle. The theme is fetched only once `settings.getUserSettings` resolves
// (`useSelectedTheme` gates `settings.getTheme` on the id), so between the parent settling and the child
// STARTING the cache is momentarily idle — and the old signal settled there, lifting the boot veil onto the
// base palette a beat before the resolved theme swapped it (the cold-cache polarity flash). The boot-read
// gate (`boot-reads.ts`) holds readiness while a registered dependent read is still pending.
test("the flag does NOT go up while a boot-critical DEPENDENT read is still pending — the chained-query false idle (#282)", async ({ mount, page }) => {
  await mount(<AppReadyBootReadStory />);

  // Land the PARENT read: its cache goes idle and a fetch has been seen — the exact state the old signal
  // read as "settled". The dependent (theme-shaped) read is still pending.
  await page.getByRole("button", { name: "land the parent read" }).click();

  // Past the 3s grace, with the parent settled and the cache idle, the flag must STILL be down.
  await expect(page.getByTestId("grace-elapsed")).toBeVisible();
  await expect(page.locator(READY_FLAG)).toHaveCount(0);

  // Resolve the dependent read: NOW the cache is idle for a reason and the flag goes up as a real settle.
  await page.getByRole("button", { name: "resolve the dependent read" }).click();
  await expect(page.locator(READY_FLAG)).toHaveCount(1);
  await expect(page.locator("html")).toHaveAttribute("data-app-ready", "");
});
