// The backend every registered surface may ask for when mounted alone. Corpus-captured procedures answer by exact request
// input, so an uncaptured request fails the owning test; every other procedure is answered by the corpus root's own server.

import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import type { ServedHold, TrpcRecorder } from "@orb/testkit/ct";
import { createShellAmbientReads, defineTrpcRoutes, routeTrpc, serveCorpusProcedures, trpcHold } from "@orb/testkit/ct";
import type { CorpusPlayback } from "@orb/testkit/iso";
import { createCorpusReadResponder } from "@orb/testkit/iso";
import type { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";

/**
 * Every read the corpus never captured, plus presets, connections and the build identity: the server answers each for the
 * request the surface sends, so a preset the surface opens is in its list.
 */
const SERVED = [
  "character.list",
  "character.count",
  "chat.listChats",
  "chat.countChats",
  "databank.list",
  "rosterPreset.list",
  "rosterPreset.count",
  "worldInfo.countBooks",
  "regex.countScripts",
  "automation.getOwnerBudgets",
  "imagery.readProvenance",
  "plugin.getSurfaceState",
  "preset.list",
  "preset.get",
  "preset.listUsage",
  "preset.resolveEffective",
  "connection.list",
  "connection.listBindings",
  "connection.resolveChatCapability",
  "connection.providersAvailable",
  "settings.getVersion",
  "settings.getAppSettingsWithOverrides",
  "share.signInMode",
  "share.status",
  "discovery.home",
  "discovery.catalog",
  "discovery.topKeywords",
  "discovery.unusedCharacters",
  "discovery.modelRouting",
  "discovery.visualArchetypes",
  "discovery.forgottenGems",
  "discovery.browseCharacters",
  "discovery.characterFacets",
  "discovery.archetypes",
  "discovery.themeDrift",
  "databank.listGlobal",
  "plugin.list",
  "plugin.listDistributed",
  "plugin.listSurfaces",
  "regex.listScripts",
  "worldInfo.listBooksWithUsage",
  "refinery.listSessions",
  "workloads.list",
  "workloads.listSchedules",
  "credentials.list",
  "admin.listUsers",
  "automation.listOwnerRules",
  "notifications.markAllRead",
] as const;

interface SurfaceReadScenario {
  readonly hold?: { readonly path: (typeof SERVED)[number]; readonly gate: ServedHold };
  readonly pluginDialog?: NonNullable<CorpusPlayback["pluginLibrary"]>["ownerActive"];
  /** Appearance the viewer's settings read answers with, over the captured settings, so the shell writes it to the root. */
  readonly appearance?: Partial<AppearanceSettings>;
}

/** Route the selected viewer's surface reads through its owning corpus root or exact captured responses. */
export async function routeSurfaceReads(
  page: Page,
  corpus: CorpusPlayback,
  root: Awaited<ReturnType<typeof createCorpusHarness>>,
  scenario: SurfaceReadScenario = {},
): Promise<TrpcRecorder> {
  const caller = await root.internalCallerFor(root.ownerId);
  await page.route("**/api/auth/config", async (route) => {
    const response = await root.http.request("/api/auth/config");
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  const { reads } = corpus;
  const spaceHold = trpcHold<"search.spaceStatus">();
  const { pluginDialog, appearance } = scenario;
  const routes = defineTrpcRoutes({
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, SERVED),
    "sessions.me": createCorpusReadResponder("sessions.me", root.ownerId, reads["sessions.me"]),
    "settings.listThemes": createCorpusReadResponder("settings.listThemes", root.ownerId, reads["settings.listThemes"]),
    ...(appearance === undefined
      ? {}
      : {
          "settings.getUserSettings": () => {
            const [captured] = reads["settings.getUserSettings"];
            if (captured === undefined) {
              throw new Error("The corpus has no settings capture");
            }
            const settings = captured.output;
            return { ...settings, config: { ...settings.config, appearance: { ...settings.config.appearance, ...appearance } } };
          },
        }),
    "search.spaceStatus": () => spaceHold,
    ...(pluginDialog === undefined
      ? {}
      : {
          "plugin.list": createCorpusReadResponder("plugin.list", root.ownerId, [pluginDialog.reads.plugins]),
          "plugin.listSurfaces": createCorpusReadResponder("plugin.listSurfaces", root.ownerId, [pluginDialog.reads.surfaces]),
          "plugin.listBundleAssets": createCorpusReadResponder("plugin.listBundleAssets", root.ownerId, [pluginDialog.reads.assets]),
        }),
    ...(scenario.hold === undefined ? {} : serveCorpusProcedures(caller, [scenario.hold.path], () => scenario.hold?.gate)),
  });
  return routeTrpc(page, routes);
}
