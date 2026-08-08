// entry/import/import-report — render + persist the whole-folder import's "what landed / what didn't"
// accounting to a file a self-host owner can open. `formatImportReport` is PURE (markdown out, testable);
// `writeImportReport` is the node:fs side (entry-tier — the domain driver stays fs-free and just returns the
// `ImportReport` data). One file per run under `data/import-reports/`, stamped with the run clock.

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { ImportReport } from "#domain/import";

/** Persistent home for import reports — beside the db under `data/` (resolved from cwd, the self-host root). */
const REPORTS_DIR = "data/import-reports";

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
    section(
      "ST profile planes NOT imported (no importer yet)",
      report.unhandled.map((e) => `\`${e}\``),
    ),
    section(
      "settings.json sections NOT imported (only personas are read today)",
      report.unhandledSettings.map((s) => `\`${s}\``),
    ),
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
