// One persona row in the rail-foot panel (FINAL-Persona §A.6 · owner consolidated-panel brief). Row body
// click = set that persona as your CURRENT (#2); inline reveal actions (dim-at-rest → brighten on
// hover/focus, the message-actions reveal idea) = ★ set-Default (#1) · ✎ edit (expands the row in place)
// · 🗑 delete (AlertDialog confirm). The current row shows a Check; the default row a Crown badge.
// Expand renders the full inline editor (<PersonaEditor>) — progressive disclosure (UX rule 4).
//
// A COMPONENT, not a surface — so the inline delete <AlertDialog> is legal (surface-purity §A.7b).

import { blobUrl } from "@orb/contracts/assets";
import {
  AlertDialog,
  AlertDialogActions,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@orb/ui/alert-dialog";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve every glyph + Icon fine (the add-member-popover precedent).
import { Check, Crown, Icon, Pencil, Star, Trash2 } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Trpc } from "#data";
import { PersonaEditor } from "./persona-editor";

type PersonaListItem = inferOutput<Trpc["persona"]["list"]>[number];

const WHITESPACE_RE = /\s+/u;

function initials(name: string): string {
  const parts = name.trim().split(WHITESPACE_RE).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const second = parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "";
  return (first + second).toUpperCase();
}

export interface PersonaPanelRowProps {
  readonly persona: PersonaListItem;
  readonly isCurrent: boolean;
  readonly isDefault: boolean;
  readonly expanded: boolean;
  readonly onSetCurrent: () => void;
  readonly onSetDefault: () => void;
  readonly onToggleExpand: () => void;
  readonly onDelete: () => void;
}

/** A panel persona row: click-body sets Current; reveal actions set-Default / edit / delete. */
export function PersonaPanelRow({
  persona,
  isCurrent,
  isDefault,
  expanded,
  onSetCurrent,
  onSetDefault,
  onToggleExpand,
  onDelete,
}: PersonaPanelRowProps): ReactElement {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const avatarSrc = persona.avatarHash === null ? {} : { src: blobUrl(persona.avatarHash) };

  return (
    <Stack gap="field">
      <ListRow
        className="group"
        clickable={true}
        selected={isCurrent}
        onClick={onSetCurrent}
        title={persona.name}
        {...(persona.title === null ? {} : { subtitle: persona.title })}
        leading={
          <Avatar fallbackDelay={0} hueSeed={persona.id} size="sm" {...avatarSrc}>
            {initials(persona.name)}
          </Avatar>
        }
        actions={
          <Row
            gap="field"
            align="center"
            className="opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
          >
            {isCurrent ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Text as="span" role="img" aria-label="Current persona" tone="muted">
                      <Icon icon={Check} size="sm" />
                    </Text>
                  }
                />
                <TooltipPopup side="top">Playing as this now</TooltipPopup>
              </Tooltip>
            ) : null}
            <IconAction
              icon={isDefault ? Crown : Star}
              label={isDefault ? "Your default" : "Set as default"}
              disabled={isDefault}
              onClick={onSetDefault}
            />
            <IconAction
              icon={Pencil}
              label={expanded ? "Close editor" : "Edit persona"}
              onClick={onToggleExpand}
            />
            <IconAction
              icon={Trash2}
              label="Delete persona"
              onClick={(): void => setDeleteOpen(true)}
            />
          </Row>
        }
      />

      {expanded ? (
        <Stack gap="section" className="rounded-card border border-border p-block">
          <PersonaEditor persona={persona} />
        </Stack>
      ) : null}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogPopup>
          <Stack gap="block">
            <AlertDialogTitle>Delete this persona?</AlertDialogTitle>
            <AlertDialogDescription>
              <Text tone="muted">
                This permanently deletes “{persona.name}”. Past messages you authored as it keep
                their name and avatar. This can't be undone.
              </Text>
            </AlertDialogDescription>
            <AlertDialogActions>
              <AlertDialogClose render={<Button intent="ghost">Cancel</Button>} />
              <AlertDialogClose
                render={
                  <Button intent="destructive" onClick={onDelete}>
                    Delete
                  </Button>
                }
              />
            </AlertDialogActions>
          </Stack>
        </AlertDialogPopup>
      </AlertDialog>
    </Stack>
  );
}

interface IconActionProps {
  readonly icon: typeof Star;
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
}

/** A reveal-action icon button — stops row-body click propagation so it never sets Current by accident. */
function IconAction({ icon, label, onClick, disabled = false }: IconActionProps): ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            intent="ghost"
            size="icon"
            aria-label={label}
            disabled={disabled}
            onClick={(event): void => {
              event.stopPropagation();
              onClick();
            }}
          >
            <Icon icon={icon} size="sm" />
          </Button>
        }
      />
      <TooltipPopup side="top">{label}</TooltipPopup>
    </Tooltip>
  );
}
