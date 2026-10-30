import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { observeSurfaceSession } from "@orb/testkit/browser/spec";
import { SURFACE_PASSES } from "@orb/testkit/iso";
import type { SurfaceRunConfig, SurfaceWalkOptions } from "@orb/testkit/node/helpers";
import {
  attachNativeFile,
  readSurfaceCaseAdmission,
  readSurfaceRunConfig,
  SURFACE_CASE_REPORT_TIMEOUT_MS,
  surfaceArtifactModes,
  surfaceCaseDelayMs,
} from "@orb/testkit/node/helpers";
import { budget } from "@orb/tooling/floor/host/load-budget";
import { test as base, expect } from "@playwright/test";
import { authenticateBrowserContext, browserActorRequestHeaders } from "./browser-actors.ts";
import type { SurfaceFlow } from "./surface-flow.ts";
import { createSurfaceFlow } from "./surface-flow.ts";
import type { TrpcClient } from "./trpc-client.ts";
import { createTrpcClient } from "./trpc-client.ts";

export { expect } from "@playwright/test";

const defaults = appearanceSettingsSchema.parse({});
const nativeRun = await readSurfaceRunConfig();

interface SurfaceWalkFixtures {
  readonly caseAdmission: undefined;
  readonly run: SurfaceRunConfig;
  readonly client: TrpcClient;
  readonly flow: SurfaceFlow;
}

/** A fresh page receives observers before its first navigation; dataset preparation never drives the browser. */
export const test = base.extend<SurfaceWalkOptions & SurfaceWalkFixtures>({
  surfacePass: [SURFACE_PASSES[0], { option: true }],
  requestedPanes: [{ kind: "desktop", panes: { list: true, context: true } }, { option: true }],
  chatStyle: [defaults.chatStyle, { option: true }],
  fontScale: [defaults.fontScale, { option: true }],
  run: async ({}, use) => {
    await use(nativeRun);
  },
  caseAdmission: [
    async ({ run }, use, info) => {
      expect(info.config.workers, "Independent surface cases share one principal budget and require serial native workers").toBe(1);
      await expect.poll(() => readSurfaceCaseAdmission(run.runRoot)?.testId, { timeout: budget(SURFACE_CASE_REPORT_TIMEOUT_MS) }).toBe(info.testId);
      const admission = readSurfaceCaseAdmission(run.runRoot);
      if (admission === null) {
        throw new Error("The native reporter admission disappeared before case setup");
      }
      const startedAt = Date.now();
      const delayMs = surfaceCaseDelayMs(admission.completedAt, startedAt, run.rateLimitWindowMs);
      await expect
        .poll(() => surfaceCaseDelayMs(admission.completedAt, Date.now(), run.rateLimitWindowMs), {
          timeout: run.rateLimitWindowMs + budget(SURFACE_CASE_REPORT_TIMEOUT_MS),
          intervals: [Math.max(1, delayMs)],
        })
        .toBe(0);
      info.annotations.push({
        type: "surface-case-pacing",
        description: JSON.stringify({ previousCompletedAt: admission.completedAt, startedAt, admittedAt: Date.now(), windowMs: run.rateLimitWindowMs }),
      });
      await use(undefined);
    },
    { timeout: nativeRun.rateLimitWindowMs + budget(SURFACE_CASE_REPORT_TIMEOUT_MS) },
  ],
  client: async ({ context, run }, use) => {
    const headers = run.authentication.mode === "local" ? await browserActorRequestHeaders(context, run.origin) : {};
    const client = createTrpcClient(run.origin, headers);
    const viewer = await client.sessions.me.query(undefined);
    expect({ userId: viewer.userId, handle: viewer.handle }).toEqual(run.owner);
    await use(client);
  },
  flow: async ({ page, client, requestedPanes, run, chatStyle, fontScale, surfacePass }, use, info) => {
    await use(createSurfaceFlow({ page, client, requestedPanes, run, chatStyle, fontScale, info, pass: surfacePass }));
  },
  context: async ({ context, run, caseAdmission: _caseAdmission, surfacePass, trace, screenshot, video }, use, info) => {
    const posture = { pass: surfacePass, trace, screenshot, video };
    await attachNativeFile(info, info, "artifact-posture", { body: JSON.stringify(posture, null, 2), contentType: "application/json" });
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
