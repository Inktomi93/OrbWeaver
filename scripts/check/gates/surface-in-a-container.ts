// Gate: surface-in-a-container — LIVE (activated W1-1, 2026-07-04; first real consumer:
// features/chat/anchors/message-thread-anchor.tsx wraps features/chat/surfaces/message-list-surface.tsx).
// docs/architecture/core/UI-Architecture-and-Layout.md §4: a SURFACE is the containment CONSUMER —
// pure content that queries `@container` variants — and a surface is placed inside a `<Container>` /
// `<Section container>` that OWNS `container-type`. Feature code never writes raw containment; it wraps
// a surface in a layout container. This gate flags a surfaces/*.tsx that renders structural JSX but
// references NO `@orb/ui/layout` container (`<Container>` / `<Section>`) EITHER in the surface itself OR
// in any file under its feature's `anchors/` dir (the calibrated cross-file exemption below).
//
// Dormant-era reason #1 (no consumer) is resolved by the chat pair above. Reason #2 — CONTAINMENT IS
// ANCHOR-PROVIDED (cross-file: §4's realized shape is anchor-wraps-surface, the `<Container>` often
// lives in the surface's ANCHOR, a different file) — is resolved HERE, calibrated against that first
// real pair: a surface with no Container of its own is NOT a violation if ANY `.tsx` file in its
// feature's `anchors/` directory renders one (`anchorHasContainer`). This is a per-FEATURE match (not
// per-surface-to-specific-anchor render-tree tracing, which needs a type graph harness.ts doesn't load)
// — acceptable at today's scale (one anchor dir per feature); a feature that grows multiple anchors
// wrapping different surfaces would need per-file cross-referencing, revisit then.
// ACTIVATED, verbatim, in scripts/check/report.ts: `import { surfaceInAContainer } from
// "./gates/surface-in-a-container.ts";` + a `surfaceInAContainer,` entry in `ALL_CHECKS`.
//
// Self-tested: tests/tooling/surface-in-a-container.int.test.ts drives it over a temp-dir fixture tree
// (real fs — the gate reads surface files) proving fire (a surface with a raw `<div>` structural root
// + no Container) AND no-false-positive (a surface that renders `<Container>`), never the real tree.
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

// ── SINGLE-PASS CONTRACT FORM (§1.2 — a pure-FS `run` gate, fsBacked conformance) ──────────────────
// surface-in-a-container reads the real fs (readdirSync of feature dirs + readFileSync of each surface +
// its anchors/) — a `run` descriptor over ctx.root reusing the scan, with `fsBacked` so conformance
// materializes examples to a real temp dir. File-level findings. Byte-identical to the legacy Check.
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
