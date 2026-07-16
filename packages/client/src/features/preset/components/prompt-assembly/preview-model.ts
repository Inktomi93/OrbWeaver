// The preview view-model — pure, node-safe. Turns the live `PromptConfig.sections` into the display-only
// assembled read-out `<AssemblyPreview>` paints: ordered enabled sections split at the `chat_history`
// pivot into setup/conversation/post bands, consecutive same-role sections grouped under one header.
// Display only — macros are tokenized, never resolved; nothing here touches live chat data.

import type { PromptSection } from "@orb/contracts/preset";
import { DEFAULT_MARKER_TEMPLATES } from "@orb/contracts/preset";
import type { MessageRole } from "@orb/kit/message-role";
import { deriveZones } from "./derive-zones";
import { MARKER_COPY } from "./marker-copy";

/** The assembler's default within-depth order (injections.ts:150) — a spliced section with no `order`. */
const DEFAULT_INJECT_ORDER = 100;

/** A templated marker is exactly a key of `DEFAULT_MARKER_TEMPLATES` (the one source-of-truth split). */
function isTemplatedMarker(marker: string): marker is keyof typeof DEFAULT_MARKER_TEMPLATES {
  return marker in DEFAULT_MARKER_TEMPLATES;
}

/** One inline token of a section's display text: literal prose, or a `{{macro}}` reference (chipped). */
export interface MacroToken {
  readonly kind: "text" | "macro";
  /** For `text` — the literal run; for `macro` — the inner name (without the `{{ }}`). */
  readonly value: string;
}

const MACRO_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g;

/** Split a string into text + `{{macro}}` tokens — DISPLAY ONLY (no resolution). Empty runs are dropped
 *  so a string that is exactly one macro yields a single `macro` token, not empty text either side. */
export function splitMacroTokens(text: string): readonly MacroToken[] {
  const tokens: MacroToken[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(MACRO_PATTERN)) {
    const start = match.index;
    if (start > lastIndex) {
      tokens.push({ kind: "text", value: text.slice(lastIndex, start) });
    }
    tokens.push({ kind: "macro", value: (match[1] ?? "").trim() });
    lastIndex = start + match[0].length;
  }
  if (lastIndex < text.length) {
    tokens.push({ kind: "text", value: text.slice(lastIndex) });
  }
  return tokens;
}

/** A preview block — one displayed section (the source `section` carries id/role for click-through). */
export interface PreviewBlock {
  readonly section: PromptSection;
  /** The human name (marker copy for markers; the author's name / a neutral label for a literal). */
  readonly name: string;
  /** The display text tokens ( `undefined` for a plain marker that contributes no author text). */
  readonly tokens: readonly MacroToken[] | undefined;
  /** A one-line "what this contributes" hint for a plain marker (no author text of its own). */
  readonly plainHint: string | undefined;
}

/** A splice entry in the conversation band — a spliced (`inject`) section at its depth/order. */
interface SpliceEntry extends PreviewBlock {
  readonly depth: number;
  readonly order: number;
}

/** A contiguous group of in-flow blocks sharing one role (the role block header groups them). */
export interface RoleGroup {
  readonly role: MessageRole;
  readonly blocks: readonly PreviewBlock[];
}

export interface AssembledPreview {
  /** In-flow setup blocks (before the conversation), grouped by consecutive role. */
  readonly setup: readonly RoleGroup[];
  /** The spliced sections shown inside the conversation band (depth desc, order asc within depth). */
  readonly splices: readonly SpliceEntry[];
  /** In-flow post blocks (after the conversation), grouped by consecutive role. */
  readonly post: readonly RoleGroup[];
  /** No `chat_history` pivot — the preview shows a note (nothing to splice against). */
  readonly missingPivot: boolean;
  /** The conversation band's own enabled state (the `chat_history` section's `enabled`). */
  readonly historyEnabled: boolean;
}

/** The display text a section contributes (literal content · templated `template ?? default`). Plain
 *  markers return `undefined` (no author text — the caller shows a hint instead). An empty custom
 *  template ("silent") returns an empty-token list, distinct from `undefined`. */
