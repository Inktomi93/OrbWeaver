// CharacterCardTile — the library list row. One shape, both flat + categorized modes: a face-sized
// avatar, the name, the distilled-pitch subtitle ladder (elevatorPitch → tag line → handle), a star
// chip, and a dual-purpose Chat CTA (resume-or-new). In bulk mode the row's click toggles a selection
// checkbox instead of opening the editor.
//
// Named `*Tile` because @orb/contracts owns `CharacterCard` as the ST wire-card type.
//
// THE TRAILING ZONE IS SPLIT (side-eye 2026-08-18 P1-3, the chats-row precedent): rest-visible MARKERS
// (★ / Archived) ride `ListRow.markers` on the title line, and the trailing cluster holds only the
// hover-revealed controls — so `actionsFloat` is on outside bulk mode and the NAME keeps the row's full
// width at rest instead of yielding 114px of a 290px row to a cluster that paints nothing.
//
// …AND THAT SPLIT IS A FINE-POINTER GUARANTEE, which is why the row still needed the COARSE COLLAPSE
// (#1695). `actionsFloat` is a `pointer-fine:` arm and `ROW_REVEAL` pins the cluster permanently ON at
// coarse, so on a phone all three controls sat in flow at the 44-48px touch floor. The star toggle — the
// row's one SECONDARY affordance — now stands down into the kebab there (`ROW_ACTION_INLINE` +
// `ROW_ACTION_OVERFLOW`), the ★ marker keeps its box (`ROW_REVEAL_SWAP_COARSE_KEEP`, the coupled site),
// and the Chat CTA stays: it is the 1-click core loop, not a secondary, and its ruling below is preserved.
//
// THE KEBAB'S ITEM LIST IS THE `row` SLICE OF ONE VOCABULARY (`../lib/character-actions.ts`, #838) — labels,
// glyphs, order and the export containers are the registry's; this file owns only the handlers and the
// confirm copy. Its rendered items are unchanged by that move (Archive · Duplicate · Export card · Delete).
// The card-export route's ONE MINT moved to the registry with it: export is still a single serialization
// path (D121 clause D), now rendered by both kebabs that offer it — this row's and the CONTEXT pane's.

import { blobUrl } from "@orb/contracts/assets";
import type { TagView } from "@orb/contracts/tag";
import type { ThemeOverride } from "@orb/contracts/theme";
import type { CharacterHandle } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Checkbox } from "@orb/ui/checkbox";
import { Icon, MessagesSquare, Star } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { MenuItem, MenuLinkItem, MenuPopup, MenuSubmenuRoot, MenuSubmenuTrigger } from "@orb/ui/menu";
import type { ReactElement, ReactNode } from "react";
import { ROW_ACTION_INLINE, ROW_ACTION_OVERFLOW, ROW_REVEAL, ROW_REVEAL_SWAP_COARSE_KEEP, RowActionsMenu, RowToggleAction } from "#components";
import { rowActionSubject } from "#lib";
import type { CHARACTER_ACTION_SCOPE_IDS } from "../lib/character-actions.ts";
import { CHARACTER_ACTIONS, characterActionItemsForScope, characterActionLabel, EXPORT_CHARACTER_PATH } from "../lib/character-actions.ts";

/** File-local — exactly the verbs the `row` scope offers, so a verb added to that scope is a `tsc` error
 *  here until this row wires it. */
type RowActionId = (typeof CHARACTER_ACTION_SCOPE_IDS)["row"][number];

export interface CharacterCardItem {
  readonly id: string;
  readonly name: string;
  /** Identity slug — the subtitle ladder's last fallback, and the row's disambiguator when the name
   *  collides ({@link handleQualifier}). */
  readonly handle: CharacterHandle;
  /** Does another of the owner's characters carry this name? The server's LIBRARY-WIDE verdict (#517) —
   *  never derived here, because this pane sees one keyset page at a time. */
  readonly nameIsAmbiguous: boolean;
  readonly archived: boolean;
  readonly starred: boolean;
  /** CAS key — null when no avatar; never `avatarAssetId` (blob route keyed by hash). */
  readonly avatarHash: string | null;
  /** The discovery-domain distilled one-liner — the subtitle's first choice. `null` until distilled. */
  readonly elevatorPitch: string | null;
  /** Per-character theme override; `null` inherits the global accent. */
  readonly themeOverride: ThemeOverride | null;
  /** Advisory card-heft estimate — the hover/:focus-within raw-metadata reveal (handle · tokenSize). */
  readonly tokenSize: number;
  /** The accepted canonical tags (pending suggestions already excluded upstream). `folderType` rides along
   *  because the SAME rows feed the categorized view's grouping, where it decides a group's first paint
   *  (C9-1d, `character-list-view.ts`'s `RowTag`) — the row itself never reads it. */
  readonly tags: readonly Pick<TagView, "id" | "name" | "isHiddenOnCard" | "folderType">[];
}

