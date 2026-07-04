// Gate: surface-in-a-container — DORMANT (deferred-with-construct, the check:registry-pairing class).
// docs/architecture/core/UI-Architecture-and-Layout.md §4: a SURFACE is the containment CONSUMER —
// pure content that queries `@container` variants — and a surface is placed inside a `<Container>` /
// `<Section container>` that OWNS `container-type`. Feature code never writes raw containment; it wraps
// a surface in a layout container. This gate flags a surfaces/*.tsx that renders structural JSX but
// references NO `@orb/ui/layout` container (`<Container>` / `<Section>`).
//
// WHY DORMANT (two reasons, both recorded so activation isn't guesswork):
//   1. NO CONSUMER-SURFACE CONSTRUCT YET. The only surface on the tree today is the app-shell FIRST-BOOT
//      placeholder (packages/client/src/features/app-shell/surfaces/app-shell.tsx), which is the SHELL
//      tier — the top-level container PROVIDER / the sole viewport-@media frame (§4.1), structurally
//      EXEMPT from "must sit in a Container" (it establishes the containers). So there is no real
//      consumer surface to bite — identical status to check:registry-pairing (ships WITH its construct).
//      FINDING (informational): app-shell/surfaces/app-shell.tsx renders `<Stack>` at root, no Container
//      — correct for the shell frame; when activated, app-shell surfaces need an explicit exemption.
//   2. CONTAINMENT IS ANCHOR-PROVIDED (cross-file). §4's realized shape is anchor-wraps-surface: the
//      `<Container>` frequently lives in the surface's ANCHOR (a different file), not the surface
//      itself. Verifying "this surface renders UNDER a Container" therefore needs cross-file render-tree
//      tracing (which anchor mounts which surface) that the pure-AST ts-morph project (harness.ts loads
//      NO type graph) can't do reliably — a within-file "does this file mention Container?" heuristic
//      OVER-FIRES on every legit surface whose anchor provides the box. W1-1/the first real surfaces+
//      anchors calibrate the anchor-provided exemption before this goes live.
// ACTIVATE (once surfaces/anchors exist + the app-shell/anchor-provided exemptions are encoded), verbatim:
//   import { surfaceInAContainer } from "./gates/surface-in-a-container.ts";
// and a `surfaceInAContainer,` entry to the `ALL_CHECKS` array in scripts/check/report.ts.
//
// Self-tested: tests/tooling/surface-in-a-container.int.test.ts drives it over a temp-dir fixture tree
// (real fs — the gate reads surface files) proving fire (a surface with a raw `<div>` structural root
// + no Container) AND no-false-positive (a surface that renders `<Container>`), never the real tree.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Check, CheckContext, Violation } from "../harness.ts";

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

export const surfaceInAContainer: Check = {
  name: "surface-in-a-container",
  run: (ctx: CheckContext): Violation[] => {
    const base = join(ctx.root, FEATURES);
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
        if (STRUCTURAL_RE.test(src) && !CONTAINER_RE.test(src)) {
          out.push({
            file: `${FEATURES}/${feat.name}/surfaces/${f}`,
            line: 0,
            message:
              "surface establishes raw structural layout but sits in no <Container>/<Section container> — a surface is the containment CONSUMER; wrap it in an @orb/ui/layout container (its own or its anchor's), never raw container-type (UI-Architecture-and-Layout.md §4).",
          });
        }
      }
    }
    return out;
  },
};
