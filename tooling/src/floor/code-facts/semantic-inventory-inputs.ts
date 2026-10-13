import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { FileSystemHost } from "ts-morph";
import type { CompilerProgram } from "../compiler/compiler-programs-contract.ts";
import type { InventoryInput } from "./semantic-inventory-contract.ts";

/** Version bytes by content rather than timestamps. */
export function contentVersion(text: string | Buffer): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Native options, roots, references and inherited config paths form one descriptor identity. */
export function descriptorVersion(program: CompilerProgram): string {
  return contentVersion(JSON.stringify([program.id, program.files, program.references, program.configPaths, program.commandLine.options]));
}

/** Content and physical identity versions include successful and failed native resolution inputs. */
export function inputVersion(path: string, kind: InventoryInput["kind"], fileSystem?: FileSystemHost): string {
  return VERSION_READERS[kind](path, fileSystem);
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
  InventoryInput["kind"],
  (path: string, fileSystem?: FileSystemHost) => string
>;

/** A failed lookup becomes stale when its candidate or containing directory changes. */
export function inputsCurrent(inputs: readonly InventoryInput[], fileSystem?: FileSystemHost): boolean {
  return inputs.every((input) => inputVersion(input.path, input.kind, fileSystem) === input.version);
}

/** Preserve physical identity for existing paths and absolute identity for missing candidates. */
export function canonicalInventoryPath(path: string): string {
  return existsSync(path) ? realpathSync(path) : resolve(path);
}
