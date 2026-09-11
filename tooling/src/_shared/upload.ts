// The ONE browser file-action engine. `snap --upload`, `snap --drop-files`, and design-audit's upload
// action share the same path boundary, target semantics, and receipts; a tool-specific copy would let
// one browser attach a directory while another silently treated the same selector as a plain file input.
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import process from "node:process";
import type { Locator } from "@playwright/test";
import { REPO_ROOT } from "./artifacts.ts";

export type FileActionKind = "upload" | "drop-files";
const FILE_ACTION_FEEDERS = ["input", "filechooser", "datatransfer"] as const;
export type FileActionFeeder = (typeof FILE_ACTION_FEEDERS)[number];

export interface FileActionFileIdentity {
  readonly name: string;
  readonly relativePath: string;
  readonly bytes: number;
}

export interface FileActionReceipt {
  readonly kind: FileActionKind;
  readonly feeder: FileActionFeeder;
  readonly selector: string;
  readonly roots: number;
  readonly files: number;
  readonly directory: boolean;
  readonly identities: readonly FileActionFileIdentity[];
}

interface ResolvedFileRoot {
  readonly absPath: string;
  readonly kind: "file" | "directory";
  readonly files: readonly FileActionFileIdentity[];
}

export type UploadPathResolution =
  | { readonly ok: true; readonly paths: readonly string[]; readonly roots: readonly ResolvedFileRoot[]; readonly files: readonly FileActionFileIdentity[] }
  | { readonly ok: false; readonly reason: string };

const BOUNDARY_ROOTS = [realpathSync(REPO_ROOT), realpathSync(tmpdir())] as const;
const RECEIPT_IDENTITY_CAP = 8;

/** THE PATH BOUNDARY: browser file actions can read fixtures from the repo or the OS scratch root, not
 * arbitrary operator files. `realpathSync` closes the symlink escape that a lexical prefix check leaves. */
function withinUploadBoundary(absPath: string): boolean {
  return BOUNDARY_ROOTS.some((root) => absPath === root || absPath.startsWith(`${root}${sep}`));
}

function slash(path: string): string {
  return path.split(sep).join("/");
}

function directoryFiles(root: string): readonly FileActionFileIdentity[] {
  const files: FileActionFileIdentity[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const candidate = join(dir, entry.name);
      const real = realpathSync(candidate);
      if (!withinUploadBoundary(real)) {
        throw new Error(`--upload directory entry escaped the repo/scratchpad boundary: ${candidate} -> ${real}`);
      }
      if (entry.isDirectory()) {
        visit(candidate);
      } else if (entry.isFile()) {
        files.push({ name: entry.name, relativePath: slash(join(basename(root), relative(root, candidate))), bytes: statSync(candidate).size });
      } else {
        throw new Error(`--upload directory contains an unsupported entry (only regular files/directories are accepted): ${candidate}`);
      }
    }
  };
  visit(root);
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function actionFlag(kind: FileActionKind): string {
  return kind === "upload" ? "--upload" : "--drop-files";
}

function directoryRoot(absPath: string, kind: FileActionKind): ResolvedFileRoot {
  if (kind === "drop-files") {
    throw new Error(`--drop-files accepts regular files, not directories: ${absPath} (use --upload on a webkitdirectory picker)`);
  }
  const files = directoryFiles(absPath);
  if (files.length === 0) {
    throw new Error(`--upload directory contains no regular files: ${absPath}`);
  }
  return { absPath, kind: "directory", files };
}

