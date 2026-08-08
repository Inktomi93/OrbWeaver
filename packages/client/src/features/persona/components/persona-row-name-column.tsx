// The persona row's NAME COLUMN — the title line (name control + the rest-visible state glyphs) over the
// subtitle — plus the marker glyph the title line paints.
//
// Split out of `persona-panel-row.tsx` when the state glyphs moved onto the title line (side-eye 2026-08-07
// §① P1): the row went over the component-size cap and its render over the cognitive-complexity cap. The
// split is along a real seam, not an arbitrary line count — this column owns the inline-RENAME state, which
// has exactly one consumer, and hands the parent only the COMMIT (`onRename`), so the mutation wiring stays
// in the one place that already holds it.

import { Button } from "@orb/ui/button";
import type { LucideIcon } from "@orb/ui/icons";
import { Crown, Heart, Icon } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { ROW_ACTION_INLINE, ROW_ACTION_OVERFLOW, ROW_REVEAL_SWAP_COARSE_KEEP } from "#components";
import type { Trpc } from "#data";
import { cn } from "#lib";

/** One row of the persona list, as the panel renders it. Declared here rather than imported from the row:
 *  `no-inline-types` bans EXPORTING a hand-declared type from a component, and importing it the other way
 *  would be a cycle. It is a one-line derivation of the wire shape, not a second spelling of it. */
type PersonaListItem = inferOutput<Trpc["persona"]["list"]>[number];

/**
 * `data-slot="persona-row-name"`: the column's WIDTH is the thing the trailing clusters were starving, so it
 * needs a stable handle a CT can measure (persona-panel-row.ct.tsx, the 358px dense-row fence).
 *
 * THE FLOOR IS NOT ON THIS COLUMN (side-eye leg-4 P2). A `min-w-1/2` here did give the name its half — and
 * MOVED the breakage: the marker Layer beside it shrank to a 38px grid cell whose contents still laid out at
 * their own width, painting 58px LEFTWARD through the name (a 9-char name ran under the orange "PLAYING AS").
 * A floor on one side of a two-item row is a squeeze on the other. What bounds the row is the trailing
 * cluster reserving its content while the name shrinks and truncates — one shrinker, one reserver.
 */
