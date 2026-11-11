import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { PlatformTextSize } from "@orb/testkit/browser/spec";
import { observeSurfaceSession, setPlatformTextSize } from "@orb/testkit/browser/spec";
import type { SeededIds } from "@orb/testkit/iso";
import { SURFACE_PASSES } from "@orb/testkit/iso";
import type { SurfaceRunConfig, SurfaceWalkOptions } from "@orb/testkit/node/helpers";
import { attachNativeFile, readSurfaceRunConfig, surfaceArtifactModes } from "@orb/testkit/node/helpers";
import { test as base, expect } from "@playwright/test";
import { authenticateBrowserContext, browserActorRequestHeaders } from "./browser-actors.ts";
import type { SurfaceFlow } from "./surface-flow.ts";
import { createSurfaceFlow } from "./surface-flow.ts";
import type { TrpcClient } from "./trpc-client.ts";
import { createTrpcClient } from "./trpc-client.ts";
import { workerIds } from "./worker-ids.ts";

export { expect } from "@playwright/test";

const defaults = appearanceSettingsSchema.parse({});
const nativeRun = await readSurfaceRunConfig();

// The engine's own default font size; an enlarged-text project multiplies it.
const BROWSER_DEFAULT_TEXT_SCALE = 1;

interface SurfaceWalkFixtures {
  readonly run: SurfaceRunConfig;
  readonly client: TrpcClient;
  readonly flow: SurfaceFlow;
  readonly textProfile: PlatformTextSize | null;
}

interface SurfaceWalkWorkerFixtures {
  readonly runIds: SeededIds;
}

/** A fresh page receives observers before its first navigation; dataset preparation never drives the browser. */
export const test = base.extend<SurfaceWalkOptions & SurfaceWalkFixtures, SurfaceWalkWorkerFixtures>({
  runIds: [
    async ({}, use, worker) => {
      // Each worker mints from its own band, so a worker Playwright restarts after a failure never repeats a name an
      // earlier worker left in the shared disposable clone.
      await use(workerIds(worker.workerIndex));
    },
    { scope: "worker" },
  ],
  surfacePass: [SURFACE_PASSES[0], { option: true }],
  layoutStability: [false, { option: true }],
  requestedPanes: [{ kind: "desktop", panes: { list: true, context: true } }, { option: true }],
  chatStyle: [defaults.chatStyle, { option: true }],
  fontScale: [defaults.fontScale, { option: true }],
  platformTextScale: [BROWSER_DEFAULT_TEXT_SCALE, { option: true }],
  textProfile: async ({ page, platformTextScale }, use, info) => {
    if (platformTextScale === BROWSER_DEFAULT_TEXT_SCALE) {
      await use(null);
      return;
    }
    await using profile = await setPlatformTextSize(page, platformTextScale);
    await attachNativeFile(info, info, "text-profile", {
      body: JSON.stringify(
        { ...profile, door: "Chrome DevTools Protocol Page.setFontSizes: the browser's default font size, set before the first navigation" },
        null,
        2,
      ),
      contentType: "application/json",
    });
    await use(profile);
  },
  run: async ({}, use, info) => {
    expect(info.config.workers, "Independent surface cases share one owner's settings and scripted peer and require serial native workers").toBe(1);
    await use(nativeRun);
  },
  client: async ({ context, run }, use) => {
    const headers = run.authentication.mode === "local" ? await browserActorRequestHeaders(context, run.origin) : {};
    const client = createTrpcClient(run.origin, headers);
    const viewer = await client.sessions.me.query(undefined);
    expect({ userId: viewer.userId, handle: viewer.handle }).toEqual(run.owner);
    await use(client);
  },
  flow: async ({ page, client, requestedPanes, run, chatStyle, fontScale, textProfile, surfacePass, layoutStability, runIds }, use, info) => {
    await use(
      createSurfaceFlow({ page, client, requestedPanes, run, chatStyle, fontScale, textProfile, info, pass: surfacePass, layoutStability, ids: runIds }),
    );
  },
  context: async ({ context, run, surfacePass, layoutStability, trace, screenshot, video }, use, info) => {
    const posture = { pass: surfacePass, trace, screenshot, video };
    await attachNativeFile(info, info, "artifact-posture", { body: JSON.stringify({ ...posture, layoutStability }, null, 2), contentType: "application/json" });
    const artifacts = surfaceArtifactModes(posture);
    if (run.authentication.mode === "local") {
      const subject = run.authentication.subjects.find(({ viewer }) => viewer.userId === run.owner.userId);
      if (subject === undefined || subject.password === null) {
        throw new Error("The local walkthrough requires its prepared owner's run-only credentials");
      }
      await authenticateBrowserContext(context, run.origin, {
        handle: subject.viewer.handle,
        password: subject.password,
        expectedUserId: subject.viewer.userId,
      });
    }
    await using _observation = await observeSurfaceSession(context, info, "owner", artifacts);
    await use(context);
  },
  page: async ({ page, baseURL, chatStyle, fontScale, requestedPanes, client, run }, use, info) => {
    expect(baseURL).toBe(run.origin);
    const before = (await client.settings.getUserSettings.query(undefined)).config.appearance;
    const display = appearanceSettingsSchema.parse({ chatStyle, fontScale, backgroundLibrary: before.backgroundLibrary });
    await client.settings.updateUserSettingsSection.mutate({ section: "appearance", patch: display });
    const actual = (await client.settings.getUserSettings.query(undefined)).config.appearance;
    expect(actual.chatStyle).toBe(chatStyle);
    expect(actual.fontScale).toBe(fontScale);
    expect(actual.backgroundLibrary).toEqual(before.backgroundLibrary);
    await attachNativeFile(info, info, "walk-context", {
      body: JSON.stringify(
        {
          dataMode: run.dataMode,
          composition: run.composition,
          jobs: run.jobs,
          authentication: { mode: run.authentication.mode, capability: run.authentication.capability, multiHumanCapable: run.authentication.multiHumanCapable },
          externalExecution:
            "Only the maintained text stand-in and declared canonical synthetic embedding responses are admitted; other provider, SDK and network execution is refused",
          generation: {
            connection: run.generation.connection,
            canonicalSyntheticEmbedding: run.generation.canonicalSyntheticEmbedding,
            requestEvidencePath: run.generation.requestEvidencePath,
          },
          viewer: run.owner,
          requestedPanes,
          display,
          provenancePath: run.provenancePath,
          cachePosture: {
            browser: "fresh native context",
            presentationVariants: "not copied from the canonical source; the per-walk variant cache may warm during journeys",
            backendTiming: "not matched to the original live warm cache",
          },
          browserStartup: "No fixture browser navigation; first explicit goto owns the document visit",
        },
        null,
        2,
      ),
      contentType: "application/json",
    });
    try {
      await use(page);
    } finally {
      await client.settings.updateUserSettingsSection.mutate({ section: "appearance", patch: before });
    }
  },
});
