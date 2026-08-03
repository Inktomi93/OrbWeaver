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
import { isTemplatedMarker, sectionGlyphIcon, triggersPillLabel } from "../../lib/assembly-model.ts";
import { CARRIER_COST_GLYPH, formatEstimate, spokenEstimate } from "../../lib/format-count.ts";
import { estimateSectionTokens } from "./estimate-tokens.ts";
import { MARKER_COPY } from "./marker-copy.ts";

type AssemblyForm = AppFormInstance<PromptConfig>;

/** The assembler's default within-depth order (`injections.ts`) — shown when `inject.order` is unset. */
const DEFAULT_INJECT_ORDER = 100;

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

/** The ONLY-WHEN-SET cue badges — plus the ONE fixed-by-product cue the registry carries (`firesCue`,
 *  crunch item 16: the mock's `⚡ steered turns` on Guided instruction, which no stored field expresses).
 *  The splice cue is the fused `@depth·order` read-only form — legal HERE (a compact badge) and nowhere
 *  else: the drill-in's fields stay split (round-3 ruling).
 *
 *  EVERY CUE IS `tone="soft"` (crunch item 14): the mock paints them as 13% tints of info/warning and the
 *  lock/custom pair as a 7% neutral, i.e. quiet annotations on the name they follow. Solid pills made the
 *  cue column louder than the row identity it annotates — the same F-17 loudness class the glyph discs
 *  already lost. */
function SectionCues({ section }: { readonly section: PromptSection }): ReactElement {
  const inject = "inject" in section ? section.inject : undefined;
  const triggersLabel = triggersPillLabel("trigger" in section ? section.trigger : undefined);
  const firesCue = section.type === "marker" ? MARKER_COPY[section.marker].firesCue : undefined;
  const firesLabel = triggersLabel ?? firesCue ?? null;
  return (
    <>
      {inject === undefined ? null : (
        <Badge intent="info" size="sm" tone="soft">
          <Icon icon={Hash} size="xs" />@{inject.depth}·{inject.order ?? DEFAULT_INJECT_ORDER}
        </Badge>
      )}
      {/* The stored trigger list WINS over the registry cue: a marker the user has narrowed says what the
          user chose, and two ⚡ pills on one row would read as two different gates. */}
      {firesLabel === null ? null : (
        <Badge intent="warning" size="sm" tone="soft">
          <Icon icon={Zap} size="xs" />
          {firesLabel}
        </Badge>
      )}
      {isLocked(section) ? (
        <Badge intent="neutral" size="sm" tone="soft">
          <Icon icon={Lock} size="xs" />
        </Badge>
      ) : null}
      {hasCustomTemplate(section) ? (
        <Badge intent="neutral" size="sm" tone="soft">
          custom
        </Badge>
      ) : null}
      {section.role === "system" ? null : (
        <Badge intent="neutral" size="sm" tone="soft">
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
  const tokens = carrier ? CARRIER_COST_GLYPH : formatEstimate(estimateSectionTokens(section));
  const chevronRef = useRef<HTMLButtonElement>(null);
  useFocusOnSwap(chevronRef, restoreFocus);
  return (
    <ListRow
      actions={
        <Row align="center" gap="row">
          {/* THE TOKEN COLUMN (crunch item 15): a fixed-width, right-aligned, tabular mono cell — the
              mock's own `.tok` (52px, `text-align:right`, `font-variant-numeric:tabular-nums`), so a rack
              of a dozen rows reads DOWN one number edge instead of ragged against the switches. The row
              gap widens from `field` to `row` for the air the mock gives it.
              LINE-THROUGH when the row is off (the mock's `.rrow.off .tok`) — a disabled section still has
              a size, and striking it says "this is not being spent" without dropping the datum. */}
          {/* THE GLYPH IS FOR THE EYE, THE SENTENCE IS THE DATUM (side-eye F-27): `~—` announces as
              "tilde em dash" and `~30` as "tilde three zero" — the compression that makes the column
              scannable makes it unspeakable. The visible cell is `aria-hidden`; the sr-only line beside it
              says the same fact in words, including the carrier arm's whole reason. */}
          <Text
            aria-hidden={true}
            as="span"
            className={`w-12 shrink-0 text-right font-mono tabular-nums ${section.enabled ? "" : "line-through"}`}
            voice="gloss"
          >
            {tokens}
          </Text>
          <Text as="span" className="sr-only">
            {spokenEstimate(carrier ? null : estimateSectionTokens(section))}
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
        // 15% tint + hue text IS the mock's `.glyph` treatment (13% of info / warning), and the glyph
        // itself is now per-marker so the column finally carries the information its brightness was
        // claiming. The HUE PAIR is the mock's own (`--color-info` setup / `--color-warning` post) — the
        // crunch-item-14 blue sweep re-tints the SATURATED families (solid discs, filled chips, macro
        // pills), not this deliberate zone accent.
        <Badge intent={zone === "post" ? "warning" : "info"} size="sm" tone="soft">
          <Icon icon={sectionGlyphIcon(section)} size="sm" />
        </Badge>
      }
      markers={<SectionCues section={section} />}
      onClick={(): void => onSelect(section.id)}
      selected={selected}
      // THE EXPLAINER RIDES THE HOVER, NOT THE LINE (crunch-list O-7★, owner ruling: the inline "your core
      // system instruction" descriptions are lame — this OVERRIDES the mock's inline-desc drawing). It
      // lands on `fullTitle`, whose one job is the name's native `title=` tooltip and which explicitly
      // never touches the accessible name (so the row still announces as "Main"). The row keeps ONE datum
      // on its line — the name — and the scent is a hover away, the §4.1 hint rule applied to a list row.
      fullTitle={`${name} — ${subtitle}`}
      title={name}
    />
  );
}
