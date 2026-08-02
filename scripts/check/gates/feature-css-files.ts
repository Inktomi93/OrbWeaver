// Gate: feature-css-files (client-architecture-lockdown.md §4 + §16 G14) — the paint law's fs backstop.
// The §4 sanctioned-CSS-homes table names exactly ONE feature-tier hand-written file, shell.css (the
// animated dynamic-track layout engine); every other feature is tokens/variants/globals only. A `.css`
// file anywhere else under `features/**` is the god-feature pattern this gate closes off (`settings-shell.css`
// was the last offender, dissolved at M6.3).
//
// TWO-SIDED (gate-hub #10 — an exemption vocabulary is two-sided from birth): an ALLOWLIST row naming a
// `.css` file that no longer exists is RED (ratchet down — the exception died with the file). The stale arm
// self-guards on a REAL-TREE ANCHOR (gate-hub #11): a conformance temp dir holds a handful of synthetic
// files and would "prove" shell.css had vanished, so the arm only judges when the real app-shell feature dir
// is on disk.
import { existsSync, globSync } from "node:fs";
import { join } from "node:path";
import type { GateDescriptor } from "../contract.ts";

const FEATURES_GLOB = "packages/client/src/features/**/*.css";
const ALLOWLIST = new Set(["packages/client/src/features/app-shell/surfaces/shell.css"]);
const GATE_SELF = "scripts/check/gates/feature-css-files.ts";
/** Real-tree anchor: on disk for every real run, absent from a synthetic tree unless an example
 *  materializes it deliberately (which is exactly how the stale arm's own proof works). */
const ANCHOR = "packages/client/src/features/app-shell";
const STALE_PREFIX = "stale ALLOWLIST row — the sanctioned feature-tier CSS file no longer exists (ratchet down; the exception died with the file): ";

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
    if (!existsSync(join(ctx.root, ANCHOR))) {
      return; // synthetic tree — the stale arm is a WHOLE-TREE claim, never made on a handful of files
    }
    for (const rel of ALLOWLIST) {
      if (!existsSync(join(ctx.root, rel))) {
        ctx.report({ file: GATE_SELF, line: 1, column: 0, message: `${STALE_PREFIX}"${rel}" — delete the row in scripts/check/gates/feature-css-files.ts` });
      }
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
    {
      files: {
        "packages/client/src/features/app-shell/surfaces/shell.tsx": "export const Shell = null;\n",
      },
      expect: { count: 1, messageIncludes: "stale ALLOWLIST row" },
      why: "THE STALE ARM: the real-tree anchor (app-shell/) is present but the allowlisted shell.css is gone — the sanction outlived its file and must ratchet down",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/client/src/features/app-shell/surfaces/shell.css": ".shell-grid { display: grid; }\n",
      },
      why: "the ONE allowlisted feature-tier file (the structural layout engine) passes — and, with the anchor present, its row proves itself still earned",
    },
    {
      files: {
        "packages/client/src/features/chat/components/thing.tsx": "export const T = null;\n",
      },
      why: "THE ANCHOR GUARD: a feature tree without the real app-shell dir is not the real tree — the stale arm stays silent instead of 'proving' shell.css vanished",
    },
  ],
};
