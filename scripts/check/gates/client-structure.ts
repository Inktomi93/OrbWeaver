// Gate: client-structure (docs/architecture/core/UI-Architecture-and-Layout.md §2.1 + §4) — the
// @orb/client feature-slice layout. The client twin of feature-structure (server domains) +
// ui-primitive-structure (@orb/ui): file-shape invariants dep-cruiser can't see (it watches imports,
// not layout). Enforced per-BUILT-feature — a slice holding only a .gitkeep (reserved, not yet built)
// is SKIPPED, so this gate is green on the empty scaffold and activates the moment a feature gets real
// code. Ports neo-tavern's 7-rule client-structure (reference/neo-tavern/scripts/check/) ADAPTED to
// orb's fleet: the surface↔anchor split (rule 7) is core D42 doctrine (§4), the reserved set +
// container-suffix vocabulary are orb-verified (NOT neo's shadcn names).
//
//   1. front-door        — a built feature exposes features/<name>/index.ts (§2.1).
//   2. mirror invariant  — a built feature name is a RESERVED UI-only slice OR mirrors a real
//                          packages/server/src/domain/<name> (read live). No _shared in orb.
//   3. no-stray-root     — the feature root holds only index.ts + *.md notes; modules live in buckets.
//   4. buckets           — a slice's subdirs come from the known set (app-shell adds registry/store).
//   5. surface naming    — surfaces/*.tsx end in -surface.tsx (§2.1 surfaces/ bucket).
//   6. hook / anchor naming — hooks/*.ts are use-*, hooks/*.tsx are use-*|-context|-provider;
//                          anchors/*.tsx end in a container-type suffix (the CONTAINMENT-PROVIDER role).
//   7. surface purity    — a surfaces/*.tsx must NOT render its own outer container primitive
//                          (Dialog/AlertDialog/Drawer — the modal-root sub-family). Establishing the
//                          containment box is the anchor's job (§4/§2.1 surfaces = CONSUMER, anchors =
//                          PROVIDER). Anchored floats (Popover/Menu/Select/Tooltip) are legal inline.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GateDescriptor } from "../contract.ts";
import type { Check, CheckContext, Violation } from "../harness.ts";

const FEATURES = "packages/client/src/features";
const DOMAINS = "packages/server/src/domain";
// The known slice buckets (§2.1): a feature module lives in a bucket, never sprawls at the root.
const BUCKETS = new Set(["surfaces", "anchors", "components", "hooks", "lib"]);
// app-shell is the SHELL-tier frame (§4.1) — it additionally owns the slot registries + the shell store.
const SHELL_EXTRA = new Set(["registry", "store"]);
// RESERVED UI-only slices (verified against orb's features/ + the AGENTS §6 domain map — orb has NO
// _shared; corpus is NOT reserved, it must rename to the `discovery` domain when built — W1-0d/PD).
const RESERVED = new Set(["app-shell", "auth", "prompt-manager", "user-admin"]);
// Container-type vocabulary for anchor filenames (anchor = the containment PROVIDER; §4). Orb-verified
// against the @orb/ui overlay fleet (packages/ui/src/primitives): dialog/drawer are the modal roots,
// popover/menu the anchored floats an anchor may own; `anchor`/`panel` are the shell-tier dock names.
// NOT neo's shadcn `sheet`/`sidebar` (no such orb primitive). "alert-dialog"-named anchors resolve to
// the `dialog` suffix via last-hyphen-segment extraction below.
const ANCHOR_SUFFIXES = ["anchor", "dialog", "drawer", "popover", "menu", "panel"];
// Raw outer-container primitives a SURFACE must never render itself — that's the anchor's job. Matches
// only the bare modal ROOT tag: `<Dialog` followed by whitespace/`>`/`/`, so it hits `<Dialog>`/
// `<Dialog ` but NOT `<DialogTrigger`/`<DialogPopup` (a surface legitimately composes an anchor's
// parts) and NOT `<ConfirmDialog`. The three names are orb's modal-root sub-family (§13.7 "modals:
// Backdrop+Popup"); anchored floats (Popover/Menu/Select/Tooltip) are inline-legal, deliberately out.
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

