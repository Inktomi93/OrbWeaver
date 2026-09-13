// Gate: client-structure (UI-Architecture-and-Layout.md §2.1 + §4) — the @orb/client feature-slice
// layout. File-shape invariants dep-cruiser can't see. Enforced per-BUILT-feature — a slice holding
// only a .gitkeep is skipped. Rules: (1) front-door index.ts, (2) name is reserved-UI-only or mirrors a
// real server domain, (3) no stray root files, (4) known buckets only, (5) surfaces/*.tsx end
// -surface.tsx, (6) hooks/anchors naming, (7) a surface must not render its own outer Dialog/Drawer.
// Rules 5/6/7 RECURSE: a bucket may hold group dirs, and a grouped file keeps its bucket's contract;
// (8) a group dir may not be NAMED after a bucket (one slice = one set of buckets, at its root).
// RESOURCE HYBRID (GATE-AUTHORING migration): structure (1-6, 8) reads the closed `client-feature` /
// `server-domain` ResourceHost trees (no content, listing only); rule 7 needs the SOURCE TEXT of
// surfaces/*.tsx, so this policy also declares a narrow SOURCE population over exactly that shape and
// reads it through `ctx.files` — the sanctioned dual role (design/gate-runtime-standardization.md
// "Population vocabulary").
// WHERE A BROKEN RESOURCE REFUSES — not here (mirrors `server-layout.ts`'s header). A declared resource
// that comes back missing/empty/unresolved/malformed makes `resolveResourceDeclarations`
// (`lib/resource-declaration.ts:182`) THROW during the POPULATION phase, and the receipt phase withholds
// every consumer, both before `create`/`evaluate` run (guide §3's acquisition-refusal rule). This module owns no not-ready
// branch: it reads both trees through `readyResourceValue`, whose throw is an assertion that the runtime's
// own refusal already held — a silent `if (status !== "ready") return;` here would be unreachable code
// reporting a clean pass on a run that could not perform its analysis at all.
import { defineGate } from "../contract/policy.ts";
import type { ResourceTreeEntry } from "../contract/resource.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const FEATURES = "packages/client/src/features";
const DOMAINS = "packages/server/src/domain";
// The known slice buckets: a feature module lives in a bucket, never sprawls at the root.
const BUCKETS = new Set(["surfaces", "anchors", "components", "hooks", "lib"]);
// app-shell is the shell-tier frame — it additionally owns the slot registries + the shell store.
const SHELL_EXTRA = new Set(["registry", "store"]);
// refinery/home/regex/config: declared-planned or shell-tier frames that own no server domain by design
// (client-architecture-lockdown.md §6a, home-section-spec, D114, config-rail-spec.md).
const RESERVED = new Set(["app-shell", "auth", "config", "home", "refinery", "regex", "user-admin"]);
// Container-type vocabulary for anchor filenames (an anchor names the containment it PROVIDES).
const ANCHOR_SUFFIXES = ["anchor", "dialog", "drawer", "popover", "menu", "panel"];
// The bare modal ROOT tag only (`<Dialog>`/`<Dialog `), not `<DialogTrigger`/`<DialogPopup`/`<ConfirmDialog`
// — a surface may compose an anchor's parts, but must not render the outer container itself.
const OUTER_CONTAINER = /<(?:Dialog|AlertDialog|Drawer)[\s/>]/u;
const CODE_RE = /\.tsx?$/u;
const TSX_RE = /\.tsx$/u;
const ROOT_OK_RE = /^(?:index\.ts|.*\.md|\.gitkeep)$/u;

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function directChildren(entries: readonly ResourceTreeEntry[], dir: string): readonly ResourceTreeEntry[] {
  const prefix = `${dir}/`;
  return entries.filter((entry) => entry.path.startsWith(prefix) && !entry.path.slice(prefix.length).includes("/"));
}

function descendants(entries: readonly ResourceTreeEntry[], dir: string): readonly ResourceTreeEntry[] {
  const prefix = `${dir}/`;
  return entries.filter((entry) => entry.path.startsWith(prefix));
}

