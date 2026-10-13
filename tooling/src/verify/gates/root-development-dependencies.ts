// The private repository root is never production-installed; runtime dependencies belong to their package.
// Singleton: this policy judges root manifest ownership, not verification command membership.
import { defineGate } from "../contract/policy.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const MANIFEST = "package.json";
const MESSAGE =
  "the private repository root declares a runtime dependency but is never production-installed. Move it to devDependencies, or to the workspace package that imports it (Core-Tooling-Law.md).";

export const gate = defineGate({
  id: "root-development-dependencies",
  application: "implementation",
  family: "root-development-dependencies",
  authority: "hard",
  severity: "error",
  population: { of: "none", why: "the root manifest is a closed ResourceHost package-metadata fact" },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "package-metadata", id: "root" }],
  message: MESSAGE,
  fix: "Move script and tooling dependencies to devDependencies; declare application dependencies in the package that imports them.",
  create: (ctx) => ({
    evaluate: () => {
      const manifest = readyResourceValue(ctx.resources.packageMetadata("root"));
      for (const name of Object.keys(manifest.dependencies.runtime)) {
        ctx.report.file(MANIFEST, { line: 1, column: 1, message: `${MESSAGE} Dependency: ${name}.` });
      }
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: { [MANIFEST]: JSON.stringify({ name: "orbweaver", private: true, dependencies: { tsx: "^4.0.0" } }) },
      expect: { count: 1, messageIncludes: "Dependency: tsx." },
      why: "a runtime dependency on the private repository root has no production installation owner",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: { [MANIFEST]: JSON.stringify({ name: "orbweaver", private: true, devDependencies: { tsx: "^4.0.0" } }) },
      why: "script dependencies belong in devDependencies and create no runtime dependency finding",
    },
    {
      mode: "resource",
      files: { [MANIFEST]: JSON.stringify({ name: "orbweaver", private: true }) },
      why: "an absent runtime dependency map is empty rather than a missing-resource refusal",
    },
  ],
});
