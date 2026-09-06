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
  // Top-level profile planes.
  // THE TEXT-COMPLETION TEMPLATE PLANES (context/instruct/sysprompt/reasoning + the oai_settings trio) are
  // BY-DESIGN exclusions, not deferred work: the owner reaffirmed 2026-08-15 that orb will never run
  // text-completion, so the old "needs an ST→orb template mapper (separate epic)" wording is gone — a
  // deferral line on a ruled-out feature reads as debt forever.
  ["movingUI/", "saved UI layout state — no domain home"],
  ["context/", "text-completion context templates — text-completion is out of product scope (owner ruling, reaffirmed 2026-08-15)"],
  ["instruct/", "text-completion instruct templates — text-completion is out of product scope (owner ruling, reaffirmed 2026-08-15)"],
  ["sysprompt/", "text-completion system-prompt templates — text-completion is out of product scope (owner ruling, reaffirmed 2026-08-15)"],
  [
    "reasoning/",
    "saved reasoning-format template library — the ACTIVE template already folds onto the live preset (reasoningParse); the library is text-completion-era and out of product scope (owner ruling, reaffirmed 2026-08-15)",
  ],
  ["TextGen Settings/", "text-completion preset files — orb has no text-completion mode; ruled out by owner 2026-08-08"],
  ["NovelAI Settings/", "text-completion preset files — orb has no text-completion mode; ruled out by owner 2026-08-08"],
  ["KoboldAI Settings/", "text-completion preset files — orb has no text-completion mode; ruled out by owner 2026-08-08"],
  ["QuickReplies/", "STscript quick-reply buttons — orb has no STscript executor (orb automation is CEL-based, D46)"],
  // Both observed rendering BARE on a real profile drive (2026-08-08).
  ["assets/", "ST extension assets (expression sprites, audio) — no domain home (the expressions design set is parked)"],
  ["vectors/", "ST's own vector store — orb re-embeds locally after import, so a foreign index never travels"],
  ["extensions/", "third-party extension INSTALLS (code, not state) — out of scope"],
  [
    "user/",
    "user/files (Data Bank) + user/images (character gallery) ARE walked and counted (see the Data Bank / gallery section); user/workflows is ST's stock ComfyUI workflow pair — orb has no ComfyUI workflow store",
  ],
  ["secrets.json", "API keys — deliberately NOT imported (credentials are entered per-install)"],
  ["stats.json", "usage stats — recomputed locally, not import canon"],
  ["content.log", "ST install log — not canon"],
  ["image-metadata.json", "ST gallery/background thumbnail metadata — orb derives its own media metadata at CAS-store time"],
  // settings.json sections (ST snake_case interchange names)
  ["textgenerationwebui_settings", "live text-completion preset — orb has no text-completion mode; ruled out by owner 2026-08-08"],
  ["nai_settings", "live text-completion preset — orb has no text-completion mode; ruled out by owner 2026-08-08"],
  ["kai_settings", "live text-completion preset — orb has no text-completion mode; ruled out by owner 2026-08-08"],
  [
    "world_info_settings",
    "global world-info activation knobs have no orb home; the per-character charLore bindings ARE read (see the world name-link section) and per-book WI is imported",
  ],
  ["horde_settings", "Horde backend config — no import canon"],
  [
    "extension_settings",
    "extension state — READ for regex (global scripts import; see the regex section; regex_presets/character_allowed_regex have no orb counterpart) and INVENTORIED for the Data Bank index (attachments/character_attachments); the rest is out of scope",
  ],
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
 *  "landed whole" apart from "was never looked at". A preset that carried its own regex scripts (the ST
 *  presetManager extension field) gets the lift accounting appended to its head line. */
