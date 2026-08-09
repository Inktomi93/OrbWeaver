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
// here renders bare, so this map must cover EVERY section a real profile emits (a verifier found 11 rendering
// bare in 2026-08; they are all present now). The prompt-format template planes remain a deferred epic; the
// cosmetic/session planes have no canon; the TEXT-COMPLETION preset families are a deliberate owner refusal,
// not a gap. A Map (not an object literal) keeps the ST snake_case section names as string-literal DATA.
//
// THE TEXT-COMPLETION RULING (owner, 2026-08-08): orb is not a text-completion app. Its connection vocabulary
// has no such protocol arm (`ROUTING_ROLE_KEYS` is chat/embed/rerank/imageEmbed/summarize/generateImage; a
// whole-tree sweep for a `v1/completions` wire returns zero), so a TextGen/Kobold/NovelAI sampler set has
// nothing here to be spent by. The CHAT-COMPLETION family DOES import (`OpenAI Settings/` + `oai_settings`) —
// neither appears below any more.
// GRADUATED 2026-08-08 (owner rulings) — these two are IMPORTED now and no longer appear here at all:
//   `backgrounds/` → CAS assets (kind `background`) appended to `appearance.backgroundLibrary`;
//   `themes/`      → converted palettes, through orb's own derivation-safety gate.
// A reason row for a handled plane would be a lie the report tells forever, so the rows were deleted rather
// than reworded. `HANDLED_ENTRIES` in `domain/import/loader/collect.ts` is the other half of that graduation.
const UNHANDLED_REASONS = new Map<string, string>([
  // Top-level profile planes
  ["movingUI/", "saved UI layout state — no domain home"],
  ["context/", "prompt-format templates — need an ST→orb template mapper (separate epic)"],
  ["instruct/", "instruct templates — need an ST→orb template mapper (separate epic)"],
  ["sysprompt/", "system-prompt templates — need an ST→orb template mapper (separate epic)"],
  ["reasoning/", "reasoning-format templates — need an ST→orb template mapper (separate epic)"],
  ["TextGen Settings/", "text-completion preset files — orb has no text-completion mode; ruled out by owner 2026-08-08"],
  ["NovelAI Settings/", "text-completion preset files — orb has no text-completion mode; ruled out by owner 2026-08-08"],
  ["KoboldAI Settings/", "text-completion preset files — orb has no text-completion mode; ruled out by owner 2026-08-08"],
  ["QuickReplies/", "quick-reply macros — no domain home (not modeled)"],
  // Both observed rendering BARE on a real profile drive (2026-08-08).
  ["assets/", "ST extension assets (expression sprites, audio) — no domain home"],
  ["vectors/", "ST's own vector store — orb re-embeds locally after import, so a foreign index never travels"],
  ["extensions/", "third-party extension state — out of scope"],
  ["user/", "misc user files — no canon home"],
  ["secrets.json", "API keys — deliberately NOT imported (credentials are entered per-install)"],
  ["stats.json", "usage stats — recomputed locally, not import canon"],
  ["content.log", "ST install log — not canon"],
  ["image-metadata.json", "gallery image metadata — no import path"],
  // settings.json sections (ST snake_case interchange names)
  ["textgenerationwebui_settings", "live text-completion preset — orb has no text-completion mode; ruled out by owner 2026-08-08"],
  ["nai_settings", "live text-completion preset — orb has no text-completion mode; ruled out by owner 2026-08-08"],
  ["kai_settings", "live text-completion preset — orb has no text-completion mode; ruled out by owner 2026-08-08"],
  ["world_info_settings", "global world-info activation knobs — per-book WI is imported; these globals have no home"],
  ["horde_settings", "Horde backend config — no import canon"],
  ["extension_settings", "extension config — out of scope"],
  ["background", "which background was SELECTED — selection state; the background IMAGES themselves import"],
  ["proxies", "connection proxy config — no import canon"],
  ["selected_proxy", "selected proxy — no import canon"],
  // The eleven a verifier found rendering BARE (2026-08): ST install/session/selection state, plus the legacy
  // TOP-LEVEL generation knobs that predate ST's per-family blobs and are superseded by them.
  ["firstRun", "ST first-run flag — install state, not canon"],
  ["accountStorage", "ST per-account browser-storage mirror — session state, not canon"],
  ["currentVersion", "the ST version stamp that wrote this profile — provenance, nothing to import"],
  ["username", "the ST account's own display name — orb identity is per-install (personas ARE imported)"],
  ["active_character", "which character was open when ST last saved — selection state, not canon"],
  ["active_group", "which group was open when ST last saved — selection state (the GROUPS themselves import)"],
  ["user_avatar", "which persona avatar was selected — selection state (the personas + avatars themselves import)"],
  ["amount_gen", "legacy top-level response length — superseded by the per-family preset blobs"],
  ["max_context", "legacy top-level context size — superseded by the per-family preset blobs"],
  ["main_api", "which backend ST was pointed at — orb connections are configured per-install, never imported"],
  ["swipes", "the swipes-enabled UI toggle — a client preference; the swipe DATA itself imports with each chat"],
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

/** One imported preset's lossiness block, as ONE `section` entry: the preset that landed, then its unmapped
 *  fields as a NESTED list. The nesting is why this returns one multi-line string per preset rather than one
 *  string per line — `section` prefixes every entry with `- `, so per-line entries rendered as `-   - field`
 *  (a mangled list, caught only by reading the rendered markdown). A preset whose whole file mapped renders
 *  the reassuring "everything mapped" line rather than nothing at all — the operator has to be able to tell
 *  "landed whole" apart from "was never looked at". */
function presetNoteLines(report: ImportReport): string[] {
  return noteLines(report.presetNotes);
}

/** The shared renderer for a per-entity lossiness note (presets + themes carry the identical shape). */
function noteLines(notes: ImportReport["presetNotes"] | ImportReport["themeNotes"]): string[] {
  return notes.map((note) => {
    const head = `\`${note.name}\` (from \`${note.sourceFile}\`)`;
    if (note.fields.length === 0) {
      return `${head} — everything mapped`;
    }
    const nested = note.fields.map((f) => `  - \`${f.field}\` — ${f.reason}`).join("\n");
    return `${head} — ${note.fields.length} field(s) not imported:\n${nested}`;
  });
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
    `- New canon written (characters + personas + chats + world books + presets + group rooms): ${report.changed}`,
    `- Cards skipped (could not import): ${report.skippedCards.length}`,
    `- Presets imported: ${report.presetsImported} (${report.presetsCreated} new, ${report.presetsImported - report.presetsCreated} merged onto an existing preset)`,
    `- Themes converted: ${report.themesImported} (${report.themesCreated} new, ${report.themesImported - report.themesCreated} merged onto an existing imported theme)`,
    `- Background images imported: ${report.backgroundsImported}`,
    `- Group rooms imported: ${report.groupsImported} (${report.groupChatsImported} group transcript(s))`,
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
    section("Presets imported — what did NOT map", presetNoteLines(report)),
    section(
      "Preset files skipped — NOT imported",
      report.skippedPresets.map((p) => `\`${p.file}\` — ${p.reason}`),
    ),
    section(
      "Preset files that failed to parse",
      report.unreadablePresets.map((f) => `\`${f}\``),
    ),
    section("Themes converted — what did NOT map", noteLines(report.themeNotes)),
    section(
      "Theme files NOT converted",
      report.skippedThemes.map((t) => `\`${t.file}\` — ${t.reason}`),
    ),
    section(
      "Background files NOT imported",
      report.skippedBackgrounds.map((b) => `\`${b.file}\` — ${b.reason}`),
    ),
    section(
      "Appearance settings taken from ST `power_user`",
      report.appearanceKeysApplied.map((k) => `\`${k}\``),
    ),
    section(
      "Groups skipped — NO room created",
      report.skippedGroups.map((g) => `\`${g.group}\` — ${g.reason}`),
    ),
    section(
      "Group members skipped (the room still imported without them)",
      report.skippedGroupMembers.map((m) => `\`${m.group}\` → \`${m.member}\` — ${m.reason}`),
    ),
    section(
      "Group definitions that failed to parse",
      report.unreadableGroups.map((f) => `\`${f}\``),
    ),
    section(
      "Group transcripts a group claimed but that could not be read",
      report.missingGroupChats.map((f) => `\`${f}\``),
    ),
    section(
      "Chat-bound persona picks that did NOT resolve (the chat imported; only the pick was dropped)",
      report.unresolvedPinnedPersonas.map((p) => `\`${p.chat}\` → persona \`${p.persona}\` — no persona of that name in this import or your library`),
    ),
    section("ST profile planes NOT imported (no importer yet)", report.unhandled.map(unhandledLine)),
    section(
      "settings.json sections NOT imported (personas, library tags and the chat-completion preset are read today)",
      report.unhandledSettings.map(unhandledLine),
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
