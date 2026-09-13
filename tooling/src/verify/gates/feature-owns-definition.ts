// Gate: feature-owns-definition (client-architecture-lockdown.md §3/§18 O2). Every feature directory
// owns a registered definition or is deleted. The rule has no exemption; directory identity comes from
// the closed client-feature ResourceHost tree rather than a gate-owned filesystem walk.
// A broken declared resource refuses one phase EARLIER than this module: `resolveResourceDeclarations`
// (`lib/resource-declaration.ts:182`) throws during the POPULATION phase and the receipt phase withholds
// every consumer, both before `create`/`evaluate` (guide §3's acquisition-refusal rule). So the read goes through
// `readyResourceValue` — a loud assertion that the runtime's refusal held — and never through an in-module
// not-ready branch, which would be unreachable and would model a silent return as the right answer.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `feature-owns-definition` descriptor at e6394c8ac9124d2ba175554f6ffb8d90f58bb463, the parent of the conversion
// `96e103fe4` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME
// 7,046 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), the legacy harness
// — no `scanRoot` — dispatched 7,046, and the final `population` admits 0; the subject is the declared
// `client-feature` tree. legacy − final = all 7,046 harness candidates — dispatched to the legacy `run`, which read
// none of them (its subject came off disk through `readdirSync(packages/client/src/features)` + each `lib/` listing);
// retired with that read. final − legacy = ∅. Controls: the legacy side is non-empty and the final side is empty by
// declaration, so equality cannot pass vacuously; outside `docs/__cbbhr_out_control.ts` rejected by both.
// OUTSIDE-CONTROL CAVEAT (verifier cb-v-header-residue): `docs/__cbbhr_out_control.ts` is rejected by `harnessGlobs`,
// not by the legacy descriptor — which has no path predicate of its own and admits it — so it proves only that
// neither side reaches outside the harness corpus, not that the legacy filter discriminates.
//
// FAMILY: a declared SINGLETON under its own id. Its only shared `lib/` dependency is the corpus-wide
// resource-consumption primitive `lib/resource-declaration.ts#readyResourceValue`; `client-structure` reads the same
// `client-feature` tree for a different verdict (slice shape, not definition ownership) and shares no computation
// with this module beyond that primitive.

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
      expect: { count: 1, token: "__g_orphan" },
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