export interface CharacterCardTileProps {
  readonly character: CharacterCardItem;
  readonly selected: boolean;
  /** Bulk mode: the click toggles selection (not open-editor) and a checkbox replaces the actions. */
  readonly bulkMode: boolean;
  readonly bulkSelected: boolean;
  readonly onSelect: (id: string) => void;
  readonly onToggleBulk: (id: string) => void;
  /** The dual-purpose Chat CTA — the surface passes a handler that resumes the most-recent chat or
   *  starts a new one; the row is agnostic to which. */
  readonly onChat: (id: string) => void;
  readonly onToggleStar: (id: string, next: boolean) => void;
  readonly onToggleArchive: (id: string, next: boolean) => void;
  readonly onDuplicate: (id: string) => void;
  readonly onDelete: (id: string) => void;
}

/**
 * THE ROW'S IDENTITY DISAMBIGUATOR (#492 → #517) — the HANDLE when another character shares this row's name,
 * `undefined` when the name already tells the reader which row this is.
 *
 * The library holds genuine same-name collisions (three `Emily` at handles `emily`/`emily-2`/`emily-3`;
 * `Hikari`×2 and `Eva`×2 inside the first 50 rows), and the row announced its `name` alone: three identical
 * `button "Emily"`. Voice control could address none of them ("click emily-3" matches nothing) and
 * list-navigation / low-verbosity screen-reader modes, which drop descriptions, heard one name three times.
 *
 * IT USED TO GATE ON DERIVABILITY (is the handle `slugifyHandle(name)`?) AND THE RULING SURVIVES — ITS INPUT
 * CHANGED (#517, side-eye se-verify-1, the verification pass over #492's own fix). The reason for that gate
 * was real and is preserved verbatim: this list is keyset-paged 30 at a time, so a collision scan over the
 * LOADED PAGE would answer about the page rather than the library, and a row's announced name would change
 * under a screen-reader user as later pages arrived. What died is the assumption that per-row derivability
 * was the only paging-stable rule available. Measured cost of that stand-in on the owner's library: 13 rows,
 * 8 qualified, 0 of the 8 colliding — `Charlotte · assistant` reads as a ROLE, while `Emily`/`emily` (a real
 * collision whose handle is derivable) got nothing at all. So the AMBIGUITY itself is answered where the
 * library lives (`character.list`'s `nameIsAmbiguous`, a library-wide, lens-independent, page-independent
 * verdict), and the handle — unique per owner, therefore always separating — is spent on exactly that.
 */
function handleQualifier(character: Pick<CharacterCardItem, "handle" | "nameIsAmbiguous">): string | undefined {
  return character.nameIsAmbiguous ? character.handle : undefined;
}

