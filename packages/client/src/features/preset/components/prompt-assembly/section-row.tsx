// SectionRow — one rack row for a non-pivot section. A domain composition of Row + Badge + Switch + a
// ghost Button (not ListRow — three independent tab stops: name-button, enabled switch, grip). Anatomy
// left→right: type-glyph badge · name+subtitle button (selects the section) · cue badges shown only when
// set · the ~token estimate · the enabled Switch. A disabled row is dimmed whole.

import type { PromptConfig, PromptSection } from "@orb/contracts/preset";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Hash, Icon, Lock, Zap } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { AppFormInstance } from "#forms";
import { isTemplatedMarker, sectionGlyphIcon, triggersPillLabel } from "../../lib/assembly-model";
import { estimateSectionTokens } from "./estimate-tokens";
import { MARKER_COPY } from "./marker-copy";

type AssemblyForm = AppFormInstance<PromptConfig>;

/** The assembler's default within-depth order (injections.ts:150 — shown when `inject.order` is unset). */
const DEFAULT_INJECT_ORDER = 100;

export interface SectionRowProps {
  readonly form: AssemblyForm;
  readonly section: PromptSection;
  readonly index: number;
  /** The derived zone accent (`setup` steel-blue / `post` warm-amber) — a left-edge cue only. */
  readonly zone: "setup" | "post";
  /** This row's section is the CONTEXT-selected one (a 10% primary tint + a primary left bar — the one
   *  restrained ember cue on the row; north-star §6.2 P2 ember budget). */
  readonly selected: boolean;
  /** Select this section → reveal the inspector (the route-built choreography, §3.4). */
  readonly onSelect: (sectionId: string) => void;
}

/** The plain-language name + subtitle for a section (marker copy for markers; the author's name for a
 *  literal, falling back to a neutral label when it's blank). */
function sectionLabels(section: PromptSection): { name: string; subtitle: string } {
  if (section.type === "marker") {
    const copy = MARKER_COPY[section.marker];
    return {
      name: section.name.trim() === "" ? copy.label : section.name,
      subtitle: copy.subtitle,
    };
  }
  return {
    name: section.name.trim() === "" ? "Literal text" : section.name,
    subtitle: "your own text",
  };
}

/** Has this templated marker a NON-default (custom or silent) template set? Drives the template-state dot. */
function hasCustomTemplate(section: PromptSection): boolean {
  return section.type === "marker" && isTemplatedMarker(section.marker) && "template" in section && section.template !== undefined;
}

/** Is this a templated marker whose card/room override is locked? Drives the lock cue. (`in` narrows the
 *  union to the templated-marker branch that carries the two forbid flags.) */
function isLocked(section: PromptSection): boolean {
  if (!("forbidCharacterOverride" in section)) {
    return false;
  }
  return section.forbidCharacterOverride === true || section.forbidRoomOverride === true;
}

/** The trailing cue badges (ONLY-WHEN-SET) — split out so the row body stays flat. */
function SectionCues({ section }: { readonly section: PromptSection }): ReactElement {
  const inject = "inject" in section ? section.inject : undefined;
  const trigger = "trigger" in section ? section.trigger : undefined;
  const triggersLabel = triggersPillLabel(trigger);
  return (
    <Row gap="field" align="center">
      {inject !== undefined ? (
        <Badge intent="info" size="sm">
          <Icon icon={Hash} size="xs" />@{inject.depth}·{inject.order ?? DEFAULT_INJECT_ORDER}
        </Badge>
      ) : null}
      {triggersLabel !== null ? (
        <Badge intent="warning" size="sm">
          <Icon icon={Zap} size="xs" />
          {triggersLabel}
        </Badge>
      ) : null}
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
      {section.role !== "system" ? (
        <Badge intent="neutral" size="sm">
          {section.role === "user" ? "U" : "A"}
        </Badge>
      ) : null}
    </Row>
  );
}

export function SectionRow({ form, section, index, zone, selected, onSelect }: SectionRowProps): ReactElement {
  const { name, subtitle } = sectionLabels(section);
  const tokens = estimateSectionTokens(section);
  // Selection is the ONE restrained ember cue on the row: a 10% primary tint (the N2 chats-list pattern),
  // not the flat `bg-accent` fill. The left bar flips to primary when selected, else the zone accent.
  const rowClass = ["rounded-card border border-border", selected ? "bg-primary/10" : "", section.enabled ? "" : "opacity-60"].join(" ");
  const unselectedAccent = zone === "post" ? "bg-warning" : "bg-info";
  const zoneAccent = selected ? "bg-primary" : unselectedAccent;

  return (
    <Row gap="row" align="center" padding="row" data-selected={selected ? "" : undefined} data-zone={zone} className={rowClass}>
      <Stack aria-hidden={true} className={`w-1 self-stretch rounded-full ${zoneAccent}`} />

      <Badge intent={zone === "post" ? "warning" : "info"} size="sm">
        <Icon icon={sectionGlyphIcon(section)} size="sm" />
      </Badge>

      <Button intent="ghost" size="sm" className="min-w-0 flex-1 justify-start text-left" onClick={(): void => onSelect(section.id)}>
        <Text size="body" weight="medium" className="truncate">
          {name}
        </Text>
        <Text size="micro" tone="muted" className="truncate">
          {subtitle}
        </Text>
      </Button>

      <SectionCues section={section} />

      <Text size="code" tone="muted" className={section.enabled ? "tabular-nums" : "tabular-nums line-through"}>
        ~{tokens}
      </Text>

      <form.AppField name={`sections[${index}].enabled`}>
        {(field): ReactElement => (
          <Switch aria-label={`${name} enabled`} checked={field.state.value} onCheckedChange={(next): void => field.handleChange(next)} tone="quiet" />
        )}
      </form.AppField>
    </Row>
  );
}
