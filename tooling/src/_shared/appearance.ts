// THE SETTINGS SHIM — a per-run, NON-MUTATING override of the user's stored settings for the browser probes.
// TWO AXES ride the SAME interception, because the app reads both out of ONE response:
//   • APPEARANCE (`--appearance '<json>'`, `--appearance-preset`, `--full-motion`) — this file, below.
//   • the ACTIVE THEME (`--theme <name|id|none>`) — `_kit/theme.ts` owns what a theme request means and how
//     a name resolves to a real id; this file owns the interception it rides on (#225).
//
// WHY THIS EXISTS (owner ruling 2026-08-18): the dev account's SERVER-side `appearance.reducedMotion` is
// `true`, so every probe drive against the dev stack reviews the REDUCED arm — motion audits have been
// judging the app with its motion off, and a "the entry animation is fine" verdict was a claim about a
// surface whose animations the app itself had frozen. The probes needed a way to render as if a setting
// were different WITHOUT writing the owner's settings row.
//
// THE MECHANISM (verified against the live wire 2026-08-18): the client's tRPC link is `httpBatchLink` with
// NO transformer (packages/client/src/data/trpc.ts), so `settings.getUserSettings` answers on a plain GET at
// `/api/trpc/<proc>[,<proc>…]?batch=1&input=…` with `[{"result":{"data":{…,"config":{…,"appearance":{…}}}}}]`
// — one array element per procedure, IN PATH ORDER. So the shim intercepts the request, fetches the REAL
// response, deep-merges the patch into `result.data.config` of the element that belongs to
// `settings.getUserSettings`, and fulfills. Nothing is written: the db row, the server, and every other
// procedure in the batch are untouched, and the next probe run with no flag sees the real account again.
// The merge lands at CONFIG level so both axes are one patch: `{appearance:{…}}` and/or
// `{theme:{selectedThemeId:…}}` — a key nobody named keeps the account's real value either way.
//
// TWO DIFFERENT MOTION GATES — do not confuse them (they diverge, which is exactly why this file exists):
//   • `--reduced-motion` (snap) → `emulateMedia({reducedMotion:"reduce"})` — the OS MEDIA QUERY.
//   • `--full-motion` / `--appearance` → this shim — the APP SETTING (`[data-reduced-motion]` on <html>,
//     written by useAppearanceRootEffects from this very query).
// motion-audit/perf-meter already pass `reducedMotion:false` (the media query) and STILL measured a frozen
// app, because the app setting said reduce. They compose; neither implies the other.
//
// BOOT PATH: today the app has no pre-createRoot device-local reduced-motion hint — `data-reduced-motion`
// is stamped by `useAppearanceRootEffects` (a layout effect fed by THIS query, moved to <html> in
// 110a43715), so intercepting the query is the whole story. If a localStorage boot hint is ever added, seed
// it here alongside the interception (snap's `--ls` seeds run through the same context).
import { readFileSync } from "node:fs";
import type { BrowserContext, Route } from "@playwright/test";
import { warn } from "./log.ts";
import type { ThemeEntry, ThemeRequest } from "./theme.ts";
import { LIST_THEMES_PROCEDURE, readThemeList, resolveTheme, themeConfigPatch, themeWarning } from "./theme.ts";

/** The tRPC procedure that answers with the user's settings blob. */
const SETTINGS_PROCEDURE = "settings.getUserSettings";
const TRPC_PATH_PREFIX = "/api/trpc/";
/** Matched on the CONTEXT so every tab/page of a `--pages`/`--contexts` run inherits one shim. */
const TRPC_ROUTE_GLOB = "**/api/trpc/**";

/** An `--appearance` patch: the keys of `appearance` the run pretends are set. Values stay `unknown` — the
 *  SERVER schema owns the vocabulary (`packages/contracts/src/settings`), and re-spelling it here would be a
 *  second home for it. An unknown key simply passes through to the app, which drops it at its own parse. */
export type AppearancePatch = Readonly<Record<string, unknown>>;

/** A patch at `config` level — the union of the axes a run pretends (`appearance`, `theme`). Same
 *  `unknown` values for the same reason: the SERVER schema owns the vocabulary. */