export function CharacterCardTile({
  character,
  selected,
  bulkMode,
  bulkSelected,
  onSelect,
  onToggleBulk,
  onChat,
  onToggleStar,
  onToggleArchive,
  onDuplicate,
  onDelete,
}: CharacterCardTileProps): ReactElement {
  const visibleTags = character.tags.filter((tag) => !tag.isHiddenOnCard);
  const tagLine = visibleTags.length === 0 ? null : visibleTags.map((tag) => tag.name).join(" · ");
  // Fallback ladder: the distilled pitch → the tag line → the handle. Always a line (never blank).
  const subtitle = character.elevatorPitch ?? tagLine ?? character.handle;
  // exactOptionalPropertyTypes: omit `src` entirely for a missing avatar so it falls to the fallback.
  const avatarSrc = character.avatarHash === null ? {} : { src: blobUrl(character.avatarHash) };
  // ONE announced identity for the row AND every control that acts on it (`rowActionSubject`, #443/#458/#463):
  // "Star Emily" / "Chat with Emily" / "Actions for Emily" collided across the three Emilys exactly as the row
  // body did, so fixing only the body would have left three identically-named kebabs behind it.
  const qualifier = handleQualifier(character);
  const subject = rowActionSubject(character.name, qualifier);

  const bulkActions = <Checkbox aria-label={`Select ${subject}`} checked={bulkSelected} onCheckedChange={(): void => onToggleBulk(character.id)} />;
  const markers = bulkMode ? undefined : rowMarkers(character);

  return (
    <ListRow
      // The Chat CTA is the row's 1-click core loop (§9c) — it stays a visible target (hover-revealed
      // on fine pointers, always-on for coarse), never folded into the kebab. Bulk mode is a checkbox.
      actions={
        bulkMode ? (
          bulkActions
        ) : (
          <NormalRowActions
            character={character}
            onChat={onChat}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            onToggleArchive={onToggleArchive}
            onToggleStar={onToggleStar}
            subject={subject}
          />
        )
      }
      // THE NAME GETS ITS WIDTH BACK (side-eye 2026-08-18 P1-3). The cluster is three hover-revealed
      // controls, and reserving their strip in flow spent 114px of a 290px row on nothing you can see at
      // rest while the TITLE — the one thing a 327-character library is scanned by, with 27 duplicate-name
      // groups in it — got the same 114px and clipped on 3 of 18 loaded rows. `actionsFloat` lifts the
      // cluster out of flow at the row's inline end (fine pointers only), so the text column keeps the full
      // width at rest AND the reveal costs no reflow — the truncation point does not jump under the pointer.
      // The app already proved the space exists: select mode's title box is 210px on the same pane.
      //
      // The float arm is INERT at rest, so a rest-VISIBLE control must not ride it: bulk mode's checkbox is
      // exactly that, and it keeps the reserved strip (`rowTint="row"`, or the tint stops before the
      // sibling cluster). The star's pressed state moved to `markers` on the title line, where it is in the
      // accessible tree and in flow — the same split the chats row landed (chat-summary-row.tsx).
      actionsFloat={!bulkMode}
      rowTint={bulkMode ? "row" : "body"}
      {...(markers === undefined ? {} : { markers })}
      className="group"
      clickable={true}
      // `md` (32px) is THE list-row portrait size — the mock's one row rhythm, shared with the chats panes
      // (side-eye P2-5). The library's 40px pitched its rows ~12px taller than the chats list of the same
      // entities. 40px survives where it means HIERARCHY: the projection's identity HEADER.
      leading={
        <Avatar hueSeed={character.id} shape="square" size="md" {...avatarSrc}>
          {initialsFor(character.name)}
        </Avatar>
      }
      onClick={(): void => (bulkMode ? onToggleBulk(character.id) : onSelect(character.id))}
      selected={bulkMode ? bulkSelected : selected}
      subtitle={subtitle}
      // THE PITCH/TAG/HANDLE LINE IS FUNCTIONAL PROSE INSIDE A CLICKABLE ROW, SO IT TAKES THE LABEL STEP
      // (#892, the readable-floor debt cb-bracket-fix surfaced closing #875 F6). Unset, `subtitle` rides
      // `ListRow`'s instrument-tier micro gloss — 10.5px interactive text, under the 11px readable floor —
      // and this row is `clickable={true}`, so it is the same shape `chat-summary-row.tsx` already fixed:
      // `subtitleStep="label"` is the ratified lever ("functional prose inside a row owes the readable
      // label floor", tiers.css), set on the row anatomy rather than invented here.
      subtitleStep="label"
      title={character.name}
      {...(qualifier === undefined ? {} : { titleQualifier: qualifier })}
      // Not in bulk mode (the row is a checkbox target, no hover disclosure).
      {...(bulkMode ? {} : { subtitleReveal: `${character.handle} · ${character.tokenSize}` })}
    />
  );
}

