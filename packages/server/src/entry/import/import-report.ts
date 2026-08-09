// entry/import/import-report — render + persist the whole-folder import's "what landed / what didn't"
// accounting to a file a self-host owner can open. `formatImportReport` is PURE (markdown out, testable);
// `writeImportReport` is the node:fs side (entry-tier — the domain driver stays fs-free and just returns the
// `ImportReport` data). One file per run under `data/import-reports/`, stamped with the run clock.

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { ImportReport } from "#domain/import";

/** Persistent home for import reports — beside the db under `data/` (resolved from cwd, the self-host root). */
const REPORTS_DIR = "data/import-reports";

// Why each still-unhandled ST plane / settings section has no importer — so the report is honest about intent,
// not just absence (owner ruling: "record it as still-unhandled with a one-line reason"). A name not listed
// here renders bare. Presets/prompt-format templates and group chats are deferred epics (a divergent ST→orb
// mapper and the multi-character roster write path, respectively); the cosmetic/session planes have no canon.
// A Map (not an object literal) keeps the ST snake_case section names as string-literal DATA, not our vocab.
const UNHANDLED_REASONS = new Map<string, string>([
  // Top-level profile planes
  ["backgrounds/", "chat background images — no domain home (UI cosmetic, not import canon)"],
  ["themes/", "UI theme JSON — client theming is not import canon"],
  ["movingUI/", "saved UI layout state — no domain home"],
  ["groups/", "group definitions — needs the multi-character group-chat + roster write path (separate epic)"],
  ["group chats/", "group chat logs — needs the group-chat import path (separate epic)"],
  ["context/", "prompt-format templates — need an ST→orb template mapper (separate epic)"],
  ["instruct/", "instruct templates — need an ST→orb template mapper (separate epic)"],
  ["sysprompt/", "system-prompt templates — need an ST→orb template mapper (separate epic)"],
  ["reasoning/", "reasoning-format templates — need an ST→orb template mapper (separate epic)"],
  ["TextGen Settings/", "backend preset files — the preset importer accepts only orb-native orb.preset; needs an ST→orb.preset mapper (separate epic)"],
  ["OpenAI Settings/", "backend preset files — needs an ST→orb.preset mapper (separate epic)"],
  ["NovelAI Settings/", "backend preset files — needs an ST→orb.preset mapper (separate epic)"],
  ["KoboldAI Settings/", "backend preset files — needs an ST→orb.preset mapper (separate epic)"],
  ["QuickReplies/", "quick-reply macros — no domain home (not modeled)"],
  ["extensions/", "third-party extension state — out of scope"],
  ["user/", "misc user files — no canon home"],
  ["secrets.json", "API keys — deliberately NOT imported (credentials are entered per-install)"],
  ["stats.json", "usage stats — recomputed locally, not import canon"],
  ["content.log", "ST install log — not canon"],
  ["image-metadata.json", "gallery image metadata — no import path"],
  // settings.json sections (ST snake_case interchange names)
  ["oai_settings", "OpenAI-family generation preset — needs an ST→orb.preset mapper (separate epic)"],
  ["textgenerationwebui_settings", "TextGen generation preset — needs an ST→orb.preset mapper (separate epic)"],
  ["nai_settings", "NovelAI generation preset — needs an ST→orb.preset mapper (separate epic)"],
  ["kai_settings", "KoboldAI generation preset — needs an ST→orb.preset mapper (separate epic)"],
  ["world_info_settings", "global world-info activation knobs — per-book WI is imported; these globals have no home"],
  ["horde_settings", "Horde backend config — no import canon"],
  ["extension_settings", "extension config — out of scope"],
  ["background", "selected UI background — cosmetic, not import canon"],
  ["proxies", "connection proxy config — no import canon"],
  ["selected_proxy", "selected proxy — no import canon"],
]);

/** One "not imported" line: the plane name + its one-line reason when known, else bare. */
function unhandledLine(name: string): string {
  const reason = UNHANDLED_REASONS.get(name);
  return reason === undefined ? `\`${name}\`` : `\`${name}\` — ${reason}`;
}

/** One report section: a heading + its lines, or a "None." placeholder so the reader sees it was checked. */
function section(title: string, lines: readonly string[]): string {
  const body = lines.length > 0 ? lines.map((l) => `- ${l}`).join("\n") : "_None._";
  return `## ${title}\n\n${body}\n`;
}

/** Render the import report as Markdown. `generatedAt` is epoch-ms (the run clock) → an ISO stamp header. */
function formatImportReport(report: ImportReport, generatedAt: number): string {
  return [
    "# SillyTavern import report",
    "",
    `Generated: ${new Date(generatedAt).toISOString()}`,
    "",
    "## Summary",
    "",
    `- Entities scanned: ${report.scanned}`,
    `- New canon written (characters + personas + chats + world books): ${report.changed}`,
    `- Cards skipped (could not import): ${report.skippedCards.length}`,
    "",
    section(
      "Cards skipped — NOT imported",
      report.skippedCards.map((c) => `\`${c.file}\` — ${c.reason}`),
    ),
    section(
      "Unreadable card files",
      report.unreadableCards.map((f) => `\`${f}\``),
    ),
    section(
      "World books that failed to parse",
      report.unreadableWorlds.map((f) => `\`${f}\``),
    ),
    section(
      "Chats skipped (oversized)",
      report.skippedChats.map((f) => `\`${f}\``),
    ),
    section(
      "Orphan chat directories (no matching card)",
      report.orphanChatDirs.map((d) => `\`${d}\``),
    ),
    section("Characters skipped (skip-listed)", report.skippedCharacters),
    section("ST profile planes NOT imported (no importer yet)", report.unhandled.map(unhandledLine)),
    section("settings.json sections NOT imported (personas + library tags are read today)", report.unhandledSettings.map(unhandledLine)),
  ].join("\n");
}

/** Write the report to `data/import-reports/import-<stamp>.md` (created if absent) and return its path. */
export async function writeImportReport(report: ImportReport, generatedAt: number): Promise<string> {
  const dir = resolve(REPORTS_DIR);
  await mkdir(dir, { recursive: true });
  const path = join(dir, `import-${generatedAt}.md`);
  await writeFile(path, formatImportReport(report, generatedAt), "utf8");
  return path;
}