/** Every bucket-relative FILE path, at any depth (a bucket may GROUP its modules into sub-dirs). */
function filesIn(entries: readonly ResourceTreeEntry[], dir: string, bucket: string): readonly string[] {
  const base = `${dir}/${bucket}`;
  return descendants(entries, base)
    .filter((entry) => entry.kind === "file")
    .map((entry) => entry.path.slice(base.length + 1));
}

/** Every bucket-relative GROUP-DIR path, at any depth. */
function dirsIn(entries: readonly ResourceTreeEntry[], dir: string, bucket: string): readonly string[] {
  const base = `${dir}/${bucket}`;
  return descendants(entries, base)
    .filter((entry) => entry.kind === "directory")
    .map((entry) => entry.path.slice(base.length + 1));
}

// A feature is "built" once it holds any .ts/.tsx anywhere under it (a .gitkeep-only dir is reserved).
function hasCode(entries: readonly ResourceTreeEntry[], featureDir: string): boolean {
  return descendants(entries, featureDir).some((entry) => entry.kind === "file" && CODE_RE.test(entry.path));
}

function featureDirs(entries: readonly ResourceTreeEntry[]): readonly string[] {
  return directChildren(entries, FEATURES)
    .filter((entry) => entry.kind === "directory")
    .map((entry) => basename(entry.path))
    .toSorted();
}

function domainNames(entries: readonly ResourceTreeEntry[]): ReadonlySet<string> {
  return new Set(
    directChildren(entries, DOMAINS)
      .filter((entry) => entry.kind === "directory")
      .map((entry) => basename(entry.path)),
  );
}

interface Report {
  readonly path: string;
  readonly message: string;
}

// Rule 8 — a GROUP dir may not re-declare the bucket axis.
function checkGroupDirs(entries: readonly ResourceTreeEntry[], name: string, out: Report[]): void {
  const dir = `${FEATURES}/${name}`;
  const reserved = new Set([...BUCKETS, ...SHELL_EXTRA]);
  const axis = [...reserved].sort().join(", ");
  for (const bucket of reserved) {
    for (const group of dirsIn(entries, dir, bucket)) {
      if (reserved.has(basename(group))) {
        out.push({
          path: `${dir}/${bucket}/${group}`,
          message: `group dir '${group}' inside bucket '${bucket}' re-declares the bucket axis {${axis}} — bucket nesting is GROUPING only (client-architecture-lockdown.md §3, F-4); a slice has exactly one set of buckets, at its root. Rename the group after what it groups.`,
        });
      }
    }
  }
}

// Rule 5 (surface naming) + Rule 7 (surface purity). app-shell is exempt from the -surface.tsx naming
// contract only (its surfaces are the frame's region chrome); surface purity still applies to it.
function checkSurfaces(entries: readonly ResourceTreeEntry[], name: string, surfaceText: ReadonlyMap<string, string>, out: Report[]): void {
  const dir = `${FEATURES}/${name}`;
  const namingExempt = name === "app-shell";
  for (const f of filesIn(entries, dir, "surfaces")) {
    if (!f.endsWith(".tsx")) {
      continue;
    }
    const path = `${dir}/surfaces/${f}`;
    if (!(namingExempt || basename(f).endsWith("-surface.tsx"))) {
      out.push({
        path,
        message: `surface files end in -surface.tsx (got '${f}') — the surfaces/ bucket is the containment CONSUMER tier (UI-Architecture-and-Layout.md §2.1). Group dirs inside a bucket are legal, but the file contracts apply at every depth.`,
      });
    }
    const text = surfaceText.get(path);
    if (text !== undefined && OUTER_CONTAINER.test(text)) {
      out.push({
        path,
        message:
          "a surface must not render its own outer Dialog/AlertDialog/Drawer — the containment box is the anchor's job; move it to anchors/ (inline Popover/Menu/Select/Tooltip are fine). See UI-Architecture-and-Layout.md §4 (surfaces = CONSUMER, anchors = PROVIDER).",
      });
    }
  }
}

