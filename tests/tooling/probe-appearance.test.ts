// The appearance shim the browser probes share (scripts/probes/_kit/appearance.ts). Home per
// Spine-Testing §2: a test of a scripts/ tool lives in tests/tooling/.
//
// WHY IT EXISTS (owner ruling 2026-08-18): the dev account STORES `appearance.reducedMotion: true`, so every
// probe drive reviewed the reduced arm — and `--reduced-motion` (the OS media query) is a DIFFERENT gate that
// cannot turn the app setting back on. These pins cover the pure half: what the patch means, which batch
// element it lands on, and that CLI misuse is refused instead of silently doing nothing.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  appearancePresetNames,
  applyAppearanceFlag,
  applyAppearanceToBody,
  deepMergeAppearance,
  FULL_MOTION_PATCH,
  loadAppearancePreset,
  mergeAppearancePatches,
  parseAppearancePatch,
  trpcProcedureIndex,
} from "../../scripts/probes/_kit/appearance.ts";
import { parseSnapArgs } from "../../scripts/probes/snap.ts";
import { expect, test } from "../support/fixtures.ts";

const PRESETS_PATH = fileURLToPath(new URL("../../scripts/probes/appearance-presets.json", import.meta.url));

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
  const merged = deepMergeAppearance({ reducedMotion: true, density: "comfortable", chatWidthPct: 50 }, { reducedMotion: false });

  expect(merged).toEqual({ reducedMotion: false, density: "comfortable", chatWidthPct: 50 });
});

test("arrays and scalars REPLACE wholesale — an appearance list is a set the caller states, not appends to", () => {
  const merged = deepMergeAppearance({ blurSurfaces: ["panels", "composer", "modals"] }, { blurSurfaces: [] });

  expect(merged).toEqual({ blurSurfaces: [] });
});

test("repeated flags accumulate in argv order, so the LAST spelling of a key wins", () => {
  // --full-motion then --appearance '{"reducedMotion":true}' must end up reduced: the command reads that way.
  const patch = mergeAppearancePatches(mergeAppearancePatches(null, FULL_MOTION_PATCH), { reducedMotion: true, density: "compact" });

  expect(patch).toEqual({ reducedMotion: true, density: "compact" });
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

  const patched = applyAppearanceToBody(body, 1, { reducedMotion: false });

  expect(patched.applied).toBe(true);
  expect(appearanceOf(patched.body, 1)).toEqual({ reducedMotion: false, density: "comfortable" });
  expect((patched.body as unknown[])[0]).toBe(others);
});

test("a response that is not the settings envelope is passed through, reported as NOT applied", () => {
  // An error result / a moved schema must never be replaced with a fabricated config the app never sent.
  const error = [{ error: { message: "UNAUTHORIZED" } }];

  expect(applyAppearanceToBody(error, 0, { reducedMotion: false })).toEqual({ body: error, applied: false });
});

test("unparseable JSON and a non-object are CLI misuse, never a silent no-op", () => {
  expect(parseAppearancePatch("not json")).toMatchObject({ error: expect.stringContaining("expects a JSON object") });
  expect(parseAppearancePatch('["reducedMotion"]')).toMatchObject({ error: expect.stringContaining("expects a JSON object") });
  expect(parseAppearancePatch('{"reducedMotion":false}')).toEqual({ patch: { reducedMotion: false } });
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

test("snap refuses a bad appearance flag before a browser boots (exit-2 posture)", () => {
  expect(parseSnapArgs(["/", "--appearance", "{oops"]).errors[0]).toContain("expects a JSON object");
  expect(parseSnapArgs(["/", "--appearance-preset", "nope"]).errors[0]).toContain("is not a profile");
  // A static mock makes no settings request — the shim would be a lie there.
  expect(parseSnapArgs(["--file", "x.html", "--full-motion"]).appearance).toEqual(FULL_MOTION_PATCH);
});

test("no appearance flag = the account's real state (the shim is not installed at all)", () => {
  expect(parseSnapArgs(["/"]).appearance).toBeNull();
});
