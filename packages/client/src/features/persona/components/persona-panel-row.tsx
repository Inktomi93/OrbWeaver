// One row of Settings → Personas, the MANAGE surface. The row body has exactly one verb: it expands the
// persona's editor (a stretched button under the row's other controls, which sit `relative` above it as their
// own tab stops). Avatar and name are display here; both are edited in the editor's identity row. The trailing
// cluster is the favorite heart, the crown (the same component the switcher uses) and the chevron; at a coarse
// pointer the faint toggles stand down into a ⋯ that carries only those two verbs. No chat state lives here:
// who you play, and who a card means, are the switcher's.

import { blobUrl } from "@orb/contracts/assets";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { Collapsible, CollapsiblePanel } from "@orb/ui/collapsible";
import { ChevronDown, ChevronRight, Crown, Heart, Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { MenuItem } from "@orb/ui/menu";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useId, useState } from "react";
import { ConfirmDialog, HIDE_AT_COARSE, PIN_REVEAL, ROW_ACTION_OVERFLOW, RowActionsMenu } from "#components";
import type { Trpc } from "#data";
import { useInvalidation, useTRPC } from "#data";
import { cn, rowActionSubject, rowActionsName } from "#lib";
import { useUpdatePersona } from "../hooks/use-persona-mutations.ts";
import { PersonaCrown } from "./persona-crown.tsx";
import { PersonaEditorRegion } from "./persona-editor.tsx";

type PersonaListItem = inferOutput<Trpc["persona"]["list"]>[number];

export interface PersonaPanelRowProps {
  readonly persona: PersonaListItem;
  /** The row's action-name DISAMBIGUATOR, resolved by the list across every row (`rowQualifiers`, #443/#458);
   *  absent when this row's name is already unique. */
  readonly qualifier?: string;
  readonly isDefault: boolean;
  readonly expanded: boolean;
  readonly onSetDefault: () => void;
  readonly onClearDefault: () => void;
  readonly onToggleExpand: () => void;
  /** Reaches `ConfirmDialog.onConfirm`, which awaits a returned promise: busy while pending, closed on
   *  resolve, open with the reason on rejection. */
  readonly onDelete: () => void | Promise<void>;
}

export function PersonaPanelRow({
  persona,
  qualifier,
  isDefault,
  expanded,
  onSetDefault,
  onClearDefault,
  onToggleExpand,
  onDelete,
}: PersonaPanelRowProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const update = useUpdatePersona({ trpc, invalidation });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const titleId = useId();
  const avatarSrc = persona.avatarHash === null ? {} : { src: blobUrl(persona.avatarHash) };
  // ONE ANNOUNCED IDENTITY PER ROW (#443/#458/#463): every control on the row embeds the same subject.
  const subject = rowActionSubject(persona.name, qualifier);
  const onToggleFavorite = (): void => {
    update.mutate({ personaId: persona.id, input: { starred: !persona.starred } });
  };

  return (
    <Stack gap="field">
      <Row
        align="center"
        className="group relative min-h-(--size-control-md) rounded-control transition-colors duration-(--motion-fast) ease-out-expo hover:bg-accent data-expanded:bg-accent"
        data-expanded={expanded ? "" : undefined}
        gap="row"
        padding="field"
      >
        <Button
          aria-describedby={persona.title === null ? undefined : titleId}
          aria-expanded={expanded}
          aria-label={subject}
          className="absolute inset-0 rounded-control"
          data-slot="persona-row-expand"
          intent="ghost"
          onClick={onToggleExpand}
        />
        <Avatar className="pointer-events-none relative shrink-0" fallbackDelay={0} hueSeed={persona.id} size="sm" {...avatarSrc}>
          {initialsFor(persona.name)}
        </Avatar>
        {/* The NAME is the row's one shrinker; every trailing control reserves its own width (leg-4 P2). */}
        <Stack className="pointer-events-none relative min-w-0 flex-1" data-slot="persona-row-name">
          <Text as="span" className="truncate" weight="medium">
            {persona.name}
          </Text>
          {persona.title === null ? null : (
            <Text className="truncate" id={titleId} voice="gloss">
              {persona.title}
            </Text>
          )}
        </Stack>
        <FavoriteToggle onToggle={onToggleFavorite} starred={persona.starred} subject={subject} />
        <PersonaCrown isDefault={isDefault} onClear={onClearDefault} onSet={onSetDefault} subject={subject} />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label={expanded ? `Hide details for ${subject}` : `Show details for ${subject}`}
                className="relative shrink-0"
                intent="ghost"
                onClick={onToggleExpand}
                size="icon"
              >
                <Icon icon={expanded ? ChevronDown : ChevronRight} size="sm" />
              </Button>
            }
          />
          <TooltipPopup side="top">{expanded ? `Hide details for ${subject}` : `Show details for ${subject}`}</TooltipPopup>
        </Tooltip>
        {/* COARSE ONLY: the two faint toggles above stand down at a coarse pointer, and their verbs ride here. */}
        <Row align="center" className={cn("relative shrink-0", ROW_ACTION_OVERFLOW) ?? ""}>
          <RowActionsMenu label={rowActionsName(subject)}>
            <MenuItem onClick={onToggleFavorite}>
              <Icon icon={Heart} size="sm" />
              {persona.starred ? "Unfavorite" : "Favorite"}
            </MenuItem>
            <MenuItem onClick={isDefault ? onClearDefault : onSetDefault}>
              <Icon icon={Crown} size="sm" />
              {isDefault ? "Clear default" : "Set as default"}
            </MenuItem>
          </RowActionsMenu>
        </Row>
      </Row>

      <ConfirmDialog
        confirmLabel="Delete"
        description={<>This permanently deletes “{persona.name}”. Past messages you authored as it keep their name and avatar. This can't be undone.</>}
        onConfirm={onDelete}
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        title="Delete this persona?"
      />

      <Collapsible onOpenChange={onToggleExpand} open={expanded}>
        <CollapsiblePanel>
          <PersonaEditorRegion persona={persona} subject={subject} onRequestDelete={(): void => setDeleteOpen(true)} />
        </CollapsiblePanel>
      </Collapsible>
    </Stack>
  );
}

/** The favorite heart: a toggle at a fine pointer (faint until hovered unless favorited), and at a coarse
 *  pointer a state glyph on a favorited row with the verb in the ⋯. Exactly one of the pair is in layout. */
function FavoriteToggle({ starred, subject, onToggle }: { readonly starred: boolean; readonly subject: string; readonly onToggle: () => void }): ReactElement {
  const label = starred ? `Unfavorite ${subject}` : `Favorite ${subject}`;
  return (
    <>
      <Tooltip describesTrigger={false}>
        <TooltipTrigger
          render={
            <Button
              aria-label={label}
              aria-pressed={starred}
              className={cn("relative shrink-0", starred ? "text-destructive" : PIN_REVEAL, HIDE_AT_COARSE) ?? ""}
              intent="ghost"
              onClick={onToggle}
              size={starred ? "inline" : "icon"}
            >
              <Icon icon={Heart} size="sm" />
            </Button>
          }
        />
        <TooltipPopup side="top">{label}</TooltipPopup>
      </Tooltip>
      {starred ? (
        <Text as="span" aria-label="Favorited" className={cn("relative shrink-0 text-destructive", ROW_ACTION_OVERFLOW) ?? ""} role="img">
          <Icon icon={Heart} size="sm" />
        </Text>
      ) : null}
    </>
  );
}
