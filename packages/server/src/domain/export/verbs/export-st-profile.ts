// verb: planStProfileExport — the owner's library laid out as a SillyTavern user directory. It reads the per-kind
// streams the library backup reads and re-shapes each kind into the file one of SillyTavern's import doors takes
// (`ST_EXPORT_DOORS`). The plan it returns is both the dry run's answer and the zip's content and report, so the
// preview and the report are one value.
//
// SECURITY: every path segment built from a stored name goes through SillyTavern's own filename rule
// (`stSanitizeFilename`) and then a case-folded collision suffix, so no name leaves its directory and no two files
// share a path on a case-insensitive disk. Character and chat folders use the portable handle, whose alphabet holds
// no separator.

import { CHARACTER_HANDLE_WIRE_KEY, characterHandleSchema, portableCharacterHandle } from "@orb/contracts/character";
import type { ImportPreviewKind, StExportLeft } from "@orb/contracts/import";
import { clipImportText, ST_EXPORT_DOORS, ST_EXPORT_PROFILE_DIR } from "@orb/contracts/import";
import type { PortableExportNotes, PortableKind } from "@orb/contracts/portability";
import { isPlainObject } from "@orb/kit/guards";
import { readCardChunk } from "@orb/kit/png-card-chunk";
import { parseDocumentFile } from "#primitives/serde/databank";
import { parseGallery } from "#primitives/serde/gallery";
import { parsePersonaBackup } from "#primitives/serde/persona";
import { buildStWorldFile, parseWorldBookFile } from "#primitives/serde/world-info";
import { stSanitizeFilename } from "#primitives/st-filename";
import type { StProfileEntry, StProfilePlan, StProfileSource } from "../contract/st-profile.ts";
import { PLACEHOLDER_PNG } from "../substrate/placeholder-png.ts";

// The kinds this build has no SillyTavern writer for, and those SillyTavern keeps nothing of. Each owned file of
// them is named in the report.
const NO_WRITER_KINDS = ["preset", "theme", "regex", "user-settings", "tag"] as const satisfies readonly PortableKind[];
const NO_HOME_KINDS = ["imagery", "spend"] as const satisfies readonly PortableKind[];

const CARD_CHUNKS = ["ccv3", "chara"] as const;
const HASH_LENGTH = 64;
const FALLBACK_NAMES = { world: "World", persona: "Persona", document: "Document", chat: "Chat" } as const;
const TXT_EXT = ".txt";
const ENCODER = new TextEncoder();

// A stored handle in the portable alphabet, or null when the text is no handle.
function portableHandle(text: unknown): string | null {
  const handle = characterHandleSchema.safeParse(text).data;
  return handle === undefined ? null : portableCharacterHandle(handle);
}

// One directory's names, folded the way a case-insensitive disk folds them.
function namer(): (base: string, fallback: string, ext: string) => string {
  const taken = new Set<string>();
  return (base, fallback, ext) => {
    const stem = stSanitizeFilename(base) || fallback;
    let name = `${stem}${ext}`;
    for (let n = 2; taken.has(name.toLowerCase()); n += 1) {
      name = `${stem} (${String(n)})${ext}`;
    }
    taken.add(name.toLowerCase());
    return name;
  };
}

function stemOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot <= 0 ? filename : filename.slice(0, dot);
}

// The handle an exported card names itself by, read off its own card chunk; null when the card carries none.
async function cardHandle(png: Uint8Array): Promise<string | null> {
  for (const keyword of CARD_CHUNKS) {
    const chunk = await readCardChunk(png, keyword);
    if (chunk !== null) {
      const card: unknown = JSON.parse(chunk);
      const data = isPlainObject(card) ? card["data"] : null;
      const handle = isPlainObject(data) ? data[CHARACTER_HANDLE_WIRE_KEY] : null;
      return portableHandle(handle);
    }
  }
  return null;
}

class PlanBuilder {
  readonly entries: StProfileEntry[] = [];
  readonly left: StExportLeft[] = [];
  readonly notes: PortableExportNotes = (note) => {
    this.leave(note.kind, note.item, "unreadable");
  };