function displayTokens(section: PromptSection): readonly MacroToken[] | undefined {
  if (section.type === "literal") {
    return splitMacroTokens(section.content);
  }
  if (!isTemplatedMarker(section.marker)) {
    return; // plain marker — no author text.
  }
  const custom = "template" in section ? section.template : undefined;
  return splitMacroTokens(custom ?? DEFAULT_MARKER_TEMPLATES[section.marker]);
}

/** The human name for a section (marker copy label, or the author's literal name / a neutral fallback). */
function sectionName(section: PromptSection): string {
  if (section.type === "marker") {
    const copy = MARKER_COPY[section.marker];
    return section.name.trim() === "" ? copy.label : section.name;
  }
  return section.name.trim() === "" ? "Literal text" : section.name;
}

/** Build the display block for a section (name + tokens, or a plain-marker hint). */
function toBlock(section: PromptSection): PreviewBlock {
  const tokens = displayTokens(section);
  const plainHint = tokens === undefined && section.type === "marker" ? MARKER_COPY[section.marker].oneLiner : undefined;
  return { section, name: sectionName(section), tokens, plainHint };
}

/** Is this section SPLICED into the conversation (carries an absolute-depth `inject`)? */
function spliceOf(section: PromptSection): { depth: number; order: number } | null {
  const inject = "inject" in section ? section.inject : undefined;
  if (inject === undefined) {
    return null;
  }
  return { depth: inject.depth, order: inject.order ?? DEFAULT_INJECT_ORDER };
}

/** Group a run of blocks into contiguous same-role groups (a role change opens a new header). */
function groupByRole(blocks: readonly PreviewBlock[]): readonly RoleGroup[] {
  const groups: RoleGroup[] = [];
  for (const block of blocks) {
    const role = block.section.role;
    const last = groups.at(-1);
    if (last !== undefined && last.role === role) {
      groups[groups.length - 1] = { role, blocks: [...last.blocks, block] };
    } else {
      groups.push({ role, blocks: [block] });
    }
  }
  return groups;
}

/**
 * Assemble the preview from the live sections. Only ENABLED, non-pivot, non-duplicate-pivot sections
 * appear. A spliced section is routed to the conversation band (regardless of its zone); an in-flow section
 * joins its zone's role-grouped run. Splices sort depth DESC, then order ASC (the P1 ST-parity semantics).
 *
 * `fires` is an OPTIONAL per-section include predicate (default: every section fires). The lens filter was
 * retired with the toolbar Lens, but the predicate seam is kept so a test can prove the include filter.
 */
export function assemblePreview(sections: readonly PromptSection[], fires: (section: PromptSection) => boolean = () => true): AssembledPreview {
  const zones = deriveZones(sections);
  const duplicateSet = new Set(zones.duplicatePivotIndexes);

  const setupInFlow: PreviewBlock[] = [];
  const postInFlow: PreviewBlock[] = [];
  const splices: SpliceEntry[] = [];
  let historyEnabled = false;

  for (const [index, section] of sections.entries()) {
    if (section.type === "marker" && section.marker === "chat_history") {
      if (!duplicateSet.has(index)) {
        historyEnabled = section.enabled;
      }
      continue; // the pivot itself is the band, never a block.
    }
    if (!section.enabled) {
      continue;
    }
    if (!fires(section)) {
      continue;
    }
    const splice = spliceOf(section);
    if (splice !== null) {
      splices.push({ ...toBlock(section), depth: splice.depth, order: splice.order });
      continue;
    }
    (zones.zoneOf(index) === "post" ? postInFlow : setupInFlow).push(toBlock(section));
  }

  // Splice order: higher depth sits earlier (further from the tail); within a depth, LOWER order higher.
  const orderedSplices = [...splices].sort((a, b) => (a.depth !== b.depth ? b.depth - a.depth : a.order - b.order));

  return {
    setup: groupByRole(setupInFlow),
    splices: orderedSplices,
    post: groupByRole(postInFlow),
    missingPivot: zones.missingPivot,
    historyEnabled,
  };
}
