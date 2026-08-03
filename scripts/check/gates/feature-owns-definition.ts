// Gate: feature-owns-definition (client-architecture-lockdown.md §3/§18 O2) — a `features/*` dir owns
// a registered definition (a rail section, a modal, a settings pane, a chrome widget, or a config
// COLLECTION) or is deleted. NO exemption: every real feature co-locates one of
// `lib/*-{section,modal,pane,chrome,collection}.{ts,tsx}`.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { GateDescriptor } from "../contract.ts";

const FEATURES = "packages/client/src/features";
// `collection` joined the vocabulary with the config rail's R1 (config-rail-spec.md §3 step 3): a feature
// whose whole product surface is a member LIBRARY contributed to the Configuration workspace owns a
// `lib/*-collection.tsx` and no pane — tags and regex went RED here the moment their panes retired.
const DEFINITION_RE = /-(?:section|modal|pane|chrome|collection)\.tsx?$/u;

function featureDirs(root: string): string[] {
  const base = join(root, FEATURES);
  if (!existsSync(base)) {
    return [];
  }
  return readdirSync(base, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function ownsDefinition(root: string, feature: string): boolean {
  const libDir = join(root, FEATURES, feature, "lib");
  if (!existsSync(libDir)) {
    return false;
  }
  return readdirSync(libDir, { withFileTypes: true }).some((e) => e.isFile() && DEFINITION_RE.test(e.name));
}

export const gate: GateDescriptor = {
  name: "feature-owns-definition",
  docRow: "client-architecture-lockdown.md §3 / §18 O2",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message:
    "a features/* dir owns no registered definition — a feature dir must co-locate a lib/*-section.tsx, lib/*-modal.tsx, lib/*-pane.tsx, lib/*-chrome.tsx, or lib/*-collection.tsx (client-architecture-lockdown.md §3/§18 O2), or be deleted. No exemptions.",
  fix: "add the feature's registered SectionDefinition/ModalDefinition/SettingsPaneDefinition/ChromeEntry/CollectionContribution under lib/, or delete the dir if it has no product surface.",
  run: (ctx) => {
    for (const feature of featureDirs(ctx.root)) {
      if (!ownsDefinition(ctx.root, feature)) {
        ctx.report({
          file: `${FEATURES}/${feature}`,
          line: 0,
          column: 0,
          message: gate.message,
        });
      }
    }
  },
  mustFlag: [
    {
      files: {
        "packages/client/src/features/__g_orphan/lib/helper.ts": "export const g = 1;\n",
      },
      expect: { messageIncludes: "owns no registered definition" },
      why: "a feature dir with only a non-definition file owns no registered definition",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/client/src/features/__g_ownssection/lib/__g-ownssection-section.tsx": "export const g = 1;\n",
      },
      why: "a lib/*-section.tsx file counts as the feature's registered definition",
    },
    {
      files: {
        "packages/client/src/features/__g_ownschrome/lib/__g-ownschrome-chrome.tsx": "export const g = 1;\n",
      },
      why: "a lib/*-chrome.tsx file (the chrome-widget kind) also counts",
    },
    {
      files: {
        "packages/client/src/features/__g_ownscollection/lib/__g-ownscollection-collection.tsx": "export const g = 1;\n",
      },
      why: "a lib/*-collection.tsx file (the config-collection kind, R1) also counts",
    },
  ],
};
