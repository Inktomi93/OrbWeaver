// entry/import/import-report — render + persist the whole-folder import's "what landed / what didn't"
// accounting to a file a self-host owner can open. `formatImportReport` is PURE (markdown out, testable);
// `writeImportReport` is the node:fs side (entry-tier — the domain driver stays fs-free and just returns the
// `ImportReport` data). One file per run in the layout's `reports/` dir, stamped with the run clock.

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ST_PROFILE_UNHANDLED_REASONS, ST_SETTINGS_UNHANDLED_REASONS } from "@orb/contracts/import";
import type { ImportReport } from "#domain/import";

// The reasons live in `@orb/contracts/import` — the one home the browser planner also reads, so what the
// picker leaves out before upload and what this report names agree. A name absent from both maps renders
// bare, so a new ST plane shows up instead of being swallowed.
function unhandledReason(name: string): string | undefined {
  return ST_PROFILE_UNHANDLED_REASONS.get(name) ?? ST_SETTINGS_UNHANDLED_REASONS.get(name);
}

/** One "not imported" line: the plane name + its one-line reason when known, else bare. */
function unhandledLine(name: string): string {
  const reason = unhandledReason(name);
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

/** The collision suffix an import took, as the report says it. */
function renamedSuffix(renamedFrom: string | null): string {
  return renamedFrom === null ? "" : ` — imported under a new name; you already have a different \`${renamedFrom}\``;
}

/** The shared renderer for a per-entity lossiness note (presets + themes carry the identical shape). */
function noteLines(notes: ImportReport["presetNotes"] | ImportReport["themeNotes"]): string[] {
  return notes.map((note) => {
    const head = `\`${note.name}\` (from \`${note.sourceFile}\`)${renamedSuffix(note.renamedFrom)}`;
    if (note.fields.length === 0) {
      return `${head} — everything mapped`;
    }
    const nested = note.fields.map((f) => `  - \`${f.field}\` — ${f.reason}`).join("\n");
    return `${head} — ${note.fields.length} field(s) not imported:\n${nested}`;
  });
}

/** One line per standalone world book the run landed: where it landed, and the SillyTavern activation
 *  fields its entries keep stored but inert (owner ruling: kept untouched, shown as not active yet). */
function worldLines(report: ImportReport): string[] {
  return report.worldNotes.map((note) => {
    const landed = note.created ? "new" : "already in your library";
    const inert =
      note.inertFields.length === 0
        ? ""
        : `; kept but not active yet: ${note.inertFields.map((f) => `\`${f.field}\` (${f.entries} ${f.entries === 1 ? "entry" : "entries"})`).join(", ")}`;
    return `\`${note.name}\` — ${note.entries} ${note.entries === 1 ? "entry" : "entries"}, ${landed}${renamedSuffix(note.renamedFrom)}${inert}`;
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
    `- World books imported: ${report.worldNotes.length} (${report.worldNotes.filter((n) => n.created).length} new, ${report.worldNotes.filter((n) => !n.created).length} already in your library)`,
    `- Presets imported: ${report.presetsImported} (${report.presetsCreated} new, ${report.presetsImported - report.presetsCreated} already in your library)`,
    `- Themes converted: ${report.themesImported} (${report.themesCreated} new, ${report.themesImported - report.themesCreated} already in your library)`,
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
    section("World books imported (SillyTavern activation settings are kept on each entry but not active yet)", worldLines(report)),
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

/** Write the report to `<reportsDir>/import-<stamp>.md` (the dir created if absent) and return its path. */
export async function writeImportReport(report: ImportReport, generatedAt: number, reportsDir: string): Promise<string> {
  const dir = resolve(reportsDir);
  await mkdir(dir, { recursive: true });
  const path = join(dir, `import-${generatedAt}.md`);
  await writeFile(path, formatImportReport(report, generatedAt), "utf8");
  return path;
}
