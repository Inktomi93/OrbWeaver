import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { FileSystemHost } from "ts-morph";
import { readAuthoredRepositoryInventory } from "../compiler/authored-repository.ts";
import type { CompilerProgram } from "../compiler/compiler-programs-contract.ts";
import type { InventoryInput, InventoryInputContext, InventoryOverlay } from "./semantic-inventory-contract.ts";

/** Authorship follows physical identity, but unrelated roster entries are not native filesystem dependencies. */
export function inventoryAuthoredFiles(root: string, overlay?: InventoryOverlay): ReadonlySet<string> {
  return new Set(
    [...readAuthoredRepositoryInventory(root).paths, ...(overlay?.files.map((file) => file.path) ?? [])].map((path) =>
      canonicalInventoryPath(resolve(root, path)),
    ),
  );
}

/** Version bytes by content rather than timestamps. */
export function contentVersion(text: string | Buffer): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Native options, roots, references and inherited config paths form one descriptor identity. */
export function descriptorVersion(program: CompilerProgram): string {
  return contentVersion(JSON.stringify([program.id, program.files, program.references, program.configPaths, program.commandLine.options]));
}

/** Content and physical identity versions include successful and failed native resolution inputs. */
export function inputVersion(
  ...[path, kind, context]:
    | [path: string, kind: Exclude<InventoryInput["kind"], "authored">, fileSystem?: FileSystemHost | undefined]
    | [path: string, kind: "authored", authored: ReadonlySet<string>]
): string {
  return kind === "authored" ? String(context.has(path)) : VERSION_READERS[kind](path, context);
}

function existenceVersion(path: string, fileSystem?: FileSystemHost): string {
  const present = fileSystem?.fileExistsSync(path) ?? (existsSync(path) && statSync(path).isFile());
  return present ? `true:${fileSystem?.realpathSync(path) ?? realpathSync(path)}` : "false";
}

function fileVersion(path: string, fileSystem?: FileSystemHost): string {
  const present = fileSystem?.fileExistsSync(path) ?? existsSync(path);
  if (!present) {
    return "missing";
  }
  const text = fileSystem === undefined ? readFileSync(path) : fileSystem.readFileSync(path);
  return contentVersion(`${fileSystem?.realpathSync(path) ?? realpathSync(path)}\0${contentVersion(text)}`);
}

function directoryVersion(path: string, fileSystem?: FileSystemHost): string {
  const present = fileSystem?.directoryExistsSync(path) ?? (existsSync(path) && statSync(path).isDirectory());
  if (!present) {
    return "missing";
  }
  const entries = fileSystem === undefined ? readdirSync(path) : fileSystem.readDirSync(path).map((entry) => basename(entry.name));
  return contentVersion(JSON.stringify([fileSystem?.realpathSync(path) ?? realpathSync(path), entries.toSorted()]));
}

const VERSION_READERS = { file: fileVersion, directory: directoryVersion, exists: existenceVersion } satisfies Record<
  Exclude<InventoryInput["kind"], "authored">,
  (path: string, fileSystem?: FileSystemHost) => string
>;

/** A failed lookup becomes stale when its candidate or containing directory changes. */
export function inputsCurrent(inputs: Iterable<InventoryInput>, context: InventoryInputContext): boolean {
  for (const input of inputs) {
    const version =
      input.kind === "authored" ? inputVersion(input.path, input.kind, context.authored) : inputVersion(input.path, input.kind, context.fileSystem);
    if (version !== input.version) {
      return false;
    }
  }
  return true;
}

/** Preserve physical identity for existing paths and absolute identity for missing candidates. */
export function canonicalInventoryPath(path: string): string {
  return existsSync(path) ? realpathSync(path) : resolve(path);
}
