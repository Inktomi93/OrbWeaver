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
// BOOT PATH: the app replays fontScale/reducedMotion before createRoot and seeds density into React's first
// ThemeScope commit from `orb:appearance-boot`. Intercepting the query alone would therefore measure a
// stale first frame. `installSettingsShim` seeds exactly those carried axes before navigation; the
// appearance-carrier-contract gate keeps this copied browser boundary set-equal to the live manifest.
import type { BrowserContext, Route } from "@playwright/test";
import { installAppearancePrepaintRecorder } from "./appearance-prepaint.ts";
import { warn } from "./log.ts";
import { isPlainObject } from "./page-validate.ts";
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

/** The appearance values remembered before React. `dataTheme` is a separate selected-theme axis. */
export interface AppearanceBootHintPatch {
  readonly reducedMotion?: unknown;
  readonly fontScale?: unknown;
  readonly density?: unknown;
}

const APPEARANCE_BOOT_HINT_KEY = "orb:appearance-boot";
const APPEARANCE_BOOT_HINT_VERSION = 1;

/** Project an arbitrary Snap patch onto the app's actual first-frame Appearance subset. */
export function appearanceBootHintPatch(patch: AppearancePatch): AppearanceBootHintPatch {
  return {
    ...(Object.hasOwn(patch, "reducedMotion") ? { reducedMotion: patch["reducedMotion"] } : {}),
    ...(Object.hasOwn(patch, "fontScale") ? { fontScale: patch["fontScale"] } : {}),
    ...(Object.hasOwn(patch, "density") ? { density: patch["density"] } : {}),
  };
}

