// Gate: client-structure (UI-Architecture-and-Layout.md §2.1 + §4) — the @orb/client feature-slice
// layout. File-shape invariants dep-cruiser can't see. Enforced per-BUILT-feature — a slice holding
// only a .gitkeep is skipped. Rules: (1) front-door index.ts, (2) name is reserved-UI-only or mirrors a
// real server domain, (3) no stray root files, (4) known buckets only, (5) surfaces/*.tsx end
// -surface.tsx, (6) hooks/anchors naming, (7) a surface must not render its own outer Dialog/Drawer.
// Rules 5/6/7 RECURSE: a bucket may hold group dirs, and a grouped file keeps its bucket's contract;
// (8) a group dir may not be NAMED after a bucket (one slice = one set of buckets, at its root).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GateDescriptor } from "../contract.ts";
import type { Violation } from "../harness.ts";

const FEATURES = "packages/client/src/features";
const DOMAINS = "packages/server/src/domain";
// The known slice buckets: a feature module lives in a bucket, never sprawls at the root.
const BUCKETS = new Set(["surfaces", "anchors", "components", "hooks", "lib"]);
// app-shell is the shell-tier frame — it additionally owns the slot registries + the shell store.
const SHELL_EXTRA = new Set(["registry", "store"]);
// refinery: declared-planned (client-architecture-lockdown.md §6a, O1) — its design set scores/rewrites
// against the `character` domain rather than owning one; no `domain/refinery` mirror is expected.
// home: the landing rail SECTION (home-section-spec) — a shell-tier surface whose CONTENT is a grid of
// door-assembled tiles from OTHER features. It owns no server domain by design (it holds no data of its
// own; every tile's data belongs to the feature that raised it), so no `domain/home` mirror is expected.
// regex: the owner-global find/replace script LIBRARY (D114 / SET-SEAMS stage 5). It owns a real product
// surface but no server domain by construction — the scripts PERSIST as a `UserSettings.regex` section
// (domain/settings) and RUN through the @orb/kit/regex engine, so a `domain/regex` mirror would be a
// third home for one concept. Minted as its own slice because neither settings nor chat READS it.
const RESERVED = new Set(["app-shell", "auth", "home", "refinery", "regex", "user-admin"]);
// Container-type vocabulary for anchor filenames (an anchor names the containment it PROVIDES).
const ANCHOR_SUFFIXES = ["anchor", "dialog", "drawer", "popover", "menu", "panel"];
// The bare modal ROOT tag only (`<Dialog>`/`<Dialog `), not `<DialogTrigger`/`<DialogPopup`/`<ConfirmDialog`
// — a surface may compose an anchor's parts, but must not render the outer container itself.
const OUTER_CONTAINER = /<(?:Dialog|AlertDialog|Drawer)[\s/>]/u;
const CODE_RE = /\.tsx?$/u;
const TSX_RE = /\.tsx$/u;
const ROOT_OK_RE = /^(?:index\.ts|.*\.md|\.gitkeep)$/u;

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

function domainNames(root: string): Set<string> {
  const base = join(root, DOMAINS);
  if (!existsSync(base)) {
    return new Set();
  }
  return new Set(
    readdirSync(base, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name),
  );
}

// A feature is "built" once it holds any .ts/.tsx anywhere under it (a .gitkeep-only dir is reserved).
function hasCode(dir: string): boolean {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (hasCode(join(dir, e.name))) {
        return true;
      }
    } else if (CODE_RE.test(e.name)) {
      return true;
    }
  }
  return false;
}

// Bucket-relative paths at ANY DEPTH. A bucket may GROUP its modules into sub-dirs (the preset
// precedent: features/preset/components/{prompt-assembly,readout}/) — grouping is legal in every bucket
// and it changes nothing about a file's ROLE, so the per-file naming + purity contracts (rules 5/6/7)
// recurse with it. A top-level-only scan let `surfaces/nested/foo.tsx` escape both, which is how the
// containment law would have rotted invisibly the first time a big feature grouped its surfaces.
function walkBucket(base: string, rel: string, files: string[], dirs: string[]): void {
  for (const e of readdirSync(rel === "" ? base : join(base, rel), { withFileTypes: true })) {
    const next = rel === "" ? e.name : `${rel}/${e.name}`;
    if (e.isDirectory()) {
      dirs.push(next);
      walkBucket(base, next, files, dirs);
    } else {
      files.push(next);
    }
  }
}

/** Every bucket-relative FILE path, at any depth. */
function filesIn(dir: string, bucket: string): string[] {
  const base = join(dir, bucket);
  if (!existsSync(base)) {
    return [];
  }
  const files: string[] = [];
  walkBucket(base, "", files, []);
  return files;
}

