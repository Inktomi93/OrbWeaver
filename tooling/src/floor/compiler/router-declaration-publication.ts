import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import type { InventoryInput } from "../code-facts/semantic-inventory-contract.ts";
import { contentVersion, inputsCurrent, inputVersion } from "../code-facts/semantic-inventory-inputs.ts";
import type { RouterDeclarationPreparation, RouterDeclarationPublication } from "./router-declarations-contract.ts";

function familyContents(directory: string): readonly (readonly [string, string])[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => !entry.isDirectory())
    .map((entry) => {
      const path = join(entry.parentPath, entry.name);
      return [relative(directory, path).replaceAll("\\", "/"), readFileSync(path, "utf8")] as const;
    })
    .toSorted(([left], [right]) => {
      if (left === right) {
        return 0;
      }
      return left < right ? -1 : 1;
    });
}

function familyMatches(directory: string, contents: string): boolean {
  return existsSync(directory) && JSON.stringify(familyContents(directory)) === contents;
}

/** Publish one complete immutable native family; only the single forwarding file is replaceable. */
export function publishRouterDeclarations({
  output,
  staging,
  ambientPaths,
  declarations,
  inputs,
  assertInputsCurrent,
}: RouterDeclarationPublication): RouterDeclarationPreparation {
  const contents = JSON.stringify(familyContents(staging));
  const digest = contentVersion(contents);
  const canonical = join(output, "generations", digest);
  // A damaged historical family must never be repaired under a reader; publish a different immutable path.
  let generation = canonical;
  while (existsSync(generation) && !familyMatches(generation, contents)) {
    generation = `${canonical}-${contentVersion(JSON.stringify([generation, familyContents(generation)]))}`;
  }
  assertInputsCurrent();
  if (!familyMatches(generation, contents)) {
    try {
      renameSync(staging, generation);
    } catch (error) {
      // Only a concurrently completed, byte-identical family can replace this producer's successful rename.
      if (!familyMatches(generation, contents)) {
        throw error;
      }
    }
  }
  const emittedEntry = join(generation, "packages/server/src/index.d.ts");
  if (!existsSync(emittedEntry)) {
    throw new Error("Native server declarations did not emit the AppRouter entry.");
  }
  const outputInputs: InventoryInput[] = [
    { path: generation, kind: "directory", version: inputVersion(generation, "directory") },
    ...readdirSync(generation, { recursive: true, withFileTypes: true }).map((item): InventoryInput => {
      const path = join(item.parentPath, item.name);
      const kind = item.isDirectory() ? "directory" : "file";
      return { path, kind, version: inputVersion(path, kind) };
    }),
  ];
  const entry = join(output, "index.d.ts");
  const references = ambientPaths
    .map((path) => {
      const staged = relative(staging, path);
      const target = !(staged.startsWith("..") || isAbsolute(staged)) ? join(generation, staged) : path;
      return `/// <reference path=${JSON.stringify(relative(output, target).replaceAll("\\", "/"))} />`;
    })
    .toSorted();
  const text = `${references.join("\n")}\nexport type { AppRouter } from ${JSON.stringify(`./${relative(output, emittedEntry).replaceAll("\\", "/")}`)};\n`;
  const forwarding = join(output, `.entry-${randomUUID()}.d.ts`);
  try {
    writeFileSync(forwarding, text, { flag: "wx" });
    assertInputsCurrent();
    if (!inputsCurrent(outputInputs, { authored: new Set() })) {
      throw new Error("Router declaration family changed before publication.");
    }
    if (!existsSync(entry) || readFileSync(entry, "utf8") !== text) {
      renameSync(forwarding, entry);
    }
    const entryVersion = inputVersion(entry, "file");
    const assertSubjectCurrent = (): void => {
      assertInputsCurrent();
      if (inputVersion(entry, "file") !== entryVersion || readFileSync(entry, "utf8") !== text || !inputsCurrent(outputInputs, { authored: new Set() })) {
        throw new Error("Router declaration entry or immutable family changed; no current verdict is available.");
      }
    };
    assertSubjectCurrent();
    return {
      entry,
      generation,
      declarations,
      inputs: [...inputs, ...outputInputs, { path: entry, kind: "file", version: entryVersion }],
      assertSubjectCurrent,
    };
  } finally {
    rmSync(forwarding, { force: true });
  }
}
