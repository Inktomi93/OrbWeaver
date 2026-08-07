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
import { ChevronDown, ChevronRight, Crown, Download, Heart, Icon, Star } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Layer, Row, Stack } from "@orb/ui/layout";
import { MenuItem } from "@orb/ui/menu";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { ConfirmDialog, ROW_REVEAL, ROW_REVEAL_SWAP, RowActionsMenu } from "#components";
import type { Trpc } from "#data";
import { useInvalidation, useTRPC, useTRPCClient, useUploadAsset } from "#data";
import { cn, downloadTextFile, notify } from "#lib";
import { useUpdatePersona } from "../hooks/use-persona-mutations.ts";
import { PersonaEditor } from "./persona-editor.tsx";

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
  const client = useTRPCClient();
  const invalidation = useInvalidation();
  const update = useUpdatePersona({ trpc, invalidation });
  const upload = useUploadAsset();
  // The EDITOR's own Delete button routes through this confirm; the kebab's destructive item owns its own
  // (RowActionsMenu). ONE copy string, so the two confirms can't drift.
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

  const selectLabel = selectTargetLabel(persona.name, isCurrent);

  const onToggleFavorite = (): void => {
    update.mutate({ personaId: persona.id, input: { starred: !persona.starred } });
  };

  // F3: EXPORT is a kebab item on the ROW (the ruled anatomy), not a button inside the editor. The bytes
  // are the SERVER's — the same file the backup bundle carries — so a shared persona and a restored one
  // can't diverge.
  const onExport = async (): Promise<void> => {
    try {
      const file = await client.persona.export.query({ personaId: persona.id });
      downloadTextFile(file.filename, file.fileText);
    } catch {
      notify.error("Couldn't export the persona.");
    }
  };

  return (
    <Stack gap="field">
      <Row
        align="center"
        // Two group NAMES on one row: `group` is what `ROW_REVEAL` keys on, `group/row` is what the
        // marker's `ROW_REVEAL_SWAP` half keys on (it is written for the `@orb/ui` ListRow root). Both
        // are needed because this row hand-rolls the anatomy ListRow otherwise provides.
        className="group/row group relative min-h-control-md rounded-control transition-colors duration-(--motion-fast) ease-out-expo hover:bg-accent data-selected:bg-accent"
        data-selected={isCurrent ? "" : undefined}
        gap="row"
        padding="field"
      >
        {/* `aria-current` STAYS beside the state-aware name (see `selectLabel`) — it is what makes this row
            findable as "the one" among same-shaped siblings. */}
        <Button
          aria-current={isCurrent ? "true" : undefined}
          aria-label={selectLabel}
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

        {/* `data-slot`: the name column's WIDTH is the thing the trailing clusters were starving, so it needs
            a stable handle a CT can measure (persona-panel-row.ct.tsx, the 358px dense-row fence).
            THE FLOOR MOVED BACK OFF THIS COLUMN (side-eye leg-4 P2). A `min-w-1/2` here did give the name its
            half — and MOVED the breakage: the marker Layer beside it shrank to a 38px grid cell whose
            contents still laid out at their own width, painting 58px LEFTWARD through the name (a 9-char
            name ran under the orange "PLAYING AS"). A floor on one side of a two-item row is a squeeze on
            the other. What actually bounds this row is the MARKERS reserving their content (below) while the
            name shrinks and truncates — one shrinker, one reserver. */}
        <Stack className="pointer-events-none relative min-w-0 flex-1" data-slot="persona-row-name">
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
            packages/client/src/components/row-reveal.ts, gate `no-hover-display-swap`).
            ONE STRIP, NOT TWO (side-eye 2026-08-06 P1): the two clusters share ONE `<Layer>` cell, so the row
            reserves the WIDER of them rather than their SUM. Side by side they charged 114px + 74px of a
            358px rail row while only ever showing one of the two, and the name column was left 58px — the
            persona's name rendered as "Tra…". Both children keep every byte of the paint-swap posture; only
            the box they share changed. */}
        {/* `relative`: the stretched select-Button above is `absolute`, so a STATIC sibling would paint
            under it and every control in here would be unreachable. */}
        {/* A REAL FLEX SIBLING RESERVING ITS CONTENT (side-eye leg-4 P2). `shrink` + `min-w-0` let this box
            be squeezed to 38px while its children — which carry their own widths — kept laying out at 96px
            and painted over the name lane. A shared `<Layer>` cell only makes the two clusters share ONE
            width; it does not make that width elastic. So the cluster reserves what it needs and the NAME is
            the row's single shrinker. */}
        <Layer className="relative shrink-0" data-slot="persona-row-markers">
          <Row align="center" className={cn("pointer-events-none", ROW_REVEAL_SWAP) ?? ""} gap="field" justify="end">
            {/* THE ROW IS THE ONE HOME FOR "PLAYING AS" (side-eye 2026-08-03 P2) — the band above the roster
                used to render the current persona a second time, with a different anatomy, 40px away. Words,
                not just the selected tint + `aria-current`: a colour is not a statement. */}
            {isCurrent ? (
              // TRUNCATES, and now that is TRUE (side-eye leg-4 P2 — the header claimed it while the kicker
              // was `white-space: normal` and wrapped to two lines even at rest, which is what made the
              // cluster taller and wider than the row budgeted for).
              <Text as="span" className="min-w-0 truncate text-primary" voice="kicker">
                Playing as
              </Text>
            ) : null}
            {isDefault ? <StatusGlyph className="text-warning" icon={Crown} label="Your default" /> : null}
            {/* DECORATIVE, unlike the crown (side-eye 2026-08-06 P1). The reveal cluster's heart button is in
                the a11y tree at ALL times and its NAME is the state ("Unfavorite" ⇒ favorited), so a named
                `role="img"` here made the row announce one fact twice on every rest-state read. The crown has
                no such twin — its verb ("Set as default") exists only while the state is FALSE — so the crown
                keeps its accessible name and this one drops to ornament. The glyph and its tooltip are
                unchanged: at rest the marker is still the only thing a reader SEES. */}
            {persona.starred ? <StatusGlyph className="text-destructive" decorative={true} icon={Heart} label="Favorited" /> : null}
          </Row>

          {/* INERT AT REST, and that is a CONSEQUENCE of sharing the cell (`ROW_REVEAL`'s own carve-out: an
              in-flow cluster overlays nothing and keeps a live hit target; a cluster that COVERS content owes
              inertness — `listRowVariants.float` is the precedent, same `pointer-fine:` gate). At rest these
              controls sit invisibly over the marker glyphs, and a click there means "switch to this persona"
              (the stretched button below), never "unfavorite". Fine pointers only: at coarse there is no
              hover, the cluster is permanently visible (`ROW_REVEAL`) and must stay live. `pointer-events`
              INHERITS, so the wrapper alone carries it — the children deliberately declare none. */}
          <Row
            align="center"
            className={
              cn(
                "pointer-fine:pointer-events-none pointer-fine:group-hover:pointer-events-auto pointer-fine:group-focus-within:pointer-events-auto",
                ROW_REVEAL,
              ) ?? ""
            }
            gap="field"
            justify="end"
          >
            <IconAction
              {...(persona.starred ? { className: "text-destructive" } : {})}
              icon={Heart}
              label={persona.starred ? "Unfavorite" : "Favorite"}
              onClick={onToggleFavorite}
            />
            {/* ONE FACT, ONE PLACE (side-eye 2026-08-03 P2). "Your default" used to be said three times on
                one row: the crown MARKER at rest, this control's label, and — on the seeded persona — the
                subtitle. The reveal cluster is for VERBS; a disabled button whose name is a STATE is neither
                a verb nor a state a reader can act on, and it was the third telling. The crown marker (in the
                a11y tree, tooltipped) keeps the state; the verb only exists while it is available. */}
            {isDefault ? null : <IconAction icon={Star} label="Set as default" onClick={onSetDefault} />}
            {/* §12.2 caps the trailing cluster at three: state · state · kebab. Export and Delete both ride
                the kebab, which is also the ruled lifecycle home for a low-frequency row verb. */}
            <RowActionsMenu
              destructive={{
                title: "Delete this persona?",
                description: deleteCopy(persona.name),
                onConfirm: onDelete,
              }}
              label={`Actions for ${persona.name}`}
            >
              <MenuItem
                onClick={(): void => {
                  void onExport();
                }}
              >
                <Icon icon={Download} size="sm" />
                Export
              </MenuItem>
            </RowActionsMenu>
          </Row>
        </Layer>

        <IconAction
          className="relative shrink-0"
          icon={expanded ? ChevronDown : ChevronRight}
          label={expanded ? "Hide details" : "Show details"}
          onClick={onToggleExpand}
        />
      </Row>

      <ConfirmDialog
        confirmLabel="Delete"
        description={deleteCopy(persona.name)}
        onConfirm={onDelete}
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        title="Delete this persona?"
      />

      <Collapsible onOpenChange={onToggleExpand} open={expanded}>
        <CollapsiblePanel>
          <Stack className="rounded-card border border-border p-block" gap="section">
            <PersonaEditor persona={persona} onRequestDelete={(): void => setDeleteOpen(true)} />
          </Stack>
        </CollapsiblePanel>
      </Collapsible>
    </Stack>
  );
}

