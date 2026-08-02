// SectionRow — one rack row (preset-surface-redesign.md §5.1, drawn first-class in
// `mocks/preset-redesign/prompt-rack.html`). The ST prompt-manager anatomy on our grammar: drag GRIP (the
// SortableList's own handle, rendered by the list) · zone-hued type GLYPH · NAME button · only-when-set
// cue badges · the ~token estimate · the enable Switch · the drill CHEVRON.
//
// SELECT ≠ DRILL (§16 row 19, ST parity): the NAME click SELECTS — the CONTEXT readout echoes, and that
// echo IS the inspect view (our answer to ST's name-click inspect popout). The trailing CHEVRON DRILLS
// into the editor. Two acts, two controls, never conflated.
//
// `ListRow` is the skin (D6/CD1/CD2 conformance): the row's `rounded-card border` box is GONE — rows
// separate by the list's own hairline + gap, selection is the primitive's 2px ember bar + 10% tint, and
// the three tab stops (name body · switch · chevron) survive because `actions` renders as a SIBLING of the
// clickable body, never nested inside it.
//
// CARRIERS READ `~—`, NOT `~0` (§5.1): a plain marker's cost is the CONVERSATION or the active world-info
// set — chat-side facts this editor cannot know. A `~0` there would be a lie with a number on it.

import type { PromptConfig, PromptSection } from "@orb/contracts/preset";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { ChevronRight, Hash, Icon, Lock, Zap } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useRef } from "react";
import type { AppFormInstance } from "#forms";
import { useFocusOnSwap } from "#lib";
import { isTemplatedMarker, sectionGlyphIcon, triggersPillLabel } from "../../lib/assembly-model";
import { formatEstimate } from "../../lib/format-count";
import { estimateSectionTokens } from "./estimate-tokens";
import { MARKER_COPY } from "./marker-copy";

type AssemblyForm = AppFormInstance<PromptConfig>;

/** The assembler's default within-depth order (`injections.ts`) — shown when `inject.order` is unset. */
const DEFAULT_INJECT_ORDER = 100;
/** The token cell for a CARRIER — its substance is chat-side, so the estimate is honestly absent. */
const CARRIER_TOKENS = "~—";

export interface SectionRowProps {
  readonly form: AssemblyForm;
  readonly section: PromptSection;
  readonly index: number;
  /** The derived zone accent (`setup` steel-blue / `post` warm-amber) — carried by the type glyph. */
  readonly zone: "setup" | "post";
  /** This row's section is the SELECTED one — the readout echoes it (ListRow paints the ember bar+tint). */
  readonly selected: boolean;
  /** SELECT (the name click) — the inspect act. */
  readonly onSelect: (sectionId: string) => void;
  /** DRILL (the chevron) — open the consolidated editor. */
  readonly onDrill: (sectionId: string) => void;
  /** This row's chevron is the drill-in's focus RESTORE target (side-eye F-04): back-out from the editor
   *  unmounts the drill-in and remounts the rack, so the control the user left from is a brand-new node —
   *  the row focuses it on mount when the id matches, rather than the caller holding a stale ref. */
  readonly restoreFocus: boolean;
}

/** The plain-language name + subtitle for a section (marker copy for markers; the author's name for a
 *  literal, falling back to a neutral label when it's blank). A CARRIER says so in its subtitle — the
 *  scent that tells you its body is attribution, not text. */
function sectionLabels(section: PromptSection): { name: string; subtitle: string } {
  if (section.type === "marker") {
    const copy = MARKER_COPY[section.marker];
    return {
      name: section.name.trim() === "" ? copy.label : section.name,
      subtitle: isTemplatedMarker(section.marker) ? copy.subtitle : `carrier — ${copy.subtitle}`,
    };
  }
  return { name: section.name.trim() === "" ? "Literal text" : section.name, subtitle: "your own text" };
}

/** Has this templated marker a custom framing template set? Drives the `custom` cue. */
function hasCustomTemplate(section: PromptSection): boolean {
  return section.type === "marker" && isTemplatedMarker(section.marker) && "template" in section && section.template !== undefined;
}

/** Is this a templated marker whose card/room override is locked? Drives the lock cue. */
function isLocked(section: PromptSection): boolean {
  if (!("forbidCharacterOverride" in section)) {
    return false;
  }
  return section.forbidCharacterOverride === true || section.forbidRoomOverride === true;
}

