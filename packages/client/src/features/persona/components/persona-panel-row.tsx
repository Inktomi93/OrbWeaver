// One persona row in the rail-foot panel: avatar/name edited inline, row-body click sets Current, hover
// reveals favorite/set-default/delete, chevron discloses details. The "set current" target is a real
// stretched <Button> pinned absolute inset-0 UNDER the row's controls; those controls are relative
// siblings layered above it so each is a disjoint tab stop (no stopPropagation crutch needed).

import { blobUrl } from "@orb/contracts/assets";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { Collapsible, CollapsiblePanel } from "@orb/ui/collapsible";
import { FileTrigger } from "@orb/ui/file-trigger";
import type { LucideIcon } from "@orb/ui/icons";
import { ChevronDown, ChevronRight, Crown, Heart, Icon, Star, Trash2 } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { ConfirmDialog, ROW_REVEAL } from "#components";
import type { Trpc } from "#data";
import { useInvalidation, useTRPC, useUploadAsset } from "#data";
import { cn, notify } from "#lib";
import { useUpdatePersona } from "../hooks/use-persona-mutations";
import { PersonaEditor } from "./persona-editor";

type PersonaListItem = inferOutput<Trpc["persona"]["list"]>[number];

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

/** A panel persona row: click-body sets Current; avatar/name edit inline; a chevron discloses DETAILS. */
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
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const update = useUpdatePersona({ trpc, invalidation });
  const upload = useUploadAsset();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(persona.name);
  const avatarSrc = persona.avatarHash === null ? {} : { src: blobUrl(persona.avatarHash) };

  const commitName = (): void => {
    setEditingName(false);
    const trimmed = draftName.trim();
    if (trimmed === "" || trimmed === persona.name) {
      setDraftName(persona.name);
      return;
    }
    update.mutate({ personaId: persona.id, input: { name: trimmed } });
  };

  const onAvatarFile = async (file: File): Promise<void> => {
    try {
      const stored = await upload(file, "avatar");
      update.mutate({ personaId: persona.id, input: { avatarAssetId: stored.assetId } });
    } catch {
      notify.error("Couldn't upload the avatar.");
    }
  };

  const onToggleFavorite = (): void => {
    update.mutate({ personaId: persona.id, input: { starred: !persona.starred } });
  };

  return (
    <Stack gap="field">
      <Row
        align="center"
        className="group relative min-h-control-md rounded-control transition-colors duration-(--motion-fast) ease-out-expo hover:bg-accent data-selected:bg-accent"
        data-selected={isCurrent ? "" : undefined}
        gap="row"
        padding="field"
      >
        <Button
          aria-current={isCurrent ? "true" : undefined}
          aria-label={`Switch to ${persona.name}`}
          className="absolute inset-0 rounded-control"
          intent="ghost"
          onClick={onSetCurrent}
        />
        <FileTrigger
          accept="image/*"
          onFilesSelected={([file]): void => {
            if (file !== undefined) {
              void onAvatarFile(file);
            }
          }}
        >
          {({ open }): ReactElement => (
            <Button aria-label="Change avatar" className="relative shrink-0" intent="ghost" onClick={open} size="icon">
              <Avatar fallbackDelay={0} hueSeed={persona.id} size="sm" {...avatarSrc}>
                {initialsFor(persona.name)}
              </Avatar>
            </Button>
          )}
        </FileTrigger>

        <Stack className="pointer-events-none relative min-w-0 flex-1">
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
          {persona.title === null ? null : (
            <Text className="truncate" size="micro" tone="muted">
              {persona.title}
            </Text>
          )}
        </Stack>

        {/* MARKERS ⇄ ACTIONS is a PAINT swap, never a display swap: both clusters are permanently in flow, so
            the row's geometry is byte-identical at rest and on hover. A `hidden`/`flex` swap here reflowed the
            row under a stationary pointer and re-hit-tested at frame rate (the preset-list P0 —
            packages/client/src/components/row-reveal.ts, gate `no-hover-display-swap`). */}
        <Row align="center" className="pointer-events-none relative shrink-0 group-hover:invisible group-focus-within:invisible" gap="field">
          {isDefault ? <StatusGlyph className="text-warning" icon={Crown} label="Your default" /> : null}
          {persona.starred ? <StatusGlyph className="text-destructive" icon={Heart} label="Favorited" /> : null}
        </Row>

        <Row align="center" className={cn("pointer-events-none relative shrink-0", ROW_REVEAL) ?? ""} gap="field">
          <IconAction
            {...(persona.starred ? { className: "text-destructive" } : {})}
            icon={Heart}
            label={persona.starred ? "Unfavorite" : "Favorite"}
            onClick={onToggleFavorite}
          />
          <IconAction
            {...(isDefault ? { className: "text-warning" } : {})}
            disabled={isDefault}
            icon={isDefault ? Crown : Star}
            label={isDefault ? "Your default" : "Set as default"}
            onClick={onSetDefault}
          />
          <IconAction icon={Trash2} label="Delete persona" onClick={(): void => setDeleteOpen(true)} />
        </Row>

        <IconAction
          className="relative shrink-0"
          icon={expanded ? ChevronDown : ChevronRight}
          label={expanded ? "Hide details" : "Show details"}
          onClick={onToggleExpand}
        />
      </Row>

      <Collapsible onOpenChange={onToggleExpand} open={expanded}>
        <CollapsiblePanel>
          <Stack className="rounded-card border border-border p-block" gap="section">
            <PersonaEditor persona={persona} onRequestDelete={(): void => setDeleteOpen(true)} />
          </Stack>
        </CollapsiblePanel>
      </Collapsible>

      <ConfirmDialog
        confirmLabel="Delete"
        description={<>This permanently deletes “{persona.name}”. Past messages you authored as it keep their name and avatar. This can't be undone.</>}
        onConfirm={onDelete}
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        title="Delete this persona?"
      />
    </Stack>
  );
}

interface IconActionProps {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

/** A non-interactive, glanceable status glyph shown at rest. */
function StatusGlyph({ icon, label, className }: { readonly icon: LucideIcon; readonly label: string; readonly className: string }): ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Text aria-label={label} as="span" className={className} role="img">
            <Icon icon={icon} size="sm" />
          </Text>
        }
      />
      <TooltipPopup side="top">{label}</TooltipPopup>
    </Tooltip>
  );
}

/** A reveal-action icon button — a `relative` sibling layered above the stretched select-Button. */
function IconAction({ icon, label, onClick, disabled = false, className }: IconActionProps): ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            className={`pointer-events-auto${className === undefined ? "" : ` ${className}`}`}
            disabled={disabled}
            intent="ghost"
            onClick={onClick}
            size="icon"
          >
            <Icon icon={icon} size="sm" />
          </Button>
        }
      />
      <TooltipPopup side="top">{label}</TooltipPopup>
    </Tooltip>
  );
}