/** The stretched select target's accessible name — STATE-AWARE (side-eye 2026-08-07 P3a).
 *
 *  A fixed `Switch to X` made a screen reader announce "Switch to Traveler, current true" on the persona you
 *  are ALREADY playing as: a verb offering an act that is a no-op, contradicted by its own `aria-current` one
 *  word later. §13.10 N4 names a control by what activating it DOES, and on the current row there is nothing
 *  to do; N3 keeps the STABLE identity — the persona's name — leading in BOTH arms, so a name-scoped lookup
 *  survives the Current pick moving. File-local: this is the row's own naming rule, not a shared vocabulary. */
function selectTargetLabel(name: string, isCurrent: boolean): string {
  return isCurrent ? `${name} — current persona` : `Switch to ${name}`;
}

/** The ONE delete-confirm body — both confirms (the kebab's and the editor's) render it. */
function deleteCopy(name: string): ReactElement {
  return <>This permanently deletes “{name}”. Past messages you authored as it keep their name and avatar. This can't be undone.</>;
}

interface IconActionProps {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

/** A non-interactive, glanceable status glyph shown at rest. `decorative` drops it out of the a11y tree —
 *  the arm for a marker whose fact is ALREADY named by an always-present control in the reveal cluster (the
 *  favorite heart); a marker with no such twin (the default crown) keeps its `role="img"` name. `label` is
 *  required either way: it is the tooltip's words, which a sighted reader still needs. */
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

/** A reveal-action icon button — layered above the stretched select-Button by its POSITIONED ancestor (the
 *  `<Layer>`, or the row itself for the chevron). It declares NO `pointer-events` of its own: `pointer-events`
 *  inherits, and the reveal cluster gates the whole strip at the wrapper (a child re-declaring `auto` would
 *  stay hit-testable through its inert parent and defeat exactly the guard the shared cell needs). */
function IconAction({ icon, label, onClick, disabled = false, className }: IconActionProps): ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button aria-label={label} {...(className === undefined ? {} : { className })} disabled={disabled} intent="ghost" onClick={onClick} size="icon">
            <Icon icon={icon} size="sm" />
          </Button>
        }
      />
      <TooltipPopup side="top">{label}</TooltipPopup>
    </Tooltip>
  );
}
