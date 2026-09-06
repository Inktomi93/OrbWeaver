// One persona row in the rail-foot panel: avatar/name edited inline, row-body click sets Current, hover
// reveals favorite/set-default/delete, chevron discloses details. The "set current" target is a real
// stretched <Button> pinned absolute inset-0 UNDER the row's controls; those controls are relative
// siblings layered above it so each is a disjoint tab stop (no stopPropagation crutch needed).

import { blobUrl } from "@orb/contracts/assets";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Collapsible, CollapsiblePanel } from "@orb/ui/collapsible";
import { FileTrigger } from "@orb/ui/file-trigger";
import type { LucideIcon } from "@orb/ui/icons";
import { ChevronDown, ChevronRight, Copy, Download, Heart, Icon, Pencil } from "@orb/ui/icons";
import { Layer, Row, Stack } from "@orb/ui/layout";
import { MenuItem } from "@orb/ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { ConfirmDialog, FINE_INERT_UNTIL_HOVER, ROW_ACTION_INLINE, ROW_ACTION_OVERFLOW, ROW_REVEAL, ROW_REVEAL_SWAP, RowActionsMenu } from "#components";
import type { Trpc } from "#data";
import { useInvalidation, useTRPC, useTRPCClient, useUploadAsset, useUploadCaps } from "#data";
import { cn, downloadTextFile, notify, oversizeUploadMessage, rowActionSubject } from "#lib";
import { useDuplicatePersona, useUpdatePersona } from "../hooks/use-persona-mutations.ts";
import { PersonaEditor } from "./persona-editor.tsx";
import { PersonaPin } from "./persona-pin.tsx";
import { PersonaRowNameColumn } from "./persona-row-name-column.tsx";

type PersonaListItem = inferOutput<Trpc["persona"]["list"]>[number];

export interface PersonaPanelRowProps {
  readonly persona: PersonaListItem;
  /** The row's action-name DISAMBIGUATOR, resolved by the surface across the WHOLE list (`rowQualifiers`,
   *  #443/#458) — absent when this row's name is already unique in the list, which is the common case (see
   *  the surface's "spent, not sprayed" note). Every control that embeds the persona's name announces
   *  `rowActionSubject(name, qualifier)`, so one row can never announce its subject two different ways. */
  readonly qualifier?: string;
  readonly isCurrent: boolean;
  readonly isDefault: boolean;
  readonly expanded: boolean;
  readonly onSetCurrent: () => void;
  readonly onSetDefault: () => void;
  readonly onToggleExpand: () => void;
  /** Reaches `ConfirmDialog.onConfirm` below, which AWAITS a returned promise (#1563b, widened #1632): the
   *  confirm holds open busy, closes on resolve, stays open with the reason on rejection. `() => void`
   *  ACCEPTED an async handler anyway, so the contract said the opposite of what the surface does. */
  readonly onDelete: () => void | Promise<void>;
}

