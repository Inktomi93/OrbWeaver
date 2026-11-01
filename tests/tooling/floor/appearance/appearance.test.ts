// The appearance shim the browser probes share (tooling/src/floor/appearance/appearance.ts). Home per
// Spine-Testing §2: a test of a scripts/ tool lives in tests/tooling/.
//
// WHY IT EXISTS (owner ruling 2026-08-18): the dev account STORES `appearance.reducedMotion: true`, so every
// probe drive reviewed the reduced arm — and `--reduced-motion` (the OS media query) is a DIFFERENT gate that
// cannot turn the app setting back on. These pins cover the pure half: what the patch means, which batch
// element it lands on, and that CLI misuse is refused instead of silently doing nothing.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { expect, test } from "@orb/testkit/tooling";
import {
  appearanceBootHintPatch,
  applySettingsToBody,
  deepMergeSettings,
  mergeAppearancePatches,
  trpcProcedureIndex,
} from "@orb/tooling/floor/appearance/appearance";
import {
  APPEARANCE_PRESET_FLAG,
  appearanceHelpBlock,
  appearancePresetNames,
  applyAppearanceFlag,
  FULL_MOTION_PATCH,
  loadAppearancePreset,
  parseAppearancePatch,
  validateAppearancePatch,
} from "@orb/tooling/floor/appearance/appearance-flags";
import type { BrowserContext, Route } from "@playwright/test";
import { APPEARANCE_CARRIER_MANIFEST } from "#client/lib/appearance-carrier-manifest.ts";
import { installSettingsShim } from "../../../../tooling/src/floor/appearance/appearance.ts";
import { parseSnapArgs } from "../../../../tooling/src/snap/index.ts";

const PRESETS_PATH = fileURLToPath(new URL("../../../../tooling/src/floor/appearance/appearance-presets.json", import.meta.url));

/** The live wire shape, measured against the dev stack 2026-08-18: plain JSON (no transformer), one array
 *  element per batched procedure, the settings blob under result.data.config. */
function envelope(appearance: Record<string, unknown>): unknown {
  return { result: { data: { userId: "u1", config: { schemaVersion: 8, appearance } } } };
}

function appearanceOf(body: unknown, index = 0): Record<string, unknown> {
  const entry = (Array.isArray(body) ? body[index] : body) as { result: { data: { config: { appearance: Record<string, unknown> } } } };
  return entry.result.data.config.appearance;
}

test("the patch is a DEEP merge: named keys win, unnamed keys keep the account's real value", () => {
  const merged = deepMergeSettings({ reducedMotion: true, density: "comfortable", chatWidthPct: 50 }, { reducedMotion: false });

  expect(merged).toEqual({ reducedMotion: false, density: "comfortable", chatWidthPct: 50 });
});

test("arrays and scalars REPLACE wholesale — an appearance list is a set the caller states, not appends to", () => {
  const merged = deepMergeSettings({ blurSurfaces: ["panels", "composer", "modals"] }, { blurSurfaces: [] });

  expect(merged).toEqual({ blurSurfaces: [] });
});

test("repeated flags accumulate in argv order, so the LAST spelling of a key wins", () => {
  // --full-motion then --appearance '{"reducedMotion":true}' must end up reduced: the command reads that way.
  const patch = mergeAppearancePatches(mergeAppearancePatches(null, FULL_MOTION_PATCH), { reducedMotion: true, density: "compact" });

  expect(patch).toEqual({ reducedMotion: true, density: "compact" });
});

test("the pre-navigation hint projects only the manifest's first-frame Appearance axes", () => {
  expect(appearanceBootHintPatch({ reducedMotion: false, fontScale: 1.25, density: "compact", chatWidthPct: 90 })).toEqual({
    reducedMotion: false,
    fontScale: 1.25,
    density: "compact",
  });
  expect(appearanceBootHintPatch({ chatWidthPct: 90 })).toEqual({});
});

test("the pre-navigation hint projects exactly the manifest's prepaint rows plus density", () => {
  const projected = Object.keys(APPEARANCE_CARRIER_MANIFEST).filter((key) => Object.keys(appearanceBootHintPatch({ [key]: 1 })).length > 0);
  const carried = Object.entries(APPEARANCE_CARRIER_MANIFEST)
    .filter(([key, row]) => row.lifecycle === "prepaint-and-hydrated" || key === "density")
    .map(([key]) => key);
  expect(projected.toSorted()).toEqual(carried.toSorted());
});

