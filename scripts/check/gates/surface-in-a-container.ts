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
const SHELL_EXEMPT = new Set(["app-shell"]);
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
  },
  mustFlag: [
    {
      files: {
        "packages/client/src/features/x/surfaces/pane.tsx":
          "export const Pane = () => <div><ul><li>row</li></ul></div>;\n",
      },
      expect: { messageIncludes: "no <Container>" },
      why: "a surface with a raw structural <div>/<ul> root + no Container (own or anchor's) — §4",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/client/src/features/x/surfaces/ok.tsx":
          "export const Ok = () => <Container><ul><li>row</li></ul></Container>;\n",
      },
      why: "the surface renders a <Container> around its structural content — the sanctioned shape, passes",
    },
    {
      files: {
        "packages/client/src/features/x/surfaces/name-surface.tsx":
          "export const N = () => <Name />;\n",
      },
      why: "a surface returning only a single composed child (no structural root) needs no container — passes",
    },
    {
      files: {
        "packages/client/src/features/app-shell/surfaces/app-shell.tsx":
          "export const A = () => <Stack>x</Stack>;\n",
      },
      why: "the app-shell shell tier is the container PROVIDER frame — exempt, passes",
    },
  ],
};