/** A panel persona row: click-body sets Current; avatar/name edit inline; a chevron discloses DETAILS. */
export function PersonaPanelRow({
  persona,
  qualifier,
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
  const uploadCaps = useUploadCaps();
  // The EDITOR's own Delete button routes through this confirm; the kebab's destructive item owns its own
  // (RowActionsMenu). ONE copy string, so the two confirms can't drift.
  const [deleteOpen, setDeleteOpen] = useState(false);
  const avatarSrc = persona.avatarHash === null ? {} : { src: blobUrl(persona.avatarHash) };

  const onAvatarFile = async (file: File): Promise<void> => {
    // `FileTrigger` (unlike `FileDropzone`) carries no size ceiling of its own — pre-check against the
    // served route cap (`UploadCaps.assetUpload`) before the multipart POST, same pattern as the
    // `.image`/`.databankUpload` FileDropzone consumers (census #72 item 1).
    const oversize = oversizeUploadMessage(file, uploadCaps.assetUpload);
    if (oversize !== undefined) {
      notify.error(oversize);
      return;
    }
    try {
      const stored = await upload(file, "avatar");
      update.mutate({ personaId: persona.id, input: { avatarAssetId: stored.assetId } });
    } catch {
      notify.error("Couldn't upload the avatar.");
    }
  };

  // ONE ANNOUNCED IDENTITY PER ROW (#443/#458/#463): the subject the surface resolved, spelled ONCE here and
  // handed to every control on the row — the stretched select target, the avatar, the name column's rename
  // button, both reveal verbs, the chevron and the kebab — so a row can never name itself two different ways.
  //
  // EVERY CONTROL CARRIES IT, not just the ones whose name already held a persona (#463). #458 disambiguated
  // the two name-embedding controls and left the other five GENERIC — "Change avatar", "Rename persona",
  // "Favorite"/"Unfavorite", "Set as default", "Show details" were byte-identical on every row in the list, so
  // the collision did not even need two personas to share a name: a reader tabbing the list heard the same
  // five controls N times with nothing to bind them to a row. So the subject is NOT collision-gated here the
  // way the #458 qualifier is — it is unconditional, and the qualifier (when the surface spent one) composes
  // into it exactly once. The grammar is the house one (`Duplicate X` / `Actions for X`, library-row.tsx):
  // verb first, subject inside.
  const subject = rowActionSubject(persona.name, qualifier);
  const selectLabel = selectTargetLabel(subject, isCurrent);

  const onToggleFavorite = (): void => {
    update.mutate({ personaId: persona.id, input: { starred: !persona.starred } });
  };

  // Row-level Duplicate (#866 S4 — was editor-only). The same double-fire guard as the editor's button:
  // a menu item can be activated twice before the first mutate settles.
  const duplicate = useDuplicatePersona({ trpc, invalidation });
  const onDuplicate = (): void => {
    if (!duplicate.isPending) {
      duplicate.mutate({ personaId: persona.id });
    }
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
              onAvatarFile(file).catch(() => notify.error("Couldn't upload the avatar."));
            }
          }}
        >
          {({ open }): ReactElement => (
            <Button aria-label={`Change avatar for ${subject}`} className="relative shrink-0" intent="ghost" onClick={open} size="icon">
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
        <PersonaRowNameColumn onRename={(name): void => update.mutate({ personaId: persona.id, input: { name } })} persona={persona} subject={subject} />

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
            {/* THE ROW IS THE ONE HOME FOR "PLAYING AS" (side-eye 2026-08-03 P2) — the band above the list
                used to render the current persona a second time, with a different anatomy, 40px away. Words,
                not just the selected tint + `aria-current`: a colour is not a statement. */}
            {/* THE PILL (#866 S4, the Personas board): "playing as" on the current row, "pinned · {{user}}"
                on the default row — words at rest on a fine pointer, exactly where the old kicker lived.
                ONE pill max: on a row that is BOTH (your only persona), current wins — "pinned" is already
                the solid pin's statement one cell over, and two pills re-buy the width collapse this row's
                fences exist to prevent. The cell keeps plain `ROW_REVEAL_SWAP`: the coarse drop is
                DELIBERATE (a narrow row cannot afford pills), and at coarse the states survive as the
                stretched button's state-aware NAME + `aria-current` (current) and the always-in-flow PIN
                (default). */}
            <RowPill isCurrent={isCurrent} isDefault={isDefault} />
          </Row>

          {/* INERT AT REST, and that is a CONSEQUENCE of sharing the cell (`ROW_REVEAL`'s own carve-out: an
              in-flow cluster overlays nothing and keeps a live hit target; a cluster that COVERS content owes
              inertness — `listRowVariants.float` is the precedent, same `pointer-fine:` gate). At rest these
              controls sit invisibly over the marker glyphs, and a click there means "switch to this persona"
              (the stretched button below), never "unfavorite". Fine pointers only: at coarse there is no
              hover, the cluster is permanently visible (`ROW_REVEAL`) and must stay live. `pointer-events`
              INHERITS, so the wrapper alone carries it — the children deliberately declare none. */}
          <Row align="center" className={cn(FINE_INERT_UNTIL_HOVER, ROW_REVEAL) ?? ""} gap="field" justify="end">
            {/* THE COARSE COLLAPSE (side-eye 2026-08-07 finding 3 — the founding instance of the rule; see
                `#components/row-reveal.ts`). At a coarse pointer `ROW_REVEAL` pins this whole cluster ON and
                every icon button is 44-48px by touch-floor construction, so these two verbs plus the kebab
                charged 102px of a 272px rail row and the NAME lane was left 38px: "Traveler" rendered "T..".
                They stand down here and ride the kebab instead (their `pointer-fine:hidden` twins below), so
                the coarse cluster is ONE control and the name gets the ~50px back.
                THIS ALSO RE-RULES the 2026-08-03 "PLAYING AS in words" premise, deliberately and narrowly:
                that ruling reserved words for the current persona, but `ROW_REVEAL_SWAP` computes
                `display:none` at coarse, so the words never rendered on a phone — the ruling stands where
                its premise holds (fine pointer) and the coarse row states "current" through the selected
                tint plus the stretched button's `aria-current` AND its state-aware NAME
                (`selectTargetLabel` — "Traveler — current persona"), which is the words in the place a
                320px row can actually afford them. Spending the reclaimed 50px on a second kicker would
                just re-buy the truncation this collapse exists to end. The collapse does not move the
                name: it touches only the trailing cluster, and the select target is the stretched Button
                either way, at every pointer class. */}
            <Row align="center" className={ROW_ACTION_INLINE} gap="field" justify="end">
              <IconAction
                {...(persona.starred ? { className: "text-destructive" } : {})}
                icon={Heart}
                label={persona.starred ? `Unfavorite ${subject}` : `Favorite ${subject}`}
                onClick={onToggleFavorite}
              />
              {/* THE SET-DEFAULT STAR IS GONE (#866 S4, pin-not-crown): the verb AND the state are ONE pin
                  now — the in-flow `PersonaPin` sibling after this Layer, solid on the default row, the
                  faint click-to-pin elsewhere. One glyph, one meaning; one fact, one place (the 2026-08-03
                  P2 rule, finally with one element). The heart pair above is unchanged. */}
            </Row>
            <PersonaRowMenu
              name={persona.name}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              onEdit={(): void => {
                if (!expanded) {
                  onToggleExpand();
                }
              }}
              onExport={onExport}
              onToggleFavorite={onToggleFavorite}
              starred={persona.starred}
              subject={subject}
            />
          </Row>
        </Layer>

        {/* THE PIN (#866 S4, pin-not-crown) — an always-in-flow sibling, NOT a member of either paint-swap
            half: the solid default marker must be rest-visible at every pointer class (the crown's coarse
            bug), and the faint click-to-pin carries its own opacity reveal. Sits between the action Layer
            and the chevron — the board draws pin before ⋯, but the markers⇄actions pair share ONE Layer
            cell by the 2026-08-06 P1 ruling and the pin can ride inside neither half (deviation recorded
            in the design doc). */}
        <PersonaPin className="relative shrink-0" isDefault={isDefault} onPin={onSetDefault} subject={subject} />

        <IconAction
          className="relative shrink-0"
          icon={expanded ? ChevronDown : ChevronRight}
          label={expanded ? `Hide details for ${subject}` : `Show details for ${subject}`}
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
          <Stack className="rounded-base border border-border p-block" gap="section">
            <PersonaEditor persona={persona} onRequestDelete={(): void => setDeleteOpen(true)} />
          </Stack>
        </CollapsiblePanel>
      </Collapsible>
    </Stack>
  );
}