test("the batched response element is picked by the procedure's position in the URL path", () => {
  const url = "http://localhost:5173/api/trpc/persona.list,settings.getUserSettings,chat.listChats?batch=1&input=%7B%7D";

  expect(trpcProcedureIndex(url)).toBe(1);
  expect(trpcProcedureIndex("http://localhost:5173/api/trpc/settings.getUserSettings?batch=1")).toBe(0);
  // Not in this batch at all → the request falls through untouched (the common case).
  expect(trpcProcedureIndex("http://localhost:5173/api/trpc/chat.listChats?batch=1")).toBeNull();
  expect(trpcProcedureIndex("http://localhost:5173/api/health")).toBeNull();
});

test("only the settings element of a batch is rewritten; its siblings are byte-identical", () => {
  const others = { result: { data: { items: [1, 2] } } };
  const body = [others, envelope({ reducedMotion: true, density: "comfortable" })];

  const patched = applySettingsToBody(body, 1, { appearance: { reducedMotion: false } });

  expect(patched.applied).toBe(true);
  expect(appearanceOf(patched.body, 1)).toEqual({ reducedMotion: false, density: "comfortable" });
  expect((patched.body as unknown[])[0]).toBe(others);
});

test("the merge lands at CONFIG level without disturbing the config's other axes", () => {
  // The shim now patches `config` (appearance AND theme ride one interception, #225) — a run that names only
  // appearance must leave `config.theme` exactly as the server sent it, or every theme-less run silently
  // re-selects the default theme.
  const body = [{ result: { data: { config: { appearance: { density: "comfortable" }, theme: { selectedThemeId: "theme_abc" } } } } }];

  const patched = applySettingsToBody(body, 0, { appearance: { density: "compact" } });

  const config = (patched.body as [{ result: { data: { config: Record<string, unknown> } } }])[0].result.data.config;
  expect(config).toEqual({ appearance: { density: "compact" }, theme: { selectedThemeId: "theme_abc" } });
});

test("a response that is not the settings envelope is passed through, reported as NOT applied", () => {
  // An error result / a moved schema must never be replaced with a fabricated config the app never sent.
  const error = [{ error: { message: "UNAUTHORIZED" } }];

  expect(applySettingsToBody(error, 0, { appearance: { reducedMotion: false } })).toEqual({ body: error, applied: false });
});

test("unparseable JSON and a non-object are CLI misuse, never a silent no-op", () => {
  expect(parseAppearancePatch("not json")).toMatchObject({ error: expect.stringContaining("expects a JSON object") });
  expect(parseAppearancePatch('["reducedMotion"]')).toMatchObject({ error: expect.stringContaining("expects a JSON object") });
  expect(parseAppearancePatch('{"reducedMotion":"system"}')).toEqual({ patch: { reducedMotion: "system" } });
});

test("unknown keys and schema-healed values refuse instead of pretending the requested arm rendered", () => {
  expect(parseAppearancePatch('{"ghostAppearance":true}')).toEqual({
    error: '--appearance contains unknown appearance key "ghostAppearance"',
  });
  expect(parseAppearancePatch('{"density":"ultra-compact"}')).toEqual({
    error: '--appearance contains invalid value for appearance key "density": "ultra-compact"',
  });

  // Planted preset-equivalent controls exercise the same validator the committed JSON passes through.
  expect(validateAppearancePatch({ ghostAppearance: true }, `${APPEARANCE_PRESET_FLAG} "planted"`)).toMatchObject({
    error: expect.stringContaining("unknown appearance key"),
  });
  expect(validateAppearancePatch({ chatWidthPct: 101 }, `${APPEARANCE_PRESET_FLAG} "planted"`)).toMatchObject({
    error: expect.stringContaining("invalid value"),
  });
});

// #1509 item 10, honestly labelled: this is a FENCE on the exported door, not a live-defect proof. The
// contracts schema is TOTAL for every plain object (each leaf carries a `.catch`), and both in-file
// callers guard with `isPlainObject` first — measured on the tree, the only inputs the schema throws on
// are non-objects. But `validateAppearancePatch` is EXPORTED and its whole contract is the `{ error }`
// shape a CLI turns into an ARG ERROR, so the throwing `.parse` was one un-guarded caller away from
// putting a raw ZodError out of a probe's mouth. `safeParse` makes that structurally impossible.
test("the exported validator RETURNS its refusal for a non-object, rather than throwing a ZodError", () => {
  // eslint-disable-next-line orb/no-test-fabrication -- A scalar must reach the exported appearance validator and return its refusal without throwing. Ends when that runtime validation is removed.
  const notAnObject = 7 as unknown as Parameters<typeof validateAppearancePatch>[0];

  expect(() => validateAppearancePatch(notAnObject, "--appearance")).not.toThrow();
  expect(validateAppearancePatch(notAnObject, "--appearance")).toMatchObject({
    error: expect.stringContaining("--appearance is not a readable appearance object"),
  });
  // The guarded callers keep their own, more specific refusals — this door did not take their job.
  expect(parseAppearancePatch("7")).toEqual({ error: '--appearance expects a JSON object, got "7"' });
});

