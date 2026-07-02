// Gate: client-structure (docs/architecture/core/UI-Architecture-and-Layout.md §2.1) — the @orb/client
// feature-slice layout. The client twin of feature-structure (server domains) + ui-primitive-structure
// (@orb/ui): file-shape invariants dep-cruiser can't see (it watches imports, not layout). Enforced
// per-BUILT-feature — a slice holding only a .gitkeep (reserved, not yet built) is SKIPPED, so this gate
// is green on the empty scaffold and activates the moment a feature gets real code.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Check, CheckContext, Violation } from "../harness.ts";

const FEATURES = "packages/client/src/features";
// The known slice buckets (§2.1): a feature module lives in a bucket, never sprawls at the root.
const BUCKETS = new Set(["surfaces", "anchors", "components", "hooks", "lib"]);
// app-shell is the SHELL-tier frame (§4.1) — it additionally owns the slot registries + the shell store.
const SHELL_EXTRA = new Set(["registry", "store"]);
const CODE_RE = /\.tsx?$/u;
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

// The three shape rules for ONE built feature (extracted to keep `run` under the complexity cap).
function checkFeature(dir: string, name: string): Violation[] {
  const out: Violation[] = [];
  const rel = `${FEATURES}/${name}/`;
  const allowed = name === "app-shell" ? new Set([...BUCKETS, ...SHELL_EXTRA]) : BUCKETS;
  // 1. front-door — a built feature exposes features/<name>/index.ts (the dep-cruiser
  //    client-feature-front-door rule forces consumers through it; this enforces it EXISTS).
  if (!existsSync(join(dir, "index.ts"))) {
    out.push({
      file: rel,
      line: 0,
      message: `built feature '${name}' has no index.ts front door — consumers enter a slice through its index (UI-Arch §2.1).`,
    });
  }
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      // 2. buckets — a slice's subdirs come from the known set; a new bucket is a deliberate
      //    addition (update the set), not silent sprawl.
      if (!allowed.has(e.name)) {
        out.push({
          file: `${rel}${e.name}/`,
          line: 0,
          message: `unknown bucket '${e.name}' in feature '${name}' — slice subdirs are {${[...allowed].sort().join(", ")}} (UI-Arch §2.1).`,
        });
      }
    } else if (!ROOT_OK_RE.test(e.name)) {
      // 3. no-stray-root — the feature root holds only index.ts + *.md notes; every module lives in a
      //    bucket (surfaces/anchors/components/hooks/lib), never loose at the root.
      out.push({
        file: `${rel}${e.name}`,
        line: 0,
        message: `stray file '${e.name}' at the root of feature '${name}' — feature modules live in a bucket (surfaces/anchors/components/hooks/lib); only index.ts + notes at the root (UI-Arch §2.1).`,
      });
    }
  }
  return out;
}

export const clientStructure: Check = {
  name: "client-structure",
  run: (ctx: CheckContext): Violation[] => {
    const out: Violation[] = [];
    for (const name of featureDirs(ctx.root)) {
      const dir = join(ctx.root, FEATURES, name);
      // A reserved slice (only .gitkeep) is skipped; the shape activates when it holds real code.
      if (hasCode(dir)) {
        out.push(...checkFeature(dir, name));
      }
    }
    return out;
  },
};
