// data/import-tree-plan — the folder-import upload PLAN: what a picked SillyTavern folder sends, skips and
// splits before any request. THE PLAN IS THE POINT. The server refuses a whole upload over its caps, and a
// long-lived ST folder carries planes the importer never reads (vectors, extension installs, text-completion
// presets, backups) beside the ones it does. So the browser skips what the server would only report, drops a
// file over the per-file cap with its reason, and splits the rest into uploads under the total cap — each a
// complete import on its own: a card travels with its chats, a group with its member cards and transcripts,
// and the planes other planes resolve against by name ride in every upload: `settings.json` (personas,
// tags), the persona avatars (art is persona identity, so an art-less repeat would mint a twin) and the
// world books (a card's name-link binds the book its own run landed). `secrets.json` is
// never sent: the plan skips it, and `importTree` drops it regardless of its caller. Every other picked file
// is sent or listed in `skipped` with its reason; a slug collision (two cards whose names slug alike) sends
// both and the server disambiguates, as it does for a folder uploaded whole.

import type { StProfileHandledEntry } from "@orb/contracts/import";
import { chatDirCardCandidates, isStSecretsFile, ST_SECRETS_FILE, ST_SETTINGS_FILE, stProfileEntryDisposition } from "@orb/contracts/import";
import { slugifyHandle } from "@orb/kit/slug";
import { relativePathOf } from "./import-tree.ts";

/** The served folder-import caps the plan packs against (`UploadCaps.importTree*`). */
export interface TreeImportCaps {
  readonly totalBytes: number;
  readonly fileBytes: number;
  readonly files: number;
}

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

/** The reason a file over the per-file cap is left out. */
export const OVER_FILE_CAP_REASON = "over the per-file size cap";
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
  // @orb-waive caught-failure-ownership(catch): a group file the browser cannot read as JSON is still sent;
  // the server records it as unreadable. The plan only loses the member pairing for it.
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

const PROFILE_MARKERS: ReadonlySet<string> = new Set([ST_SETTINGS_FILE, CHARACTERS_DIR, CHATS_DIR, USER_AVATARS_DIR]);

/** How many leading segments name the profile dir: 0 when the picked folder IS a profile, 1 when it holds
 *  profile subdirs (the `data/` root), null when the tree is not SillyTavern-shaped. */
