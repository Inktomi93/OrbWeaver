// data/import-tree-plan — the folder-import upload PLAN: what a picked SillyTavern folder sends, skips and
// splits before any request. THE PLAN IS THE POINT. The server refuses a whole upload over its caps, and a
// long-lived ST folder carries planes the importer never reads (vectors, extension installs, text-completion
// presets, backups) beside the ones it does. So the browser skips what the server would only report, drops a
// file over the per-file cap or too large for any one framed upload with its reason, and splits the rest into
// uploads whose whole bodies stay under the total cap — each a
// complete import on its own: a card travels with its chats, a group with its member cards and transcripts,
// and the planes other planes resolve against by name ride in every upload: `settings.json` (personas,
// tags), the persona avatars (art is persona identity, so an art-less repeat would mint a twin) and the
// world books (a card's name-link binds the book its own run landed). `secrets.json` is
// never sent: the plan skips it, and `importTree` drops it regardless of its caller. Every other picked file
// is sent or listed in `skipped` with its reason; a slug collision (two cards whose names slug alike) sends
// both and the server disambiguates, as it does for a folder uploaded whole.

import type { StProfileHandledEntry, TreeLayoutDeclaration } from "@orb/contracts/import";
import { admitTreeBatch, chatDirCardCandidates, isStSecretsFile, ST_SECRETS_FILE, ST_SETTINGS_FILE, stProfileEntryDisposition } from "@orb/contracts/import";
import { PORTABLE_DIRECTORIES, PORTABLE_IMPORT_ORDER } from "@orb/contracts/portability";
import { slugifyHandle } from "@orb/kit/slug";
import { relativePathOf } from "./import-tree.ts";
import { UploadPacker } from "./import-tree-packer.ts";

/** The served folder-import caps the plan packs against (`UploadCaps.importTree*`). */
export interface TreeImportCaps {
  readonly totalBytes: number;
  readonly fileBytes: number;
  readonly files: number;
}

/** What each upload's multipart body adds to the file bytes it carries: once per upload, and per file part. */
export interface TreeUploadFraming {
  readonly perUpload: number;
  readonly perFile: (file: File) => number;
}

const NO_FRAMING: TreeUploadFraming = { perUpload: 0, perFile: () => 0 };

/** One picked file the plan will not send, with the reason the preflight and the summary print. */
export interface SkippedTreeFile {
  readonly path: string;
  readonly reason: string;
}

export interface TreeImportPlan {
  /** The uploads, in send order. Each is a complete import on its own. */
  readonly batches: readonly (readonly File[])[];
  readonly skipped: readonly SkippedTreeFile[];
  /** Files and bytes the batches carry (a file repeated across uploads counts once). */
  readonly files: number;
  readonly bytes: number;
  /** The layout every upload declares, or null when each upload is recognized on its own. */
  readonly layout: TreeLayoutDeclaration | null;
}

const PNG_EXT = /\.png$/iu;
const JSONL_EXT = /\.jsonl$/iu;
const JSON_EXT = /\.json$/iu;
const CHARACTERS_DIR = "characters";
const CHATS_DIR = "chats";
const GROUPS_DIR = "groups";
const GROUP_CHATS_DIR = "group chats";
const USER_AVATARS_DIR = "User Avatars" satisfies StProfileHandledEntry;
const WORLDS_DIR = "worlds" satisfies StProfileHandledEntry;

// Generic and profile plans report the same per-file cap refusal.
const OVER_FILE_CAP_REASON = "over the per-file size cap";
const OVER_UPLOAD_CAP_REASON = "too large for one upload";
const UNHANDLED_FALLBACK = "no importer for this plane";
/** Why `secrets.json` is left out, from the one reason map. */
const ST_PROFILE_SECRETS_REASON = (stProfileEntryDisposition(ST_SECRETS_FILE, false) as { readonly reason: string | null }).reason ?? UNHANDLED_FALLBACK;

/** One picked file with the path the server will see (wrapper stripped) and its profile-relative parts. */
interface PlannedFile {
  readonly file: File;
  readonly path: string;
  /** The path inside the profile dir (a multi-profile root keeps its profile dir in `path`). */
  readonly segments: readonly string[];
}

/** The cards sharing one slug with their chat directory — the unit the server pairs by handle, so an upload
 *  never splits it. Two cards under one slug both travel; the server suffixes the second handle. */
interface Bundle {
  readonly cards: PlannedFile[];
  readonly chats: PlannedFile[];
}

interface GroupUnit {
  readonly definition: PlannedFile;
  readonly memberKeys: readonly string[];
  readonly chats: PlannedFile[];
}

