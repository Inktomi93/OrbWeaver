// Gate: feature-css-files (client-architecture-lockdown.md §4 + §16 G14) — the paint law's fs backstop.
// The §4 sanctioned-CSS-homes table names exactly ONE feature-tier hand-written file, shell.css (the
// animated dynamic-track layout engine); every other feature is tokens/variants/globals only. A `.css`
// file anywhere else under `features/**` is the god-feature pattern this gate closes off (`settings-shell.css`
// was the last offender, dissolved at M6.3).
import { globSync } from "node:fs";
import type { GateDescriptor } from "../contract.ts";

const FEATURES_GLOB = "packages/client/src/features/**/*.css";
const ALLOWLIST = new Set(["packages/client/src/features/app-shell/surfaces/shell.css"]);

export const gate: GateDescriptor = {
  name: "feature-css-files",
  docRow: "client-architecture-lockdown.md §4 / §16 G14",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message:
    "a `.css` file under features/** outside the §4 sanctioned allowlist — features write NEITHER CSS nor raw values (tokens/variants/globals only); shell.css is the ONE feature-tier exception (client-architecture-lockdown.md §4).",
  fix: "move the styles to a DTCG token (tokens.json), a @orb/ui variants.ts skin, or client/styles/globals.css (document-level); delete the feature-tier .css file.",
  run: (ctx) => {
    for (const rel of globSync(FEATURES_GLOB, { cwd: ctx.root })) {
      const posix = rel.replaceAll("\\", "/");
      if (ALLOWLIST.has(posix)) {
        continue;
      }
      ctx.report({ file: posix, line: 0, column: 0, message: gate.message });
    }
  },
  mustFlag: [
    {
      files: {
        "packages/client/src/features/__g_feature_css/lib/thing.css": ".g { color: red; }\n",
      },
      expect: { messageIncludes: "outside the §4 sanctioned allowlist" },
      why: "a .css file under features/** not on the allowlist is the banned feature-tier paint",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/client/src/features/app-shell/surfaces/shell.css":
          ".shell-grid { display: grid; }\n",
      },
      why: "the ONE allowlisted feature-tier file (the structural layout engine) passes",
    },
  ],
};