function profileDepth(paths: readonly string[]): 0 | 1 | null {
  const top = new Set(paths.map((p) => p.split("/")[0] ?? ""));
  if ([...top].some((name) => PROFILE_MARKERS.has(name))) {
    return 0;
  }
  const second = new Set(paths.map((p) => p.split("/")[1] ?? ""));
  return [...second].some((name) => PROFILE_MARKERS.has(name)) ? 1 : null;
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

/** Greedy packing of units (each a file list) under the caps, `always` riding in every upload. A unit that
 *  does not fit beside others starts a fresh upload; a unit over the cap on its own is split at file
 *  boundaries with its `repeat` files (a card, a group's definition and members) carried into each part. */
class Packer {
  readonly batches: File[][] = [];
  private readonly caps: TreeImportCaps;
  private readonly always: readonly PlannedFile[];
  private readonly alwaysBytes: number;
  private current: PlannedFile[] = [];
  private currentBytes = 0;
  private inCurrent = new Set<PlannedFile>();

  constructor(caps: TreeImportCaps, always: readonly PlannedFile[]) {
    this.caps = caps;
    this.always = always;
    this.alwaysBytes = always.reduce((n, f) => n + f.file.size, 0);
  }

  private fits(extraBytes: number, extraFiles: number): boolean {
    return this.currentBytes + extraBytes <= this.caps.totalBytes && this.current.length + extraFiles <= this.caps.files;
  }

  private open(): void {
    this.current = [...this.always];
    this.inCurrent = new Set(this.always);
    this.currentBytes = this.alwaysBytes;
  }

  private flush(): void {
    if (this.current.length > this.always.length) {
      this.batches.push(this.current.map((f) => f.file));
    }
    this.current = [];
    this.inCurrent = new Set();
    this.currentBytes = 0;
  }

  /** Append the files not already in this upload — a group's member card repeats a bundle's card. */
  private push(files: readonly PlannedFile[]): void {
    for (const f of files) {
      if (!this.inCurrent.has(f)) {
        this.inCurrent.add(f);
        this.current.push(f);
        this.currentBytes += f.file.size;
      }
    }
  }

  /** Add one unit; `repeat` is the part of it every split must carry. */
  add(repeat: readonly PlannedFile[], rest: readonly PlannedFile[]): void {
    const unit = [...repeat, ...rest];
    const bytes = unit.reduce((n, f) => n + f.file.size, 0);
    if (this.current.length === 0) {
      this.open();
    }
    if (this.fits(bytes, unit.length)) {
      this.push(unit);
      return;
    }
    this.flush();
    this.open();
    if (this.fits(bytes, unit.length)) {
      this.push(unit);
      return;
    }
    // Over the cap on its own: split `rest` across uploads, each carrying `repeat`.
    this.push(repeat);
    for (const file of rest) {
      if (!this.fits(file.file.size, 1)) {
        this.flush();
        this.open();
        this.push(repeat);
      }
      this.push([file]);
    }
  }

  finish(): File[][] {
    this.flush();
    return this.batches;
  }
}

/** A non-SillyTavern tree (an unzipped orb backup): every file imports on its own, so the plan is a plain
 *  greedy split in path order with nothing skipped but an over-cap file. */
function planGeneric(planned: readonly PlannedFile[], caps: TreeImportCaps): TreeImportPlan {
  const skipped: SkippedTreeFile[] = [];
  const packer = new Packer(caps, []);
  let files = 0;
  let bytes = 0;
  for (const f of planned) {
    if (f.file.size > caps.fileBytes) {
      skipped.push({ path: f.path, reason: OVER_FILE_CAP_REASON });
      continue;
    }
    packer.add([], [f]);
    files += 1;
    bytes += f.file.size;
  }
  return { batches: packer.finish(), skipped, files, bytes };
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

/** Plan a picked folder's uploads against the served caps. `readText` reads a group definition's text (the
 *  default is `File.text`); it is injectable so a node test can plan without a DOM `File`. */
export async function planTreeImport(
  files: readonly File[],
  caps: TreeImportCaps,
  readText: (file: File) => Promise<string> = (f) => f.text(),
): Promise<TreeImportPlan> {
  const rawPaths = files.map(relativePathOf);
  const wrapper = commonWrapper(rawPaths);
  const planned: PlannedFile[] = files.map((file, i) => {
    const raw = rawPaths[i] ?? file.name;
    const path = wrapper === null ? raw : raw.slice(wrapper.length + 1);
    return { file, path, segments: path.split("/") };
  });
  const depth = profileDepth(planned.map((f) => f.path));
  if (depth === null) {
    return planGeneric(planned, caps);
  }
  const inProfile = depth === 0 ? planned : planned.map((f) => ({ ...f, segments: f.segments.slice(1) }));
  const classified = classifySt(inProfile, caps);
  const { groups, unclaimedGroupChats } = await groupUnits(classified, readText);

  const always = classified.shared;
  const packer = new Packer(caps, always);
  const counted = new Set<PlannedFile>(always);

  // Base plane first: presets, themes, backgrounds, orphan chats, unclaimed group chats.
  for (const f of [...classified.base, ...unclaimedGroupChats]) {
    packer.add([], [f]);
    counted.add(f);
  }
  // Character bundles, cards first so a split never strands a chat dir without its card.
  for (const [, bundle] of [...classified.bundles].sort(([a], [b]) => a.localeCompare(b))) {
    packer.add(bundle.cards, bundle.chats);
    for (const f of [...bundle.cards, ...bundle.chats]) {
      counted.add(f);
    }
  }
  // Groups last, with their member cards repeated (a card dedups by content, so a repeat costs bytes only).
  for (const group of groups) {
    const members = group.memberKeys.flatMap((key) => classified.bundles.get(key)?.cards ?? []);
    packer.add([group.definition, ...members], group.chats);
    for (const f of [group.definition, ...group.chats]) {
      counted.add(f);
    }
  }

  let bytes = 0;
  for (const f of counted) {
    bytes += f.file.size;
  }
  return { batches: packer.finish(), skipped: classified.skipped, files: counted.size, bytes };
}

/** The reasons the plan skipped files, grouped with a count each — the preflight's and the summary's lines. */
export function skippedByReason(skipped: readonly SkippedTreeFile[]): readonly { readonly reason: string; readonly files: number }[] {
  const counts = new Map<string, number>();
  for (const { reason } of skipped) {
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts].map(([reason, files]) => ({ reason, files }));
}
