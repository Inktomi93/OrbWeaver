// --map: the global Orbweaver destination atlas plus the current rendered shell/surface map. Every
// surface row owns a unique locator; only rows explicitly marked actionable are current click handles.
import { errorMessage } from "@orb/kit/error-message";
import type { Page } from "@playwright/test";
import { aggregateScope } from "../../../_shared/artifact-scope.ts";
import type { ResultPair } from "../../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";
import { EXIT } from "../../../_shared/exit-contract.ts";
import type { ArmArgs, ArmDef, ArmFactEmission, ArmFailureCounts, ArmNeeds, ArmPairInput } from "../../contract/arms.ts";
import type { MapAtlasEvidence, MapEntry, MapShellEvidence, RawMapBridgeEvidence, RawMapEntry } from "../../contract/map.ts";
import type { CaptureOutcome } from "../../contract/types.ts";
import { buildSurfaceMapScript, READ_MAP_BRIDGE_SCRIPT } from "../../lib/map-browser.ts";
import { consumeOptionalSelector } from "../flags-support.ts";
import { mapAtlasEvidence, mapBridgePayload, mapShellEvidence, rawMapEntries } from "../page-validate.ts";
import { writeArmEvidenceFile } from "./evidence-file.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

interface LocatorProof {
  readonly unique: boolean;
  readonly visible: boolean;
  readonly enabled: boolean;
}

async function locatorProof(page: Page, selector: string): Promise<LocatorProof> {
  const locator = page.locator(selector);
  // @orb-waive caught-failure-ownership(locator.count): a malformed/non-unique candidate returns
  // unique=false and falls through to the next candidate; no row can escape without a proven locator.
  const count = await locator.count().catch(() => 0);
  if (count !== 1) {
    return { unique: false, visible: false, enabled: false };
  }
  // @orb-waive caught-failure-ownership(locator.isVisible): a failed visibility probe is false;
  // visible/actionable rows require true, while explicit hidden inventory remains locator-only.
  return {
    unique: true,
    visible: await locator.isVisible().catch(() => false),
    // @orb-waive caught-failure-ownership(locator.isEnabled): failed enabled proof is false;
    // a locator-only inventory row can survive it, but an actionable row cannot.
    enabled: await locator.isEnabled().catch(() => false),
  };
}

async function validateMapEntry(page: Page, entry: RawMapEntry): Promise<MapEntry> {
  const candidates = [entry.selector, entry.semanticFallback, entry.fallback].filter(
    (candidate, index, rows) => candidate !== "" && rows.indexOf(candidate) === index,
  );
  for (const candidate of candidates) {
    const proof = await locatorProof(page, candidate);
    if (!proof.unique || (entry.visibility === "visible" && !proof.visible) || (entry.actionability === "actionable" && !proof.enabled)) {
      continue;
    }
    return {
      role: entry.role,
      name: entry.name,
      selector: candidate,
      source: candidate === entry.fallback ? "dom" : "semantic",
      state: entry.state,
      visibility: entry.visibility,
      inactiveReason: entry.inactiveReason,
      actionability: entry.actionability,
    };
  }
  throw new Error(`map could not mint one unique ${entry.visibility} locator for ${entry.role} ${JSON.stringify(entry.name)}`);
}

async function captureSurfaceMap(
  page: Page,
  selector: string,
  includeHidden: boolean,
): Promise<{ readonly entries: MapEntry[] | null; readonly error: string | null }> {
  try {
    const result = rawMapEntries(await page.evaluate(buildSurfaceMapScript(selector, includeHidden)));
    if (result === null) {
      return { entries: null, error: `no element matches "${selector}"` };
    }
    return { entries: await Promise.all(result.map((entry) => validateMapEntry(page, entry))), error: null };
  } catch (error) {
    return { entries: null, error: errorMessage(error) };
  }
}

async function captureMapBridge(page: Page): Promise<{
  readonly atlas: MapAtlasEvidence | null;
  readonly shell: MapShellEvidence | null;
  readonly atlasError: string | null;
  readonly shellError: string | null;
}> {
  let raw: RawMapBridgeEvidence;
  // @orb-waive caught-failure-ownership(error): the browser read failure is retained in
  // both named map errors; the report prints it and the map page-arm exit forces toolError.
  try {
    raw = mapBridgePayload(await page.evaluate(READ_MAP_BRIDGE_SCRIPT));
  } catch (error) {
    const detail = errorMessage(error);
    return { atlas: null, shell: null, atlasError: detail, shellError: detail };
  }
  let atlas: MapAtlasEvidence | null = null;
  let atlasError: string | null = null;
  let shell: MapShellEvidence | null = null;
  let shellError: string | null = null;
  // @orb-waive caught-failure-ownership(error): the capabilities shape failure becomes
  // mapAtlasError, printed as MAP INSTRUMENT ERROR and forced to toolError by the page-arm exit.
  try {
    atlas = mapAtlasEvidence(raw.atlas);
  } catch (error) {
    atlasError = errorMessage(error);
  }
  // @orb-waive caught-failure-ownership(error): the shell shape failure becomes
  // mapShellError, printed as MAP INSTRUMENT ERROR and forced to toolError by the page-arm exit.
  try {
    shell = mapShellEvidence(raw.shell);
  } catch (error) {
    shellError = errorMessage(error);
  }
  return { atlas, shell, atlasError, shellError };
}