/**
 * The row's kebab — §12.2 caps the trailing cluster at three (state · state · kebab), and Export + Delete
 * ride here because this is the ruled lifecycle home for a low-frequency row verb.
 *
 * ITS ITEMS STAY BARE VERBS (#463): a menu item is announced inside a menu whose own name already carries the
 * row's subject (the trigger's "Actions for …"), so the row is named for the reader who opened it — repeating
 * the subject on every item would be the double-telling this row's rulings ban. The row's LOOSE controls have
 * no such container, which is why they carry the subject themselves.
 *
 * AT A COARSE POINTER IT IS THE CLUSTER'S ONLY CONTROL, so it also carries the two collapsed verbs
 * (`ROW_ACTION_OVERFLOW` = `pointer-fine:hidden`). Exactly ONE of each pair is in layout — and, since
 * `hidden` is `display:none`, in the a11y tree — for a given pointer class, so the collapse can never
 * become the double-telling this row's own rulings ban.
 */
function PersonaRowMenu({
  name,
  onDelete,
  onDuplicate,
  onEdit,
  onExport,
  onToggleFavorite,
  starred,
  subject,
}: {
  /** The persona's own name — the destructive confirm quotes it, and a confirm body speaks to a reader who
   *  can SEE which row they opened, so it never wants the disambiguator. */
  readonly name: string;
  /** Reaches `RowActionsMenu.destructive.onConfirm` below → `ConfirmDialog.onConfirm`, which AWAITS a
   *  returned promise (#1563b, widened #1632) — see the row's own `onDelete` above. */
  readonly onDelete: () => void | Promise<void>;
  /** Expands the row's editor (#866 S4 — the ⋯ names what the chevron does, for the reader who opens a
   *  menu looking for a verb; the editing model's HOME is unchanged, it is the expansion). */
  readonly onEdit: () => void;
  /** `persona.duplicate` — was editor-only; the row menu is the ruled lifecycle home (§12.2). */
  readonly onDuplicate: () => void;
  readonly onExport: () => Promise<void>;
  readonly onToggleFavorite: () => void;
  readonly starred: boolean;
  /** The row's announced identity (`rowActionSubject`) — what the TRIGGER's accessible name embeds, so two
   *  same-named rows can't hand one list two controls called "Actions for Traveler" (#443/#458). */
  readonly subject: string;
}): ReactElement {
  // Set-as-default LEFT this menu with #866 S4 (pin-not-crown): the pin is an always-in-flow row control
  // at BOTH pointer classes, so a coarse-overflow twin here would be the double-telling the collapse
  // rule exists to prevent. The Favorite twin stays — its inline heart still stands down at coarse.
  return (
    <RowActionsMenu
      destructive={{
        title: "Delete this persona?",
        description: deleteCopy(name),
        onConfirm: onDelete,
      }}
      label={`Actions for ${subject}`}
    >
      <MenuItem className={ROW_ACTION_OVERFLOW} onClick={onToggleFavorite}>
        <Icon icon={Heart} size="sm" />
        {starred ? "Unfavorite" : "Favorite"}
      </MenuItem>
      <MenuItem onClick={onEdit}>
        <Icon icon={Pencil} size="sm" />
        Edit
      </MenuItem>
      <MenuItem onClick={onDuplicate}>
        <Icon icon={Copy} size="sm" />
        Duplicate
      </MenuItem>
      <MenuItem
        onClick={(): void => {
          onExport().catch(() => notify.error("Couldn't export the persona."));
        }}
      >
        <Icon icon={Download} size="sm" />
        Export
      </MenuItem>
    </RowActionsMenu>
  );
}