export type SettingsPatch = Readonly<Record<string, unknown>>;

/** Parse outcome: a patch, or a stated reason (the caller turns it into an ARG ERROR — exit 2). */
export type AppearanceParse = { readonly patch: AppearancePatch } | { readonly error: string };

/** `--full-motion` is exactly this patch — the flag a motion sweep actually types. */
export const FULL_MOTION_PATCH: AppearancePatch = { reducedMotion: false };

/** THE curated appearance points (`--appearance-preset <name>`), committed beside the probes so a sweep
 *  names a profile instead of pasting JSON. One home: new coverage is a new PROFILE there, never a new flag.
 *  Read eagerly at parse time so an unknown/broken profile is CLI misuse (exit 2), not a mid-run surprise. */
const PRESETS_PATH = new URL("./appearance-presets.json", import.meta.url);

interface PresetFile {
  readonly presets?: Record<string, { readonly why?: string; readonly appearance?: unknown }>;
}

/** Null when the committed file is missing or unparseable — the caller turns that into an ARG ERROR naming
 *  the path, never a silent "no such preset" that blames the caller for a broken file. */
function readPresetFile(): PresetFile | null {
  try {
    return JSON.parse(readFileSync(PRESETS_PATH, "utf8")) as PresetFile;
  } catch {
    return null;
  }
}

/** Every profile name, in file order — the list an ARG ERROR prints and `--help` echoes. */
export function appearancePresetNames(): readonly string[] {
  return Object.keys(readPresetFile()?.presets ?? {});
}

/** `--appearance-preset <name>` → its patch, or a stated reason naming the valid profiles. */
export function loadAppearancePreset(name: string): AppearanceParse {
  const file = readPresetFile();
  if (file === null) {
    return { error: "--appearance-preset could not read tooling/src/_shared/appearance-presets.json (missing or invalid JSON)" };
  }
  const presets = file.presets ?? {};
  const entry = presets[name];
  if (entry === undefined) {
    return { error: `--appearance-preset "${name}" is not a profile — valid: ${Object.keys(presets).join(", ")}` };
  }
  if (!isPlainObject(entry.appearance)) {
    return { error: `--appearance-preset "${name}" has no appearance object in tooling/src/_shared/appearance-presets.json` };
  }
  return { patch: entry.appearance };
}

/** The value-taking appearance flags — every probe CLI adds these to its required-value scan. */
export const APPEARANCE_VALUE_FLAGS: readonly string[] = ["--appearance", "--appearance-preset"];

/** The one help block for the appearance axis, shared by all four probe CLIs so the axis warning cannot
 *  drift between them. Rendered with the house `Heading:` + two-space-indented flag list. */
export function appearanceHelpBlock(): string {
  return `Appearance (the APP's own settings, shimmed over the settings response and never written — a DIFFERENT
axis from --reduced-motion, which emulates the OS media query; they compose):
  --full-motion                 render with the app's reduce-motion setting OFF
  --appearance '<json>'         deep-merge any appearance keys, e.g. '{"density":"compact"}'
  --appearance-preset <name>    curated profile: ${appearancePresetNames().join(" | ")}
                                (tooling/src/_shared/appearance-presets.json is the ONE home for these —
                                new coverage is a new profile there, never a new flag; --appearance
                                composes OVER a preset). No flag = the account's real state.`;
}

/** Fold one appearance flag's outcome into a CLI's args — the patch accumulates (later keys win, so argv
 *  reads the way it behaves) and a stated reason becomes CLI misuse (exit 2). Shared by all four probes:
 *  a typo'd profile must never quietly audit the account state under a profile's name. */