function presetNoteLines(report: ImportReport): string[] {
  const base = noteLines(report.presetNotes);
  return base.map((line, i) => {
    const note = report.presetNotes[i];
    if (note === undefined || note.scriptsLifted + note.scriptsReused === 0) {
      return line;
    }
    const scripts = `${note.scriptsLifted + note.scriptsReused} regex script(s) → the script library, attached to this preset (${note.scriptsLifted} new, ${note.scriptsReused} matched existing rows)`;
    // The scripts line nests under the preset's head line, exactly like the unmapped fields do.
    return `${line}\n  - ${scripts}`;
  });
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

/** The regex-plane accounting (the silent-gap sweep, 2026-08-15): every plane renders its count EVEN AT
 *  ZERO, so "read and empty" is distinguishable from "never looked at" — this exact plane used to vanish
 *  with no line at all (measured: 15 real preset-scoped scripts silently ignored on the 2026-08-15 run). */
function regexLines(report: ImportReport): string[] {
  const lines = [
    `Card-carried scripts (\`data.extensions.regex_scripts\`): ${report.cardRegexScriptsLifted + report.cardRegexScriptsReused} attached (${report.cardRegexScriptsLifted} new library rows, ${report.cardRegexScriptsReused} matched existing)`,
    `Preset-carried scripts (\`extensions.regex_scripts\` in a chat-completion preset): see each preset's own note above`,
    `Global scripts (\`settings.json#extension_settings.regex\`): found ${report.globalRegexScriptsFound} — ${report.globalRegexScriptsLifted} new library rows (global), ${report.globalRegexScriptsReused} matched existing`,
  ];
  if (report.malformedGlobalRegexScripts > 0) {
    lines.push(`Global entries that did not parse as regex scripts: ${report.malformedGlobalRegexScripts} — dropped, see the server log`);
  }
  if (report.globalRegexSkippedReason !== null) {
    lines.push(`Global scripts NOT imported: ${report.globalRegexSkippedReason}`);
  }
  return lines;
}

/** The world NAME-LINK accounting (card `extensions.world` primary + `charLore` auxiliaries). */
function worldLinkLines(report: ImportReport): string[] {
  const lines = [`Book links attached by name: ${report.worldLinksAttached}`];
  for (const miss of report.worldLinksMissing) {
    lines.push(`\`${miss.character}\` names world book \`${miss.book}\` — no book of that name in this profile or your library (never near-matched)`);
  }
  if (report.worldLinksSkippedReason !== null) {
    lines.push(`Name-links NOT attached: ${report.worldLinksSkippedReason}`);
  }
  return lines;
}

/** The ST Data Bank + character-gallery planes — counted, with the honest disposition. These have real orb
 *  counterparts (`domain/databank`; the assets gallery) and the write waves are a NAMED FOLLOW-UP: the real
 *  corpus carries zero files in both, so mappers today would be proven against nothing. The count line is
 *  the guarantee that a future profile carrying data shows LOUDLY instead of vanishing under `user/`. */
function userPlaneLines(report: ImportReport): string[] {
  const disposition = (count: number, plane: string, home: string): string =>
    count === 0
      ? `${plane}: 0 files found — nothing to import`
      : `${plane}: ${count} file(s) found — NOT imported yet (the ${home} import wave is a named follow-up; nothing was lost, the files stay in the ST profile)`;
  return [
    disposition(report.databankFileCount, "Data Bank files (`user/files/` + the attachments index)", "databank"),
    disposition(report.galleryImageCount, "Character-gallery images (`user/images/`)", "gallery"),
  ];
}

/** The DRY-RUN banner + per-wave census. A rehearsal writes nothing, so every write count below it is zero by
 *  construction — which reads exactly like a profile carrying none of those planes unless the report says so. */
function dryRunLines(report: ImportReport): string[] {
  const census = report.dryRunWouldImport;
  if (census === null) {
    return [];
  }
  return [
    "",
    "> **DRY RUN — nothing was written.** Every count in this report is zero because no wave ran, not because",
    "> the profile is empty. A real run would attempt:",
    "",
    `- Characters: ${census.characters} (with ${census.chats} chat transcript(s))`,
    `- Personas: ${census.personas}`,
    `- World books: ${census.worlds}`,
    `- Presets: ${census.presets}`,
    `- Themes: ${census.themes}`,
    `- Background images: ${census.backgrounds}`,
    `- Group rooms: ${census.groups} (with ${census.groupChats} group transcript(s))`,
    `- Orphan chat directories (a placeholder character each): ${census.orphanChatDirs}`,
  ];
}

/** Render the import report as Markdown. `generatedAt` is epoch-ms (the run clock) → an ISO stamp header. */
function formatImportReport(report: ImportReport, generatedAt: number): string {
  return [
    "# SillyTavern import report",
    "",
    `Generated: ${new Date(generatedAt).toISOString()}`,
    ...dryRunLines(report),
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
    // The dedup-skip HEAL. Rendered even at zero: a re-run over an already-imported corpus writes no new
    // canon, so this is the ONLY line that can tell an operator the re-run did anything at all.
    `- Existing rooms given their user persona (re-run repair): ${report.chatsPersonaHealed}`,
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
      "Orphan chat directories (no matching card — a placeholder character is minted; see the next section)",
      report.orphanChatDirs.map((d) => `\`${d}\``),
    ),
    section("Orphan chats imported (placeholder minted from the directory's own evidence, tagged `orphan import`)", [
      ...report.orphanImports.map(
        (o) => `\`${o.dir}\` → \`${o.characterName}\` (${o.chatsImported} chat(s)${o.created ? "" : "; placeholder already existed from a prior run"})`,
      ),
      ...report.orphanSkipped.map((o) => `\`${o.dir}\` — NOT imported: ${o.reason}`),
    ]),
    section("Characters skipped (skip-listed)", report.skippedCharacters),
    section(
      "Library tags that did NOT attach (the character imported without them)",
      report.skippedCardTags.map((t) => `\`${t.character}\` → \`${t.tag}\` — ${t.reason}`),
    ),
    section("Presets imported — what did NOT map", presetNoteLines(report)),
    section(
      "Preset files skipped — NOT imported",
      report.skippedPresets.map((p) => `\`${p.file}\` — ${p.reason}`),
    ),
    section(
      "Preset files that failed to parse",
      report.unreadablePresets.map((f) => `\`${f}\``),
    ),
    section("Regex scripts (cards · presets · global)", regexLines(report)),
    section("World book name-links (card `extensions.world` + `charLore`)", worldLinkLines(report)),
    section("ST Data Bank / character-gallery planes (counted every run)", userPlaneLines(report)),
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
      "Group speakers that could NOT be told apart (two seated cards share one display name)",
      report.ambiguousSpeakerNames.map(
        (a) =>
          `\`${a.group}\` — ${a.seats} seated cards are called \`${a.name}\`, so a transcript line naming only "${a.name}" (an older export with no card filename on the line) was left to the room's primary rather than assigned to one of them`,
      ),
    ),
    section(
      "Group members SillyTavern had disabled (seated MUTED — the flag travelled)",
      report.seatedDisabledMembers.map(
        (m) => `\`${m.group}\` → \`${m.member}\` — seated in the room with its mute ON, exactly as ST had it; un-mute it in the room to hear from it`,
      ),
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
    section(
      "Directories the importer could only read PART of (entry ceiling — everything past the count was NOT examined)",
      report.truncatedDirs.map((t) => `\`${t.dir}\` — ${t.total} entries found, only the first ${t.kept} were read (the rest did NOT import)`),
    ),
    section("ST profile planes NOT imported (no importer yet)", report.unhandled.map(unhandledLine)),
    section(
      "settings.json sections NOT (fully) imported (personas, library tags, the chat-completion preset, global regex scripts and charLore are read today)",
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
