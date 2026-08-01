// The CHARACTER TAKEOVER (tracked-field unification §3 — SETTLED, owner 2026-07-31): expanding a Status
// roster entry IS the sheet. Not an accordion — a FULL PANEL TAKEOVER with a breadcrumb back to the roster,
// holding everything Sheet-the-tab held (title · level · wallet · the d20 attribute values) PLUS this actor's
// live tracker readings, conditions and status line. Sheet-the-tab is GONE: a tab whose content migrated to
// another tab depending on the stat profile was a hallway, not a home, and nobody asks "Status or Sheet?"
// again — the answer is "the character".
//
// The takeover is a VIEW SWAP inside the tab viewport, which is what makes it work at every width: docked at
// 17rem or as the mobile full-width sheet, the panel's own scroll region simply shows the character instead
// of the roster, and the breadcrumb (a real ≥44px-on-coarse button) is the only way back — it never opens a
// second navigation layer to fight the shell drawer, so the sanctioned modal fallback is not needed.
//
// EDIT authz mirrors the verbs: `patchSheet` (title/flavor/level/attributes) — host any actor, a member their OWN
// `user` ref, cast actors carry no sheet; `editSnapshot` (wallet + every volatile plane) — `canEditShared`
// (host, D108: NOT gated by `trackersReadOnly` — that gates the MODEL write path only). Tracker DEFS are not
// authored here: they home ONCE in `config.trackers` on the Game tab (the whole point of the unification),
// so this surface reads defs and edits READINGS.

