// The appearance shim the browser probes share (tooling/src/_shared/appearance.ts). Home per
// Spine-Testing §2: a test of a scripts/ tool lives in tests/tooling/.
//
// WHY IT EXISTS (owner ruling 2026-08-18): the dev account STORES `appearance.reducedMotion: true`, so every
// probe drive reviewed the reduced arm — and `--reduced-motion` (the OS media query) is a DIFFERENT gate that
// cannot turn the app setting back on. These pins cover the pure half: what the patch means, which batch
// element it lands on, and that CLI misuse is refused instead of silently doing nothing.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { appearanceBootHintPatch, applySettingsToBody, deepMergeSettings, mergeAppearancePatches, trpcProcedureIndex } from "@orb/tooling/_shared/appearance";
import {
  appearancePresetNames,
  applyAppearanceFlag,
  FULL_MOTION_PATCH,
  loadAppearancePreset,
  parseAppearancePatch,
  validateAppearancePatch,
} from "@orb/tooling/_shared/appearance-flags";
import type { BrowserContext, Route } from "@playwright/test";
import { installSettingsShim } from "../../../tooling/src/_shared/appearance.ts";
import { parseSnapArgs } from "../../../tooling/src/snap/index.ts";
import { expect, test } from "../../support/tool-fixtures.ts";

const PRESETS_PATH = fileURLToPath(new URL("../../../tooling/src/_shared/appearance-presets.json", import.meta.url));

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
  expect(parseAppearancePatch('{"reducedMotion":false}')).toEqual({ patch: { reducedMotion: false } });
});

test("unknown keys and schema-healed values refuse instead of pretending the requested arm rendered", () => {
  expect(parseAppearancePatch('{"ghostAppearance":true}')).toEqual({
    error: '--appearance contains unknown appearance key "ghostAppearance"',
  });
  expect(parseAppearancePatch('{"density":"ultra-compact"}')).toEqual({
    error: '--appearance contains invalid value for appearance key "density": "ultra-compact"',
  });

  // Planted preset-equivalent controls exercise the same validator the committed JSON passes through.
  expect(validateAppearancePatch({ ghostAppearance: true }, '--appearance-preset "planted"')).toMatchObject({
    error: expect.stringContaining("unknown appearance key"),
  });
  expect(validateAppearancePatch({ chatWidthPct: 101 }, '--appearance-preset "planted"')).toMatchObject({
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
  // @orb-waive no-test-fabrication(unknown): a deliberate invalid-input probe — the NON-object is the thing under test (the exported validator must return its refusal, not throw) Ends when this deliberate test boundary can be expressed without a fabricated typed value.
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

test("every committed profile states a why and carries a non-empty patch", () => {
  const file = JSON.parse(readFileSync(PRESETS_PATH, "utf8")) as { presets: Record<string, { why?: string; appearance?: Record<string, unknown> }> };
  const names = appearancePresetNames();

  expect(names.length).toBeGreaterThanOrEqual(4);
  for (const name of names) {
    const entry = file.presets[name];
    expect(entry?.why, `${name} owes a why`).toBeTruthy();
    expect(Object.keys(entry?.appearance ?? {}).length, `${name} owes appearance keys`).toBeGreaterThan(0);
    expect(validateAppearancePatch(entry?.appearance ?? {}, `--appearance-preset ${JSON.stringify(name)}`)).toEqual({
      patch: entry?.appearance,
    });
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

  const composed = parseSnapArgs(["/", "--appearance-preset", "compact", "--appearance", '{"density":"comfortable"}']);
  expect(composed.errors).toEqual([]);
  expect(composed.appearance?.["density"]).toBe("comfortable");
  // …while the rest of the preset survives — the patch is a merge, not a replacement.
  expect(composed.appearance?.["avatarSize"]).toBe("sm");
});

test("snap refuses a bad appearance flag before a browser boots (misuse posture)", () => {
  expect(parseSnapArgs(["/", "--appearance", "{oops"]).errors[0]).toContain("expects a JSON object");
  expect(parseSnapArgs(["/", "--appearance-preset", "nope"]).errors[0]).toContain("is not a profile");
  // A static mock makes no settings request — the shim would be a lie there.
  expect(parseSnapArgs(["--file", "x.html", "--full-motion"]).appearance).toEqual(FULL_MOTION_PATCH);
});

test("no appearance flag = the account's real state (the shim is not installed at all)", () => {
  expect(parseSnapArgs(["/"]).appearance).toBeNull();
});

test("a failed real-response fallback rejects the appearance shim instead of reporting a usable route", async () => {
  let handler: ((route: Route) => Promise<void>) | undefined;
  // @orb-waive no-test-fabrication(unknown): Playwright's `BrowserContext` is a third-party interface with dozens of members and no Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  // public constructor, so a shim test can only supply the ONE door the code under test opens
  // (`context.route`). Ends the day installSettingsShim's signature narrows to that structural surface.
  const context = {
    addInitScript: () => Promise.resolve(),
    route: (_glob: string, registered: (route: Route) => Promise<void>) => {
      handler = registered;
      return Promise.resolve();
    },
  } as unknown as BrowserContext;
  await installSettingsShim(context, { appearance: { reducedMotion: false }, theme: null });

  const fallbackFailure = new Error("planted fallback failure");
  // @orb-waive no-test-fabrication(unknown): same third-party-edge reason as the BrowserContext double above — `Route` is a Playwright Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  // interface with no constructor; this supplies only request/fetch/fallback, the members the fallback path
  // under test actually calls.
  const route = {
    request: () => ({ url: () => "http://localhost/api/trpc/settings.getUserSettings?batch=1" }),
    fetch: async () => Promise.reject(new Error("planted primary failure")),
    fallback: async () => Promise.reject(fallbackFailure),
  } as unknown as Route;

  expect(handler).toBeDefined();
  await expect(handler?.(route) ?? Promise.resolve()).rejects.toBe(fallbackFailure);
});
