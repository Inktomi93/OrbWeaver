// Gate: server-layout (Core-0-Architecture-and-Structure.md §3). The server source root is the closed
// six-tier architecture plus index.ts. This is a semantic vocabulary, not an exemption or count ratchet;
// ResourceHost derives the live entries and package metadata anchors missing-tier findings.
import { defineGate } from "../contract/policy.ts";
import type { ResourceTreeEntry } from "../contract/resource.ts";

const SERVER_SOURCE = "packages/server/src";
const SERVER_MANIFEST = "packages/server/package.json";
const REQUIRED_TIERS = ["entry", "transport", "domain", "infra", "foundation", "kit"] as const;
const LEGAL_ENTRIES = new Set<string>([...REQUIRED_TIERS, "index.ts"]);
const MESSAGE =
  "an illegal or missing top-level entry at packages/server/src/ — the server root is exactly entry/transport/domain/infra/foundation/kit plus index.ts (Core-0-Architecture-and-Structure.md §3).";

function topEntry(entry: ResourceTreeEntry): string | undefined {
  if (!entry.path.startsWith(`${SERVER_SOURCE}/`)) {
    return;
  }
  const relative = entry.path.slice(SERVER_SOURCE.length + 1);
  return relative.length > 0 && !relative.includes("/") ? relative : undefined;
}

export const gate = defineGate({
  id: "server-layout",
  family: "server-layout",
  authority: "hard",
  severity: "error",
  population: { of: "none", why: "server root structure is a closed ResourceHost tree fact" },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [
    { kind: "authored-tree", id: "server" },
    { kind: "package-metadata", id: "server" },
  ],
  message: MESSAGE,
  fix: "move an illegal entry into its tier, or amend the architecture and this closed tier vocabulary together when a tier is deliberately added or removed.",
  create: (ctx) => ({
    evaluate: () => {
      const tree = ctx.resources.authoredTree("server");
      const metadata = ctx.resources.packageMetadata("server");
      if (tree.status !== "ready" || metadata.status !== "ready") {
        return;
      }
      const entries = tree.value
        .map(topEntry)
        .filter((value): value is string => value !== undefined)
        .toSorted();
      const present = new Set(entries);
      for (const entry of entries) {
        if (!LEGAL_ENTRIES.has(entry)) {
          ctx.report.file(`${SERVER_SOURCE}/${entry}`, { line: 1, column: 1, message: `illegal top-level entry ${JSON.stringify(entry)}.` });
        }
      }
      for (const entry of LEGAL_ENTRIES) {
        if (!present.has(entry)) {
          ctx.report.file(SERVER_MANIFEST, {
            line: 1,
            column: 1,
            message: `${JSON.stringify(entry)} is required by the closed server-root architecture but is missing.`,
          });
        }
      }
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: {
        "packages/server/package.json": '{"name":"@orb/server","private":true}',
        "packages/server/src/stray.ts": "export const x = 1;\n",
      },
      expect: { messageIncludes: "illegal top-level entry" },
      why: "a stray server-root file is outside the six tiers plus index.ts",
    },
    {
      mode: "resource",
      files: {
        "packages/server/package.json": '{"name":"@orb/server","private":true}',
        "packages/server/src/index.ts": "export const x = 1;\n",
        "packages/server/src/entry/x.ts": "export const x = 1;\n",
        "packages/server/src/transport/x.ts": "export const x = 1;\n",
        "packages/server/src/domain/x.ts": "export const x = 1;\n",
        "packages/server/src/infra/x.ts": "export const x = 1;\n",
        "packages/server/src/foundation/x.ts": "export const x = 1;\n",
      },
      expect: { count: 1, messageIncludes: '"kit" is required' },
      why: "a named tier missing from the live tree is a structural mismatch",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        "packages/server/package.json": '{"name":"@orb/server","private":true}',
        "packages/server/src/index.ts": "export const x = 1;\n",
        "packages/server/src/entry/x.ts": "export const x = 1;\n",
        "packages/server/src/transport/x.ts": "export const x = 1;\n",
        "packages/server/src/domain/x.ts": "export const x = 1;\n",
        "packages/server/src/infra/x.ts": "export const x = 1;\n",
        "packages/server/src/foundation/x.ts": "export const x = 1;\n",
        "packages/server/src/kit/x.ts": "export const x = 1;\n",
      },
      why: "every required tier and index.ts is present with no extra root entry",
    },
  ],
});