/** Every bucket-relative GROUP-DIR path, at any depth. */
function dirsIn(dir: string, bucket: string): string[] {
  const base = join(dir, bucket);
  if (!existsSync(base)) {
    return [];
  }
  const dirs: string[] = [];
  walkBucket(base, "", [], dirs);
  return dirs;
}

/** The file's own name, for the naming contracts — `f` is bucket-relative and may carry group dirs. */
function baseName(f: string): string {
  return f.slice(f.lastIndexOf("/") + 1);
}

// Rule 8 — a GROUP dir may not re-declare the bucket axis. Nesting is legal (rules 5/6/7 recurse into
// it), but `components/hooks/` or `surfaces/anchors/` is a second slice shape growing inside the first,
// and the file contracts key on the OUTER bucket — so the inner name is a lie about what lives there.
function checkGroupDirs(dir: string, name: string, out: Violation[]): void {
  const rel = `${FEATURES}/${name}`;
  const reserved = new Set([...BUCKETS, ...SHELL_EXTRA]);
  const axis = [...reserved].sort().join(", ");
  for (const bucket of reserved) {
    for (const group of dirsIn(dir, bucket)) {
      if (reserved.has(baseName(group))) {
        out.push({
          file: `${rel}/${bucket}/${group}/`,
          line: 0,
          message: `group dir '${group}' inside bucket '${bucket}' re-declares the bucket axis {${axis}} — bucket nesting is GROUPING only (client-architecture-lockdown.md §3, F-4); a slice has exactly one set of buckets, at its root. Rename the group after what it groups.`,
        });
      }
    }
  }
}

