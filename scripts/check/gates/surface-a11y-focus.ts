// biome-ignore-all lint/security/noSecrets: the mustFlag/mustPass example strings are TSX surface fixture
// snippets, not secrets.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { blankTsCommentsInText } from "../comment-spans.ts";
import type { GateDescriptor } from "../contract.ts";
import type { Violation } from "../harness.ts";

const FEATURES = "packages/client/src/features";

// Base UI primitives that inherently trap/manage focus on mount. Surfaces returning these as their root
// are exempt from manual focus restoration.
const AUTO_FOCUS_PRIMITIVES_RE = /<(?:Popover|Dialog|Tooltip|Dropdown|Sheet)[\s/>]/u;

// We check if a surface explicitly calls `.focus()` (usually via a `useLayoutEffect` and a `surfaceRef`).
// Or if it uses the shared `useFocusOnMount` hook, or delegates focus management to an internal component.
const FOCUS_CALL_RE = /(?:\.focus\(|useFocusOnMount)/u;

function surfaceFiles(dir: string): string[] {
  const surfaces = join(dir, "surfaces");
  if (!existsSync(surfaces)) {
    return [];
  }
  return readdirSync(surfaces, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".tsx"))
    .map((e) => e.name);
}

const A11Y_MESSAGE =
  "surface is missing A11y focus restoration. Drill-down/SPA surfaces must manage focus on mount (e.g. `ref.current?.focus()`) unless wrapped in a focus-trapping primitive (Popover, Dialog, etc.) (UI-Gates-and-Lessons.md §8).";

/** The fs scan shared by the legacy Check and the single-pass `run` descriptor. */
function scanSurfaceA11yFocus(root: string): Violation[] {
  const base = join(root, FEATURES);
  if (!existsSync(base)) {
    return [];
  }
  const out: Violation[] = [];
  for (const feat of readdirSync(base, { withFileTypes: true })) {
    if (!feat.isDirectory()) {
      continue;
    }
    const dir = join(base, feat.name);
    for (const f of surfaceFiles(dir)) {
      // Exclude shell layout surfaces that never unmount or don't represent drill-down pane transitions.
      if (f.includes("app-shell") || f.includes("topbar")) {
        continue;
      }
      // Comments blanked first (issue #117/#132), the PERMISSIVE direction: a surface whose comment
      // names `.focus()` or an auto-focus primitive would read as focus-managing while managing none.
      const src = blankTsCommentsInText(readFileSync(join(dir, "surfaces", f), "utf8"));
      // A full-page pane (no auto-focus primitive wrapper) must manage focus on mount for a11y/agents.
      if (!(AUTO_FOCUS_PRIMITIVES_RE.test(src) || FOCUS_CALL_RE.test(src))) {
        out.push({
          file: `${FEATURES}/${feat.name}/surfaces/${f}`,
          line: 0,
          message: A11Y_MESSAGE,
        });
      }
    }
  }
  return out;
}

export const gate: GateDescriptor = {
  name: "surface-a11y-focus",
  docRow: "UI-Gates-and-Lessons.md §8",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message: A11Y_MESSAGE,
  fix: "manage focus on mount (`ref.current?.focus()` / `useFocusOnMount`), or wrap the surface in a focus-trapping primitive (Popover/Dialog).",
  run: (ctx) => {
    for (const v of scanSurfaceA11yFocus(ctx.root)) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      files: {
        "packages/client/src/features/x/surfaces/pane.tsx": "export const Pane = () => <div>content</div>;\n",
      },
      expect: { messageIncludes: "focus restoration" },
      why: "a full-page surface with no .focus()/useFocusOnMount and no focus-trapping primitive (a11y gap)",
    },
    {
      files: {
        "packages/client/src/features/x/surfaces/commented-focus.tsx":
          "// Focus: the anchor's <Dialog> owns it today; when this becomes a drill-down pane, call ref.focus() here.\nexport const Pane = () => <div>content</div>;\n",
      },
      expect: { messageIncludes: "focus restoration" },
      why: "COMMENT POSTURE (issue #117/#132) in the PERMISSIVE direction: a surface whose COMMENT names `.focus(` and a focus-trapping primitive manages no focus at all — a file-text scan hands it the exemption, which is the silent-green half of the comment-blindness class",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/client/src/features/x/surfaces/ok.tsx": "export const Ok = () => {\n  ref.current?.focus();\n  return <div>content</div>;\n};\n",
      },
      why: "the surface calls .focus() on mount — manages its own focus restoration, passes",
    },
  ],
};
