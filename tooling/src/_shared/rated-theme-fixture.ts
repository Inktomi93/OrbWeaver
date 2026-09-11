// Rated custom-theme lifecycle shared by matrix consumers. This is deliberately stage-only: a matrix may
// write two temporary rows to the throwaway staged DB, but it must never mutate the operator's shared
// account. The returned cleanup owns the exact minted ids and proves their absence after removal.

import { randomUUID } from "node:crypto";
import { errorMessage } from "@orb/kit/error-message";
import { refuseDirectInvocation } from "./entrypoint.ts";
import { instrumentRefusal } from "./page-validate.ts";
import type { ThemeEntry } from "./theme.ts";
import { readThemeList } from "./theme.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap|design-audit --matrix --isolated");

const MATRIX_THEME_PREFIX = "orb-matrix";
const LIGHT_BACKGROUND = "oklch(0.96 0.01 80)";
const DARK_BACKGROUND = "oklch(0.18 0.02 265)";
const LIGHT_CSS = ":root { --orb-matrix-fixture-ink: oklch(0.24 0.02 80); }";
const DARK_CSS = ":root { --orb-matrix-fixture-ink: oklch(0.94 0.01 265); }";
const FIXTURE_NAME_SUFFIX_LENGTH = 8;

interface TrpcEnvelope {
  readonly result?: { readonly data?: unknown };
}

export interface RatedThemeFixture {
  readonly entries: readonly [ThemeEntry, ThemeEntry];
  readonly cleanup: () => Promise<void>;
}

function provisioningCleanupError(primary: unknown, cleanup: unknown): AggregateError {
  return new AggregateError([primary, cleanup], "INSTRUMENT ERROR: rated theme provisioning and exact cleanup both failed", { cause: primary });
}

async function trpc(baseUrl: string, procedure: string, input?: unknown): Promise<unknown> {
  const init: RequestInit =
    input === undefined
      ? {}
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        };
  const response = await fetch(`${baseUrl}/api/trpc/${procedure}`, init);
  const text = await response.text();
  if (!response.ok) {
    return instrumentRefusal(`rated theme ${procedure} failed (HTTP ${response.status}): ${text}`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    return instrumentRefusal(`rated theme ${procedure} returned invalid JSON: ${errorMessage(error)}`);
  }
}

function createdTheme(body: unknown, capability: "custom-light" | "custom-dark"): ThemeEntry {
  const data = (body as TrpcEnvelope).result?.data;
  const entries = readThemeList({ result: { data: data === undefined ? [] : [data] } });
  const entry = entries?.[0];
  if (entry === undefined || entry.isSeed !== false || entry.polarity !== capability.slice("custom-".length) || entry.hasCustomCss !== true) {
    return instrumentRefusal(`settings.createTheme did not return a rated ${capability} row`);
  }
  return entry;
}

async function listThemes(baseUrl: string): Promise<readonly ThemeEntry[]> {
  const entries = readThemeList(await trpc(baseUrl, "settings.listThemes"));
  if (entries === null) {
    return instrumentRefusal("settings.listThemes returned an unreadable catalog during rated-theme lifecycle");
  }
  return entries;
}

async function removeAndProveAbsent(baseUrl: string, entries: readonly ThemeEntry[]): Promise<void> {
  for (const entry of entries) {
    await trpc(baseUrl, "settings.removeTheme", { id: entry.id });
  }
  const remaining = await listThemes(baseUrl);
  const leaked = entries.filter((entry) => remaining.some((candidate) => candidate.id === entry.id));
  if (leaked.length > 0) {
    instrumentRefusal(`rated theme cleanup left ${leaked.map((entry) => entry.id).join(", ")} in the staged catalog`);
  }
}

/** Provision the two real custom-theme capabilities only on a tool-owned stage. Shared runs return null
 *  without making a request; their live catalog must already satisfy the matrix contract. */
export async function provisionRatedStageThemes(baseUrl: string, staged: boolean): Promise<RatedThemeFixture | null> {
  if (!staged) {
    return null;
  }
  const suffix = randomUUID().slice(0, FIXTURE_NAME_SUFFIX_LENGTH);
  const created: ThemeEntry[] = [];
  try {
    created.push(
      createdTheme(
        await trpc(baseUrl, "settings.createTheme", {
          name: `${MATRIX_THEME_PREFIX}-light-${suffix}`,
          override: { background: LIGHT_BACKGROUND },
          css: LIGHT_CSS,
        }),
        "custom-light",
      ),
    );
    created.push(
      createdTheme(
        await trpc(baseUrl, "settings.createTheme", {
          name: `${MATRIX_THEME_PREFIX}-dark-${suffix}`,
          override: { background: DARK_BACKGROUND },
          css: DARK_CSS,
        }),
        "custom-dark",
      ),
    );
    const catalog = await listThemes(baseUrl);
    for (const entry of created) {
      if (!catalog.some((candidate) => candidate.id === entry.id)) {
        return instrumentRefusal(`rated theme ${entry.id} was not readable after creation`);
      }
    }
    const rated = created as [ThemeEntry, ThemeEntry];
    return { entries: rated, cleanup: async () => await removeAndProveAbsent(baseUrl, rated) };
  } catch (error) {
    if (created.length === 0) {
      throw error;
    }
    let cleanupFailure: unknown = null;
    // @orb-waive caught-failure-ownership(cleanupError): the cleanup failure is preserved beside the primary failure in the thrown AggregateError below; the matrix command prints that terminal error and exits toolError. Ends if either failure stops propagating.
    try {
      await removeAndProveAbsent(baseUrl, created);
    } catch (cleanupError) {
      cleanupFailure = cleanupError;
    }
    if (cleanupFailure !== null) {
      throw provisioningCleanupError(error, cleanupFailure);
    }
    throw error;
  }
}