// Pure hooks are use-*.ts; a .tsx in hooks/ is a co-located context PROVIDER (-context/-provider).
function hookNameOk(f: string): boolean {
  if (f.endsWith(".tsx")) {
    return f.startsWith("use-") || f.endsWith("-context.tsx") || f.endsWith("-provider.tsx");
  }
  return f.startsWith("use-");
}

// Rule 6 — hooks/ + anchors/ file naming.
function checkHooksAndAnchors(entries: readonly ResourceTreeEntry[], name: string, out: Report[]): void {
  const dir = `${FEATURES}/${name}`;
  for (const f of filesIn(entries, dir, "hooks")) {
    if (!CODE_RE.test(f)) {
      continue;
    }
    if (!hookNameOk(basename(f))) {
      out.push({
        path: `${dir}/hooks/${f}`,
        message: `hooks/ files are use-*.ts (pure hooks) or *-context.tsx / *-provider.tsx (co-located providers); got '${f}' (UI-Architecture-and-Layout.md §2.1). Group dirs inside a bucket are legal, but the file contracts apply at every depth.`,
      });
    }
  }
  for (const f of filesIn(entries, dir, "anchors")) {
    if (!f.endsWith(".tsx")) {
      continue;
    }
    const base = basename(f).replace(TSX_RE, "");
    const suffix = base.slice(base.lastIndexOf("-") + 1);
    if (!ANCHOR_SUFFIXES.includes(suffix)) {
      out.push({
        path: `${dir}/anchors/${f}`,
        message: `anchor files end in a container-type suffix {${ANCHOR_SUFFIXES.join(", ")}} (got '${f}') — an anchor names the containment it PROVIDES (UI-Architecture-and-Layout.md §4). Add to ANCHOR_SUFFIXES in tooling/src/verify/gates/client-structure.ts if it's a real new container type. Group dirs inside a bucket are legal, but the file contracts apply at every depth.`,
      });
    }
  }
}

interface CheckFeatureInput {
  readonly entries: readonly ResourceTreeEntry[];
  readonly name: string;
  readonly domains: ReadonlySet<string>;
  readonly surfaceText: ReadonlyMap<string, string>;
}

// The shape rules for ONE built feature.
function checkFeature({ entries, name, domains, surfaceText }: CheckFeatureInput, out: Report[]): void {
  const dir = `${FEATURES}/${name}`;
  const allowed = name === "app-shell" ? new Set([...BUCKETS, ...SHELL_EXTRA]) : BUCKETS;
  // 1. front-door.
  if (!directChildren(entries, dir).some((entry) => entry.kind === "file" && basename(entry.path) === "index.ts")) {
    out.push({
      path: dir,
      message: `built feature '${name}' has no index.ts front door — consumers enter a slice through its index (UI-Architecture-and-Layout.md §2.1).`,
    });
  }
  // 2. mirror invariant.
  if (!(RESERVED.has(name) || domains.has(name))) {
    out.push({
      path: dir,
      message: `'${name}' is neither a reserved UI-only slice (${[...RESERVED].join("/")}) nor a mirror of a real packages/server/src/domain/<name>. Rename it to the domain it serves, or add it to RESERVED if it's UI-only (UI-Architecture-and-Layout.md §2.1 + AGENTS.md §6).`,
    });
  }
  for (const entry of directChildren(entries, dir)) {
    const name2 = basename(entry.path);
    if (entry.kind === "directory") {
      // 4. buckets.
      if (!allowed.has(name2)) {
        out.push({
          path: entry.path,
          message: `unknown bucket '${name2}' in feature '${name}' — slice subdirs are {${[...allowed].sort().join(", ")}} (UI-Architecture-and-Layout.md §2.1).`,
        });
      }
    } else if (!ROOT_OK_RE.test(name2)) {
      // 3. no-stray-root.
      out.push({
        path: entry.path,
        message: `stray file '${name2}' at the root of feature '${name}' — feature modules live in a bucket (surfaces/anchors/components/hooks/lib); only index.ts + notes at the root (UI-Architecture-and-Layout.md §2.1).`,
      });
    }
  }
  // 5 + 6 + 7 — per-bucket file naming + surface purity (at any depth). 8 — group dirs stay groups.
  checkSurfaces(entries, name, surfaceText, out);
  checkHooksAndAnchors(entries, name, out);
  checkGroupDirs(entries, name, out);
}

