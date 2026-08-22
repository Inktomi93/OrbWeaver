// A feature `surfaces/*.tsx` manages focus on mount, OR declares — in source, with an owner and a reason —
// that its section's arrival focus is owned by ANOTHER pane. Four arms: missing focus · a valid declaration
// (pass) · a declaration on a surface that DOES focus (stale, two-sided) · a malformed declaration.
// COMMENT POSTURE: comment-BLIND for the focus detection (wired through `comment-spans.ts` — a comment
// naming `.focus(` must not exempt) and comments-INTENDED for the marker, which is read from RAW text.
// biome-ignore-all lint/security/noSecrets: the mustFlag/mustPass example strings are TSX surface fixture
// snippets, not secrets.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GateDescriptor } from "../contract/gate.ts";
import type { Violation } from "../contract/harness.ts";
import { blankTsCommentsInText } from "../lib/comment-spans.ts";

const FEATURES = "packages/client/src/features";

// Base UI primitives that inherently trap/manage focus on mount. Surfaces returning these as their root
// are exempt from manual focus restoration.
const AUTO_FOCUS_PRIMITIVES_RE = /<(?:Popover|Dialog|Tooltip|Dropdown|Sheet)[\s/>]/u;

// We check if a surface explicitly calls `.focus()` (usually via a `useLayoutEffect` and a `surfaceRef`).
// Or if it uses the shared `useFocusOnMount` hook, or delegates focus management to an internal component.
const FOCUS_CALL_RE = /(?:\.focus\(|useFocusOnMount)/u;

// ── THE DECLARED EXEMPTION (side-eye corpus re-pass #2 P2-4, ruled 2026-08-19) ────────────────────────
// The absolute rule was structurally incomplete for a REAL composition: a section whose LIST pane owns
// arrival focus (the corpus omnibox) and whose CONTENT surface must NOT compete for it. CONTENT mounts
// second, so a focus-on-mount there always wins — and the corpus overview's target was its own
// `tabIndex={-1}` root: an 869x7831 unnamed div with `outline: none`, announced as nothing.
//
// WHY A MARKER AND NOT THE HOUSE'S TYPED ROW (§4.1): the exemption is a property of the surface's
// COMPOSITION, and a path-keyed table is exactly the shape §3 warns about — it goes silently stale the day
// the file moves, while the declaration travels with the file it describes and is read by the next person
// who opens it. The MANDATORY parts do the work a row's `why` does: `<owner>` names the control that
// actually takes arrival focus (so the claim is checkable against that pane), and the reason carries the
// proof — the CT that pins it.
//
// It is TWO-SIDED (§4.4): a surface carrying this marker AND managing focus is RED, because the promise it
// makes is no longer the truth of the file, and the next author would inherit an exemption nobody granted.
const MARKER = "@surface-focus-elsewhere";
/** The whole grammar: a `//` comment whose own text OPENS with the vocabulary (the mention fence — a
 *  quotation of it inside prose or a string is inert), a non-empty owner in parens, a non-empty reason. */
const MARKER_RE = /^[^\S\n]*\/\/[^\S\n]*@surface-focus-elsewhere\([^\S\n]*([^)\n]*?\S)[^\S\n]*\)[^\S\n]*:[^\S\n]*(\S[^\n]*)$/mu;
/** Any line that OPENS a comment with the vocabulary — the malformed arm's net. */
const MARKER_OPENER_RE = /^[^\S\n]*\/\/[^\S\n]*@surface-focus-elsewhere/mu;

const A11Y_MESSAGE =
  "surface is missing A11y focus restoration. Drill-down/SPA surfaces must manage focus on mount (e.g. `ref.current?.focus()`) unless wrapped in a focus-trapping primitive (Popover, Dialog, etc.), or declaring `// @surface-focus-elsewhere(<owner>): <reason>` when another pane owns the section's arrival focus (UI-Gates-and-Lessons.md §8).";
const STALE_MESSAGE = `stale \`${MARKER}\` — this surface DOES manage focus on mount, so the declaration exempts nothing and would silently absolve the next author who removes that focus. Delete the marker (UI-Gates-and-Lessons.md §8).`;
const MALFORMED_MESSAGE = `malformed \`${MARKER}\` — the grammar is \`// ${MARKER}(<owner>): <reason>\`, and BOTH parts are required: the owner names the control that actually takes the section's arrival focus, the reason states why and names the test that pins it. A marker that exempts nothing must not sit there looking like protection (UI-Gates-and-Lessons.md §8).`;
const BLIND_MESSAGE = `${FEATURES} exists but this gate found ZERO surface files — its \`surfaces/\` derivation came back empty, so it is a no-op reporting green. Re-point the derivation (tooling/src/verify/gates/GATE-AUTHORING.md §4).`;

function surfaceFiles(dir: string): string[] {
  const surfaces = join(dir, "surfaces");
  if (!existsSync(surfaces)) {
    return [];
  }
  return readdirSync(surfaces, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".tsx"))
    .map((e) => e.name);
}

/** 1-based line of the first marker opener, for a finding that points at the declaration itself. */
function markerLine(raw: string): number {
  const lines = raw.split("\n");
  const index = lines.findIndex((line) => MARKER_OPENER_RE.test(line));
  return index + 1;
}