function mapOutput(enabled: boolean, outcomes: readonly CaptureOutcome[]): { readonly count: string; readonly domFallbacks: string } {
  if (!enabled) {
    return { count: "no", domFallbacks: "no" };
  }
  // AGGREGATED over every page, exactly as `facts()` below already does. Reading the FIRST outcome with a
  // map made a multi-page run print one page's counts as the run's counts (#1509) — the RESULT pair and
  // the emitted fact then disagreed about the same run.
  const entries = outcomes.flatMap((outcome) => outcome.mapResult ?? []);
  return { count: String(entries.length), domFallbacks: String(entries.filter((entry) => entry.source === "dom").length) };
}

function pageHasMapFailure(outcome: CaptureOutcome): boolean {
  return outcome.mapError !== null || outcome.mapAtlasError !== null || outcome.mapShellError !== null;
}

function mapFailures({ outcomes }: ArmPairInput): number {
  return outcomes.filter(pageHasMapFailure).length;
}

function mapInstrumentFailures({ outcomes }: ArmPairInput): number {
  return outcomes.filter((outcome) => outcome.mapAtlasError !== null || outcome.mapShellError !== null).length;
}

export const MAP_ARM = {
  flags: [
    {
      flag: "--map",
      kind: "optional-selector",
      pageTargetable: true,
      group: "Look",
      summary: "the global SPA destination atlas plus the rendered surface map — run this first on any surface",
      handler: (args, rest, page): void => {
        args.map = true;
        args.mapPage = page;
        const selector = consumeOptionalSelector(rest);
        if (selector !== null) {
          args.mapSelector = selector;
        }
      },
    },
    {
      flag: "--atlas",
      kind: "boolean",
      pageTargetable: false,
      group: "Look",
      summary: "with --map: print the whole SPA destination atlas (default is one line — the atlas is global, not this surface)",
      handler: (args): void => {
        args.atlas = true;
      },
    },
  ],
  level: "call",
  needs: (): ArmNeeds => ({}),
  sessionCallBaseMs: (): null => null,
  defaults: (): Pick<ArmArgs, "map" | "mapSelector" | "mapPage" | "atlas"> => ({ map: false, mapSelector: "body", mapPage: 0, atlas: false }),
  help: `  --map [selector]        print BOTH the global Orbweaver SPA destination atlas and the current
                          rendered shell/surface map with unique locators and useful control state.
                          The selector scopes only the surface; atlas stays global. Static files are a
                          valid DOM-only map. Use --include-hidden for an explicitly labelled attached-DOM
                          inventory; hidden/inert/disabled rows are locator-only, not current click handles,
                          and DOM evidence does not claim React Activity provenance.`,
  result: {
    schema: "snap-arm-map-v1",
    source: "__orb nav atlas + shell topology + rendered DOM",
    lifetime: "settled page capture",
    enabled: (opts): boolean => opts.map,
  },
  lifecycle: {
    at: "page",
    enabled: ({ opts, pageIndex }): boolean => opts.map && opts.mapPage === pageIndex,
    run: async ({ page, opts, outcome }): Promise<void> => {
      const [surface, bridge] = await Promise.all([captureSurfaceMap(page, opts.mapSelector, opts.includeHidden), captureMapBridge(page)]);
      outcome.mapResult = surface.entries;
      outcome.mapError = surface.error;
      outcome.mapAtlas = bridge.atlas;
      outcome.mapAtlasError = bridge.atlasError;
      outcome.mapShell = bridge.shell;
      outcome.mapShellError = bridge.shellError;
    },
    pairs: (input): readonly ResultPair[] => {
      const summary = mapOutput(input.opts.map, input.outcomes);
      return [
        ["map", summary.count],
        ["map-dom-fallbacks", summary.domFallbacks],
        ["map-fails", mapFailures(input)],
      ];
    },
    // #1342: the interactive surface itself. The RESULT line carried `map=37`; which 37 controls, and the
    // atlas/shell topology beside them, existed only on the terminal that ran it.
    evidence: async ({ outcomes }, slug): Promise<void> => {
      const rows = outcomes
        .filter((outcome) => outcome.mapResult !== null || outcome.mapError !== null || outcome.mapAtlas !== null || outcome.mapShell !== null)
        .map((outcome) => ({
          page: outcome.pageIndex,
          entries: outcome.mapResult,
          error: outcome.mapError,
          atlas: outcome.mapAtlas,
          atlasError: outcome.mapAtlasError,
          shell: outcome.mapShell,
          shellError: outcome.mapShellError,
        }));
      await writeArmEvidenceFile({
        arm: "map",
        name: "map",
        slug,
        schema: "snap-map-surface-v1",
        records: rows.length,
        completeness: "bounded",
        completenessDetail: "the printed surface map per page, bounded by the run's --map selector and hidden-element policy",
        body: { v: 1, pages: rows },
      });
    },
    facts: (input): readonly ArmFactEmission<"map">[] => {
      const entries = input.outcomes.flatMap((outcome) => outcome.mapResult ?? []);
      const failures = mapFailures(input);
      let state: "off" | "refused" | "failed" | "passed" = "off";
      if (input.opts.map) {
        if (mapInstrumentFailures(input) > 0) {
          state = "refused";
        } else {
          state = failures > 0 ? "failed" : "passed";
        }
      }
      return [
        {
          scope: aggregateScope(),
          data: {
            state,
            detail: null,
            entries: entries.length,
            domFallbacks: entries.filter((entry) => entry.source === "dom").length,
            failures,
          },
        },
      ];
    },
    failures: (input): ArmFailureCounts => ({ map: mapFailures(input) }),
    exit: (input, code): number => (mapInstrumentFailures(input) === 0 ? code : EXIT.toolError),
  },
} satisfies ArmDef<"map">;
