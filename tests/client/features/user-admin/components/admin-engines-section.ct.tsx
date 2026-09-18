// CT: the Engines SECTION (Settings → Admin → Engines — the vLLM engine monitor + restart + the
// restart-gated launch-config editor). Drives the PRODUCTION path: the section's OWN polled
// `admin.vllmEngines` read (no pane batch since SET-SEAMS stage 3), the per-engine restart verb, and the
// launch editor's `settings.getAppSettings` read + only-moved-fields `updateAppSettings` delta. Every verb
// is adminProcedure server-side — this section is UX honesty over that floor.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder, TrpcRoutes } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { setNumber } from "../../../../support/node/set-number.ts";
import { AdminEnginesSectionStory } from "../_ct-stories.tsx";

const ENGINES = {
  embed: { status: "owned", detail: "ok", updatedAt: 1_700_000_000_000, port: 8701, storePath: "/srv/orb/store/models" },
  rerank: { status: "failed", detail: "exited 137", updatedAt: 1_700_000_000_000, port: 8702, storePath: "/srv/orb/store/models" },
};

// The numeric launch knobs are `@orb/ui` NumberFields — a Base UI TEXTBOX named by its `<Field label>`, not a
// spinbutton and not a `data-testid` (the Root spread would park a testid on the wrapper div, where
// `toHaveValue` reads nothing). Locate them by accessible name; the model-id fields stay plain Inputs.
const GEN_WINDOW = "Gen context window (tokens)";
const GEN_GPU_UTIL_MULTI = "Gen GPU-util (multi-GPU)";
const EMBED_GPU_UTIL = "Embed GPU-util";

const ENGINE_DETAIL_RE = /exited 137/u;
// The read-only DEPLOYMENT facts folded into each engine's status subtitle (#14: displayed, never edited).
const ENGINE_PORT_RE = /port 8702/u;
const ENGINE_STORE_PATH_RE = /\/srv\/orb\/store\/models/u;

// The resolved EffectiveAppConfig the engine-launch config editor reads (settings.getAppSettings). Only the
// engineLaunch slice is asserted here; the rest satisfies the shape the section consumes.
const APP_SETTINGS = {
  engineLaunch: {
    embedModel: "Qwen/Qwen3-VL-Embedding-2B",
    rerankModel: "Qwen/Qwen3-VL-Reranker-2B",
    genModel: "Qwen/Qwen3-VL-8B-Instruct",
    embedMaxModelLen: 8192,
    rerankMaxModelLen: 8192,
    genMaxModelLen: 32_768,
    embedGpuUtil: 0.14,
    rerankGpuUtilMulti: 0.16,
    rerankGpuUtilSingle: 0.22,
    genGpuUtilMulti: 0.28,
    genGpuUtilSingle: 0.5,
    poolingMaxPixels: 1_843_200,
    genMaxPixels: 4_194_304,
  },
};

function stub(page: Page, extra: TrpcRoutes = {}): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "admin.vllmEngines": () => ENGINES,
    // The engine-launch config editor always fires getAppSettings — it needs a valid stub in the shared
    // bundle or the unlisted-proc default crashes the section.
    "settings.getAppSettings": () => APP_SETTINGS,
    ...extra,
  });
}

test("renders the engines list off its OWN polled read, anchored at the admin pane's engines anchor", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<AdminEnginesSectionStory />);

  // Engines: name + status badge + detail line.
  await expect(component.getByText("embed", { exact: true })).toBeVisible();
  await expect(component.getByText("failed", { exact: true })).toBeVisible();
  await expect(component.getByText(ENGINE_DETAIL_RE)).toBeVisible();
  // The read-only DEPLOYMENT facts (port + store path) render in the status subtitle (#14: displayed, not
  // edited). Assert the actual stubbed values, not mere presence.
  await expect(component.getByText(ENGINE_PORT_RE)).toBeVisible();
  await expect(component.getByText(ENGINE_STORE_PATH_RE).first()).toBeVisible();
  // The section stamps its own anchor now (§7.1 — the id is byte-identical across the move).
  await expect(page.locator("#config-anchor-admin-engines")).toBeVisible();
});

