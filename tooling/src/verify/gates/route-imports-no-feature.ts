// Policy: route-imports-no-feature (client-architecture-lockdown.md §6 / §16 G1, arm 3b) — a route is a
// THIN MOUNT. It may not import a feature's front door; features reach the shell through the registries,
// and a route that imports one has re-formed the god-map through the module graph instead of a prop.
//
// AUTHORITY IS reviewed-grant, and that is the whole reason this arm has its own policy id. The exceptions
// are not per-occurrence mistakes an author waives with a reason — they are recurring repository
// PERMISSIONS: ONE sanctioned composition route, and the auth surfaces that must mount the login gate
// before any registry exists. Each is an exact `(subject, operation)` row in the central reviewed-grant
// table with its own `why` and `endsWhen`; after a complete run a row consumed zero times is STALE and a
// row matching more than one finding is OVER-BROAD and licenses nothing. Nothing here subtracts a path
// from the population, and this policy holds no allowlist of its own.
//
// The split follows the design's own `tooling-front-door` ruling — an ordinary import-boundary policy plus
// a reviewed grant policy — because a descriptor carries exactly one authority. The definition arms of the
// same doc row live in `section-registry-completeness`.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `section-registry-completeness` descriptor at e18bce01edaa15a30220d7a34c96a2c5228a1646, the parent of the
// conversion `dd862e988`; this module did not exist there, so it is measured against the module it was carved from,
// `section-registry-completeness` (blob read from git with no working-tree plant: a `GateDescriptor`, no
// `defineGate`). The legacy descriptor had no `scanRoot`, so its effective population is its in-run path filter —
// parent run: `if (!path.includes(CLIENT_SRC)) continue`. Over the SAME 7,143 harness candidates at that tree
// (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`) it admits 1,302 and the final `population` admits 1,302
// (the bare harness dispatch was 7,143). legacy − final = ∅. final − legacy = ∅. Controls: inside
// `packages/client/src/agent-handles/__cbbhr_in_index.ts` (virtual) admitted by both; outside
// `packages/contracts/src/assets/__cbbhr_out_index.ts` rejected by both.
//
// FAMILY: a declared SINGLETON under its own id. It imports nothing from `lib/`; it was split from
// `section-registry-completeness` by AUTHORITY, and the two share no production dependency, so they are not one
// family.
import type { SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

const ROUTES = "packages/client/src/routes/";
const FEATURE_DOOR = "#features/";
const OPERATION = "feature-front-door-import";
const ROUTE_POPULATION = "route module";

const MESSAGE =
  "a route imports a feature front door — a route is a thin mount, and a feature reaches the shell through the " +
  "section/modal/chrome registries. Composing a feature at a route is the god-map re-formed through the module " +
  "graph (client-architecture-lockdown.md §6 / §16 G1).";
const FIX = "mount the registry-assembled shell instead, or record an exact reviewed grant for a route that is genuinely a composition root.";

interface Candidate {
  readonly node: import("ts-morph").ImportDeclaration;
  readonly path: string;
  readonly specifier: string;
}

export const gate = defineGate({
  id: "route-imports-no-feature",
  family: "route-imports-no-feature",
  authority: "reviewed-grant",
  severity: "error",
  population: "@client",
  analysis: "syntax",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const routes = new Set<string>();
    const candidates: Candidate[] = [];

    return {
      visitors: [
        {
          kinds: [SyntaxKind.ImportDeclaration],
          visit: (node, sourceFile: SourceFile) => {
            if (!Node.isImportDeclaration(node)) {
              return;
            }
            const path = ctx.relativePath(sourceFile);
            if (!path.startsWith(ROUTES)) {
              return;
            }
            const specifier = node.getModuleSpecifierValue();
            if (specifier.startsWith(FEATURE_DOOR)) {
              candidates.push({ node, path, specifier });
            }
          },
        },
      ],
      visitFile: (sourceFile) => {
        const path = ctx.relativePath(sourceFile);
        if (path.startsWith(ROUTES)) {
          routes.add(path);
        }
      },
      evaluate: () => {
        ctx.receipt({ kind: "population", source: ROUTE_POPULATION, members: routes.size, unresolved: 0 });
        for (const candidate of candidates) {
          ctx.report.node(candidate.node, {
            subject: candidate.path,
            operation: `${OPERATION}:${candidate.specifier}`,
            message: `${MESSAGE} Route: ${candidate.path}, front door: ${candidate.specifier}.`,
            fix: FIX,
          });
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "source",
      grant: { subject: "packages/client/src/routes/some-route.tsx", operation: "feature-front-door-import:#features/chat" },
      files: {
        "packages/client/src/routes/some-route.tsx": 'import { X } from "#features/chat";\nexport const G = X;\n',
      },
      expect: { count: 1, messageIncludes: "#features/chat" },
      why: "a feature front door imported by a route — the founding shape, and without a grant row it stands",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/routes/login-page.tsx": 'import { LoginSurface } from "#features/auth";\nexport const G = LoginSurface;\n',
      },
      expect: { count: 1, messageIncludes: "#features/auth" },
      why: "THE PERMISSION IS NOT A CARVE-OUT IN THE RULE: the auth surfaces red like any other route and are licensed by an exact grant row, so a NEW auth import in a NEW route is a finding until someone reviews it",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/routes/app-root.tsx":
          'import { AppShell } from "#features/app-shell";\nimport { Chat } from "#features/chat";\nexport const G = [AppShell, Chat];\n',
      },
      expect: { count: 2 },
      why: "each (route, front door) pair is its OWN occurrence identity, so the composition route consumes one grant row per door and a row can never license two imports at once",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/client/src/routes/some-route.tsx": 'import { sectionRegistry } from "#state";\nexport const G = sectionRegistry;\n',
      },
      why: "a route that mounts the assembled registry imports no feature front door",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/routes/some-route.tsx": "export const G = 1;\n",
        "packages/client/src/features/chat/index.ts": 'import { helper } from "#features/persona";\nexport const X = helper;\n',
      },
      why: "THE SCOPE COUNTERFACTUAL: the identical import spelling OUTSIDE the routes tree is a feature-to-feature question this policy does not own (`client-features-no-cross` does) — the subject is a ROUTE module",
    },
  ],
});