  add(kind: ImportPreviewKind, relative: string, bytes: () => Promise<Uint8Array>): void {
    this.entries.push({ path: `${ST_EXPORT_PROFILE_DIR}${relative}`, kind, door: ST_EXPORT_DOORS[kind], bytes });
  }

  addBytes(kind: ImportPreviewKind, relative: string, bytes: Uint8Array): void {
    this.add(kind, relative, () => Promise.resolve(bytes));
  }

  leave(kind: PortableKind, item: string, reason: StExportLeft["reason"]): void {
    this.left.push({ kind, item: clipImportText(item), reason });
  }
}

async function planCharacters(source: StProfileSource, plan: PlanBuilder): Promise<void> {
  const name = namer();
  for await (const file of source.files("character", plan.notes)) {
    const handle = await cardHandle(file.bytes);
    plan.addBytes("characters", `characters/${name(handle ?? stemOf(file.filename), FALLBACK_NAMES.chat, ".png")}`, file.bytes);
  }
}

async function planChats(source: StProfileSource, plan: PlanBuilder): Promise<void> {
  const namers = new Map<string, ReturnType<typeof namer>>();
  for (const { chatId, handle } of await source.listHostChats()) {
    const dir = portableCharacterHandle(handle);
    const name = namers.get(dir) ?? namer();
    namers.set(dir, name);
    const relative = `chats/${dir}/${name(chatId, FALLBACK_NAMES.chat, ".jsonl")}`;
    plan.add("chats", relative, async () => {
      const transcript = await source.exportChat(chatId);
      return ENCODER.encode(transcript?.text ?? "");
    });
  }
}

async function planWorlds(source: StProfileSource, plan: PlanBuilder): Promise<void> {
  const name = namer();
  for await (const file of source.files("world-info", plan.notes)) {
    const book = parseWorldBookFile(file.bytes, stemOf(file.filename));
    if (!book.ok) {
      plan.leave("world-info", stemOf(file.filename), "unreadable");
      continue;
    }
    plan.addBytes("worlds", `worlds/${name(book.value.name, FALLBACK_NAMES.world, ".json")}`, buildStWorldFile(book.value));
  }
}

interface StSettings {
  readonly personas: Record<string, string>;
  readonly personaDescriptions: Record<string, { readonly description: string; readonly title: string }>;
  readonly attachments: Record<string, unknown>[];
  readonly characterAttachments: Partial<Record<string, Record<string, unknown>[]>>;
  readonly galleryFolders: Record<string, string>;
}

async function planPersonas(source: StProfileSource, plan: PlanBuilder, settings: StSettings): Promise<void> {
  const name = namer();
  for await (const file of source.files("persona", plan.notes)) {
    const backup = parsePersonaBackup(file.bytes);
    if (!backup.ok) {
      plan.leave("persona", stemOf(file.filename), "unreadable");
      continue;
    }
    const avatar = name(backup.value.name, FALLBACK_NAMES.persona, ".png");
    settings.personas[avatar] = backup.value.name;
    settings.personaDescriptions[avatar] = { description: backup.value.description, title: backup.value.title ?? "" };
    plan.addBytes("personas", `User Avatars/${avatar}`, PLACEHOLDER_PNG);
    plan.leave("persona", backup.value.name, "persona-without-art");
  }
}

async function planDocuments(source: StProfileSource, plan: PlanBuilder, settings: StSettings): Promise<void> {
  const name = namer();
  for await (const file of source.files("databank", plan.notes)) {
    const document = parseDocumentFile(file.bytes);
    if (!document.ok) {
      plan.leave("databank", stemOf(file.filename), "unreadable");
      continue;
    }
    const { value } = document;
    const bytes = ENCODER.encode(value.extractedText);
    const stored = name(value.name.toLowerCase().endsWith(TXT_EXT) ? stemOf(value.name) : value.name, FALLBACK_NAMES.document, TXT_EXT);
    // SillyTavern's attachment entry (`public/scripts/chats.js` `uploadFileAttachmentToServer`).
    const entry = { url: `/user/files/${stored}`, size: bytes.byteLength, name: value.name, created: value.createdAt ?? 0 };
    if (value.global) {
      settings.attachments.push(entry);
    }
    for (const handle of value.characterHandles.flatMap((text) => portableHandle(text) ?? [])) {
      const card = `${handle}.png`;
      settings.characterAttachments[card] = [...(settings.characterAttachments[card] ?? []), entry];
    }
    plan.addBytes("documents", `user/files/${stored}`, bytes);
  }
}

