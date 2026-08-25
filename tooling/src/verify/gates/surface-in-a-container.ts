// Gate: surface-in-a-container (UI-Architecture-and-Layout.md §4) — a SURFACE is the containment
// CONSUMER (pure content querying `@container` variants); it must sit inside a `<Container>` /
// `<Section container>` that owns `container-type`. Flags a surfaces/*.tsx that renders structural JSX
// but references no `@orb/ui/layout` container, either in the surface itself or in any file under its
// feature's `anchors/` dir — §4's realized shape is anchor-wraps-surface. Per-FEATURE match, not per-surface-to-specific-anchor tracing.
// COMMENT POSTURE: comment-SAFE — structural/container evidence is exact JSX tag identity. DECLARED LIMIT:
// composed-child-only surfaces need no container; any anchor container is the feature-level wrapper proof.
// biome-ignore-all lint/security/noSecrets: the mustFlag/mustPass example strings are TSX surface fixture
// snippets, not secrets.
import type { SourceFile } from "ts-morph";
import type { GateDescriptor } from "../contract/gate.ts";
import type { Violation } from "../contract/harness.ts";
import { renderedTagNames } from "../lib/baseui-read.ts";
import { repoRel } from "../lib/pass.ts";

// The shell tier is the top-level container PROVIDER (§4.1) — exempt from "sit inside a Container".
// TWO-SIDED (gate-hub #10): a SHELL_EXEMPT row naming a feature that no longer exists is RED — the
// exemption ratchets down with its feature instead of silently un-scanning a name someone later reuses.
const SHELL_EXEMPT = new Set(["app-shell"]);
const GATE_SELF = "tooling/src/verify/gates/surface-in-a-container.ts";
/** Real-tree anchor (gate-hub #11): a feature that is NOT the exempt one, so a synthetic conformance tree
 *  (which builds its own `features/x/`) never "proves" the shell tier had vanished. */
const ANCHOR_FEATURE = "chat";
const STALE_PREFIX = "stale SHELL_EXEMPT row — no such feature dir under packages/client/src/features (ratchet down): ";
// A layout container from @orb/ui/layout: the surface (or, once cross-file, its anchor) must render one.
const CONTAINER_TAGS = new Set(["Container", "Section"]);
// A structural root worth containing — the surface establishes layout (a raw box/grid/flex element).
// A surface that returns only text / a single composed child needs no container of its own.
const STRUCTURAL_TAGS = new Set(["div", "main", "section", "ul", "ol", "form", "Stack", "Row", "Grid", "Toolbar"]);
const FEATURE_FILE_RE = /^packages\/client\/src\/features\/([^/]+)\/(surfaces|anchors)\/[^/]+\.tsx$/u;

function hasTag(sf: SourceFile, names: ReadonlySet<string>): boolean {
  return [...renderedTagNames(sf).keys()].some((tag) => names.has(tag));
}

// The calibrated cross-file exemption: does ANY `.tsx` file under this feature's `anchors/` dir render
// a layout container? (the anchor-wraps-surface shape §4 mandates — message-thread-anchor.tsx is the
// first real instance). No anchors dir, or none of its files mention Container/Section → false.
function anchorHasContainer(anchors: readonly SourceFile[]): boolean {
  return anchors.some((sf) => hasTag(sf, CONTAINER_TAGS));
}

interface FeatureFiles {
  readonly surfaces: ReadonlyMap<string, readonly { readonly rel: string; readonly sf: SourceFile }[]>;
  readonly anchors: ReadonlyMap<string, readonly SourceFile[]>;
  readonly features: ReadonlySet<string>;
}

function indexFeatureFiles(root: string, files: readonly SourceFile[]): FeatureFiles {
  const surfaces = new Map<string, { rel: string; sf: SourceFile }[]>();
  const anchors = new Map<string, SourceFile[]>();
  const features = new Set<string>();
  for (const sf of files) {
    const rel = repoRel(root, sf.getFilePath());
    const match = FEATURE_FILE_RE.exec(rel);
    const feature = match?.[1];
    const kind = match?.[2];
    if (feature === undefined || kind === undefined) {
      continue;
    }
    features.add(feature);
    if (kind === "anchors") {
      anchors.set(feature, [...(anchors.get(feature) ?? []), sf]);
    } else {
      surfaces.set(feature, [...(surfaces.get(feature) ?? []), { rel, sf }]);
    }
  }
  return { surfaces, anchors, features };
}

const CONTAINER_MESSAGE =
  "surface establishes raw structural layout but sits in no <Container>/<Section container> — a surface is the containment CONSUMER; wrap it in an @orb/ui/layout container (its own or its anchor's), never raw container-type (UI-Architecture-and-Layout.md §4).";

/** The shared-workspace AST scan used by the single-pass `run` descriptor. */
function scanSurfaceInAContainer(root: string, files: readonly SourceFile[]): { readonly violations: Violation[]; readonly features: ReadonlySet<string> } {
  const out: Violation[] = [];
  const indexed = indexFeatureFiles(root, files);
  for (const [feature, featureSurfaces] of indexed.surfaces) {
    if (SHELL_EXEMPT.has(feature)) {
      continue;
    }
    const containedByAnchor = anchorHasContainer(indexed.anchors.get(feature) ?? []);
    for (const { rel, sf } of featureSurfaces) {
      if (hasTag(sf, STRUCTURAL_TAGS) && !hasTag(sf, CONTAINER_TAGS) && !containedByAnchor) {
        out.push({ file: rel, line: 0, message: CONTAINER_MESSAGE });
      }
    }
  }
  return { violations: out, features: indexed.features };
}

export const gate: GateDescriptor = {
  name: "surface-in-a-container",
  docRow: "UI-Architecture-and-Layout.md §4",
  status: "active",
  scopeSafety: "whole-project",
  message: CONTAINER_MESSAGE,
  fix: "wrap the surface in an @orb/ui/layout <Container>/<Section container> (its own or its anchor's) — never raw container-type.",
  run: (ctx) => {
    const scan = scanSurfaceInAContainer(ctx.root, ctx.files);
    for (const v of scan.violations) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
    if (!scan.features.has(ANCHOR_FEATURE)) {
      return; // synthetic tree — the stale arm is a whole-tree claim
    }
    for (const feat of SHELL_EXEMPT) {
      if (!scan.features.has(feat)) {
        ctx.report({
          file: GATE_SELF,
          line: 1,
          column: 0,
          message: `${STALE_PREFIX}"${feat}" — delete the row in tooling/src/verify/gates/surface-in-a-container.ts`,
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
        "packages/client/src/features/x/surfaces/commented-container.tsx":
          "// Containment: wrap this in <Container> when the pane gets its own scroll area.\nexport const Pane = () => <div><ul><li>row</li></ul></div>;\n",
      },
      expect: { messageIncludes: "no <Container>" },
      why: "COMMENT POSTURE (issue #117/#132) in the PERMISSIVE direction: a surface whose COMMENT names `<Container>` establishes no containing block — a file-text scan reads the plan as the deed and the surface ships uncontained",
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
