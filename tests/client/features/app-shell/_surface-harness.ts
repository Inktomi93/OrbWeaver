// The backend every registered surface may ask for when mounted alone. Corpus-captured procedures answer by exact request
// input, so an uncaptured request fails the owning test; every other procedure is answered by the corpus root's own server.

import type { TrpcRecorder, TrpcRoutes } from "@orb/testkit/ct";
import { createShellAmbientReads, defineTrpcRoutes, routeTrpc, serveCorpusProcedures, trpcHold } from "@orb/testkit/ct";
import type { CorpusWire } from "@orb/testkit/iso";
import { createCorpusReadResponder } from "@orb/testkit/iso";
import type { Page } from "@playwright/test";

/** The same captured output offered for further request inputs a surface issues; an input listed nowhere still fails the test. */
function sameOutputFor<T extends { readonly input: unknown; readonly output: unknown }>(captured: readonly T[], inputs: readonly T["input"][]): readonly T[] {
  const [first] = captured;
  if (first === undefined) {
    throw new Error("The corpus has no capture to serve the extra inputs from");
  }
  return inputs.map((input) => ({ ...first, input }));
}

/** tRPC's infinite-query client adds `direction` to the wire input; it is not in the procedure's input type, so it is added past the type. */
function pagedWire<T extends object>(input: T): T {
  return { ...input, direction: "forward" } as T;
}

function requiredFirstBoot(corpus: CorpusWire): NonNullable<CorpusWire["firstBoot"]> {
  const { firstBoot } = corpus;
  if (firstBoot === undefined) {
    throw new Error("The corpus has no first-boot capture");
  }
  return firstBoot;
}

function shellRecords(corpus: CorpusWire): NonNullable<CorpusWire["shellAmbient"]>["reads"] {
  const shell = corpus.shellAmbient;
  if (shell === undefined) {
    throw new Error("The corpus has no shell ambient capture");
  }
  return shell.reads;
}

/**
 * Every read the corpus never captured, plus presets, connections and the build identity: the server answers each for the
 * request the surface sends, so a preset the surface opens is in its list.
 */
const SERVED = [
  "preset.list",
  "preset.get",
  "preset.listUsage",
  "preset.resolveEffective",
  "connection.list",
  "connection.listBindings",
  "connection.resolveChatCapability",
  "connection.providersAvailable",
  "settings.getVersion",
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

/** Reads a seeded surface needs beyond the shared set; each replaces the shared answer for that procedure. */
export type SurfaceRouteOverrides = TrpcRoutes;

/** Route every read a registered surface may issue when mounted alone; `caller` is a corpus root's internal caller. */
export function routeSurfaceReads(page: Page, corpus: CorpusWire, caller: object, overrides: SurfaceRouteOverrides = {}): Promise<TrpcRecorder> {
  const { reads } = corpus;
  const shell = shellRecords(corpus);
  const firstBoot = requiredFirstBoot(corpus);
  const spaceHold = trpcHold<"search.spaceStatus">();
  const routes = defineTrpcRoutes({
    ...createShellAmbientReads(corpus),
    ...serveCorpusProcedures(caller, SERVED),
    // The list and the count both come from the one captured preview, so the roster a surface counts is the roster it lists.
    "rosterPreset.list": createCorpusReadResponder("rosterPreset.list", [shell.rosterPreview, { ...shell.rosterPreview, input: undefined }]),
    "rosterPreset.count": createCorpusReadResponder("rosterPreset.count", [
      ...reads["rosterPreset.count"].map((record) => ({ ...record, output: shell.rosterPreview.output.length })),
    ]),
    "sessions.me": createCorpusReadResponder("sessions.me", reads["sessions.me"]),
    "settings.listThemes": createCorpusReadResponder("settings.listThemes", reads["settings.listThemes"]),
    "chat.listChats": createCorpusReadResponder("chat.listChats", [
      ...reads["chat.listChats"],
      shell.recentChats,
      ...sameOutputFor(reads["chat.listChats"], [{ limit: 20 }, { limit: 30 }, pagedWire({ limit: 30 })]),
    ]),
    "chat.countChats": createCorpusReadResponder("chat.countChats", [...reads["chat.countChats"], ...sameOutputFor(reads["chat.countChats"], [{}])]),
    "character.list": createCorpusReadResponder("character.list", [
      ...reads["character.list"],
      shell.quickPicks,
      ...sameOutputFor(reads["character.list"], [
        { archived: false, limit: 5, sort: "recent" },
        pagedWire({ limit: 100 }),
        pagedWire({ limit: 30, sort: "recent", archived: false }),
        { archived: false, limit: 6, sort: "starred", starred: true },
        { starred: true, limit: 24, archived: false },
        { archived: false, limit: 12, sort: "newest" },
      ]),
    ]),
    "character.count": createCorpusReadResponder("character.count", [
      ...reads["character.count"],
      ...sameOutputFor(reads["character.count"], [{ archived: false }]),
    ]),
    "worldInfo.countBooks": createCorpusReadResponder("worldInfo.countBooks", reads["worldInfo.countBooks"]),
    "regex.countScripts": createCorpusReadResponder("regex.countScripts", reads["regex.countScripts"]),
    "automation.getOwnerBudgets": createCorpusReadResponder("automation.getOwnerBudgets", reads["automation.getOwnerBudgets"]),
    "settings.getAppSettingsWithOverrides": createCorpusReadResponder("settings.getAppSettingsWithOverrides", [firstBoot.reads.appSettings]),
    "share.signInMode": createCorpusReadResponder("share.signInMode", [firstBoot.reads.signInMode]),
    "share.status": createCorpusReadResponder("share.status", [firstBoot.reads.shareStatus]),
    "search.spaceStatus": () => spaceHold,
    "databank.list": createCorpusReadResponder("databank.list", [
      ...reads["databank.list"],
      shell.recentDocuments,
      ...sameOutputFor(reads["databank.list"], [pagedWire({ limit: 30 })]),
    ]),
    ...overrides,
  });
  return routeTrpc(page, routes);
}