test("an unknown preset name is refused with the valid list, not treated as an empty patch", () => {
  const outcome = loadAppearancePreset("maximalist");

  expect(outcome).toMatchObject({ error: expect.stringContaining("is not a profile") });
  const message = "error" in outcome ? outcome.error : "";
  for (const name of appearancePresetNames()) {
    expect(message).toContain(name);
  }
});

test("every committed profile states a why and resolves a valid non-empty patch", () => {
  const file = JSON.parse(readFileSync(PRESETS_PATH, "utf8")) as { presets: Record<string, { why?: string; appearance?: Record<string, unknown> }> };
  const names = appearancePresetNames();

  expect(names.length).toBeGreaterThanOrEqual(4);
  for (const name of names) {
    const entry = file.presets[name];
    expect(entry?.why, `${name} owes a why`).toBeTruthy();
    const outcome = loadAppearancePreset(name);
    expect(outcome).toHaveProperty("patch");
    if ("error" in outcome) {
      throw new Error(outcome.error);
    }
    expect(Object.keys(outcome.patch).length, `${name} owes appearance keys`).toBeGreaterThan(0);
    expect(validateAppearancePatch(outcome.patch, `${APPEARANCE_PRESET_FLAG} ${JSON.stringify(name)}`)).toEqual(outcome);
  }
});

test("applyAppearanceFlag folds a patch in and routes a refusal to the CLI's error list", () => {
  // The structural shape every probe CLI's Args satisfies — declared, not cast, so it stays honest if the
  // helper's parameter type moves.
  const args: { appearance: Record<string, unknown> | null; errors: string[] } = { appearance: null, errors: [] };

  applyAppearanceFlag(args, parseAppearancePatch('{"density":"compact"}'));
  expect(args).toEqual({ appearance: { density: "compact" }, errors: [] });

  applyAppearanceFlag(args, loadAppearancePreset("nope"));
  expect(args.errors).toHaveLength(1);
  expect(args.appearance).toEqual({ density: "compact" });
});

test("snap's CLI: --full-motion is exactly the sugar, a preset loads, and --appearance composes over it", () => {
  expect(parseSnapArgs(["/", "--full-motion"]).appearance).toEqual(FULL_MOTION_PATCH);

  const composed = parseSnapArgs(["/", APPEARANCE_PRESET_FLAG, "compact", "--appearance", '{"density":"comfortable"}']);
  expect(composed.errors).toEqual([]);
  expect(composed.appearance?.["density"]).toBe("comfortable");
  // …while the rest of the preset survives — the patch is a merge, not a replacement.
  expect(composed.appearance?.["avatarSize"]).toBe("sm");
});

test("snap refuses a bad appearance flag before a browser boots (misuse posture)", () => {
  expect(parseSnapArgs(["/", "--appearance", "{oops"]).errors[0]).toContain("expects a JSON object");
  expect(parseSnapArgs(["/", APPEARANCE_PRESET_FLAG, "nope"]).errors[0]).toContain("is not a profile");
  // A static mock makes no settings request — the shim would be a lie there.
  expect(parseSnapArgs(["--file", "x.html", "--full-motion"]).appearance).toEqual(FULL_MOTION_PATCH);
});

test("no appearance flag = the account's real state (the shim is not installed at all)", () => {
  expect(parseSnapArgs(["/"]).appearance).toBeNull();
});

test("defaults resolves every schema axis instead of stale values or omitted account preferences", () => {
  const expected = Object.fromEntries(Object.entries(appearanceSettingsSchema.parse({})).filter(([key]) => key !== "backgroundLibrary"));
  const nondefaultAvatarSize = expected["avatarSize"] === "lg" ? "sm" : "lg";
  const args = parseSnapArgs(["/", APPEARANCE_PRESET_FLAG, "defaults"]);

  expect(args.errors).toEqual([]);
  expect(args.appearance).toEqual(expected);
  expect({ ...expected, avatarSize: nondefaultAvatarSize }).not.toEqual(expected);
  const omittedPreferences = Object.fromEntries(Object.entries(expected).filter(([key]) => key !== "reducedTransparency" && key !== "increasedContrast"));
  expect(omittedPreferences).not.toEqual(expected);
});