// Each gallery image's content hash with the characters whose gallery shows it.
async function gallerySubjects(source: StProfileSource, plan: PlanBuilder): Promise<Map<string, string[]>> {
  const subjects = new Map<string, string[]>();
  for await (const file of source.files("gallery", plan.notes)) {
    const gallery = parseGallery(file.bytes);
    for (const item of gallery.ok ? gallery.value.items : []) {
      const handle = portableHandle(item.subjectCharacterHandle);
      if (item.assetHash !== null && handle !== null) {
        subjects.set(item.assetHash, [...(subjects.get(item.assetHash) ?? []), handle]);
      }
    }
  }
  return subjects;
}

async function planGallery(source: StProfileSource, plan: PlanBuilder, settings: StSettings): Promise<void> {
  const subjects = await gallerySubjects(source, plan);
  if (subjects.size === 0) {
    return;
  }
  // An asset file's name opens with its content hash; only the blobs a gallery row names are read.
  for await (const file of source.files("assets", plan.notes)) {
    const handles = subjects.get(file.filename.slice(0, HASH_LENGTH)) ?? [];
    const ext = stSanitizeFilename(file.filename.slice(file.filename.lastIndexOf(".") + 1));
    for (const handle of handles) {
      settings.galleryFolders[`${handle}.png`] = handle;
      plan.addBytes("gallery", `user/images/${handle}/${file.filename.slice(0, HASH_LENGTH)}.${ext}`, file.bytes);
    }
  }
}

async function planLeftKinds(source: StProfileSource, plan: PlanBuilder): Promise<void> {
  const kinds = [...NO_WRITER_KINDS.map((kind) => [kind, "no-writer"] as const), ...NO_HOME_KINDS.map((kind) => [kind, "no-sillytavern-home"] as const)];
  for (const [kind, reason] of kinds) {
    for await (const file of source.files(kind, plan.notes)) {
      plan.leave(kind, stemOf(file.filename), reason);
    }
  }
}

// SillyTavern's settings file, holding only what the export carries: the personas and their descriptions
// (`power_user`), the Data Bank index and the gallery folders (`extension_settings`). SillyTavern fills every
// other setting with its default.
function settingsFile(settings: StSettings): Uint8Array {
  return ENCODER.encode(
    JSON.stringify(
      {
        ["power_user"]: { personas: settings.personas, ["persona_descriptions"]: settings.personaDescriptions },
        ["extension_settings"]: {
          attachments: settings.attachments,
          ["character_attachments"]: settings.characterAttachments,
          gallery: { folders: settings.galleryFolders },
        },
      },
      null,
      2,
    ),
  );
}

/** The SillyTavern export of the library `source` reads: every file with the door that takes it, and every row it
 *  left behind with why. */
export async function planStProfileExport(source: StProfileSource): Promise<StProfilePlan> {
  const plan = new PlanBuilder();
  const settings: StSettings = { personas: {}, personaDescriptions: {}, attachments: [], characterAttachments: {}, galleryFolders: {} };
  await planCharacters(source, plan);
  await planChats(source, plan);
  await planWorlds(source, plan);
  await planPersonas(source, plan, settings);
  await planDocuments(source, plan, settings);
  await planGallery(source, plan, settings);
  await planLeftKinds(source, plan);
  plan.addBytes("personas", "settings.json", settingsFile(settings));
  return { entries: plan.entries, report: { files: plan.entries.map(({ path, kind, door }) => ({ path, kind, door })), left: plan.left } };
}