function resolveFileRoot(value: string, kind: FileActionKind): ResolvedFileRoot {
  const lexical = isAbsolute(value) ? value : resolve(process.cwd(), value);
  if (!existsSync(lexical)) {
    throw new Error(`${actionFlag(kind)} no such file: ${lexical}`);
  }
  const absPath = realpathSync(lexical);
  if (!withinUploadBoundary(absPath)) {
    throw new Error(`${actionFlag(kind)} path outside the repo/scratchpad boundary: ${absPath} (allowed roots: ${BOUNDARY_ROOTS.join(", ")})`);
  }
  const stat = statSync(absPath);
  if (stat.isDirectory()) {
    return directoryRoot(absPath, kind);
  }
  if (!stat.isFile()) {
    throw new Error(`${actionFlag(kind)} accepts regular files${kind === "upload" ? " or one directory" : ""}: ${absPath}`);
  }
  return { absPath, kind: "file", files: [{ name: basename(absPath), relativePath: basename(absPath), bytes: stat.size }] };
}

/** Resolve against the operator's cwd, then validate the REAL path, its kind, and the complete directory
 * tree before any browser action. The first failure refuses the whole action; partial selections lie. */
export function resolveUploadPaths(raw: readonly string[], kind: FileActionKind = "upload"): UploadPathResolution {
  try {
    const roots = raw.map((value) => resolveFileRoot(value, kind));
    return { ok: true, paths: roots.map((root) => root.absPath), roots, files: roots.flatMap((root) => root.files) };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

interface FileInputFacts {
  readonly directory: boolean;
  readonly multiple: boolean;
}

async function fileInputFacts(input: Locator): Promise<FileInputFacts> {
  return await input.evaluate((element) => {
    const node = element as unknown as { hasAttribute: (name: string) => boolean };
    return {
      directory: node.hasAttribute("webkitdirectory") || node.hasAttribute("directory"),
      multiple: node.hasAttribute("multiple"),
    };
  });
}

/** A direct file input or first descendant. Sibling/label/button triggers deliberately return null so
 * the caller takes the Playwright filechooser arm instead of guessing a DOM association. */
export async function resolveFileInputLocator(loc: Locator): Promise<Locator | null> {
  // @orb-waive caught-failure-ownership(evaluate): this best-effort type probe converts a detached/unreadable target into "not a direct input" and deliberately delegates to the descendant/chooser arms below; those interactions surface the actionable target failure. Ends if this catch stops feeding that fallback or a failure can exit clean without either arm running.
  const direct = await loc
    .evaluate((element) => {
      const node = element as unknown as { tagName: string; getAttribute: (name: string) => string | null };
      return node.tagName === "INPUT" && node.getAttribute("type") === "file";
    })
    .catch(() => false);
  if (direct) {
    return loc;
  }
  const nested = loc.locator('input[type="file"]');
  return (await nested.count()) > 0 ? nested.first() : null;
}

function validateUploadShape(resolved: Extract<UploadPathResolution, { readonly ok: true }>, facts: FileInputFacts): void {
  const directories = resolved.roots.filter((root) => root.kind === "directory");
  if (facts.directory) {
    if (resolved.roots.length !== 1 || directories.length !== 1) {
      throw new Error("webkitdirectory target requires exactly one directory path; individual files and multiple roots are refused");
    }
    return;
  }
  if (directories.length > 0) {
    throw new Error("directory path requires a webkitdirectory target; use the visible folder-picker trigger or its directory input");
  }
  if (!facts.multiple && resolved.roots.length > 1) {
    throw new Error(`single-file target received ${String(resolved.roots.length)} paths; choose one file or target an input with multiple`);
  }
}

function receipt(
  kind: FileActionKind,
  feeder: FileActionFeeder,
  selector: string,
  resolved: Extract<UploadPathResolution, { readonly ok: true }>,
): FileActionReceipt {
  return {
    kind,
    feeder,
    selector,
    roots: resolved.roots.length,
    files: resolved.files.length,
    directory: resolved.roots.some((root) => root.kind === "directory"),
    identities: resolved.files,
  };
}

/** Upload through a direct/descendant input, or click a real trigger and consume the emitted chooser. */
export async function driveFileUpload(target: Locator, selector: string, rawPaths: readonly string[], timeoutMs: number): Promise<FileActionReceipt> {
  const resolved = resolveUploadPaths(rawPaths, "upload");
  if (!resolved.ok) {
    throw new Error(resolved.reason);
  }
  await target.waitFor({ state: "attached", timeout: timeoutMs });
  const input = await resolveFileInputLocator(target);
  if (input !== null) {
    validateUploadShape(resolved, await fileInputFacts(input));
    await input.setInputFiles([...resolved.paths]);
    return receipt("upload", "input", selector, resolved);
  }

  const chooserPromise = target.page().waitForEvent("filechooser", { timeout: timeoutMs });
  try {
    await target.click({ timeout: timeoutMs });
  } catch (error) {
    // @orb-waive caught-failure-ownership(chooserPromise): the target click already failed and is rethrown below; drain the paired chooser promise so its later timeout cannot become an unhandled secondary failure. Ends if the chooser result is consumed here or the click error stops being rethrown.
    await chooserPromise.catch(() => undefined);
    throw error;
  }
  const chooser = await chooserPromise.catch(() => {
    throw new Error(`--upload target ${JSON.stringify(selector)} did not resolve to a file input and did not emit a filechooser within ${String(timeoutMs)}ms`);
  });
  const chooserElement = chooser.element();
  const facts: FileInputFacts = {
    directory: (await chooserElement.getAttribute("webkitdirectory")) !== null || (await chooserElement.getAttribute("directory")) !== null,
    multiple: chooser.isMultiple(),
  };
  validateUploadShape(resolved, facts);
  await chooser.setFiles([...resolved.paths]);
  return receipt("upload", "filechooser", selector, resolved);
}

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".png": "image/png",
  ".txt": "text/plain",
  ".webp": "image/webp",
  ".zip": "application/zip",
};

/** Dispatch dragenter → dragover → drop with a page-owned DataTransfer. This is not setInputFiles in
 * disguise: production FileDropzone reads `event.dataTransfer.files`, the distinct feeder this proves. */
export async function driveFileDrop(target: Locator, selector: string, rawPaths: readonly string[], timeoutMs: number): Promise<FileActionReceipt> {
  const resolved = resolveUploadPaths(rawPaths, "drop-files");
  if (!resolved.ok) {
    throw new Error(resolved.reason);
  }
  await target.waitFor({ state: "visible", timeout: timeoutMs });
  const specs = resolved.roots.map((root) => ({
    name: basename(root.absPath),
    mimeType: MIME_BY_EXTENSION[extname(root.absPath).toLowerCase()] ?? "application/octet-stream",
    base64: readFileSync(root.absPath).toString("base64"),
  }));
  const script = `(() => {
    const transfer = new DataTransfer();
    const specs = ${JSON.stringify(specs)};
    for (const spec of specs) {
      const binary = atob(spec.base64);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      transfer.items.add(new File([bytes], spec.name, { type: spec.mimeType }));
    }
    return transfer;
  })()`;
  const dataTransfer = await target.page().evaluateHandle(script);
  try {
    await target.dispatchEvent("dragenter", { dataTransfer });
    await target.dispatchEvent("dragover", { dataTransfer });
    await target.dispatchEvent("drop", { dataTransfer });
  } finally {
    await dataTransfer.dispose();
  }
  return receipt("drop-files", "datatransfer", selector, resolved);
}

/** Bounded terminal receipt; the full identity list rides `CaptureOutcome.fileActions` into evidence. */
export function fileActionReceiptLine(value: FileActionReceipt): string {
  const visible = value.identities.slice(0, RECEIPT_IDENTITY_CAP).map((file) => file.relativePath);
  const omitted = value.identities.length - visible.length;
  return (
    `FILE ACTION  kind=${value.kind} feeder=${value.feeder} target=${JSON.stringify(value.selector)} roots=${String(value.roots)} files=${String(value.files)} ` +
    `directory=${value.directory ? "yes" : "no"} identities=${JSON.stringify(visible)}${omitted > 0 ? ` omitted=${String(omitted)}` : ""}`
  );
}