async function seedAppearanceBootHint(context: BrowserContext, patch: AppearancePatch): Promise<void> {
  const axes = appearanceBootHintPatch(patch);
  if (Object.keys(axes).length === 0) {
    return;
  }
  await context.addInitScript(
    ({ axes: requested, key, version }) => {
      let current: unknown;
      // @orb-waive caught-failure-ownership(catch): a malformed optional device hint is replaced by the requested probe axes; the app re-validates the result through appearanceSettingsSchema. Ends if the hint becomes authoritative.
      try {
        current = JSON.parse(localStorage.getItem(key) ?? "null") as unknown;
      } catch {
        current = null;
      }
      const state =
        typeof current === "object" && current !== null && "state" in current && typeof current.state === "object" && current.state !== null
          ? current.state
          : {};
      // @orb-waive caught-failure-ownership(catch): an opaque-origin bootstrap page has no localStorage; the settings-response shim remains authoritative after navigation. Ends if the boot hint becomes the authoritative appearance source.
      try {
        localStorage.setItem(key, JSON.stringify({ state: { ...state, ...requested }, version }));
      } catch {
        // Opaque bootstrap documents cannot carry origin-scoped hints.
      }
    },
    { axes, key: APPEARANCE_BOOT_HINT_KEY, version: APPEARANCE_BOOT_HINT_VERSION },
  );
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
  // @orb-waive caught-failure-ownership(catch): an unreadable optional appearance snapshot is represented as absent and the caller rebuilds from the live page. Ends if this snapshot becomes authoritative.
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

async function fulfilPatched(route: Route, patch: SettingsPatch, index: number): Promise<boolean> {
  const response = await route.fetch();
  const body = (await response.json()) as unknown;
  const patched = applySettingsToBody(body, index, patch);
  await route.fulfill({ response, json: patched.body });
  return patched.applied;
}

/** The theme library, asked of the app's OWN API on the context's cookie jar — the same origin the
 *  intercepted request went to, so a `--base`/stage port never has to be re-derived here. `listThemes` takes
 *  no input, so the batch URL carries an empty input map. */
function themeListUrl(requestUrl: string): string | null {
  // @orb-waive caught-failure-ownership(catch): an unreadable optional theme catalog entry is represented as absent and the caller reports the missing theme. Ends if absence stops reaching the operator.
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
const THEME_RESOLUTION_SOURCES = ["default", "seed", "custom", "unknown"] as const;
export type ThemeResolutionSource = (typeof THEME_RESOLUTION_SOURCES)[number];

export interface ThemeResolutionEvidence {
  readonly request: ThemeRequest;
  readonly id: string | null;
  readonly name: string | null;
  readonly source: ThemeResolutionSource;
}

interface ResolvedTheme {
  readonly id: string | null;
  readonly evidence: ThemeResolutionEvidence;
  readonly catalog: readonly ThemeEntry[];
}

function resolvedTheme(entries: readonly ThemeEntry[], request: ThemeRequest, id: string | null): ResolvedTheme {
  if (id === null) {
    return { id: null, evidence: { request, id: null, name: null, source: "default" }, catalog: entries };
  }
  const entry = entries.find((candidate) => candidate.id === id);
  let source: ThemeResolutionSource = "unknown";
  if (entry?.isSeed === true) {
    source = "seed";
  } else if (entry?.isSeed === false) {
    source = "custom";
  }
  return { id, evidence: { request, id, name: entry?.name ?? null, source }, catalog: entries };
}

function themeResolver(request: ThemeRequest): (route: Route, context: BrowserContext) => Promise<ResolvedTheme | null> {
  let pending: Promise<ResolvedTheme | null> | null = null;
  const resolveOnce = async (route: Route, context: BrowserContext): Promise<ResolvedTheme | null> => {
    const url = themeListUrl(route.request().url());
    if (url === null) {
      warn(themeWarning(`could not derive an API origin from ${route.request().url()}`));
      return null;
    }
    let entries: readonly ThemeEntry[] | null = null;
    // @orb-waive caught-failure-ownership(e): the list-themes command emits the read failure through warn before returning no catalog. Ends if the warning stops carrying the failure.
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
    return resolvedTheme(entries, request, resolution.id);
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

export interface SettingsShimEvidence {
  appearanceApplied: boolean | null;
  themeApplied: boolean | null;
  /** The real catalog row the request resolved to; null until/unless resolution succeeds. */
  themeResolution: ThemeResolutionEvidence | null;
  /** The authenticated catalog used for resolution, including derived source/polarity capabilities. */
  themeCatalog: readonly ThemeEntry[] | null;
}

function recordAppliedEvidence(evidence: SettingsShimEvidence, applied: boolean, appearanceRequested: boolean, themeResolved: boolean): void {
  if (!applied) {
    return;
  }
  if (appearanceRequested) {
    evidence.appearanceApplied = true;
  }
  if (themeResolved) {
    evidence.themeApplied = true;
  }
}

/**
 * Install the shim on a browser CONTEXT (before its first navigation, so the app's very first settings read
 * is already shimmed).
 *
 * A primary fetch/parse/patch failure falls through to the real response, so an unrelated interception
 * hiccup does not fabricate settings. The FALLBACK itself is the final response owner: if it rejects there
 * is no real response to continue with, so that rejection propagates and the probe fails honestly. An
 * UNRESOLVABLE `--theme` is loud (stderr) because the run measured a different arm than the operator typed.
 */
export async function installSettingsShim(context: BrowserContext, shim: SettingsShim): Promise<SettingsShimEvidence> {
  const evidence: SettingsShimEvidence = {
    appearanceApplied: shim.appearance === null ? null : false,
    themeApplied: shim.theme === null ? null : false,
    themeResolution: null,
    themeCatalog: null,
  };
  if (shim.appearance === null && shim.theme === null) {
    return evidence;
  }
  await installAppearancePrepaintRecorder(context);
  if (shim.appearance !== null) {
    await seedAppearanceBootHint(context, shim.appearance);
  }
  const resolveThemeId = shim.theme === null ? null : themeResolver(shim.theme);
  await context.route(TRPC_ROUTE_GLOB, async (route: Route) => {
    const index = trpcProcedureIndex(route.request().url());
    if (index === null) {
      await route.fallback();
      return;
    }
    // @orb-waive caught-failure-ownership(catch): the primary route failure is owned by the awaited fallback route, whose own rejection propagates to the command. Ends if fallback becomes fire-and-forget.
    try {
      // No --theme, or a resolution that FAILED (the warning already said so) → no theme key at all, never
      // a fabricated selection. A resolved `none` IS a selection: `selectedThemeId: null`.
      const themeOutcome = resolveThemeId === null ? null : await resolveThemeId(route, context);
      if (themeOutcome !== null) {
        evidence.themeResolution = themeOutcome.evidence;
        evidence.themeCatalog = themeOutcome.catalog;
      }
      const patch: SettingsPatch = {
        ...(shim.appearance === null ? {} : { appearance: shim.appearance }),
        ...(themeOutcome === null ? {} : themeConfigPatch(themeOutcome.id)),
      };
      const applied = await fulfilPatched(route, patch, index);
      recordAppliedEvidence(evidence, applied, shim.appearance !== null, themeOutcome !== null);
    } catch {
      await route.fallback();
    }
  });
  return evidence;
}