/** The ONLY-WHEN-SET cue badges. The splice cue is the fused `@depth·order` read-only form — legal HERE
 *  (a compact badge) and nowhere else: the drill-in's fields stay split (round-3 ruling). */
function SectionCues({ section }: { readonly section: PromptSection }): ReactElement {
  const inject = "inject" in section ? section.inject : undefined;
  const triggersLabel = triggersPillLabel("trigger" in section ? section.trigger : undefined);
  return (
    <>
      {inject === undefined ? null : (
        <Badge intent="info" size="sm">
          <Icon icon={Hash} size="xs" />@{inject.depth}·{inject.order ?? DEFAULT_INJECT_ORDER}
        </Badge>
      )}
      {triggersLabel === null ? null : (
        <Badge intent="warning" size="sm">
          <Icon icon={Zap} size="xs" />
          {triggersLabel}
        </Badge>
      )}
      {isLocked(section) ? (
        <Badge intent="neutral" size="sm">
          <Icon icon={Lock} size="xs" />
        </Badge>
      ) : null}
      {hasCustomTemplate(section) ? (
        <Badge intent="neutral" size="sm">
          custom
        </Badge>
      ) : null}
      {section.role === "system" ? null : (
        <Badge intent="neutral" size="sm">
          {section.role === "user" ? "U" : "A"}
        </Badge>
      )}
    </>
  );
}

export function SectionRow({ form, section, index, zone, selected, onSelect, onDrill, restoreFocus }: SectionRowProps): ReactElement {
  const { name, subtitle } = sectionLabels(section);
  const carrier = section.type === "marker" && !isTemplatedMarker(section.marker);
  // ONE number format across the surface (side-eye F-29) — grouped, exactly as the readout's bars print it.
  const tokens = carrier ? CARRIER_TOKENS : formatEstimate(estimateSectionTokens(section));
  const chevronRef = useRef<HTMLButtonElement>(null);
  useFocusOnSwap(chevronRef, restoreFocus);
  return (
    <ListRow
      actions={
        <Row align="center" gap="field">
          {/* LINE-THROUGH when the row is off (the mock's `.rrow.off .tok`) — a disabled section still has a
              size, and striking it says "this is not being spent" without dropping the datum. */}
          <Text as="span" className={section.enabled ? "" : "line-through"} voice="gloss">
            {tokens}
          </Text>
          {/* AMBER-ON, the app's one switch grammar (owner ruling, 2026-08-02). The `quiet` tone painted a
              pale `foreground/55` track that read as the SAME control in both states down a twelve-row rack
              — while Params' Reasoning switch, one tab away, was amber. Rationing the accent per row lost
              the state signal it was rationing it for. */}
          <form.AppField name={`sections[${index}].enabled`}>
            {(field): ReactElement => (
              <Switch aria-label={`${name} enabled`} checked={field.state.value} onCheckedChange={(next): void => field.handleChange(next)} />
            )}
          </form.AppField>
          <Button aria-label={`Edit ${name}`} intent="ghost" onClick={(): void => onDrill(section.id)} ref={chevronRef} size="icon" type="button">
            <Icon icon={ChevronRight} size="sm" />
          </Button>
        </Row>
      }
      className={section.enabled ? "" : "opacity-60"}
      clickable={true}
      leading={
        // SOFT, not solid (side-eye F-17): nine solid `info` discs were the loudest thing in the pane. The
        // 15% tint + hue text IS the mock's `.glyph` treatment, and the glyph itself is now per-marker so
        // the column finally carries the information its brightness was claiming.
        <Badge intent={zone === "post" ? "warning" : "info"} size="sm" tone="soft">
          <Icon icon={sectionGlyphIcon(section)} size="sm" />
        </Badge>
      }
      markers={<SectionCues section={section} />}
      onClick={(): void => onSelect(section.id)}
      selected={selected}
      // INLINE after the name — the mock's rack row is one line (orchestrator ruling, 2026-08-02: follow
      // the mock where nothing supersedes it). The 720px content cap (F-16) is what makes the trade mild.
      subtitle={subtitle}
      subtitlePlacement="inline"
      title={name}
    />
  );
}
