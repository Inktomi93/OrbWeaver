import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import type { InventoryInput } from "../code-facts/semantic-inventory-contract.ts";
import { contentVersion, inputsCurrent, inputVersion } from "../code-facts/semantic-inventory-inputs.ts";
import type { RouterDeclarationInputs } from "./router-declarations-contract.ts";

const UTF16_BOM_BYTES = 2;
const UTF8_BOM_BYTES = 3;
const UTF16_BE_BOM = 0xfe_ff;
const UTF16_LE_BOM = 0xff_fe;
const UTF8_BOM = 0xef_bb_bf;
const UTF16_ENCODING = "utf16le";

// The native System reader normalizes BOMs; raw InventoryInput versions alone cannot identify its consumed text.
function nativeText(buffer: Buffer): string {
  if (buffer.length >= UTF16_BOM_BYTES && buffer.readUInt16BE(0) === UTF16_BE_BOM) {
    return buffer
      .subarray(0, Math.floor(buffer.length / UTF16_BOM_BYTES) * UTF16_BOM_BYTES)
      .swap16()
      .toString(UTF16_ENCODING, UTF16_BOM_BYTES);
  }
  if (buffer.length >= UTF16_BOM_BYTES && buffer.readUInt16BE(0) === UTF16_LE_BOM) {
    return buffer.toString(UTF16_ENCODING, UTF16_BOM_BYTES);
  }
  return buffer.toString("utf8", buffer.length >= UTF8_BOM_BYTES && buffer.readUIntBE(0, UTF8_BOM_BYTES) === UTF8_BOM ? UTF8_BOM_BYTES : 0);
}

function consumedFile(path: string): { readonly physical: string | undefined; readonly version: string | undefined } {
  if (!existsSync(path)) {
    return { physical: undefined, version: undefined };
  }
  const physical = realpathSync(path);
  return { physical, version: contentVersion(nativeText(readFileSync(physical))) };
}

/** Observe the native compiler's subject inputs without replacing its filesystem or resolver. */
export function routerDeclarationInputs(): RouterDeclarationInputs {
  let changed = false;
  const inputs = new Map<string, InventoryInput>();
  const reads = new Map<string, ReturnType<typeof consumedFile>>();
  const listings = new Map<string, { readonly version: string; readonly read: () => readonly string[] }>();
  const observe = (path: string, kind: Exclude<InventoryInput["kind"], "authored">): void => {
    const absolute = resolve(path);
    const key = `${kind}\0${absolute}`;
    if (!inputs.has(key)) {
      inputs.set(key, { path: absolute, kind, version: inputVersion(absolute, kind) });
    }
  };
  const listing = (key: string, read: () => readonly string[]): string[] => {
    const result = [...read()];
    if (!listings.has(key)) {
      listings.set(key, { version: contentVersion(JSON.stringify(result)), read });
    }
    return result;
  };
  const system: ts.System = {
    ...ts.sys,
    readFile: (path, encoding) => {
      observe(path, "file");
      const physical = existsSync(path) ? realpathSync(path) : undefined;
      const value = ts.sys.readFile(physical ?? path, encoding);
      const consumed = { physical, version: value === undefined ? undefined : contentVersion(value) };
      const current = consumedFile(path);
      const previous = reads.get(path) ?? consumed;
      if (
        current.physical !== consumed.physical ||
        current.version !== consumed.version ||
        previous.physical !== consumed.physical ||
        previous.version !== consumed.version
      ) {
        changed = true;
      }
      if (!reads.has(path)) {
        reads.set(path, consumed);
      }
      return value;
    },
    fileExists: (path) => {
      observe(path, "exists");
      const value = ts.sys.fileExists(path);
      if (value !== (existsSync(path) && statSync(path).isFile())) {
        changed = true;
      }
      return value;
    },
    directoryExists: (path) => {
      observe(path, "directory");
      const value = ts.sys.directoryExists(path);
      if (value !== (existsSync(path) && statSync(path).isDirectory())) {
        changed = true;
      }
      return value;
    },
    getDirectories: (path) => {
      observe(path, "directory");
      return listing(JSON.stringify(["directories", path]), () => ts.sys.getDirectories(path));
    },
    // Native glob expansion hides its internal walk; replay its exact query to catch new ambient roots in previously empty directories.
    readDirectory: (...args) => listing(JSON.stringify(["files", ...args]), () => ts.sys.readDirectory(...args)),
  };
  return {
    system,
    inputs,
    assertCurrent: (): void => {
      if (
        changed ||
        !inputsCurrent(inputs.values(), { authored: new Set() }) ||
        [...reads].some(([path, consumed]) => {
          const current = consumedFile(path);
          return current.physical !== consumed.physical || current.version !== consumed.version;
        }) ||
        [...listings.values()].some((query) => contentVersion(JSON.stringify(query.read())) !== query.version)
      ) {
        throw new Error("Router declaration subject inputs changed; no current verdict is available.");
      }
    },
  };
}
