// Gate: feature-owns-definition (client-architecture-lockdown.md §3/§18 O2). Every feature directory
// owns a registered definition or is deleted. The rule has no exemption; directory identity comes from
// the closed client-feature ResourceHost tree rather than a gate-owned filesystem walk.
// A broken declared resource refuses one phase EARLIER than this module: `resolveResourceDeclarations`
// (`lib/resource-declaration.ts:182`) throws during the POPULATION phase and the receipt phase withholds
// every consumer, both before `create`/`evaluate` (guide §11 ruling 3). So the read goes through
// `readyResourceValue` — a loud assertion that the runtime's refusal held — and never through an in-module
// not-ready branch, which would be unreachable and would model a silent return as the right answer.

import { defineGate } from "../contract/policy.ts";
import type { ResourceTreeEntry } from "../contract/resource.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const FEATURES = "packages/client/src/features";
const DEFINITION_SUFFIXES = ["-section.ts", "-section.tsx", "-modal.ts", "-modal.tsx", "-group.ts", "-group.tsx", "-chrome.ts", "-chrome.tsx"] as const;
const MESSAGE =
  "a features/* dir owns no registered definition — a feature dir must co-locate a lib/*-section.tsx, lib/*-modal.tsx, lib/*-group.tsx, or lib/*-chrome.tsx (client-architecture-lockdown.md §3/§18 O2), or be deleted. No exemptions.";

function featureName(entry: ResourceTreeEntry): string | undefined {
  if (entry.kind !== "directory" || !entry.path.startsWith(`${FEATURES}/`)) {
    return;
  }
  const relative = entry.path.slice(FEATURES.length + 1);
  return relative.length > 0 && !relative.includes("/") ? relative : undefined;
}

function definitionOwner(entry: ResourceTreeEntry): string | undefined {
  if (entry.kind !== "file" || !entry.path.startsWith(`${FEATURES}/`)) {
    return;
  }
  const [feature, slot, file, ...rest] = entry.path.slice(FEATURES.length + 1).split("/");
  return feature !== undefined && slot === "lib" && file !== undefined && rest.length === 0 && DEFINITION_SUFFIXES.some((suffix) => file.endsWith(suffix))
    ? feature
    : undefined;
}

export const gate = defineGate({
  id: "feature-owns-definition",
  family: "feature-owns-definition",
  authority: "hard",
  severity: "error",
  population: { of: "none", why: "feature directory membership is a closed ResourceHost tree fact" },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "authored-tree", id: "client-feature" }],
  message: MESSAGE,
  fix: "add the feature's registered SectionDefinition/ModalDefinition/ConfigGroupDefinition/ChromeEntry under lib/, or delete the dir if it has no product surface.",
  create: (ctx) => ({
    evaluate: () => {
      const entries = readyResourceValue(ctx.resources.authoredTree("client-feature"));
      const owners = new Set(entries.map(definitionOwner).filter((value): value is string => value !== undefined));
      for (const feature of entries
        .map(featureName)
        .filter((value): value is string => value !== undefined)
        .toSorted()) {
        if (!owners.has(feature)) {
          ctx.report.file(`${FEATURES}/${feature}`, { line: 1, column: 1, token: feature });
        }
      }
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: { "packages/client/src/features/__g_orphan/lib/helper.ts": "export const g = 1;\n" },
      expect: { count: 1, token: "__g_orphan", messageIncludes: "owns no registered definition" },
      why: "a feature dir with only a non-definition file owns no registered definition",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: { "packages/client/src/features/__g_ownssection/lib/__g-ownssection-section.tsx": "export const g = 1;\n" },
      why: "a lib/*-section.tsx file counts as the feature's registered definition",
    },
    {
      mode: "resource",
      files: { "packages/client/src/features/__g_ownschrome/lib/__g-ownschrome-chrome.tsx": "export const g = 1;\n" },
      why: "a lib/*-chrome.tsx file also counts",
    },
    {
      mode: "resource",
      files: { "packages/client/src/features/__g_ownsgroup/lib/__g-ownsgroup-group.tsx": "export const g = 1;\n" },
      why: "a lib/*-group.tsx file also counts",
    },
  ],
});