export function applyAppearanceFlag(target: { appearance: AppearancePatch | null; errors: string[] }, parsed: AppearanceParse): void {
  if ("error" in parsed) {
    target.errors.push(parsed.error);
    return;
  }
  target.appearance = mergeAppearancePatches(target.appearance, parsed.patch);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `--appearance '<json>'` → a patch. A non-object (array/number/string/null) is CLI misuse, not a silent
 *  no-op: the flag's whole contract is "these appearance keys". */
export function parseAppearancePatch(raw: string): AppearanceParse {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (e) {
    return { error: `--appearance expects a JSON object, got ${JSON.stringify(raw)} (${e instanceof Error ? e.message : String(e)})` };
  }
  if (!isPlainObject(value)) {
    return { error: `--appearance expects a JSON object, got ${JSON.stringify(raw)}` };
  }
  return { patch: value };
}

/**
 * Deep-merge `patch` over `base`. Nested objects merge key-by-key; every other value (array, scalar, null)
 * REPLACES wholesale — an appearance list like `blurSurfaces` is a set the caller means to state, not append
 * to, and `theme.selectedThemeId: null` is the "no selection" arm, not an absent key. A key absent from the
 * patch keeps the account's real value, which is what makes this an override of named axes rather than a
 * synthetic settings blob.
 */
export function deepMergeSettings(base: unknown, patch: SettingsPatch): unknown {
  if (!isPlainObject(base)) {
    return { ...patch };
  }
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const current = merged[key];
    merged[key] = isPlainObject(current) && isPlainObject(value) ? deepMergeSettings(current, value) : value;
  }
  return merged;
}

/** Accumulate repeated appearance flags in argv order — later keys win, so
 *  `--full-motion --appearance '{"reducedMotion":true}'` ends up reduced, as written. */
export function mergeAppearancePatches(base: AppearancePatch | null, next: AppearancePatch): AppearancePatch {
  return base === null ? next : (deepMergeSettings(base, next) as AppearancePatch);
}

/**
 * Which element of a batched tRPC response belongs to `settings.getUserSettings` — the index of the
 * procedure in the comma-separated path, or null when this request does not carry it at all (the common
 * case; those routes fall straight through untouched).
 */
export function trpcProcedureIndex(rawUrl: string, procedure: string = SETTINGS_PROCEDURE): number | null {
  let pathname: string;
  try {
    pathname = new URL(rawUrl).pathname;
  } catch {
    return null;
  }
  const marker = pathname.indexOf(TRPC_PATH_PREFIX);
  if (marker === -1) {
    return null;
  }
  const index = decodeURIComponent(pathname.slice(marker + TRPC_PATH_PREFIX.length))
    .split(",")
    .indexOf(procedure);
  return index === -1 ? null : index;
}

/** Patch ONE tRPC envelope's `result.data.config`. A shape that isn't the settings envelope (an
 *  error result, a schema that moved) is returned untouched with `applied:false` — the caller REPORTS that
 *  rather than fabricating a config the app never sent. */
function patchEnvelope(envelope: unknown, patch: SettingsPatch): { readonly value: unknown; readonly applied: boolean } {
  if (!isPlainObject(envelope)) {
    return { value: envelope, applied: false };
  }
  const result = envelope["result"];
  if (!isPlainObject(result)) {
    return { value: envelope, applied: false };
  }
  const data = result["data"];
  if (!isPlainObject(data)) {
    return { value: envelope, applied: false };
  }
  const config = data["config"];
  if (!isPlainObject(config)) {
    return { value: envelope, applied: false };
  }
  return {
    value: { ...envelope, result: { ...result, data: { ...data, config: deepMergeSettings(config, patch) } } },
    applied: true,
  };
}

/** Patch a whole tRPC response body — a batch ARRAY (patch the element at `index`) or a single envelope
 *  (`batch=0`, index 0). Pure, so the merge semantics are unit-testable without a browser. */
export function applySettingsToBody(body: unknown, index: number, patch: SettingsPatch): { readonly body: unknown; readonly applied: boolean } {
  if (Array.isArray(body)) {
    const target = body[index];
    if (target === undefined) {
      return { body, applied: false };
    }
    const patched = patchEnvelope(target, patch);
    return { body: body.map((entry, i) => (i === index ? patched.value : entry)), applied: patched.applied };
  }
  if (index !== 0) {
    return { body, applied: false };
  }
  const patched = patchEnvelope(body, patch);
  return { body: patched.value, applied: patched.applied };
}

async function fulfilPatched(route: Route, patch: SettingsPatch, index: number): Promise<void> {
  const response = await route.fetch();
  const body = (await response.json()) as unknown;
  const patched = applySettingsToBody(body, index, patch);
  await route.fulfill({ response, json: patched.body });
}

