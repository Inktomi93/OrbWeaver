import { resolve } from "node:path";
import ts from "typescript";
import type { InventoryInput } from "../code-facts/semantic-inventory-contract.ts";
import { contentVersion, inputsCurrent, inputVersion } from "../code-facts/semantic-inventory-inputs.ts";
import type { RouterDeclarationInputs } from "./router-declarations-contract.ts";

/** Observe the native compiler's subject inputs without replacing its filesystem or resolver. */
export function routerDeclarationInputs(): RouterDeclarationInputs {
  const inputs = new Map<string, InventoryInput>();
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
      return ts.sys.readFile(path, encoding);
    },
    fileExists: (path) => {
      observe(path, "exists");
      return ts.sys.fileExists(path);
    },
    directoryExists: (path) => {
      observe(path, "directory");
      return ts.sys.directoryExists(path);
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
        !inputsCurrent(inputs.values(), { authored: new Set() }) ||
        [...listings.values()].some((query) => contentVersion(JSON.stringify(query.read())) !== query.version)
      ) {
        throw new Error("Router declaration subject inputs changed; no current verdict is available.");
      }
    },
  };
}