export const gate = defineGate({
  id: "client-structure",
  family: "client-structure",
  authority: "hard",
  severity: "error",
  population: { in: ["@client"], under: ["packages/client/src/features/*/surfaces/**"], ext: ["tsx"] },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [
    { kind: "authored-tree", id: "client-feature" },
    { kind: "authored-tree", id: "server-domain" },
  ],
  message:
    "a BUILT @orb/client feature slice violates the feature-slice layout — a missing index.ts front door, a name that is neither reserved nor a real server-domain mirror, a stray root file, an unknown bucket, a mis-named surface/hook/anchor AT ANY DEPTH / a surface rendering its own outer container, or a group dir named after a bucket (UI-Architecture-and-Layout.md §2.1 + §4; client-architecture-lockdown.md §3).",
  fix: "add the index.ts front door, move loose modules into a bucket (surfaces/anchors/components/hooks/lib), rename to the served domain (or add to RESERVED), and name surfaces `-surface.tsx` / hooks `use-*` / anchors by container suffix — grouping a bucket into sub-dirs is legal, but the file contracts follow the file down and a group is never named after a bucket.",
  create: (ctx) => ({
    evaluate: () => {
      const entries = readyResourceValue(ctx.resources.authoredTree("client-feature"));
      const domains = domainNames(readyResourceValue(ctx.resources.authoredTree("server-domain")));
      const surfaceText = new Map(ctx.files.map((file) => [ctx.relativePath(file), file.getFullText()]));
      const findings: Report[] = [];
      for (const name of featureDirs(entries)) {
        // A reserved slice (only .gitkeep) is skipped; the shape activates when it holds real code.
        if (hasCode(entries, `${FEATURES}/${name}`)) {
          checkFeature({ entries, name, domains, surfaceText }, findings);
        }
      }
      for (const finding of findings) {
        ctx.report.file(finding.path, { line: 1, column: 1, message: finding.message });
      }
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: {
        "packages/client/src/features/broken/stray.ts": "export const x = 1;\n",
        "packages/server/src/domain/companion/index.ts": "export const c = 1;\n",
        "packages/client/src/features/user-admin/index.ts": "export const x = 1;\n",
        "packages/client/src/features/user-admin/surfaces/keep-surface.tsx": "export const K = () => null;\n",
      },
      expect: { count: 3, messageIncludes: "stray file" },
      why: "a BUILT feature (has code) with a stray root file + no index.ts front door — feature-slice violations",
    },
    {
      // rule 2: a built feature that mirrors no domain and isn't reserved.
      mode: "resource",
      files: {
        "packages/client/src/features/nodomain/index.ts": "export const x = 1;\n",
        "packages/server/src/domain/companion/index.ts": "export const c = 1;\n",
        "packages/client/src/features/user-admin/index.ts": "export const x = 1;\n",
        "packages/client/src/features/user-admin/surfaces/keep-surface.tsx": "export const K = () => null;\n",
      },
      expect: { count: 1, messageIncludes: "neither a reserved UI-only slice" },
      why: "rule 2: a built feature name that is neither reserved nor a real server-domain mirror",
    },
    {
      // rule 5: a surfaces/*.tsx not ending in -surface.tsx.
      mode: "resource",
      files: {
        "packages/server/src/domain/character/index.ts": "export const d = 1;\n",
        "packages/client/src/features/character/index.ts": "export const x = 1;\n",
        "packages/client/src/features/character/surfaces/card.tsx": "export const C = () => null;\n",
      },
      expect: { count: 1, messageIncludes: "end in -surface.tsx" },
      why: "rule 5: a surface file not named -surface.tsx",
    },
    {
      // rule 6: a hooks/ file not named use-*.
      mode: "resource",
      files: {
        "packages/server/src/domain/character/index.ts": "export const d = 1;\n",
        "packages/client/src/features/character/index.ts": "export const x = 1;\n",
        "packages/client/src/features/character/hooks/helpers.ts": "export const h = 1;\n",
        "packages/client/src/features/character/surfaces/card-surface.tsx": "export const C = () => null;\n",
      },
      expect: { count: 1, messageIncludes: "hooks/ files are use-*" },
      why: "rule 6: a hooks/ file not named use-* (nor -context/-provider)",
    },
    {
      // rule 6: an anchor without a container-type suffix.
      mode: "resource",
      files: {
        "packages/server/src/domain/character/index.ts": "export const d = 1;\n",
        "packages/client/src/features/character/index.ts": "export const x = 1;\n",
        "packages/client/src/features/character/anchors/thing.tsx": "export const T = () => null;\n",
        "packages/client/src/features/character/surfaces/card-surface.tsx": "export const C = () => null;\n",
      },
      expect: { count: 1, messageIncludes: "container-type suffix" },
      why: "rule 6: an anchor filename without a known container-type suffix",
    },
    {
      // rule 7: a surface rendering its own outer Dialog root (surface purity).
      mode: "resource",
      files: {
        "packages/server/src/domain/character/index.ts": "export const d = 1;\n",
        "packages/client/src/features/character/index.ts": "export const x = 1;\n",
        "packages/client/src/features/character/surfaces/edit-surface.tsx": "export const E = () => <Dialog>x</Dialog>;\n",
      },
      expect: { count: 1, messageIncludes: "must not render its own outer Dialog" },
      why: "rule 7: a surface rendering its own outer Dialog root — the containment box is the anchor's job",
    },
    {
      // RECURSION: a surface inside a bucket GROUP dir escaped rules 5 + 7 entirely before F-4.
      mode: "resource",
      files: {
        "packages/server/src/domain/character/index.ts": "export const d = 1;\n",
        "packages/client/src/features/character/index.ts": "export const x = 1;\n",
        "packages/client/src/features/character/surfaces/gallery/card.tsx": "export const C = () => <Drawer>x</Drawer>;\n",
      },
      expect: { count: 2 },
      why: "the F-4 recursion arm: a GROUPED surface breaks both its naming contract and surface purity — a top-level-only scan reported neither",
    },
    {
      // RECURSION: the hooks/ naming contract applies inside a group dir too.
      mode: "resource",
      files: {
        "packages/server/src/domain/character/index.ts": "export const d = 1;\n",
        "packages/client/src/features/character/index.ts": "export const x = 1;\n",
        "packages/client/src/features/character/hooks/editor/helpers.ts": "export const h = 1;\n",
        "packages/client/src/features/character/surfaces/card-surface.tsx": "export const C = () => null;\n",
      },
      expect: { count: 1, messageIncludes: "hooks/ files are use-*" },
      why: "the F-4 recursion arm: a grouped hooks/ file keeps the use-* contract (the predicate reads the BASENAME, not the group-prefixed path)",
    },
    {
      // Rule 8: a group dir NAMED after a bucket — a second slice shape growing inside the first.
      mode: "resource",
      files: {
        "packages/server/src/domain/character/index.ts": "export const d = 1;\n",
        "packages/client/src/features/character/index.ts": "export const x = 1;\n",
        "packages/client/src/features/character/components/hooks/use-card.ts": "export const useCard = () => 1;\n",
        "packages/client/src/features/character/surfaces/card-surface.tsx": "export const C = () => null;\n",
      },
      expect: { count: 1, messageIncludes: "re-declares the bucket axis" },
      why: "rule 8: nesting is GROUPING — a group dir may not re-declare the bucket axis (components/hooks/ is a slice inside a slice)",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/chat/index.ts": "export const d = 1;\n",
        "packages/client/src/features/chat/index.ts": "export const i = 1;\n",
        "packages/client/src/features/chat/surfaces/chat-surface.tsx": "export const S = () => null;\n",
        "packages/client/src/features/chat/hooks/use-chat.ts": "export const useChat = () => 1;\n",
      },
      why: "a built feature mirroring a real domain with an index.ts, a -surface.tsx, and a use-* hook — the layout, passes",
    },
    {
      // rule 2: a reserved UI-only slice needs no server-domain mirror.
      mode: "resource",
      files: {
        "packages/client/src/features/user-admin/index.ts": "export const x = 1;\n",
        "packages/client/src/features/user-admin/surfaces/keep-surface.tsx": "export const K = () => null;\n",
        "packages/server/src/domain/companion/index.ts": "export const c = 1;\n",
      },
      why: "rule 2: a reserved UI-only slice (user-admin) is clean without a domain mirror",
    },
    {
      // rule 5: app-shell surfaces are exempt from the -surface.tsx naming contract (region chrome).
      mode: "resource",
      files: {
        "packages/client/src/features/app-shell/index.ts": "export const x = 1;\n",
        "packages/client/src/features/app-shell/surfaces/rail.tsx": "export const R = () => null;\n",
        "packages/server/src/domain/companion/index.ts": "export const c = 1;\n",
      },
      why: "rule 5: app-shell surfaces are exempt from the -surface.tsx naming contract",
    },
    {
      // rule 7: a surface composing a Dialog PART (DialogTrigger) is clean — not the bare root.
      mode: "resource",
      files: {
        "packages/server/src/domain/character/index.ts": "export const d = 1;\n",
        "packages/client/src/features/character/index.ts": "export const x = 1;\n",
        "packages/client/src/features/character/surfaces/edit-surface.tsx": "export const E = () => <DialogTrigger>x</DialogTrigger>;\n",
      },
      why: "rule 7: composing a Dialog PART (DialogTrigger) is legal — only the bare modal root is banned",
    },
    {
      // rule 6: a use-*.ts hook + a .gitkeep in hooks/ are clean.
      mode: "resource",
      files: {
        "packages/server/src/domain/character/index.ts": "export const d = 1;\n",
        "packages/client/src/features/character/index.ts": "export const x = 1;\n",
        "packages/client/src/features/character/hooks/use-card.ts": "export const useCard = () => 1;\n",
        "packages/client/src/features/character/hooks/.gitkeep": "",
        "packages/client/src/features/character/surfaces/card-surface.tsx": "export const C = () => null;\n",
      },
      why: "rule 6: a use-*.ts hook plus a .gitkeep both pass the hooks/ naming contract",
    },
    {
      // rule 6: a -dialog anchor carries a known container-type suffix.
      mode: "resource",
      files: {
        "packages/server/src/domain/character/index.ts": "export const d = 1;\n",
        "packages/client/src/features/character/index.ts": "export const x = 1;\n",
        "packages/client/src/features/character/anchors/edit-dialog.tsx": "export const E = () => null;\n",
        "packages/client/src/features/character/surfaces/card-surface.tsx": "export const C = () => null;\n",
      },
      why: "rule 6: a -dialog anchor carries a known container-type suffix and passes",
    },
    {
      // RECURSION, the legal side: grouping is legal in EVERY bucket.
      mode: "resource",
      files: {
        "packages/server/src/domain/character/index.ts": "export const d = 1;\n",
        "packages/client/src/features/character/index.ts": "export const x = 1;\n",
        "packages/client/src/features/character/components/card/header.tsx": "export const H = () => null;\n",
        "packages/client/src/features/character/surfaces/gallery/browse-surface.tsx": "export const B = () => null;\n",
        "packages/client/src/features/character/hooks/editor/use-card.ts": "export const useCard = () => 1;\n",
      },
      why: "the F-4 nesting ruling: bucket-internal GROUP dirs are legal everywhere; what recursion adds is that the contracts follow the file down",
    },
  ],
});