import type { RpgActorView, RpgStatProfile } from "@orb/contracts/rpg";
import { Avatar } from "@orb/ui/avatar";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { ChevronLeft, Icon } from "@orb/ui/icons";
import { Grid, Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { StatCell, TrackerChip, TrackerValue } from "#components";
import { useInvalidation, useTRPC } from "#data";
import type { RpgPanelState } from "../hooks/use-rpg-context-state";
import { useEditSnapshot, usePatchSheet } from "../hooks/use-rpg-mutations";
import { actorLockBase, actorStatePatch } from "../lib/volatile-patch";
import type { ActorEdit } from "./rpg-actor-trackers";
import { ActorMeters, ActorTrackerRows, ConditionChips, StatusLine } from "./rpg-actor-trackers";
import { RpgDoorwayLine } from "./rpg-doorway-line";
import { RpgFieldLock } from "./rpg-field-lock";
import { Kicker } from "./rpg-kicker";
import { RpgPopulateControl } from "./rpg-populate-control";

/** The hand-only progression LEVEL (§2.6) — `Level N`, editable-in-place for the sheet owner/host. A null level
 *  is omitted from a READ-ONLY view (nullable-honesty: no phantom "Level 0"); an editable view shows an empty
 *  field so the owner can SET it. A blank/non-numeric commit clears the level (null). */
function SheetLevel({ level, onEditLevel }: { readonly level: number | null; readonly onEditLevel?: (next: number | null) => void }): ReactElement | null {
  if (level === null && onEditLevel === undefined) {
    return null;
  }
  if (onEditLevel === undefined) {
    return (
      <Badge tone="soft" size="sm" data-slot="sheet-level">
        <Text as="span" size="micro" weight="medium" className="tabular-nums">
          Level {level}
        </Text>
      </Badge>
    );
  }
  return (
    <TrackerChip
      label="Level"
      value={level === null ? "" : String(level)}
      onEditValue={(next: string): void => {
        const trimmed = next.trim();
        const n = Number.parseInt(trimmed, 10);
        onEditLevel(trimmed === "" || Number.isNaN(n) ? null : Math.max(0, n));
      }}
    />
  );
}

/** The sheet's FLAVOR prose (RV-11) — a quiet gloss line under the name: who this character is, in the
 *  host's own words. `patchSheet` has always written it and nothing ever read it back. Click-to-edit for
 *  whoever may write the sheet; read-only + empty ⇒ nothing at all (a per-character line nobody wrote is not
 *  a missing feature, so it gets no "none yet" placeholder). Wraps — it is free prose, not a reading. */
function SheetFlavor({ actor, onEditFlavor }: { readonly actor: RpgActorView; readonly onEditFlavor?: (next: string) => void }): ReactElement | null {
  if (onEditFlavor === undefined) {
    if (actor.sheet.flavor === "") {
      return null;
    }
    return (
      <Text as="span" size="label" tone="muted" className="min-w-0 break-words">
        {actor.sheet.flavor}
      </Text>
    );
  }
  return (
    <TrackerValue
      ariaLabel={`${actor.name} flavor`}
      display={actor.sheet.flavor}
      placeholder="a line about who they are…"
      tone="muted"
      onEdit={onEditFlavor}
      wrap={true}
      className="!w-auto min-w-0 max-w-full field-sizing-content"
    />
  );
}

/** One wallet chip — `<amount> <name>` (#2 wallet editability). The AMOUNT is click-to-edit for the host
 *  (`editSnapshot` on the volatile wallet plane — a hand plane, host-only in v1); a pinned currency
 *  (`…wallet.<name>` locked, #10) carries the pin + Release inside the chip. Read-only renders the plain
 *  badge (the honest-arms arm). */
function WalletChip({
  coin,
  locked,
  onEditAmount,
  onRelease,
}: {
  readonly coin: { readonly name: string; readonly amount: number };
  readonly locked?: boolean;
  readonly onEditAmount?: (next: number) => void;
  readonly onRelease?: () => void;
}): ReactElement {
  return (
    <Badge tone="soft" size="sm" data-slot="sheet-wallet-chip">
      {onEditAmount === undefined ? (
        <Text as="span" size="micro" weight="medium" className="tabular-nums">
          {coin.amount} {coin.name}
        </Text>
      ) : (
        <Row gap="field" align="center">
          <TrackerValue
            ariaLabel={`${coin.name} amount`}
            display={String(coin.amount)}
            kind="numeric"
            size="micro"
            onEdit={(next): void => {
              const n = Number.parseInt(next, 10);
              if (!Number.isNaN(n)) {
                onEditAmount(n);
              }
            }}
            className="!w-avatar-md px-field text-right tabular-nums"
            restClassName="tabular-nums"
          />
          <Text as="span" size="micro" weight="medium">
            {coin.name}
          </Text>
          {locked === true && onRelease !== undefined ? <RpgFieldLock onRelease={onRelease} /> : null}
        </Row>
      )}
    </Badge>
  );
}

/** The wallet row — every named amount this character carries, plus the honest none-yet line (an empty
 *  wallet has no add affordance anywhere: currencies arrive from the story, so silence would read as a
 *  missing feature rather than an empty purse). */
function WalletChips({
  wallet,
  lockBase,
  lockedPaths,
  onEditAmount,
  onRelease,
}: {
  readonly wallet: readonly { readonly name: string; readonly amount: number }[];
  readonly lockBase: string;
  readonly lockedPaths: readonly string[];
  readonly onEditAmount?: (name: string, next: number) => void;
  readonly onRelease?: (name: string) => void;
}): ReactElement {
  if (wallet.length === 0) {
    return (
      <Text as="span" size="micro" tone="muted">
        No coin yet — the story hands it out.
      </Text>
    );
  }
  return (
    <>
      {wallet.map((coin) => (
        <WalletChip
          key={coin.name}
          coin={coin}
          locked={lockedPaths.includes(`${lockBase}.wallet.${coin.name}`)}
          {...(onEditAmount === undefined ? {} : { onEditAmount: (next: number): void => onEditAmount(coin.name, next) })}
          {...(onRelease === undefined ? {} : { onRelease: (): void => onRelease(coin.name) })}
        />
      ))}
    </>
  );
}

/** The ATTRIBUTES plane — the profile vocabulary as stat cells (hint on title), clamped into the profile
 *  range on commit (§12.3 Tier-1). A profile with NO attributes says so and points at where they are
 *  authored (the Game tab's Stat profile section, which now adds/renames/glosses them — RV-4/RV-12). */
function AttributeGrid({
  profile,
  actor,
  onEditAttribute,
}: {
  readonly profile: RpgStatProfile;
  readonly actor: RpgActorView;
  readonly onEditAttribute?: (key: string, next: number) => void;
}): ReactElement {
  return (
    <Stack gap="field">
      <Kicker>Attributes</Kicker>
      {profile.attributes.length === 0 ? (
        <RpgDoorwayLine>No attributes in this game yet — the host adds them in the Game tab's Stat profile.</RpgDoorwayLine>
      ) : (
        <Grid cols="tile" gap="field">
          {profile.attributes.map((def) => (
            <StatCell
              key={def.key}
              label={def.label}
              value={actor.sheet.attributes[def.key] ?? profile.range.min}
              {...(def.hint === "" ? {} : { hint: def.hint })}
              {...(onEditAttribute === undefined
                ? {}
                : { onEditValue: (next: number): void => onEditAttribute(def.key, Math.min(profile.range.max, Math.max(profile.range.min, next))) })}
            />
          ))}
        </Grid>
      )}
    </Stack>
  );
}

/** The IDENTITY block — portrait · name + title · the flavor gloss · the status line · level + wallet. The
 *  sheet planes (title/flavor/level) and the volatile planes (status/wallet) sit on one line because that is how a character reads;
 *  their WRITE doors differ (patchSheet vs editSnapshot), which is why each callback is separate and each is
 *  omitted when the viewer may not make that write (PERMISSION-omit, never a disabled twin). */
function IdentityBlock({
  actor,
  lockBase,
  lockedPaths,
  edit,
  onEditTitle,
  onEditFlavor,
  onEditLevel,
  onEditCoin,
  onReleaseCoin,
}: {
  readonly actor: RpgActorView;
  readonly lockBase: string;
  readonly lockedPaths: readonly string[];
  readonly edit?: ActorEdit;
  readonly onEditTitle?: (next: string) => void;
  readonly onEditFlavor?: (next: string) => void;
  readonly onEditLevel?: (next: number | null) => void;
  readonly onEditCoin?: (name: string, next: number) => void;
  readonly onReleaseCoin?: (name: string) => void;
}): ReactElement {
  return (
    <Row gap="block" align="center" data-slot="rpg-character-identity">
      <Avatar size="lg" shape="rounded" alt={actor.name} hueSeed={actor.name} {...(actor.avatar === undefined ? {} : { src: actor.avatar })}>
        {actor.name.slice(0, 1).toUpperCase()}
      </Avatar>
      <Stack gap="field" className="min-w-0 flex-1">
        <Row gap="field" align="center" className="min-w-0 flex-wrap">
          <Text as="span" size="label" weight="semibold" className="truncate">
            {actor.name}
          </Text>
          <SheetTitle actor={actor} {...(onEditTitle === undefined ? {} : { onEditTitle })} />
        </Row>
        {/* Flavor sits with the identity, ABOVE the volatile status line: who they are, then how they are. */}
        <SheetFlavor actor={actor} {...(onEditFlavor === undefined ? {} : { onEditFlavor })} />
        <StatusLine status={actor.volatile?.status ?? ""} {...(edit === undefined ? {} : { edit })} />
        <Row gap="field" align="center" className="flex-wrap">
          <SheetLevel level={actor.sheet.level} {...(onEditLevel === undefined ? {} : { onEditLevel })} />
          <WalletChips
            wallet={actor.volatile?.wallet ?? []}
            lockBase={lockBase}
            lockedPaths={lockedPaths}
            {...(onEditCoin === undefined ? {} : { onEditAmount: onEditCoin })}
            {...(onReleaseCoin === undefined ? {} : { onRelease: onReleaseCoin })}
          />
        </Row>
      </Stack>
    </Row>
  );
}

/** This character's TRACKERS — meters then observations, or the honest doorway when it carries none (defs
 *  home on the Game tab; an actor with no carried tracker is a real, sayable state). */
function TrackerSection({
  actor,
  carriesNone,
  edit,
}: {
  readonly actor: RpgActorView;
  readonly carriesNone: boolean;
  readonly edit?: ActorEdit;
}): ReactElement {
  return (
    <Stack gap="field">
      <Kicker>Trackers</Kicker>
      {carriesNone ? (
        <RpgDoorwayLine>{`${actor.name} carries no trackers yet — the host defines them in the Game tab, and every carrier gets the same one.`}</RpgDoorwayLine>
      ) : (
        <Stack gap="field">
          <ActorMeters actor={actor} {...(edit === undefined ? {} : { edit })} />
          <ActorTrackerRows actor={actor} {...(edit === undefined ? {} : { edit })} />
        </Stack>
      )}
    </Stack>
  );
}

/** The CONDITIONS plane — lit chips (+ the host's add field). A read-only viewer with no conditions gets the
 *  honest none-yet line rather than an empty section (an invisible plane reads as an absent feature). */
function ConditionSection({ actor, edit }: { readonly actor: RpgActorView; readonly edit?: ActorEdit }): ReactElement {
  const conditions = actor.volatile?.conditions ?? [];
  return (
    <Stack gap="field">
      <Kicker>Conditions</Kicker>
      {conditions.length === 0 && edit === undefined ? (
        <Text size="micro" tone="muted">
          Nothing on {actor.name} right now.
        </Text>
      ) : (
        <ConditionChips conditions={conditions} {...(edit === undefined ? {} : { onAdd: edit.onAddCondition, onRemove: edit.onRemoveCondition, edit })} />
      )}
    </Stack>
  );
}

export interface RpgCharacterDetailProps {
  readonly state: RpgPanelState;
  readonly actor: RpgActorView;
  /** The volatile-plane callbacks (host) — the SAME set the collapsed roster row uses. */
  readonly edit?: ActorEdit;
  /** Back to the roster (the breadcrumb) — the takeover's only exit. */
  readonly onBack: () => void;
}

/** The character takeover: breadcrumb · identity (portrait · name · title · level · wallet) · attributes ·
 *  this character's trackers · conditions. */
export function RpgCharacterDetail({ state, actor, edit, onBack }: RpgCharacterDetailProps): ReactElement {
  const { tracker, chatId, viewerUserId, isHost, canEditShared } = state;
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const patchSheet = usePatchSheet({ trpc, invalidation });
  const editSnapshot = useEditSnapshot({ trpc, invalidation });

  // A member may edit only their OWN `user` sheet; a host may edit any. Cast actors have no sheet.
  // `trackersReadOnly` is NOT a factor (D108 — it gates the MODEL write path only).
  const ownRow = actor.actorRef.kind === "user" && actor.actorRef.userId === viewerUserId;
  const canEditSheet = (isHost || ownRow) && actor.actorRef.kind !== "cast";
  const profile: RpgStatProfile = state.game.publicConfig.statProfile;
  const carriesNone = actor.trackers.length === 0;
  const lockBase = actorLockBase(actor.actorRef);
  // The two write doors, resolved ONCE and PERMISSION-omitted where the viewer may not use them: the sheet
  // planes ride `patchSheet` (host any actor / a member their own), the wallet rides `editSnapshot`.
  const sheetWrites = canEditSheet
    ? {
        onEditTitle: (next: string): void => {
          patchSheet.mutate({ chatId, actorRef: actor.actorRef, patch: { className: next.trim() } });
        },
        onEditFlavor: (next: string): void => {
          patchSheet.mutate({ chatId, actorRef: actor.actorRef, patch: { flavor: next.trim() } });
        },
        onEditLevel: (next: number | null): void => {
          patchSheet.mutate({ chatId, actorRef: actor.actorRef, patch: { level: next } });
        },
      }
    : {};
  const walletWrites = canEditShared
    ? {
        onEditCoin: (name: string, next: number): void =>
          editSnapshot.mutate({
            chatId,
            patch: actorStatePatch(tracker.actors, actor.actorRef, (v) => ({
              ...v,
              wallet: v.wallet.map((w) => (w.name === name ? { ...w, amount: next } : w)),
            })),
            lockPaths: [`${lockBase}.wallet.${name}`],
          }),
        onReleaseCoin: (name: string): void => editSnapshot.mutate({ chatId, patch: {}, releaseLocks: [`${lockBase}.wallet.${name}`] }),
      }
    : {};
  const attributeWrites = canEditSheet
    ? {
        onEditAttribute: (key: string, next: number): void => {
          patchSheet.mutate({ chatId, actorRef: actor.actorRef, patch: { attributes: { [key]: next } } });
        },
      }
    : {};

  return (
    <Stack gap="section" data-slot="rpg-character-detail">
      {/* The breadcrumb — a real button (keyboard-reachable, ≥44px on a coarse pointer through the shared
          control tokens), naming where it goes. The roster is one step away from every character. */}
      <Row gap="field" align="center">
        <Button intent="ghost" size="sm" onClick={onBack} aria-label="Back to the roster">
          <Icon icon={ChevronLeft} size="xs" />
          Roster
        </Button>
        <Text as="span" size="micro" tone="muted" aria-hidden={true}>
          /
        </Text>
        <Text as="span" size="micro" tone="muted" className="truncate">
          {actor.name}
        </Text>
      </Row>

      <IdentityBlock
        actor={actor}
        lockBase={lockBase}
        lockedPaths={tracker.lockedPaths}
        {...(edit === undefined ? {} : { edit })}
        {...sheetWrites}
        {...walletWrites}
      />

      <AttributeGrid profile={profile} actor={actor} {...attributeWrites} />

      <TrackerSection actor={actor} carriesNone={carriesNone} {...(edit === undefined ? {} : { edit })} />
      <ConditionSection actor={actor} {...(edit === undefined ? {} : { edit })} />
      {/* The born-state doorway — HOST-only (PERMISSION-omit: a member never sees a control that would refuse),
          and the one place the hand-only sheet fields can be model-written at all. */}
      {isHost ? <RpgPopulateControl chatId={chatId} actor={actor} canPopulate={state.game.canPopulate} /> : null}
    </Stack>
  );
}

/** The sheet TITLE beside the name ("Warden of House Vane") — the `className` field as a first-class datum,
 *  click-to-edit like everything else (patchSheet). Read-only + empty ⇒ nothing. */
function SheetTitle({ actor, onEditTitle }: { readonly actor: RpgActorView; readonly onEditTitle?: (next: string) => void }): ReactElement | null {
  if (onEditTitle === undefined) {
    if (actor.sheet.className === "") {
      return null;
    }
    return (
      <Text as="span" size="label" tone="muted" className="truncate">
        — {actor.sheet.className}
      </Text>
    );
  }
  return (
    <Row gap="field" align="center" className="min-w-0">
      <Text as="span" size="label" tone="muted" aria-hidden={true}>
        —
      </Text>
      <TrackerValue
        ariaLabel={`${actor.name} title`}
        display={actor.sheet.className}
        placeholder="title…"
        onEdit={onEditTitle}
        className="!w-auto min-w-0 max-w-full field-sizing-content"
      />
    </Row>
  );
}
