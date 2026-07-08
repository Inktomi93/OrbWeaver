import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Check, CheckContext, Violation } from "../harness.ts";

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

export const surfaceA11yFocus: Check = {
  name: "surface-a11y-focus",
  run: (ctx: CheckContext): Violation[] => {
    const base = join(ctx.root, FEATURES);
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
        const src = readFileSync(join(dir, "surfaces", f), "utf8");

        // Exclude shell layout surfaces that never unmount or don't represent drill-down pane transitions
        if (f.includes("app-shell") || f.includes("topbar")) {
          continue;
        }

        // If the surface renders a full page pane (no auto-focus primitive wrapper)
        // it must explicitly manage its own focus restoration on mount for agents and screen readers.
        if (!(AUTO_FOCUS_PRIMITIVES_RE.test(src) || FOCUS_CALL_RE.test(src))) {
          out.push({
            file: `${FEATURES}/${feat.name}/surfaces/${f}`,
            line: 0,
            message:
              "surface is missing A11y focus restoration. Drill-down/SPA surfaces must manage focus on mount (e.g. `ref.current?.focus()`) unless wrapped in a focus-trapping primitive (Popover, Dialog, etc.) (AGENT-NAVIGABILITY.md).",
          });
        }
      }
    }
    return out;
  },
};