/** The theme library, asked of the app's OWN API on the context's cookie jar — the same origin the
 *  intercepted request went to, so a `--base`/stage port never has to be re-derived here. `listThemes` takes
 *  no input, so the batch URL carries an empty input map. */
function themeListUrl(requestUrl: string): string | null {
  try {
    return `${new URL(requestUrl).origin}${TRPC_PATH_PREFIX}${LIST_THEMES_PROCEDURE}?batch=1&input=${encodeURIComponent("{}")}`;
  } catch {
    return null;
  }
}

/** Resolve `--theme` ONCE per context (the first intercepted settings read, by which point the context is
 *  authenticated), then reuse the answer for every later request. Every failure arm — no origin, a non-200,
 *  an unparseable body, a name that is not in the library — returns null AFTER printing the loud warning,
 *  so a run can never quietly review the account's own theme under another theme's name. */
function themeResolver(request: ThemeRequest): (route: Route, context: BrowserContext) => Promise<{ readonly id: string | null } | null> {
  let pending: Promise<{ readonly id: string | null } | null> | null = null;
  const resolveOnce = async (route: Route, context: BrowserContext): Promise<{ readonly id: string | null } | null> => {
    const url = themeListUrl(route.request().url());
    if (url === null) {
      warn(themeWarning(`could not derive an API origin from ${route.request().url()}`));
      return null;
    }
    let entries: readonly ThemeEntry[] | null = null;
    try {
      const response = await context.request.get(url);
      entries = response.ok() ? readThemeList((await response.json()) as unknown) : null;
      if (entries === null) {
        warn(themeWarning(`${LIST_THEMES_PROCEDURE} answered ${response.status()} with no theme list`));
        return null;
      }
    } catch (e) {
      warn(themeWarning(`${LIST_THEMES_PROCEDURE} could not be read (${e instanceof Error ? e.message : String(e)})`));
      return null;
    }
    const resolution = resolveTheme(entries, request);
    if ("error" in resolution) {
      warn(themeWarning(resolution.error));
      return null;
    }
    return { id: resolution.id };
  };
  return (route, context) => {
    pending ??= resolveOnce(route, context);
    return pending;
  };
}

/** What a run pretends about the user's settings: the appearance keys and/or the ACTIVE THEME. Both null =
 *  no interception at all (the default probe run drives the REAL account state, itself a valid arm — it is
 *  the owner's actual experience). */
export interface SettingsShim {
  readonly appearance: AppearancePatch | null;
  readonly theme: ThemeRequest | null;
}

/**
 * Install the shim on a browser CONTEXT (before its first navigation, so the app's very first settings read
 * is already shimmed).
 *
 * Never fails the run: a request that can't be fetched/parsed (a mid-navigation abort, a non-JSON error page)
 * falls through to the real response — the alternative is a probe that dies on an unrelated network hiccup.
 * An UNRESOLVABLE `--theme` is the one case that is loud (stderr) rather than silent, because unlike a
 * network blip it means the run measured a different arm than the operator typed.
 */
export async function installSettingsShim(context: BrowserContext, shim: SettingsShim): Promise<void> {
  if (shim.appearance === null && shim.theme === null) {
    return;
  }
  const resolveThemeId = shim.theme === null ? null : themeResolver(shim.theme);
  await context.route(TRPC_ROUTE_GLOB, async (route: Route) => {
    const index = trpcProcedureIndex(route.request().url());
    if (index === null) {
      await route.fallback();
      return;
    }
    try {
      // No --theme, or a resolution that FAILED (the warning already said so) → no theme key at all, never
      // a fabricated selection. A resolved `none` IS a selection: `selectedThemeId: null`.
      const themeOutcome = resolveThemeId === null ? null : await resolveThemeId(route, context);
      const patch: SettingsPatch = {
        ...(shim.appearance === null ? {} : { appearance: shim.appearance }),
        ...(themeOutcome === null ? {} : themeConfigPatch(themeOutcome.id)),
      };
      await fulfilPatched(route, patch, index);
    } catch {
      await route.fallback().catch(() => undefined);
    }
  });
}
