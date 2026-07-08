// One persona row in the rail-foot panel — LEAN redesign (identity edited IN THE ROW, no sub-editor
// identity block). Interaction model:
//   • Avatar click → a hidden file input → `uploadAsset(file,"avatar")` → `persona.update` PARTIAL patch
//     (`avatarAssetId`), autosaved. NO drag-drop zone.
//   • Name click → inline rename (the name becomes an `Input` in place; Enter/blur commits via the SAME
//     partial-patch mutation; Escape cancels).
//   • Row-body click (anywhere but the avatar/name) = set that persona as CURRENT (#2).
//   • Hover-reveal actions: ♥ favorite (a `persona.update` partial patch, `starred`) · ★ set-Default
//     (#1, gold Crown once set) · 🗑 delete (AlertDialog confirm). NO ✎ edit button.
//   • An ALWAYS-visible ⌄ chevron is a disclosure toggle (`@orb/ui/collapsible`), not an edit
//     button — it expands/collapses the row's DETAILS (`<PersonaEditor>`, itself fully autosaving).
// The avatar/name controls are real `<button>`/`<input>` nested inside the row's `role="button"` click
// target; each stops propagation on click so they never also fire "set current" (the same carve-out
// technique the hover actions already use — see `IconAction` below). `@orb/ui/list-row`'s `title` is a
// plain string with no room for a live edit-in-place control, so this row is hand-composed from
// `@orb/ui/layout` + `@orb/ui/button` rather than force-fit into that primitive.
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
import { Collapsible, CollapsiblePanel } from "@orb/ui/collapsible";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve every glyph + Icon fine (the add-member-popover precedent).
import { ChevronDown, ChevronRight, Crown, Heart, Icon, Star, Trash2 } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { KeyboardEvent, ReactElement } from "react";
import { useRef, useState } from "react";
import type { Trpc } from "#data";
import { uploadAsset, useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import { useUpdatePersona } from "../hooks/use-persona-mutations";
import { PersonaEditor } from "./persona-editor";

type PersonaListItem = inferOutput<Trpc["persona"]["list"]>[number];

const WHITESPACE_RE = /\s+/u;

function initials(name: string): string {
  const parts = name.trim().split(WHITESPACE_RE).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const second = parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "";
  return (first + second).toUpperCase();
}

/** Enter/Space synthesizes a click on the row body — mirrors `@orb/ui/list-row`'s own `activateOnKey`. */
function activateOnKey(event: KeyboardEvent<HTMLDivElement>): void {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    event.currentTarget.click();
  }
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
  const fileRef = useRef<HTMLInputElement>(null);
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
        aria-current={isCurrent ? "true" : undefined}
        aria-label={`Switch to ${persona.name}`}
        className="group min-h-control-md cursor-pointer rounded-control outline-none transition-colors duration-(--motion-fast) ease-out-expo hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-selected:bg-accent"
        data-selected={isCurrent ? "" : undefined}
        gap="row"
        onClick={onSetCurrent}
        onKeyDown={activateOnKey}
        padding="field"
        role="button"
        tabIndex={0}
      >
        <Button
          aria-label="Change avatar"
          className="shrink-0"
          intent="ghost"
          onClick={(event): void => {
            event.stopPropagation();
            fileRef.current?.click();
          }}
          size="icon"
        >
          <Avatar fallbackDelay={0} hueSeed={persona.id} size="sm" {...avatarSrc}>
            {initials(persona.name)}
          </Avatar>
        </Button>
        <input
          aria-label="Upload avatar file"
          accept="image/*"
          hidden={true}
          onChange={(event): void => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file !== undefined) {
              void onAvatarFile(file);
            }
          }}
          onClick={(event): void => event.stopPropagation()}
          ref={fileRef}
          type="file"
        />

        <Stack className="min-w-0 flex-1">
          {editingName ? (
            <Input
              aria-label="Persona name"
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus={true}
              onBlur={commitName}
              onClick={(event): void => event.stopPropagation()}
              onKeyDown={(event): void => {
                event.stopPropagation();
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
              className="min-w-0 justify-start truncate"
              intent="ghost"
              onClick={(event): void => {
                event.stopPropagation();
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
          className="shrink-0 group-hover:hidden group-focus-within:hidden"
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
          className="hidden shrink-0 group-hover:flex group-focus-within:flex"
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
          className="shrink-0"
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

      <AlertDialog onOpenChange={setDeleteOpen} open={deleteOpen}>
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

/** A reveal-action icon button — stops row-body click propagation so it never sets Current by accident. */
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
            {...(className === undefined ? {} : { className })}
            disabled={disabled}
            intent="ghost"
            onClick={(event): void => {
              event.stopPropagation();
              onClick();
            }}
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