// The IN-PROCESS local-light tier's warm-up rows ride the SAME read (`entry/compose/admin.ts` merges them,
// namespaced so they cannot collide with the vLLM engine of the same role). `port: 0` is the honest shape —
// nothing listens, the tier runs inside the server process.
const LOCAL_LIGHT_ROW = {
  "local-light:embed": {
    status: "downloading",
    detail: "downloading jinaai/jina-clip-v2 — 42% (1.5 GB / 3.5 GB)",
    updatedAt: 1_700_000_000_000,
    port: 0,
    storePath: "/app/data/models/transformers",
  },
};
const LOCAL_LIGHT_PROGRESS_RE = /42% \(1\.5 GB \/ 3\.5 GB\)/u;
const ANY_PORT_RE = /port \d/u;

test("a local-light warm-up row renders its download progress, and never a port it does not have", async ({ mount, page }) => {
  await stub(page, { "admin.vllmEngines": () => ({ ...ENGINES, ...LOCAL_LIGHT_ROW }) });
  const component = await mount(<AdminEnginesSectionStory />);

  // The row is titled by its namespaced key, badged `downloading`, and carries the byte/percent line.
  await expect(component.getByText("local-light:embed", { exact: true })).toBeVisible();
  await expect(component.getByText("downloading", { exact: true })).toBeVisible();
  const subtitle = component.getByText(LOCAL_LIGHT_PROGRESS_RE);
  await expect(subtitle).toBeVisible();
  // `port 0` would be a fabricated deployment fact — the segment is dropped for this row while the weights
  // cache path (its one real fact) stays. The vLLM rows above still show theirs.
  await expect(subtitle).not.toHaveText(ANY_PORT_RE);
  await expect(component.getByText(/\/app\/data\/models\/transformers/u)).toBeVisible();
  await expect(component.getByText(ENGINE_PORT_RE)).toBeVisible();
});

test("engines: restart fires restartVllmEngine for THAT engine", async ({ mount, page }) => {
  const trpc = await stub(page, { "admin.restartVllmEngine": () => "restart 1/3" });
  const component = await mount(<AdminEnginesSectionStory />);

  await component.getByRole("button", { name: "Restart engine — rerank" }).click();
  await expect.poll(() => trpc.lastInput("admin.restartVllmEngine"), { intervals: [20, 50, 100] }).toEqual({ engine: "rerank" });
});

test("launch config: renders the resolved per-engine flags off getAppSettings", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<AdminEnginesSectionStory />);

  const config = component.getByTestId("engine-launch-config");
  await expect(config).toBeVisible();
  // The gen window + a gpu-util fraction render as the current values (not a bare literal — the resolved config).
  await expect(config.getByRole("textbox", { name: GEN_WINDOW })).toHaveValue("32,768");
  await expect(config.getByRole("textbox", { name: GEN_GPU_UTIL_MULTI })).toHaveValue("0.28");
  await expect(config.getByTestId("engine-launch-genModel")).toHaveValue("Qwen/Qwen3-VL-8B-Instruct");
});

test("launch config: Save fires updateAppSettings with ONLY the moved field, then arms restart-to-apply", async ({ mount, page }) => {
  const trpc = await stub(page, { "settings.updateAppSettings": () => APP_SETTINGS });
  const component = await mount(<AdminEnginesSectionStory />);

  const config = component.getByTestId("engine-launch-config");
  const save = config.getByTestId("engine-launch-save");
  // Save is disabled until a field actually moves (no accidental empty override).
  await expect(save).toBeDisabled();

  await setNumber(config.getByRole("textbox", { name: GEN_WINDOW }), "65536");
  await expect(save).toBeEnabled();
  await save.click();

  // Only the diffed field becomes an override — the untouched fields never leak into the patch.
  await expect
    .poll(() => trpc.lastInput("settings.updateAppSettings"), { intervals: [20, 50, 100] })
    .toEqual({ partial: { engineLaunch: { genMaxModelLen: 65_536 } } });

  // A successful save arms the "restart to apply" banner (the running engines still serve the old flags).
  await expect(config.getByTestId("engine-launch-pending-restart")).toBeVisible();
});

test("launch config: a delegated admin can view + save (admin-gated, not owner-gated)", async ({ mount, page }) => {
  const trpc = await stub(page, { "settings.updateAppSettings": () => APP_SETTINGS });
  const component = await mount(<AdminEnginesSectionStory />);

  const config = component.getByTestId("engine-launch-config");
  await setNumber(config.getByRole("textbox", { name: EMBED_GPU_UTIL }), "0.2");
  await config.getByTestId("engine-launch-save").click();
  await expect
    .poll(() => trpc.lastInput("settings.updateAppSettings"), { intervals: [20, 50, 100] })
    .toEqual({ partial: { engineLaunch: { embedGpuUtil: 0.2 } } });
});