/** A rough ST group definition read for planning only: its member card files and transcript leaves. */
interface GroupShape {
  readonly members: readonly string[];
  readonly chats: readonly string[];
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

async function readGroupShape(file: File, readText: (file: File) => Promise<string>): Promise<GroupShape> {
  // the group definition is still packed and sent (`planTreeImport`'s `packer.add`), and the server parse
  // (`collectGroups` in loader/collect.ts) lists it in `unreadableGroups`, which the import report prints. Ends if the server stops reporting unreadable groups.
  try {
    const raw: unknown = JSON.parse(await readText(file));
    if (typeof raw !== "object" || raw === null) {
      return { members: [], chats: [] };
    }
    const record = raw as Record<string, unknown>;
    return { members: stringList(record["members"]), chats: stringList(record["chats"]) };
  } catch {
    return { members: [], chats: [] };
  }
}

/** The single leading path segment every path shares (the browser's picked-folder wrapper), else null. */
function commonWrapper(paths: readonly string[]): string | null {
  const first = paths[0];
  if (first === undefined) {
    return null;
  }
  const slash = first.indexOf("/");
  if (slash === -1) {
    return null;
  }
  const prefix = first.slice(0, slash + 1);
  return paths.every((p) => p.startsWith(prefix)) ? prefix.slice(0, -1) : null;
}

/** The server's chat-dir pairing: the slug, else the slug minus an ST folder-name decoration
 *  (`chatDirCardCandidates`, the one rule the collector also pairs by). */
function bundleKeyForChatDir(dirName: string, cardKeys: ReadonlySet<string>): string | null {
  const handle = slugifyHandle(dirName);
  if (cardKeys.has(handle)) {
    return handle;
  }
  return chatDirCardCandidates(handle).find((c) => cardKeys.has(c)) ?? null;
}

/** A packer over the served caps, charging each file its own bytes plus its part framing. */
function packerFor(caps: TreeImportCaps, framing: TreeUploadFraming, always: readonly PlannedFile[]): UploadPacker<PlannedFile> {
  return new UploadPacker<PlannedFile>(
    { totalBytes: caps.totalBytes - framing.perUpload, files: caps.files },
    always,
    (f) => f.file.size + framing.perFile(f.file),
  );
}

/** The finished uploads, with each rejected file joining `skipped` and the files and bytes the uploads carry
 *  counted once each (shared files repeat across uploads). */
function finishPlan(packer: UploadPacker<PlannedFile>, skipped: SkippedTreeFile[]): Omit<TreeImportPlan, "layout"> {
  const { batches, rejected } = packer.finish();
  for (const f of rejected) {
    skipped.push({ path: f.path, reason: OVER_UPLOAD_CAP_REASON });
  }
  const sent = new Set(batches.flat());
  let bytes = 0;
  for (const file of sent) {
    bytes += file.size;
  }
  return { batches, skipped, files: sent.size, bytes };
}

/** A greedy split in the given order; an over-cap file joins `skipped`. */
function packGeneric(
  planned: readonly PlannedFile[],
  caps: TreeImportCaps,
  framing: TreeUploadFraming,
  skipped: SkippedTreeFile[],
): Omit<TreeImportPlan, "layout"> {
  const packer = packerFor(caps, framing, []);
  for (const f of planned) {
    if (f.file.size > caps.fileBytes) {
      skipped.push({ path: f.path, reason: OVER_FILE_CAP_REASON });
      continue;
    }
    packer.add([], [f]);
  }
  return finishPlan(packer, skipped);
}

/** Each native directory's position in the loader's dependency order; an entry outside every one sorts last. */
const NATIVE_IMPORT_RANK: ReadonlyMap<string, number> = new Map(PORTABLE_IMPORT_ORDER.map((kind, rank) => [PORTABLE_DIRECTORIES[kind].slice(0, -1), rank]));

function nativeImportRank(f: PlannedFile): number {
  return NATIVE_IMPORT_RANK.get(f.segments[0] ?? "") ?? PORTABLE_IMPORT_ORDER.length;
}

/** A native tree (an unzipped orb backup): every file imports on its own. One upload is recognized as native
 *  by itself. Split uploads each declare the native layout, which the server admits only when every entry sits
 *  under a native directory, so an entry outside one is skipped here instead of refusing its whole upload.
 *  The loader orders planes only within one upload and resolves links by name against what already landed,
 *  so the files are packed in its dependency order: every upload then follows all of its dependencies. */
function planGeneric(picked: readonly PlannedFile[], caps: TreeImportCaps, framing: TreeUploadFraming): TreeImportPlan {
  const planned = picked.toSorted((a, b) => nativeImportRank(a) - nativeImportRank(b));
  const whole = packGeneric(planned, caps, framing, []);
  if (whole.batches.length <= 1) {
    return { ...whole, layout: null };
  }
  const nativeEntry = (f: PlannedFile): boolean => admitTreeBatch([f.path], "orb").kind === "orb";
  const outside = planned.filter((f) => !nativeEntry(f)).map((f) => ({ path: f.path, reason: UNHANDLED_FALLBACK }));
  return { ...packGeneric(planned.filter(nativeEntry), caps, framing, outside), layout: "orb" };
}

/** Where one picked file belongs in the plan. */
type FileRole =
  | { readonly kind: "skip"; readonly reason: string }
  | { readonly kind: "shared" }
  | { readonly kind: "card"; readonly key: string }
  | { readonly kind: "chat"; readonly dirName: string }
  | { readonly kind: "group" }
  | { readonly kind: "groupChat"; readonly leaf: string }
  | { readonly kind: "base" };

/** Which plane a file under a handled directory belongs to, by its first two segments. */
function planeRole(top: string, second: string | undefined, tail: readonly string[]): FileRole {
  const leaf = tail.length === 0 ? second : undefined;
  if (top === CHARACTERS_DIR && leaf !== undefined && PNG_EXT.test(leaf)) {
    return { kind: "card", key: slugifyHandle(leaf.replace(PNG_EXT, "")) };
  }
  if (top === CHATS_DIR && second !== undefined && tail.length === 1 && JSONL_EXT.test(tail[0] ?? "")) {
    return { kind: "chat", dirName: second };
  }
  if (top === GROUPS_DIR && leaf !== undefined && JSON_EXT.test(leaf)) {
    return { kind: "group" };
  }
  if (top === GROUP_CHATS_DIR && leaf !== undefined && JSONL_EXT.test(leaf)) {
    return { kind: "groupChat", leaf: leaf.replace(JSONL_EXT, "") };
  }
  if ((top === USER_AVATARS_DIR || top === WORLDS_DIR) && leaf !== undefined) {
    return { kind: "shared" };
  }
  return { kind: "base" };
}

function roleOf(f: PlannedFile, caps: TreeImportCaps): FileRole {
  const [top, second, ...tail] = f.segments;
  if (top === undefined) {
    return { kind: "base" };
  }
  if (isStSecretsFile(f.path)) {
    return { kind: "skip", reason: ST_PROFILE_SECRETS_REASON };
  }
  const disposition = stProfileEntryDisposition(top, second !== undefined);
  if (!disposition.handled) {
    return { kind: "skip", reason: disposition.reason ?? UNHANDLED_FALLBACK };
  }
  if (f.file.size > caps.fileBytes) {
    return { kind: "skip", reason: OVER_FILE_CAP_REASON };
  }
  if (top === ST_SETTINGS_FILE && second === undefined) {
    return { kind: "shared" };
  }
  return planeRole(top, second, tail);
}

interface StClassification {
  readonly base: PlannedFile[];
  readonly bundles: Map<string, Bundle>;
  readonly groupFiles: PlannedFile[];
  readonly groupChats: Map<string, PlannedFile>;
  /** Each profile's `settings.json`, persona avatars and world books; every one rides in every upload. */
  readonly shared: PlannedFile[];
  readonly skipped: SkippedTreeFile[];
}

function bundleFor(bundles: Map<string, Bundle>, key: string): Bundle {
  const existing = bundles.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const fresh: Bundle = { cards: [], chats: [] };
  bundles.set(key, fresh);
  return fresh;
}

/** Sort each picked file into the base upload, a card bundle, a group, or the skip list. */
function classifySt(planned: readonly PlannedFile[], caps: TreeImportCaps): StClassification {
  const out: StClassification = { base: [], bundles: new Map(), groupFiles: [], groupChats: new Map(), shared: [], skipped: [] };
  const chatDirs: { file: PlannedFile; dirName: string }[] = [];
  for (const f of planned) {
    const role = roleOf(f, caps);
    switch (role.kind) {
      case "skip":
        out.skipped.push({ path: f.path, reason: role.reason });
        break;
      case "shared":
        out.shared.push(f);
        break;
      case "card":
        bundleFor(out.bundles, role.key).cards.push(f);
        break;
      case "chat":
        chatDirs.push({ file: f, dirName: role.dirName });
        break;
      case "group":
        out.groupFiles.push(f);
        break;
      case "groupChat":
        out.groupChats.set(role.leaf, f);
        break;
      case "base":
        out.base.push(f);
        break;
    }
  }
  const cardKeys = new Set([...out.bundles].filter(([, b]) => b.cards.length > 0).map(([key]) => key));
  for (const { file, dirName } of chatDirs) {
    const key = bundleKeyForChatDir(dirName, cardKeys);
    // An orphan chat directory: the server mints a placeholder from it, so it travels with the base upload.
    (key === null ? out.base : bundleFor(out.bundles, key).chats).push(file);
  }
  return out;
}

async function groupUnits(
  classified: StClassification,
  readText: (file: File) => Promise<string>,
): Promise<{ readonly groups: GroupUnit[]; readonly unclaimedGroupChats: PlannedFile[] }> {
  const claimed = new Set<string>();
  const groups: GroupUnit[] = [];
  for (const definition of classified.groupFiles) {
    const shape = await readGroupShape(definition.file, readText);
    const chats: PlannedFile[] = [];
    for (const leaf of shape.chats) {
      const chat = classified.groupChats.get(leaf);
      if (chat !== undefined && !claimed.has(leaf)) {
        claimed.add(leaf);
        chats.push(chat);
      }
    }
    groups.push({ definition, memberKeys: shape.members.map((m) => slugifyHandle(m.replace(PNG_EXT, ""))), chats });
  }
  const unclaimedGroupChats = [...classified.groupChats].filter(([leaf]) => !claimed.has(leaf)).map(([, file]) => file);
  return { groups, unclaimedGroupChats };
}

/** Plan a picked folder's uploads against the served caps, charging each upload `framing` on top of its file
 *  bytes. `readText` reads a group definition's text (the default is `File.text`); it is injectable so a node
 *  test can plan without a DOM `File`.
 *  @throws Error when the folder has no supported layout, or the caps leave no room for any file. */
export async function planTreeImport(
  files: readonly File[],
  caps: TreeImportCaps,
  framing: TreeUploadFraming = NO_FRAMING,
  readText: (file: File) => Promise<string> = (f) => f.text(),
): Promise<TreeImportPlan> {
  const rawPaths = files.map(relativePathOf);
  const wrapper = commonWrapper(rawPaths);
  const planned: PlannedFile[] = files.map((file, i) => {
    const raw = rawPaths[i] ?? file.name;
    const path = wrapper === null ? raw : raw.slice(wrapper.length + 1);
    return { file, path, segments: path.split("/") };
  });
  const layout = admitTreeBatch(
    planned.map((f) => f.path),
    null,
  );
  if (layout.kind === "reject") {
    throw new Error("The selected folder does not contain an unambiguous supported library layout");
  }
  if (layout.kind === "orb") {
    return planGeneric(planned, caps, framing);
  }
  const inProfile = layout.stagePrefix === "" ? planned.map((f) => ({ ...f, segments: f.segments.slice(1) })) : planned;
  const classified = classifySt(inProfile, caps);
  const { groups, unclaimedGroupChats } = await groupUnits(classified, readText);

  const packer = packerFor(caps, framing, classified.shared);
  // Base plane first: presets, themes, backgrounds, orphan chats, unclaimed group chats.
  for (const f of [...classified.base, ...unclaimedGroupChats]) {
    packer.add([], [f]);
  }
  // Character bundles, cards first so a split never strands a chat dir without its card.
  for (const [, bundle] of [...classified.bundles].sort(([a], [b]) => a.localeCompare(b))) {
    packer.add(bundle.cards, bundle.chats);
  }
  // Groups last, with their member cards repeated (a card dedups by content, so a repeat costs bytes only).
  for (const group of groups) {
    const members = group.memberKeys.flatMap((key) => classified.bundles.get(key)?.cards ?? []);
    packer.add([group.definition, ...members], group.chats);
  }
  return { ...finishPlan(packer, classified.skipped), layout: null };
}

/** Every file the plan's uploads carry, once each (settings.json and the avatars repeat across batches). The
 *  persona review reads this, not the raw pick, so it sees the same art the import will write. */
export function plannedFiles(plan: TreeImportPlan): readonly File[] {
  return [...new Set(plan.batches.flat())];
}

/** The reasons the plan skipped files, grouped with a count each — the preflight's and the summary's lines. */
export function skippedByReason(skipped: readonly SkippedTreeFile[]): readonly { readonly reason: string; readonly files: number }[] {
  const counts = new Map<string, number>();
  for (const { reason } of skipped) {
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts].map(([reason, files]) => ({ reason, files }));
}
