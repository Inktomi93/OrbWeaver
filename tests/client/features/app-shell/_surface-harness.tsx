// The backend every registered surface may ask for when mounted alone. Corpus-captured procedures answer with their
// first capture whatever the request input, because the audit judges the rendered controls, not a query's filter.
// Procedures the corpus never captured answer an empty collection or a count of zero.

import type { NameFinding } from "@orb/testkit/browser/spec";
import { nameQualityFindings } from "@orb/testkit/browser/spec";
import type { TrpcRecorder } from "@orb/testkit/ct";
import { createShellAmbientReads, defineTrpcRoutes, routeTrpc, trpcHold } from "@orb/testkit/ct";
import type { CorpusWire } from "@orb/testkit/iso";
import type { Page } from "@playwright/test";

function firstCapture<T extends { readonly output: unknown }>(name: string, records: readonly T[]): () => T["output"] {
  const [first] = records;
  if (first === undefined) {
    throw new Error(`The corpus has no ${name} capture`);
  }
  return () => first.output;
}

/** Route every read a registered surface may issue when mounted alone. */
export function routeSurfaceReads(page: Page, corpus: CorpusWire): Promise<TrpcRecorder> {
  const { reads } = corpus;
  const overridesHold = trpcHold<"settings.getAppSettingsWithOverrides">();
  const versionHold = trpcHold<"settings.getVersion">();
  const presetHold = trpcHold<"preset.get">();
  const spaceHold = trpcHold<"search.spaceStatus">();
  const routes = defineTrpcRoutes({
    ...createShellAmbientReads(corpus),
    "sessions.me": firstCapture("sessions.me", reads["sessions.me"]),
    "settings.listThemes": firstCapture("settings.listThemes", reads["settings.listThemes"]),
    "chat.listChats": firstCapture("chat.listChats", reads["chat.listChats"]),
    "chat.countChats": firstCapture("chat.countChats", reads["chat.countChats"]),
    "character.list": firstCapture("character.list", reads["character.list"]),
    "character.count": firstCapture("character.count", reads["character.count"]),
    "worldInfo.countBooks": firstCapture("worldInfo.countBooks", reads["worldInfo.countBooks"]),
    "regex.countScripts": firstCapture("regex.countScripts", reads["regex.countScripts"]),
    "automation.getOwnerBudgets": firstCapture("automation.getOwnerBudgets", reads["automation.getOwnerBudgets"]),
    "discovery.home": () => ({
      coverage: { characters: 0, digests: 0, segments: 0 },
      sceneThemes: [],
      arcThemes: [],
      duplicateCounts: { characters: 0, chats: 0, identicalCharacterPairs: 0 },
    }),
    "discovery.catalog": () => ({ genres: [], tones: [], topTags: [], tagPairs: [], totalDistilled: 0, totalCharacters: 0 }),
    // The admin overrides and the selected preset's detail are cold: a pending read is the honest state without minting a full config object.
    "settings.getAppSettingsWithOverrides": () => overridesHold,
    "settings.getVersion": () => versionHold,
    "preset.get": () => presetHold,
    "discovery.topKeywords": () => [],
    "discovery.unusedCharacters": () => [],
    "discovery.modelRouting": () => [],
    "search.spaceStatus": () => spaceHold,
    "databank.list": firstCapture("databank.list", reads["databank.list"]),
    "discovery.visualArchetypes": () => [],
    "discovery.forgottenGems": () => [],
    "discovery.browseCharacters": () => ({ items: [], nextCursor: null, totalCount: 0 }),
    "discovery.characterFacets": () => ({ genres: [], tones: [] }),
    "databank.listGlobal": () => [],
    "plugin.listDistributed": () => [],
    "connection.providersAvailable": () => [],
    "rosterPreset.list": () => [],
    "plugin.list": () => [],
    "plugin.listSurfaces": () => [],
    "regex.listScripts": () => [],
    "worldInfo.listBooksWithUsage": () => [],
    "preset.list": () => [],
    "refinery.listSessions": () => [],
    "workloads.list": () => [],
    "workloads.listSchedules": () => [],
    "connection.list": () => [],
    "connection.listBindings": () => [],
    "credentials.list": () => [],
    "admin.listUsers": () => [],
    "automation.listOwnerRules": () => [],
    "notifications.markAllRead": () => ({ markedCount: 0 }),
  });
  return routeTrpc(page, routes);
}

const QUIET_FRAMES = 20;

/** Settled means the DOM took no mutation for a run of frames: data-backed surfaces fill in after mount. */
export async function settleSurface(page: Page): Promise<void> {
  await page.evaluate(
    (quietFrames: number) =>
      new Promise<void>((resolve) => {
        let quiet = 0;
        const observer = new MutationObserver(() => {
          quiet = 0;
        });
        observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
        const tick = (): void => {
          quiet += 1;
          if (quiet >= quietFrames) {
            observer.disconnect();
            resolve();
          } else {
            requestAnimationFrame(tick);
          }
        };
        requestAnimationFrame(tick);
      }),
    QUIET_FRAMES,
  );
}

/** Record titles the corpus itself repeats: a control named after one is ambiguous because of the data, not the product. */
function repeatedRecordTitles(corpus: CorpusWire): readonly string[] {
  const titles = [
    ...corpus.reads["character.list"].flatMap((read) => read.output.items.map((item) => item.name)),
    ...corpus.reads["chat.listChats"].flatMap((read) => read.output.items.flatMap((item) => (item.title === null ? [] : [item.title]))),
  ];
  return [...new Set(titles.filter((title, at) => titles.indexOf(title) !== at))];
}

/**
 * The name findings that bind the product. A duplicate name is dropped when the corpus repeats the record it is named after
 * (two rooms titled alike) or the page prints the same row sentence as many times outside any control (two identical
 * notifications): only the data can tell those apart. The bare verb "Dismiss" repeated stays a finding.
 */
export async function productNameFindings(page: Page, corpus: CorpusWire): Promise<readonly NameFinding[]> {
  const repeated = repeatedRecordTitles(corpus);
  const findings = (await nameQualityFindings(page)).filter(
    (finding) => finding.rule !== "ambiguous-duplicate" || !repeated.some((title) => (finding.subject ?? "").includes(title)),
  );
  const duplicates = findings.flatMap((finding) =>
    finding.rule === "ambiguous-duplicate" ? [{ subject: finding.subject ?? "", count: finding.count ?? 0 }] : [],
  );
  const dataDriven = new Set(
    await page.evaluate((candidates: readonly { subject: string; count: number }[]) => {
      const counts = new Map<string, number>();
      for (const el of document.body.querySelectorAll("*")) {
        const text = el.children.length === 0 ? el.textContent.trim() : "";
        if (
          text.length >= 4 &&
          el.closest(
            "button,a,input,select,textarea,[role='button'],[role='link'],[role='menuitem'],[role='checkbox'],[role='switch'],[role='radio'],[role='tab']",
          ) === null
        ) {
          counts.set(text, (counts.get(text) ?? 0) + 1);
        }
      }
      return candidates
        .filter(({ subject, count }) => [...counts].some(([text, seen]) => seen >= count && text !== subject && subject.includes(text)))
        .map(({ subject }) => subject);
    }, duplicates),
  );
  return findings.filter((finding) => finding.rule !== "ambiguous-duplicate" || !dataDriven.has(finding.subject ?? ""));
}