// Rule 5 (surface naming) + Rule 7 (surface purity). app-shell is exempt from the -surface.tsx naming
// contract only (its surfaces are the frame's region chrome); surface purity still applies to it.
function checkSurfaces(dir: string, name: string, out: Violation[]): void {
  const rel = `${FEATURES}/${name}`;
  const namingExempt = name === "app-shell";
  for (const f of filesIn(dir, "surfaces")) {
    if (!f.endsWith(".tsx")) {
      continue;
    }
    if (!(namingExempt || baseName(f).endsWith("-surface.tsx"))) {
      out.push({
        file: `${rel}/surfaces/${f}`,
        line: 0,
        message: `surface files end in -surface.tsx (got '${f}') — the surfaces/ bucket is the containment CONSUMER tier (UI-Architecture-and-Layout.md §2.1). Group dirs inside a bucket are legal, but the file contracts apply at every depth.`,
      });
    }
    if (OUTER_CONTAINER.test(readFileSync(join(dir, "surfaces", f), "utf8"))) {
      out.push({
        file: `${rel}/surfaces/${f}`,
        line: 0,
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
function checkHooksAndAnchors(dir: string, name: string, out: Violation[]): void {
  const rel = `${FEATURES}/${name}`;
  for (const f of filesIn(dir, "hooks")) {
    if (!CODE_RE.test(f)) {
      continue;
    }
    if (!hookNameOk(baseName(f))) {
      out.push({
        file: `${rel}/hooks/${f}`,
        line: 0,
        message: `hooks/ files are use-*.ts (pure hooks) or *-context.tsx / *-provider.tsx (co-located providers); got '${f}' (UI-Architecture-and-Layout.md §2.1). Group dirs inside a bucket are legal, but the file contracts apply at every depth.`,
      });
    }
  }
  for (const f of filesIn(dir, "anchors")) {
    if (!f.endsWith(".tsx")) {
      continue;
    }
    const base = baseName(f).replace(TSX_RE, "");
    const suffix = base.slice(base.lastIndexOf("-") + 1);
    if (!ANCHOR_SUFFIXES.includes(suffix)) {
      out.push({
        file: `${rel}/anchors/${f}`,
        line: 0,
        message: `anchor files end in a container-type suffix {${ANCHOR_SUFFIXES.join(", ")}} (got '${f}') — an anchor names the containment it PROVIDES (UI-Architecture-and-Layout.md §4). Add to ANCHOR_SUFFIXES in scripts/check/gates/client-structure.ts if it's a real new container type. Group dirs inside a bucket are legal, but the file contracts apply at every depth.`,
      });
    }
  }
}

// The shape rules for ONE built feature (extracted to keep `run` under the complexity cap).
function checkFeature(dir: string, name: string, domains: Set<string>): Violation[] {
  const out: Violation[] = [];
  const rel = `${FEATURES}/${name}/`;
  const allowed = name === "app-shell" ? new Set([...BUCKETS, ...SHELL_EXTRA]) : BUCKETS;
  // 1. front-door — a built feature exposes features/<name>/index.ts (the dep-cruiser
  //    client-feature-front-door rule forces consumers through it; this enforces it EXISTS).
  if (!existsSync(join(dir, "index.ts"))) {
    out.push({
      file: rel,
      line: 0,
      message: `built feature '${name}' has no index.ts front door — consumers enter a slice through its index (UI-Architecture-and-Layout.md §2.1).`,
    });
  }
  // 2. mirror invariant — a built slice name is RESERVED (UI-only) or mirrors a real server domain.
  if (!(RESERVED.has(name) || domains.has(name))) {
    out.push({
      file: rel,
      line: 0,
      message: `'${name}' is neither a reserved UI-only slice (${[...RESERVED].join("/")}) nor a mirror of a real packages/server/src/domain/<name>. Rename it to the domain it serves, or add it to RESERVED if it's UI-only (UI-Architecture-and-Layout.md §2.1 + AGENTS.md §6).`,
    });
  }
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      // 4. buckets — a slice's subdirs come from the known set; a new bucket is a deliberate
      //    addition (update the set), not silent sprawl.
      if (!allowed.has(e.name)) {
        out.push({
          file: `${rel}${e.name}/`,
          line: 0,
          message: `unknown bucket '${e.name}' in feature '${name}' — slice subdirs are {${[...allowed].sort().join(", ")}} (UI-Architecture-and-Layout.md §2.1).`,
        });
      }
    } else if (!ROOT_OK_RE.test(e.name)) {
      // 3. no-stray-root — the feature root holds only index.ts + *.md notes; every module lives in a
      //    bucket (surfaces/anchors/components/hooks/lib), never loose at the root.
      out.push({
        file: `${rel}${e.name}`,
        line: 0,
        message: `stray file '${e.name}' at the root of feature '${name}' — feature modules live in a bucket (surfaces/anchors/components/hooks/lib); only index.ts + notes at the root (UI-Architecture-and-Layout.md §2.1).`,
      });
    }
  }
  // 5 + 6 + 7 — per-bucket file naming + surface purity (at any depth). 8 — group dirs stay groups.
  checkSurfaces(dir, name, out);
  checkHooksAndAnchors(dir, name, out);
  checkGroupDirs(dir, name, out);
  return out;
}

/** The fs scan shared by the legacy Check and the single-pass `run` descriptor. */
function scanClientStructure(root: string): Violation[] {
  const out: Violation[] = [];
  const domains = domainNames(root);
  for (const name of featureDirs(root)) {
    const dir = join(root, FEATURES, name);
    // A reserved slice (only .gitkeep) is skipped; the shape activates when it holds real code.
    if (hasCode(dir)) {
      out.push(...checkFeature(dir, name, domains));
    }
  }
  return out;
}

export const gate: GateDescriptor = {
  name: "client-structure",
  docRow: "UI-Architecture-and-Layout.md §2.1 (§4)",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message:
    "a BUILT @orb/client feature slice violates the feature-slice layout — a missing index.ts front door, a name that is neither reserved nor a real server-domain mirror, a stray root file, an unknown bucket, a mis-named surface/hook/anchor AT ANY DEPTH / a surface rendering its own outer container, or a group dir named after a bucket (UI-Architecture-and-Layout.md §2.1 + §4; client-architecture-lockdown.md §3).",
  fix: "add the index.ts front door, move loose modules into a bucket (surfaces/anchors/components/hooks/lib), rename to the served domain (or add to RESERVED), and name surfaces `-surface.tsx` / hooks `use-*` / anchors by container suffix — grouping a bucket into sub-dirs is legal, but the file contracts follow the file down and a group is never named after a bucket.",
  run: (ctx) => {
    for (const v of scanClientStructure(ctx.root)) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      files: {
        "packages/client/src/features/broken/stray.ts": "export const x = 1;\n",
      },
      expect: { messageIncludes: "stray file" },
      why: "a BUILT feature (has code) with a stray root file + no index.ts front door — feature-slice violations",
    },
    {
      // rule 2: a built feature that mirrors no domain and isn't reserved.
      files: {
        "packages/client/src/features/nodomain/index.ts": "export const x = 1;\n",
      },
      expect: { messageIncludes: "neither a reserved UI-only slice" },
      why: "rule 2: a built feature name that is neither reserved nor a real server-domain mirror",
    },
    {
      // rule 5: a surfaces/*.tsx not ending in -surface.tsx.
      files: {
        "packages/server/src/domain/character/index.ts": "export const d = 1;\n",
        "packages/client/src/features/character/index.ts": "export const x = 1;\n",
        "packages/client/src/features/character/surfaces/card.tsx": "export const C = () => null;\n",
      },
      expect: { messageIncludes: "end in -surface.tsx" },
      why: "rule 5: a surface file not named -surface.tsx",
    },
    {
      // rule 6: a hooks/ file not named use-*.
      files: {
        "packages/server/src/domain/character/index.ts": "export const d = 1;\n",
        "packages/client/src/features/character/index.ts": "export const x = 1;\n",
        "packages/client/src/features/character/hooks/helpers.ts": "export const h = 1;\n",
      },
      expect: { messageIncludes: "hooks/ files are use-*" },
      why: "rule 6: a hooks/ file not named use-* (nor -context/-provider)",
    },
    {
      // rule 6: an anchor without a container-type suffix.
      files: {
        "packages/server/src/domain/character/index.ts": "export const d = 1;\n",
        "packages/client/src/features/character/index.ts": "export const x = 1;\n",
        "packages/client/src/features/character/anchors/thing.tsx": "export const T = () => null;\n",
      },
      expect: { messageIncludes: "container-type suffix" },
      why: "rule 6: an anchor filename without a known container-type suffix",
    },
    {
      // rule 7: a surface rendering its own outer Dialog root (surface purity).
      files: {
        "packages/server/src/domain/character/index.ts": "export const d = 1;\n",
        "packages/client/src/features/character/index.ts": "export const x = 1;\n",
        "packages/client/src/features/character/surfaces/edit-surface.tsx": "export const E = () => <Dialog>x</Dialog>;\n",
      },
      expect: { messageIncludes: "must not render its own outer Dialog" },
      why: "rule 7: a surface rendering its own outer Dialog root — the containment box is the anchor's job",
    },
    {
      // RECURSION: a surface inside a bucket GROUP dir escaped rules 5 + 7 entirely before F-4.
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
      files: {
        "packages/server/src/domain/character/index.ts": "export const d = 1;\n",
        "packages/client/src/features/character/index.ts": "export const x = 1;\n",
        "packages/client/src/features/character/hooks/editor/helpers.ts": "export const h = 1;\n",
      },
      expect: { messageIncludes: "hooks/ files are use-*" },
      why: "the F-4 recursion arm: a grouped hooks/ file keeps the use-* contract (the predicate reads the BASENAME, not the group-prefixed path)",
    },
    {
      // Rule 8: a group dir NAMED after a bucket — a second slice shape growing inside the first.
      files: {
        "packages/server/src/domain/character/index.ts": "export const d = 1;\n",
        "packages/client/src/features/character/index.ts": "export const x = 1;\n",
        "packages/client/src/features/character/components/hooks/use-card.ts": "export const useCard = () => 1;\n",
      },
      expect: { messageIncludes: "re-declares the bucket axis" },
      why: "rule 8: nesting is GROUPING — a group dir may not re-declare the bucket axis (components/hooks/ is a slice inside a slice)",
    },
  ],
  mustPass: [
    {
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
      files: {
        "packages/client/src/features/user-admin/index.ts": "export const x = 1;\n",
      },
      why: "rule 2: a reserved UI-only slice (user-admin) is clean without a domain mirror",
    },
    {
      // rule 5: app-shell surfaces are exempt from the -surface.tsx naming contract (region chrome).
      files: {
        "packages/client/src/features/app-shell/index.ts": "export const x = 1;\n",
        "packages/client/src/features/app-shell/surfaces/rail.tsx": "export const R = () => null;\n",
      },
      why: "rule 5: app-shell surfaces are exempt from the -surface.tsx naming contract",
    },
    {
      // rule 7: a surface composing a Dialog PART (DialogTrigger) is clean — not the bare root.
      files: {
        "packages/server/src/domain/character/index.ts": "export const d = 1;\n",
        "packages/client/src/features/character/index.ts": "export const x = 1;\n",
        "packages/client/src/features/character/surfaces/edit-surface.tsx": "export const E = () => <DialogTrigger>x</DialogTrigger>;\n",
      },
      why: "rule 7: composing a Dialog PART (DialogTrigger) is legal — only the bare modal root is banned",
    },
    {
      // rule 6: a use-*.ts hook + a .gitkeep in hooks/ are clean.
      files: {
        "packages/server/src/domain/character/index.ts": "export const d = 1;\n",
        "packages/client/src/features/character/index.ts": "export const x = 1;\n",
        "packages/client/src/features/character/hooks/use-card.ts": "export const useCard = () => 1;\n",
        "packages/client/src/features/character/hooks/.gitkeep": "",
      },
      why: "rule 6: a use-*.ts hook plus a .gitkeep both pass the hooks/ naming contract",
    },
    {
      // rule 6: a -dialog anchor carries a known container-type suffix.
      files: {
        "packages/server/src/domain/character/index.ts": "export const d = 1;\n",
        "packages/client/src/features/character/index.ts": "export const x = 1;\n",
        "packages/client/src/features/character/anchors/edit-dialog.tsx": "export const E = () => null;\n",
      },
      why: "rule 6: a -dialog anchor carries a known container-type suffix and passes",
    },
    {
      // RECURSION, the legal side: grouping is legal in EVERY bucket — a group dir whose files still
      // honour their bucket's contract is clean (components/ carries no per-file rule at all: the
      // features/preset/components/{prompt-assembly,readout}/ precedent).
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
};
