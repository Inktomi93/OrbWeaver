// Gate: empty-state-has-action (design-enforcement.md §3.2, D62 — the rule-1 "no dead ends" mechanical
// half). A JSX `<EmptyState>` render in `packages/client/src/features/**` must pass an `action` prop (a
// next-step CTA — @orb/ui/button `Button`, typically) OR appear in the ALLOWLIST below. Without one, an
// empty state teaches nothing and strands the user (design-enforcement.md §3.2's finding: "today 5 of 6
// empty states are dead").
//
// SHAPE: for every `.tsx` file under features/**, walk `<EmptyState … />` JSX elements. `action={…}` (any
// attribute literally named `action`) or a spread attribute (`{...cond ? { action: … } : {}}` — a
// conditional CTA the gate can't statically resolve, so it's treated as present) counts as satisfied.
//
// ALLOWLIST (file-level, the no-interactive-role-in-features BURN_DOWN precedent): a file lands here the
// commit its dead-end EmptyState is discovered, with the reason — either a genuine "no next step exists"
// case (a search/filter yielding zero results, "nothing left to do") or real debt awaiting a CTA design
// call. An allowlisted file that has gone CLEAN (every EmptyState in it now passes `action`) is RED (stale
// entry — remove it); a NEW file with a dead-end EmptyState not in the allowlist is RED immediately.
import type { JsxAttributeLike, JsxSelfClosingElement, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { Check, CheckContext, Violation } from "../harness.ts";

const FEATURES_DIR = "/packages/client/src/features/";
const TAG_NAME = "EmptyState";

/** Current dead-end files → reason. See no-interactive-role-in-features.ts for the ratchet contract. */
const ALLOWLIST: Record<string, string> = {
  "packages/client/src/features/app-shell/components/section-placeholder.tsx":
    "the generic unbuilt-section placeholder (modal-body-not-placeholder's SectionPlaceholder sibling) " +
    "— has no section-specific next step to offer; the flag is on the eventual real section body, not here.",
  "packages/client/src/features/settings/components/settings-pane-placeholder.tsx":
    "the settings equivalent of section-placeholder.tsx — same reasoning.",
  "packages/client/src/features/preset/components/preset-library-welcome.tsx":
    'a "pick from the left, or create one" nudge shown alongside the library list (which itself carries ' +
    "the create CTA) — not a true dead end, but has no action prop of its own; design-enforcement.md §3.2 follow-up.",
  "packages/client/src/features/chat/anchors/character-gallery-dialog.tsx":
    'the "Nothing left to add" state (every owned image is already in the gallery) has no next step — ' +
    "genuinely nothing to do.",
  "packages/client/src/features/preset/components/preset-section-inspector.tsx":
    'the "Select a section to inspect it" prompt shown when no rack row is selected — the next step (pick ' +
    "a row) lives in the sibling rack, not here; same reasoning as preset-library-welcome.tsx.",
};

const MESSAGE =
  "<EmptyState> with no `action` CTA (design-enforcement.md §3.2) — every empty-state render must offer " +
  "a next-action affordance (an @orb/ui Button, typically) so the user isn't stranded at a dead end.";

const STALE_ENTRY_MESSAGE_PREFIX =
  "ALLOWLIST entry has NO dead-end <EmptyState> any more — every render in it now passes `action` " +
  "(ratchet down): delete the stale row in empty-state-has-action.ts: ";

function clientRel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path : path.slice(idx + 1);
}

/** Does this `<EmptyState .../>` carry an `action` prop, or a spread that MIGHT (a conditional CTA the
 *  gate can't statically resolve, so it's given the benefit of the doubt)? */
function hasAction(el: JsxSelfClosingElement): boolean {
  return el.getAttributes().some((attr: JsxAttributeLike) => {
    if (attr.getKind() === SyntaxKind.JsxSpreadAttribute) {
      return true;
    }
    return (
      attr.getKind() === SyntaxKind.JsxAttribute && attr.getFirstChild()?.getText() === "action"
    );
  });
}

/** Lines of every dead-end `<EmptyState>` (no `action`) in this file. */
function offenceLines(sf: SourceFile): number[] {
  const lines: number[] = [];
  for (const el of sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)) {
    if (el.getTagNameNode().getText() === TAG_NAME && !hasAction(el)) {
      lines.push(el.getStartLineNumber());
    }
  }
  return lines;
}

/** The offender scan: new-offender violations + which allowlisted files still carry a dead-end render. */
function scanFeatures(
  project: CheckContext["project"],
  allowlist: Record<string, string>,
): { violations: Violation[]; seenAllowlisted: Set<string> } {
  const violations: Violation[] = [];
  const seenAllowlisted = new Set<string>();
  for (const sf of project.getSourceFiles()) {
    const path = sf.getFilePath();
    if (!(path.includes(FEATURES_DIR) && path.endsWith(".tsx"))) {
      continue;
    }
    const rel = clientRel(path);
    const lines = offenceLines(sf);
    if (rel in allowlist) {
      if (lines.length > 0) {
        seenAllowlisted.add(rel);
      }
      continue;
    }
    for (const line of lines) {
      violations.push({ file: rel, line, message: MESSAGE });
    }
  }
  return { violations, seenAllowlisted };
}

/** The ratchet-down arm: an allowlisted file that never surfaced a dead-end render (absent OR gone clean). */
function staleEntries(
  allowlist: Record<string, string>,
  seenAllowlisted: ReadonlySet<string>,
): Violation[] {
  return Object.keys(allowlist)
    .filter((rel) => !seenAllowlisted.has(rel))
    .map((rel) => ({
      file: "scripts/check/gates/empty-state-has-action.ts",
      line: 1,
      message: `${STALE_ENTRY_MESSAGE_PREFIX}"${rel}" — scripts/check/gates/empty-state-has-action.ts`,
    }));
}

/** Factory (the createNoInteractiveRoleInFeatures precedent): the self-test drives BOTH ratchet arms with
 *  an injected registry. */
export function createEmptyStateHasAction(allowlist: Record<string, string>): Check {
  return {
    name: "empty-state-has-action",
    run: ({ project }): Violation[] => {
      const { violations, seenAllowlisted } = scanFeatures(project, allowlist);
      return [...violations, ...staleEntries(allowlist, seenAllowlisted)];
    },
  };
}

export const emptyStateHasAction: Check = createEmptyStateHasAction(ALLOWLIST);
