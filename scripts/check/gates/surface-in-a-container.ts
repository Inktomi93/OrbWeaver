// Gate: surface-in-a-container (UI-Architecture-and-Layout.md §4) — a SURFACE is the containment
// CONSUMER (pure content querying `@container` variants); it must sit inside a `<Container>` /
// `<Section container>` that owns `container-type`. Flags a surfaces/*.tsx that renders structural JSX
// but references no `@orb/ui/layout` container, either in the surface itself or in any file under its
// feature's `anchors/` dir — §4's realized shape is anchor-wraps-surface. Per-FEATURE match, not per-surface-to-specific-anchor tracing.
// biome-ignore-all lint/security/noSecrets: the mustFlag/mustPass example strings are TSX surface fixture
// snippets, not secrets.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GateDescriptor } from "../contract.ts";
import type { Violation } from "../harness.ts";

const FEATURES = "packages/client/src/features";
// The shell tier is the top-level container PROVIDER (§4.1) — exempt from "sit inside a Container".
// TWO-SIDED (gate-hub #10): a SHELL_EXEMPT row naming a feature that no longer exists is RED — the
// exemption ratchets down with its feature instead of silently un-scanning a name someone later reuses.
const SHELL_EXEMPT = new Set(["app-shell"]);
const GATE_SELF = "scripts/check/gates/surface-in-a-container.ts";
/** Real-tree anchor (gate-hub #11): a feature that is NOT the exempt one, so a synthetic conformance tree
 *  (which builds its own `features/x/`) never "proves" the shell tier had vanished. */
const ANCHOR_FEATURE = "chat";
const STALE_PREFIX = "stale SHELL_EXEMPT row — no such feature dir under packages/client/src/features (ratchet down): ";
// A layout container from @orb/ui/layout: the surface (or, once cross-file, its anchor) must render one.
const CONTAINER_RE = /<(?:Container|Section)[\s/>]/u;
// A structural root worth containing — the surface establishes layout (a raw box/grid/flex element).
// A surface that returns only text / a single composed child needs no container of its own.
const STRUCTURAL_RE = /<(?:div|main|section|ul|ol|form|Stack|Row|Grid|Toolbar)[\s/>]/u;

function surfaceFiles(dir: string): string[] {
  const surfaces = join(dir, "surfaces");
  if (!existsSync(surfaces)) {
    return [];
  }
  return readdirSync(surfaces, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".tsx"))
    .map((e) => e.name);
}

// The calibrated cross-file exemption: does ANY `.tsx` file under this feature's `anchors/` dir render
// a layout container? (the anchor-wraps-surface shape §4 mandates — message-thread-anchor.tsx is the
// first real instance). No anchors dir, or none of its files mention Container/Section → false.
function anchorHasContainer(dir: string): boolean {
  const anchors = join(dir, "anchors");
  if (!existsSync(anchors)) {
    return false;
  }
  return readdirSync(anchors, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".tsx"))
    .some((e) => CONTAINER_RE.test(readFileSync(join(anchors, e.name), "utf8")));
}

const CONTAINER_MESSAGE =
  "surface establishes raw structural layout but sits in no <Container>/<Section container> — a surface is the containment CONSUMER; wrap it in an @orb/ui/layout container (its own or its anchor's), never raw container-type (UI-Architecture-and-Layout.md §4).";

/** The fs scan shared by the legacy Check and the single-pass `run` descriptor. */
function scanSurfaceInAContainer(root: string): Violation[] {
  const base = join(root, FEATURES);
  if (!existsSync(base)) {
    return [];
  }
  const out: Violation[] = [];
  for (const feat of readdirSync(base, { withFileTypes: true })) {
    if (!feat.isDirectory() || SHELL_EXEMPT.has(feat.name)) {
      continue;
    }
    const dir = join(base, feat.name);
    for (const f of surfaceFiles(dir)) {
      const src = readFileSync(join(dir, "surfaces", f), "utf8");
      if (STRUCTURAL_RE.test(src) && !CONTAINER_RE.test(src) && !anchorHasContainer(dir)) {
        out.push({
          file: `${FEATURES}/${feat.name}/surfaces/${f}`,
          line: 0,
          message: CONTAINER_MESSAGE,
        });
      }
    }
  }
  return out;
}

export const gate: GateDescriptor = {
  name: "surface-in-a-container",
  docRow: "UI-Architecture-and-Layout.md §4",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message: CONTAINER_MESSAGE,
  fix: "wrap the surface in an @orb/ui/layout <Container>/<Section container> (its own or its anchor's) — never raw container-type.",
  run: (ctx) => {
    for (const v of scanSurfaceInAContainer(ctx.root)) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
    if (!existsSync(join(ctx.root, FEATURES, ANCHOR_FEATURE))) {
      return; // synthetic tree — the stale arm is a whole-tree claim
    }
    for (const feat of SHELL_EXEMPT) {
      if (!existsSync(join(ctx.root, FEATURES, feat))) {
        ctx.report({
          file: GATE_SELF,
          line: 1,
          column: 0,
          message: `${STALE_PREFIX}"${feat}" — delete the row in scripts/check/gates/surface-in-a-container.ts`,
        });
      }
    }
  },
  mustFlag: [
    {
      files: {
        "packages/client/src/features/x/surfaces/pane.tsx": "export const Pane = () => <div><ul><li>row</li></ul></div>;\n",
      },
      expect: { messageIncludes: "no <Container>" },
      why: "a surface with a raw structural <div>/<ul> root + no Container (own or anchor's) — §4",
    },
    {
      files: {
        "packages/client/src/features/chat/surfaces/ok.tsx": "export const Ok = () => <Container><ul><li>row</li></ul></Container>;\n",
      },
      expect: { count: 1, messageIncludes: "stale SHELL_EXEMPT row" },
      why: "THE STALE ARM: the real-tree anchor feature is present but `app-shell` is not — the container-PROVIDER exemption outlived its feature and must ratchet down instead of un-scanning a name a future feature could reuse",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/client/src/features/x/surfaces/ok.tsx": "export const Ok = () => <Container><ul><li>row</li></ul></Container>;\n",
      },
      why: "the surface renders a <Container> around its structural content — the sanctioned shape, passes",
    },
    {
      files: {
        "packages/client/src/features/x/surfaces/name-surface.tsx": "export const N = () => <Name />;\n",
      },
      why: "a surface returning only a single composed child (no structural root) needs no container — passes",
    },
    {
      files: {
        "packages/client/src/features/app-shell/surfaces/app-shell.tsx": "export const A = () => <Stack>x</Stack>;\n",
      },
      why: "the app-shell shell tier is the container PROVIDER frame — exempt, passes; with no anchor feature present the stale arm also stays silent (THE ANCHOR GUARD)",
    },
    {
      files: {
        "packages/client/src/features/chat/surfaces/ok.tsx": "export const Ok = () => <Container><ul><li>row</li></ul></Container>;\n",
        "packages/client/src/features/app-shell/surfaces/app-shell.tsx": "export const A = () => <Stack>x</Stack>;\n",
      },
      why: "the row STILL EARNED, judged against the real-tree anchor: the exempt feature exists, so neither arm fires",
    },
  ],
};