/** The row's TITLE-LINE markers — the state the row already carries, rest-visible, INSIDE the text column
 *  (`ListRow.markers`, which rides `aria-describedby`, unlike the `aria-hidden` leading slot).
 *
 *  This is the half that makes `actionsFloat` legal on this row (P1-3): a floated cluster is inert and sits
 *  ON the title text, so anything the row shows AT REST has to earn its width where the text already is. The
 *  ★ here and the star TOGGLE in the cluster are ONE concept, so the marker SWAPS against it — it paints the
 *  pressed state at rest and steps aside exactly when the control that sets it reveals, so the row never
 *  paints two stars. `undefined` when the row is in neither state: the slot is data-driven, never an empty
 *  reserved box.
 *
 *  COARSE KEEPS THE MARKER (#1695, the coupled half of the collapse below). Plain `ROW_REVEAL_SWAP` computes
 *  `display:none` at a coarse pointer on one premise: that the toggle carrying the same datum is permanently
 *  visible there. `ROW_ACTION_INLINE` on that toggle DELETES the premise — it stands down and its datum moves
 *  into a CLOSED menu — so the swap is hover-only here and coarse keeps the ★ permanently. Without this the
 *  measured result is a starred row with no star anywhere on it (proven on the chats roster, which is why
 *  `ROW_REVEAL_SWAP_COARSE_KEEP` exists). */
function rowMarkers(character: Pick<CharacterCardItem, "archived" | "starred">): ReactNode {
  if (!(character.archived || character.starred)) {
    return;
  }
  return (
    <>
      {character.starred ? <Icon className={`text-warning ${ROW_REVEAL_SWAP_COARSE_KEEP}`} icon={Star} label="Starred" size="sm" /> : null}
      {character.archived ? (
        <Badge intent="warning" size="sm">
          Archived
        </Badge>
      ) : null}
    </>
  );
}

/** The normal-mode trailing actions — CONTROLS ONLY (the rest-visible markers moved to the title line, so
 *  the whole cluster is hover-revealed and can float): the Star state-toggle at `rest="never"` (its pressed
 *  face is the title-line ★), the dual-purpose Chat CTA (§4.4/§9c — the 1-click core loop, hover-revealed on
 *  fine pointers, always-on for coarse) + the ⋯ overflow.
 *
 *  TWO CONTROLS AT A COARSE POINTER, THREE AT A FINE ONE (#1695): the star pair gates by `display`, so the
 *  phone row spends its trailing budget on the CTA and the one overflow door. */