/** The verdict for ONE surface file, given its raw text. Split out so the report shape below has exactly
 *  one construction site (`finding-overload-provenance`: one literal, not four). */
function verdictFor(raw: string): { readonly message: string; readonly line: number } | null {
  // Comments blanked for the FOCUS detection (issue #117/#132), the PERMISSIVE direction: a surface whose
  // comment names `.focus()` or an auto-focus primitive would read as focus-managing while managing none.
  const code = blankTsCommentsInText(raw);
  const managesFocus = AUTO_FOCUS_PRIMITIVES_RE.test(code) || FOCUS_CALL_RE.test(code);
  // The marker is read from RAW text on purpose — it IS a comment (comments-INTENDED).
  const declared = MARKER_RE.exec(raw);
  const opens = MARKER_OPENER_RE.test(raw);
  if (opens && declared === null) {
    return { message: MALFORMED_MESSAGE, line: markerLine(raw) };
  }
  if (declared !== null) {
    // Two-sided: a declaration on a surface that manages its own focus is stale, not free.
    return managesFocus ? { message: STALE_MESSAGE, line: markerLine(raw) } : null;
  }
  return managesFocus ? null : { message: A11Y_MESSAGE, line: 0 };
}

/** The fs scan shared by the legacy Check and the single-pass `run` descriptor. */
function scanSurfaceA11yFocus(root: string): Violation[] {
  const base = join(root, FEATURES);
  if (!existsSync(base)) {
    return [];
  }
  const out: Violation[] = [];
  let surfacesSeen = 0;
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
      surfacesSeen += 1;
      const verdict = verdictFor(readFileSync(join(dir, "surfaces", f), "utf8"));
      if (verdict !== null) {
        out.push({ file: `${FEATURES}/${feat.name}/surfaces/${f}`, line: verdict.line, message: verdict.message });
      }
    }
  }
  // §4.6 BLINDNESS TRIPWIRE: this gate is keyed on an exact directory NAME. The day `surfaces/` is renamed
  // (or the features root moves under it), the loop above walks nothing and the gate reports ✓ forever.
  if (surfacesSeen === 0) {
    out.push({ file: `${FEATURES}`, line: 0, message: BLIND_MESSAGE });
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
  fix: "manage focus on mount (`ref.current?.focus()` / `useFocusOnMount`), wrap the surface in a focus-trapping primitive (Popover/Dialog), or — when another pane owns the section's arrival focus — declare `// @surface-focus-elsewhere(<owner>): <reason>` in the surface.",
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
    {
      files: {
        "packages/client/src/features/x/surfaces/no-owner.tsx":
          "// @surface-focus-elsewhere(): the list pane takes it\nexport const Pane = () => <div>content</div>;\n",
      },
      expect: { messageIncludes: "malformed" },
      why: "MALFORMED, its own flavour (§5 case 4): an empty owner names no control, so the claim cannot be checked against the pane that supposedly takes focus — and a marker that exempts nothing must not sit there looking like protection",
    },
    {
      files: {
        "packages/client/src/features/x/surfaces/no-reason.tsx": "// @surface-focus-elsewhere(SearchOmnibox)\nexport const Pane = () => <div>content</div>;\n",
      },
      expect: { messageIncludes: "malformed" },
      why: "MALFORMED, the other half: the house grammar is `marker:\\s*\\S` — a reason is REQUIRED, and a bare marker must exempt NOTHING (§4.3)",
    },
    {
      files: {
        "packages/client/src/features/x/surfaces/stale.tsx":
          "// @surface-focus-elsewhere(SearchOmnibox): the list pane owns arrival focus\nexport const Pane = () => {\n  ref.current?.focus();\n  return <div>content</div>;\n};\n",
      },
      expect: { messageIncludes: "stale" },
      why: "TWO-SIDED (§4.4): the surface manages its own focus, so the declaration promises something that is no longer true — and a stale marker is a loaded gun for the next author who deletes that focus call",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/client/src/features/x/surfaces/ok.tsx": "export const Ok = () => {\n  ref.current?.focus();\n  return <div>content</div>;\n};\n",
      },
      why: "the surface calls .focus() on mount — manages its own focus restoration, passes",
    },
    {
      files: {
        "packages/client/src/features/x/surfaces/declared.tsx":
          "// @surface-focus-elsewhere(SearchOmnibox): the corpus LIST pane's omnibox takes arrival focus; this CONTENT surface mounts second and must not steal it (pinned by corpus-list-surface.ct.tsx)\nexport const Declared = () => <div>content</div>;\n",
      },
      why: "the DECLARED arm: owner + reason present, no focus of its own — the composition the absolute rule could not express",
    },
    {
      files: {
        "packages/client/src/features/x/surfaces/mention.tsx":
          "/** Prose that MENTIONS the vocabulary: a surface may declare @surface-focus-elsewhere when another pane owns arrival focus. */\nexport const Mention = () => {\n  ref.current?.focus();\n  return <div>content</div>;\n};\n",
      },
      why: "THE MENTION FENCE (§4.3): the vocabulary quoted inside a JSDoc block is an inert mention, not a declaration — so it is neither an exemption nor a stale-marker accusation against a surface that does manage focus",
    },
  ],
};