test("defaults resets the shim's saved axes and background selection but retains uploaded content without mutating the response", () => {
  const defaults = appearanceSettingsSchema.parse({});
  const nondefaultAvatarSize = defaults.avatarSize === "lg" ? "sm" : "lg";
  const backgroundLibrary = [{ name: "Retained upload", assetHash: "owned-hash" }];
  const account = {
    ...defaults,
    avatarSize: nondefaultAvatarSize,
    reducedTransparency: "on",
    increasedContrast: "off",
    backgroundImageKind: "asset",
    backgroundAssetId: "owned-asset",
    backgroundAssetHash: "owned-hash",
    backgroundAssetMime: "image/png",
    backgroundLibrary,
  };
  const args = parseSnapArgs(["/", APPEARANCE_PRESET_FLAG, "defaults"]);
  expect(args.errors).toEqual([]);
  expect(args.appearance).not.toBeNull();
  if (args.appearance === null) {
    throw new Error("defaults did not resolve an appearance patch");
  }
  const body = envelope(account);
  const patched = applySettingsToBody(body, 0, { appearance: args.appearance });

  expect(patched.applied).toBe(true);
  expect(appearanceOf(patched.body)).toEqual({ ...defaults, backgroundLibrary });
  expect(appearanceOf(patched.body)["backgroundLibrary"]).toBe(backgroundLibrary);
  expect(appearanceOf(body)).toBe(account);
  expect(account.backgroundAssetHash).toBe("owned-hash");
  expect(appearanceBootHintPatch(args.appearance)).toEqual(appearanceBootHintPatch(defaults));
});

test("defaults composes with explicit patches in argv order and help distinguishes schema values from curated patches", () => {
  const defaults = appearanceSettingsSchema.parse({});
  const nondefaultAvatarSize = defaults.avatarSize === "lg" ? "sm" : "lg";
  const override = JSON.stringify({ avatarSize: nondefaultAvatarSize });
  const overridden = parseSnapArgs(["/", APPEARANCE_PRESET_FLAG, "defaults", "--appearance", override]);
  const reset = parseSnapArgs(["/", "--appearance", override, APPEARANCE_PRESET_FLAG, "defaults"]);

  expect(overridden.appearance?.["avatarSize"]).toBe(nondefaultAvatarSize);
  expect(reset.appearance?.["avatarSize"]).toBe(defaults.avatarSize);
  expect(appearanceHelpBlock()).toContain("defaults derives the production schema's defaults");
  expect(appearanceHelpBlock()).toContain("backgroundLibrary");
});

test("a failed real-response fallback rejects the appearance shim instead of reporting a usable route", async () => {
  let handler: ((route: Route) => Promise<void>) | undefined;
  // eslint-disable-next-line orb/no-test-fabrication -- Controlled Playwright routing exposes the real registered handler to distinguish primary and fallback failures. Ends when native routing fault injection supplies this pair.
  const context = {
    addInitScript: () => Promise.resolve(),
    route: (_glob: string, registered: (route: Route) => Promise<void>) => {
      handler = registered;
      return Promise.resolve();
    },
  } as unknown as BrowserContext;
  await installSettingsShim(context, { appearance: { reducedMotion: false }, theme: null });

  const fallbackFailure = new Error("planted fallback failure");
  // eslint-disable-next-line orb/no-test-fabrication -- Primary fetch fails and final fallback rejects with its original error; no usable response may be reported. Ends when native routing fault injection supplies this pair.
  const route = {
    request: () => ({ url: () => "http://localhost/api/trpc/settings.getUserSettings?batch=1" }),
    fetch: async () => Promise.reject(new Error("planted primary failure")),
    fallback: async () => Promise.reject(fallbackFailure),
  } as unknown as Route;

  expect(handler).toBeDefined();
  await expect(handler?.(route) ?? Promise.resolve()).rejects.toBe(fallbackFailure);
});

test("the defaults and maximal profiles each PIN enableThemeColorization, at opposite values", () => {
  expect(loadAppearancePreset("defaults")).toMatchObject({ patch: { enableThemeColorization: false } });
  expect(loadAppearancePreset("maximal")).toMatchObject({ patch: { enableThemeColorization: true } });
});