function NormalRowActions({
  character,
  subject,
  onChat,
  onToggleStar,
  onToggleArchive,
  onDuplicate,
  onDelete,
}: {
  readonly character: CharacterCardItem;
  /** The row's announced identity (`rowActionSubject(name, handleQualifier)`) — what every control here
   *  embeds, so a library holding three "Emily"s cannot ship three identically-named kebabs (#492). The
   *  ROW BODY renders and announces the same pair without the action grammar's quotes
   *  (`ListRow.titleQualifier` → a visible `Emily · emily-3`): one identity, two sentence shapes — a name
   *  standing alone, and a name inside a verb. */
  readonly subject: string;
  readonly onChat: (id: string) => void;
  readonly onToggleStar: (id: string, next: boolean) => void;
  readonly onToggleArchive: (id: string, next: boolean) => void;
  readonly onDuplicate: (id: string) => void;
  readonly onDelete: (id: string) => void;
}): ReactElement {
  /** Every verb the `row` scope offers, wired. `null` = not click-dispatched from this map: `exportCard`
   *  renders as download LINKS and `delete` rides `RowActionsMenu`'s destructive slot + confirm. */
  const rowHandlers: Readonly<Record<RowActionId, (() => void) | null>> = {
    archive: (): void => onToggleArchive(character.id, !character.archived),
    duplicate: (): void => onDuplicate(character.id),
    exportCard: null,
    delete: null,
  };

  return (
    <>
      {/* D11, in its MARKER form (`rest="never"`): the toggle is always reveal-gated because the title-line
          ★ (`rowMarkers`) is what carries the pressed state at rest — D11's invariant is met in the marker
          slot, and the two never paint together. That is what leaves this cluster entirely hover-revealed,
          which is the precondition for `actionsFloat` returning the name its 114px (P1-3). Same split as
          the chats row.

          THE COARSE COLLAPSE (#1695, side-eye 2026-09-05 — the rule's home is `#components/row-reveal.ts`).
          `ROW_REVEAL` pins this toggle permanently ON at a coarse pointer, where it is a 44-48px touch box
          and `actionsFloat` (a `pointer-fine:` arm) is off, so it charges real in-flow width on every row of
          a phone-width library. Measured on this tree at coarse BEFORE the collapse, title width / row
          width: 0.31 @320 · 0.43 @390 · 0.48 @430, with `Calamity, Doomblade of the Ninth Epoch` clipped at
          all three. It stands down here and rides the kebab instead (its `ROW_ACTION_OVERFLOW` twin below),
          so the coarse cluster is the Chat CTA plus one overflow door. */}
      <Row align="center" className={ROW_ACTION_INLINE}>
        <RowToggleAction
          icon={Star}
          labelOff={`Star ${subject}`}
          labelOn={`Unstar ${subject}`}
          onToggle={(): void => onToggleStar(character.id, !character.starred)}
          pressed={character.starred}
          pressedClassName="text-warning"
          rest="never"
        />
      </Row>
      {/* THE CTA DOES NOT COLLAPSE, and that is this row's own standing ruling, preserved: the dual-purpose
          Chat action is the library's 1-click core loop (§9c) and "stays a visible target … never folded
          into the kebab" (this file's header). The collapse rule is written for a row's SECONDARY
          affordances (`#components/row-reveal.ts`), which the star is and this is not — so #1695's symptom
          (three touch boxes charging a phone row) is answered by taking the cluster from three to TWO, not
          by reversing the CTA ruling. */}
      <Button aria-label={`Chat with ${subject}`} className={ROW_REVEAL} intent="ghost" onClick={(): void => onChat(character.id)} size="icon" type="button">
        <Icon icon={MessagesSquare} size="sm" />
      </Button>
      <RowActionsMenu
        align="start"
        label={`Actions for ${subject}`}
        reveal={true}
        destructive={{
          separator: false,
          label: CHARACTER_ACTIONS.delete.label,
          title: `Delete "${character.name}"?`,
          description: "This permanently deletes the character and everything attached to it. This can't be undone.",
          onConfirm: (): void => onDelete(character.id),
        }}
      >
        {/* THE OVERFLOW ARM of the collapsed star (#1695) — present ONLY at a coarse pointer, where the
            inline toggle above is `display:none`. Exactly one of the pair is in layout, and therefore in the
            a11y tree, per pointer class, so the collapse never becomes double-telling.

            HAND-SPELLED HERE, NOT ADDED TO `character-actions.ts`, and the registry's one-vocabulary law
            (this file's header) is why. That registry is the membership list shared by the row kebab, the
            CONTEXT kebab and the bulk bar, and it has no pointer axis: a `star` member would render in all
            three at BOTH pointer classes — doubling the fine row's inline toggle, and minting a second home
            for a state the CONTEXT pane already carries its own way. This item is not a new row VERB; it is
            the coarse arm of a control the row already has, which is why the registry's item census
            (`character-card.ct.tsx`) is unchanged at a fine pointer. Its label is the bare verb because the
            menu's own name already carries the subject (#463) — the persona row's twin, same shape. */}
        <MenuItem className={ROW_ACTION_OVERFLOW} onClick={(): void => onToggleStar(character.id, !character.starred)}>
          <Icon icon={Star} size="sm" />
          {character.starred ? "Unstar" : "Star"}
        </MenuItem>
        {characterActionItemsForScope("row").map((action) => {
          const label = characterActionLabel(action, { archived: character.archived });
          if (action.formats.length > 0) {
            return (
              <MenuSubmenuRoot key={action.id}>
                <MenuSubmenuTrigger>
                  <Icon icon={action.glyph} size="sm" />
                  {label}
                </MenuSubmenuTrigger>
                <MenuPopup>
                  {action.formats.map((format) => (
                    <MenuLinkItem download={true} href={`${EXPORT_CHARACTER_PATH}${character.id}${format.query}`} key={format.query}>
                      {format.label}
                    </MenuLinkItem>
                  ))}
                </MenuPopup>
              </MenuSubmenuRoot>
            );
          }
          const onClick = rowHandlers[action.id];
          return onClick === null ? null : (
            <MenuItem key={action.id} onClick={onClick}>
              <Icon icon={action.glyph} size="sm" />
              {label}
            </MenuItem>
          );
        })}
      </RowActionsMenu>
    </>
  );
}