export function PersonaRowNameColumn({
  persona,
  isDefault,
  onRename,
}: {
  readonly persona: PersonaListItem;
  readonly isDefault: boolean;
  readonly onRename: (name: string) => void;
}): ReactElement {
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(persona.name);

  const commitName = (): void => {
    setEditingName(false);
    const trimmed = draftName.trim();
    if (trimmed === "" || trimmed === persona.name) {
      setDraftName(persona.name);
      return;
    }
    onRename(trimmed);
  };

  return (
    <Stack className="pointer-events-none relative min-w-0 flex-1" data-slot="persona-row-name">
      {/* THE TITLE LINE CARRIES THE STATE GLYPHS (side-eye 2026-08-07 §① P1). They used to live in the row's
          trailing `<Layer>` beside the actions, wearing `ROW_REVEAL_SWAP` — whose `pointer-coarse:hidden`
          rests on one premise: at coarse the reveal cluster is permanently visible, so the CONTROL carrying
          the same datum is on screen. The coarse collapse deleted that premise for this row (Favorite and
          Set-as-default moved into the CLOSED kebab), so at coarse the crown was `display:none` AND its verb
          was behind a tap: "which persona is my default" had zero homes on a phone. That is the identical bug
          the same commit fixed on the chats row.
          WHY THE GLYPHS MOVED rather than just swapping the constant: the trailing `<Layer>` is ONE grid cell
          shared by the markers and the actions (the 2026-08-06 P1 ruling — reserve the WIDER, not the SUM),
          which is only sound while the two are never both painted. `ROW_REVEAL` pins the action cluster
          permanently ON at coarse, so simply un-hiding the markers there would paint the crown and the heart
          UNDERNEATH the kebab. The title line is the ruled home for a rest-visible marker anyway
          (`ROW_REVEAL_SWAP`'s own header; `ListRow.markers`; the chats roster's ★), and it is a cell the
          actions never occupy — so the swap stays honest at fine and the state stays legible at coarse. The
          "Playing as" kicker STAYS behind in the Layer on `ROW_REVEAL_SWAP`: its coarse drop is a deliberate
          ruling (see the collapse comment in the row) and this change does not touch it. */}
      <Row align="center" className="min-w-0" gap="field">
        {editingName ? (
          <Input
            aria-label="Persona name"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus={true}
            className="pointer-events-auto"
            onBlur={commitName}
            onKeyDown={(event): void => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitName();
              } else if (event.key === "Escape") {
                setDraftName(persona.name);
                setEditingName(false);
              }
            }}
            onValueChange={setDraftName}
            value={draftName}
          />
        ) : (
          <Button
            aria-label="Rename persona"
            className="pointer-events-auto min-w-0 justify-start truncate"
            intent="ghost"
            onClick={(): void => {
              setDraftName(persona.name);
              setEditingName(true);
            }}
            size="sm"
          >
            <Text as="span" className="truncate" weight="medium">
              {persona.name}
            </Text>
          </Button>
        )}
        {/* `shrink-0` + the name's `min-w-0`: the NAME is this line's single shrinker, exactly as it is the
            row's (the leg-4 "one shrinker, one reserver" rule, one level down). */}
        <Row align="center" className={cn("shrink-0", ROW_REVEAL_SWAP_COARSE_KEEP) ?? ""} data-slot="persona-row-title-markers" gap="field" justify="end">
          {isDefault ? <StatusGlyph className="text-warning" icon={Crown} label="Your default" /> : null}
          {/* THE HEART'S A11Y ARM IS POINTER-GATED, and for the same premise death one layer down. The marker
              is ORNAMENT (`aria-hidden`) because the reveal cluster's heart BUTTON is named for the state at
              all times ("Unfavorite" ⇒ favorited), so a named marker beside it announced one fact twice (the
              2026-08-06 P1 ruling, which stands). At coarse that button is `display:none` and its kebab twin
              is inside a CLOSED menu — so an ornament marker there means the row states "favorited" NOWHERE.
              `decorative` is a JS prop and cannot read a media query, so the two arms are separate elements
              gated by display, the same idiom the collapse itself uses: exactly ONE is in layout — and
              therefore in the a11y tree — per pointer class. The CROWN needs no pair: its verb ("Set as
              default") exists only while the state is FALSE, so it never had a twin to be doubled by, and it
              keeps its name at every pointer class. */}
          {persona.starred ? (
            <>
              <StatusGlyph className={cn("text-destructive", ROW_ACTION_INLINE) ?? ""} decorative={true} icon={Heart} label="Favorited" />
              <StatusGlyph className={cn("text-destructive", ROW_ACTION_OVERFLOW) ?? ""} icon={Heart} label="Favorited" />
            </>
          ) : null}
        </Row>
      </Row>
      {persona.title === null ? null : (
        <Text className="truncate" size="micro" tone="muted">
          {persona.title}
        </Text>
      )}
    </Stack>
  );
}

/** A non-interactive, glanceable status glyph shown at rest. `decorative` drops it out of the a11y tree —
 *  the arm for a marker whose fact is ALREADY named by an always-present control at that pointer class (the
 *  favorite heart at FINE); a marker with no such twin (the default crown, and the heart at COARSE) keeps its
 *  `role="img"` name. `label` is required either way: it is the tooltip's words, which a sighted reader still
 *  needs. */
function StatusGlyph({
  icon,
  label,
  className,
  decorative = false,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly className: string;
  readonly decorative?: boolean;
}): ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Text as="span" className={className} {...(decorative ? { "aria-hidden": true } : { "aria-label": label, role: "img" })}>
            <Icon icon={icon} size="sm" />
          </Text>
        }
      />
      <TooltipPopup side="top">{label}</TooltipPopup>
    </Tooltip>
  );
}