/** The title-line pill — ONE max (current wins; see the markers-cell comment). Plain text to a reader:
 *  the STATES are already announced by `aria-current` + the state-aware select name (current) and the
 *  named pin (default); the pill is the fine-pointer rest-glance telling. */
function RowPill({ isCurrent, isDefault }: { readonly isCurrent: boolean; readonly isDefault: boolean }): ReactElement | null {
  if (isCurrent) {
    return (
      <Badge className="min-w-0 truncate" intent="primary" tone="soft">
        playing as
      </Badge>
    );
  }
  if (isDefault) {
    return (
      <Badge className="min-w-0 truncate" tone="soft">
        pinned · {"{{user}}"}
      </Badge>
    );
  }
  return null;
}

/** The stretched select target's accessible name — STATE-AWARE (side-eye 2026-08-07 P3a).
 *
 *  A fixed `Switch to X` made a screen reader announce "Switch to Traveler, current true" on the persona you
 *  are ALREADY playing as: a verb offering an act that is a no-op, contradicted by its own `aria-current` one
 *  word later. §13.10 N4 names a control by what activating it DOES, and on the current row there is nothing
 *  to do; N3 keeps the STABLE identity — the persona's name — leading in BOTH arms, so a name-scoped lookup
 *  survives the Current pick moving. File-local: this is the row's own naming rule, not a shared vocabulary.
 *
 *  It takes the SUBJECT, not the bare name (#458): with two personas called "Traveler" and neither current,
 *  a bare name gave one list two buttons called "Switch to Traveler". The subject still leads with the name,
 *  so N3 is unchanged — it just carries the list-resolved disambiguator when there is one to carry. */
function selectTargetLabel(subject: string, isCurrent: boolean): string {
  return isCurrent ? `${subject} — current persona` : `Switch to ${subject}`;
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