function filesIn(dir: string, bucket: string): string[] {
  try {
    return readdirSync(join(dir, bucket), { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => e.name);
  } catch {
    return [];
  }
}

// Rule 5 (surface naming) + Rule 7 (surface purity) — the surfaces/ bucket. app-shell is exempt from
// the -surface.tsx NAMING contract only (its surfaces are the frame's REGION chrome — rail/list/
// content/context, §4.1 — named for their region, not placeable content surfaces); surface PURITY
// still applies to it (frame overlays belong in app-shell/anchors/, surfaces stay pure).
function checkSurfaces(dir: string, name: string, out: Violation[]): void {
  const rel = `${FEATURES}/${name}`;
  const namingExempt = name === "app-shell";
  for (const f of filesIn(dir, "surfaces")) {
    if (!f.endsWith(".tsx")) {
      continue;
    }
    if (!(namingExempt || f.endsWith("-surface.tsx"))) {
      out.push({
        file: `${rel}/surfaces/${f}`,
        line: 0,
        message: `surface files end in -surface.tsx (got '${f}') — the surfaces/ bucket is the containment CONSUMER tier (UI-Architecture-and-Layout.md §2.1).`,
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
    if (!hookNameOk(f)) {
      out.push({
        file: `${rel}/hooks/${f}`,
        line: 0,
        message: `hooks/ files are use-*.ts (pure hooks) or *-context.tsx / *-provider.tsx (co-located providers); got '${f}' (UI-Architecture-and-Layout.md §2.1).`,
      });
    }
  }
  for (const f of filesIn(dir, "anchors")) {
    if (!f.endsWith(".tsx")) {
      continue;
    }
    const base = f.replace(TSX_RE, "");
    const suffix = base.slice(base.lastIndexOf("-") + 1);
    if (!ANCHOR_SUFFIXES.includes(suffix)) {
      out.push({
        file: `${rel}/anchors/${f}`,
        line: 0,
        message: `anchor files end in a container-type suffix {${ANCHOR_SUFFIXES.join(", ")}} (got '${f}') — an anchor names the containment it PROVIDES (UI-Architecture-and-Layout.md §4). Add to ANCHOR_SUFFIXES in scripts/check/gates/client-structure.ts if it's a real new container type.`,
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
  // 5 + 6 + 7 — per-bucket file naming + surface purity.
  checkSurfaces(dir, name, out);
  checkHooksAndAnchors(dir, name, out);
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

export const clientStructure: Check = {
  name: "client-structure",
  run: (ctx: CheckContext): Violation[] => scanClientStructure(ctx.root),
};

// ── SINGLE-PASS CONTRACT FORM (§1.2 — a pure-FS `run` gate, fsBacked conformance) ──────────────────
// client-structure reads the real filesystem (readdirSync/existsSync/readFileSync of the features + domain
// dirs), never the ts-morph Project — so it ports as a `run` descriptor over ctx.root reusing the exact
// scan, and declares `fsBacked` so the conformance runner materializes its examples into a real temp dir.
// Findings are file-level (line 0). Byte-identical to the legacy Check. Kept ALONGSIDE the legacy Check.
export const gate: GateDescriptor = {
  name: "client-structure",
  docRow: "UI-Architecture-and-Layout.md §2.1 (§4)",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message:
    "a BUILT @orb/client feature slice violates the feature-slice layout — a missing index.ts front door, a name that is neither reserved nor a real server-domain mirror, a stray root file, an unknown bucket, or a mis-named surface/hook/anchor / a surface rendering its own outer container (UI-Architecture-and-Layout.md §2.1 + §4).",
  fix: "add the index.ts front door, move loose modules into a bucket (surfaces/anchors/components/hooks/lib), rename to the served domain (or add to RESERVED), and name surfaces `-surface.tsx` / hooks `use-*` / anchors by container suffix.",
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
  ],
  mustPass: [
    {
      files: {
        "packages/server/src/domain/chat/index.ts": "export const d = 1;\n",
        "packages/client/src/features/chat/index.ts": "export const i = 1;\n",
        "packages/client/src/features/chat/surfaces/chat-surface.tsx":
          "export const S = () => null;\n",
        "packages/client/src/features/chat/hooks/use-chat.ts": "export const useChat = () => 1;\n",
      },
      why: "a built feature mirroring a real domain with an index.ts, a -surface.tsx, and a use-* hook — the layout, passes",
    },
  ],
};
