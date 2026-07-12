// One persona row in the rail-foot panel — LEAN redesign (identity edited IN THE ROW, no sub-editor
// identity block). Interaction model:
//   • Avatar click → `@orb/ui/file-trigger` → `uploadAsset(file,"avatar")` → `persona.update` PARTIAL
//     patch (`avatarAssetId`), autosaved. NO drag-drop zone.
//   • Name click → inline rename (the name becomes an `Input` in place; Enter/blur commits via the SAME
//     partial-patch mutation; Escape cancels).
//   • Row-body click (anywhere but the avatar/name/actions) = set that persona as CURRENT (#2).
//   • Hover-reveal actions: ♥ favorite (a `persona.update` partial patch, `starred`) · ★ set-Default
//     (#1, gold Crown once set) · 🗑 delete (`ConfirmDialog`). NO ✎ edit button.
//   • An ALWAYS-visible ⌄ chevron is a disclosure toggle (`@orb/ui/collapsible`), not an edit
//     button — it expands/collapses the row's DETAILS (`<PersonaEditor>`, itself fully autosaving).
// A11y model (side-eye item 13 / no-interactive-role-in-features): the "set current" target is a real
// stretched `<Button>` pinned `absolute inset-0` UNDER the row's controls, NOT a hand-rolled
// `role="button"` div wrapping them. The avatar/name/action controls are `relative` SIBLINGS layered
// above it — every one a first-class tab stop, nothing nested inside another interactive element — so
// the old `stopPropagation` crutches are gone (disjoint elements never fire each other). `@orb/ui/list-row`
// is not used because its `title` is a plain string with no room for the live edit-in-place name control.
//
// A COMPONENT, not a surface — so the inline delete `<ConfirmDialog>` is legal (surface-purity §A.7b).

import { blobUrl } from "@orb/contracts/assets";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { Collapsible, CollapsiblePanel } from "@orb/ui/collapsible";
import { FileTrigger } from "@orb/ui/file-trigger";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve every glyph + Icon fine (the add-member-popover precedent).
import { ChevronDown, ChevronRight, Crown, Heart, Icon, Star, Trash2 } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { ConfirmDialog } from "#components";
import type { Trpc } from "#data";
import { uploadAsset, useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
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
      const stored = await uploadAsset(file, "avatar");
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
        {/* The "set current" target: a real stretched <Button> pinned under the row's controls (NOT a
            hand-rolled role="button" div). Empty — its accessible name is the aria-label; the controls
            layered above (relative) intercept their own clicks, gaps fall through to this. */}
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
            <Button
              aria-label="Change avatar"
              className="relative shrink-0"
              intent="ghost"
              onClick={open}
              size="icon"
            >
              <Avatar fallbackDelay={0} hueSeed={persona.id} size="sm" {...avatarSrc}>
                {initialsFor(persona.name)}
              </Avatar>
            </Button>
          )}
        </FileTrigger>

        {/* `pointer-events-none` lets the Stack's EMPTY space (right of the short name) fall through to the
            stretched select overlay below — only the actual name control re-enables pointer events. */}
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

        {/* Rest state: only glanceable status (default/favorite) so the name keeps full width —
            Current is already conveyed by the selected row background + `aria-current`. On
            hover/focus the whole cluster swaps to the action buttons below. */}
        <Row
          align="center"
          className="pointer-events-none relative shrink-0 group-hover:hidden group-focus-within:hidden"
          gap="field"
        >
          {isDefault ? (
            <StatusGlyph className="text-warning" icon={Crown} label="Your default" />
          ) : null}
          {persona.starred ? (
            <StatusGlyph className="text-destructive" icon={Heart} label="Favorited" />
          ) : null}
        </Row>

        {/* Hover/focus: the full action cluster (favorite · set-default · delete). */}
        <Row
          align="center"
          className="pointer-events-none relative hidden shrink-0 group-hover:flex group-focus-within:flex"
          gap="field"
        >
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
          <IconAction
            icon={Trash2}
            label="Delete persona"
            onClick={(): void => setDeleteOpen(true)}
          />
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
            <PersonaEditor persona={persona} />
          </Stack>
        </CollapsiblePanel>
      </Collapsible>

      <ConfirmDialog
        confirmLabel="Delete"
        description={
          <>
            This permanently deletes “{persona.name}”. Past messages you authored as it keep their
            name and avatar. This can't be undone.
          </>
        }
        onConfirm={onDelete}
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        title="Delete this persona?"
      />
    </Stack>
  );
}

interface IconActionProps {
  readonly icon: typeof Star;
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  /** An active-state color override (e.g. `text-warning` gold once Default, `text-destructive` red
   *  once Favorited) — the ghost intent's muted tone otherwise. */
  readonly className?: string;
}

/** A non-interactive, glanceable status glyph shown at rest (gold Crown = default, red Heart =
 *  favorited) — swapped out for the action cluster on row hover/focus. */
function StatusGlyph({
  icon,
  label,
  className,
}: {
  readonly icon: typeof Star;
  readonly label: string;
  readonly className: string;
}): ReactElement {
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

/** A reveal-action icon button — a `relative` sibling layered above the stretched select-Button, so it
 *  is its own disjoint tab stop and never fires "set current" (no stopPropagation crutch needed). */
function IconAction({
  icon,
  label,
  onClick,
  disabled = false,
  className,
}: IconActionProps): ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            // `pointer-events-auto` re-enables clicks inside the pointer-events-none action clusters (the
            // stretched select overlay owns the row's empty space; each control re-claims its own hit area).
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
