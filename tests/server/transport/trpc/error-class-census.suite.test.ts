// Every error class the public doors of @orb/contracts and @orb/kit export reaches a route as a modeled answer.
// A class that extends plain Error is invisible to the classifier, so a route that lets one escape answers a server error.
// @subject packages/server/src/transport/trpc/error-mapping.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DomainConflictError } from "@orb/kit/errors";
import { classifyDomainError } from "@orb/server/transport/trpc";
import { expect, test } from "@orb/testkit/node";
import { z } from "zod";

type ErrorClass = abstract new (...args: never[]) => Error;

const CENSUSED_PACKAGES = ["contracts", "kit"] as const;
const manifestSchema = z.object({ exports: z.record(z.string(), z.unknown()) });

function isErrorClass(value: unknown): value is ErrorClass {
  return typeof value === "function" && value.prototype instanceof Error;
}

/** Every Error subclass exported by any public subpath of the two packages, once per class however many doors re-export it. */
async function exportedErrorClasses(): Promise<ReadonlyMap<ErrorClass, string>> {
  const classes = new Map<ErrorClass, string>();
  for (const pkg of CENSUSED_PACKAGES) {
    const manifest = manifestSchema.parse(JSON.parse(readFileSync(join(import.meta.dirname, `../../../../packages/${pkg}/package.json`), "utf8")));
    for (const subpath of Object.keys(manifest.exports)) {
      const specifier = subpath === "." ? `@orb/${pkg}` : `@orb/${pkg}/${subpath.slice("./".length)}`;
      const exports = z.record(z.string(), z.unknown()).parse(await import(specifier));
      for (const [name, value] of Object.entries(exports)) {
        if (isErrorClass(value) && !classes.has(value)) {
          classes.set(value, `${specifier}#${name}`);
        }
      }
    }
  }
  return classes;
}

/** A class another census member extends is a base: its subclasses carry the classification, so only its leaves are judged. */
function leaves(classes: ReadonlyMap<ErrorClass, string>): readonly (readonly [ErrorClass, string])[] {
  return [...classes].filter(([candidate]) => ![...classes.keys()].some((other) => other.prototype instanceof candidate));
}

/**
 * The classifier keys on the class a throw is an instance of, not on how it was constructed, and constructors take
 * different arguments, so each leaf is judged as a bare instance of its prototype.
 */
function unclassified(classes: ReadonlyMap<ErrorClass, string>): readonly string[] {
  return leaves(classes)
    .filter(([cls]) => {
      const mapped = classifyDomainError(Object.create(cls.prototype));
      return mapped === null || mapped.code === "INTERNAL_SERVER_ERROR";
    })
    .map(([, label]) => label);
}

test("every error class the contracts and kit doors export is classified to a modeled answer", async () => {
  const classes = await exportedErrorClasses();
  expect(classes.size).toBeGreaterThan(0);
  expect(unclassified(classes)).toEqual([]);
}, 60_000);

test("a plain Error subclass is reported, a domain-tree subclass is not, and a base is judged through its leaves", () => {
  class LooseFaultError extends Error {}
  class LooseBaseError extends Error {}
  class LooseLeafError extends LooseBaseError {}
  class ModeledConflictError extends DomainConflictError {}
  const classes = new Map<ErrorClass, string>([
    [LooseFaultError, "loose"],
    [LooseBaseError, "base"],
    [LooseLeafError, "leaf"],
    [ModeledConflictError, "modeled"],
  ]);
  expect(unclassified(classes)).toEqual(["loose", "leaf"]);
});
