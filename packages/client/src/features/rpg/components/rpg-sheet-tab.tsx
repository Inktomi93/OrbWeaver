// The SHEET tab (panel-redesign DESIGN.md §4 "Sheet" — the viewer's sheet): member SELECTOR (the one
// mini-tab scope-selector semantics, §12.1.3 — actor scope; self default) → the IDENTITY line (portrait ·
// name · class · the hand-only Level chip (null renders nothing read-only; an editable view offers the
// empty field) · the wallet chip listing EVERY named amount, §12.2.2's second zoom level) → the ATTRIBUTES
// stat-cell grid (profile vocabulary; hint on title) → POOLS (the §12.2.7 honest arm: pools are PER-ACTOR
// sheet data and this IS their authoring home until `features.defaultPoolDefs` exists — the GM-console
// pools section stays APPLICABILITY-omitted). A pool row edits name · max · COLOR (the owner free-hex
// ruling: a `ColorField` — native `<input type=color>` + hex text behind the swatch — writing the strict
// hex/OKLCH `poolDefs[].color`; clear ⇒ null ⇒ the ordinal ramp) + "Add meter" (member-own row / host).
//
// EDIT authz mirrors the verb (`patchSheet`): host any actor; a member their OWN `user` ref; cast actors
// carry no sheet. `trackersReadOnly` folds in via the standing `canEdit` gate (consistent with every tab).

import type { RpgActorView, RpgPoolDef, RpgStatProfile } from "@orb/contracts/rpg";
import { RPG_POOL_COLOR_RE } from "@orb/contracts/rpg";
import { Avatar } from "@orb/ui/avatar";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { ColorField } from "@orb/ui/color-field";
import { Grid, Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { StatCell, TrackerChip, TrackerValue } from "#components";
import { useInvalidation, useTRPC } from "#data";
import type { RpgPanelState } from "../hooks/use-rpg-context-state";
import { useEditSnapshot, usePatchSheet } from "../hooks/use-rpg-mutations";
import { actorKey } from "../lib/actor-key";
import { resolvePoolColor } from "../lib/track-color";
import { actorLockBase, actorStatePatch } from "../lib/volatile-patch";
import { RpgDoorwayLine } from "./rpg-doorway-line";
import { RpgFieldLock } from "./rpg-field-lock";
import { RpgSubjectSelect } from "./rpg-subject-select";

const DEFAULT_POOL_MAX = 10;

/** The identity line IS the subject selector (owner ruling 2026-07-28): clicking the NAME opens the member
 *  dropdown — no pill shelf; a one-member roster renders the plain name. The TITLE (the sheet's
 *  `className`, surfaced as a first-class field — "Warden of House Vane") sits beside it as one
 *  name + title unit, click-to-edit like every other datum (patchSheet `className`). */
function SheetIdentityLine({
  actors,
  actor,
  canEdit,
  onSelect,
  onEditTitle,
}: {
  readonly actors: readonly RpgActorView[];
  readonly actor: RpgActorView;
  readonly canEdit: boolean;
  readonly onSelect: (key: string) => void;
  readonly onEditTitle: (next: string) => void;
}): ReactElement {
  const name =
    actors.length > 1 ? (
      <RpgSubjectSelect actors={actors} value={actor} onChange={onSelect} ariaLabel="Whose sheet" />
    ) : (
      <Text as="span" size="label" weight="semibold" className="truncate">
        {actor.name}
      </Text>
    );
  let title: ReactElement | null;
  if (canEdit) {
    title = (
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
  } else if (actor.sheet.className === "") {
    title = null;
  } else {
    title = (
      <Text as="span" size="label" tone="muted" className="truncate">
        — {actor.sheet.className}
      </Text>
    );
  }
  return (
    <Row gap="field" align="center" className="min-w-0 flex-wrap">
      {name}
      {title}
    </Row>
  );
}

/** The roster actor that is the viewer's own `user` ref, or the first actor as a fallback. */
function viewerActor(actors: readonly RpgActorView[], viewerUserId: string): RpgActorView | undefined {
  return actors.find((a) => a.actorRef.kind === "user" && a.actorRef.userId === viewerUserId) ?? actors[0];
}

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

/** Row key for a pool def — name is the identity (names are the pool address everywhere else too). */
function poolRowKey(def: RpgPoolDef, i: number): string {
  return def.name === "" ? `pool-${i}` : def.name;
}

interface PoolDefsEditorProps {
  readonly poolDefs: readonly RpgPoolDef[];
  readonly onCommit: (next: readonly RpgPoolDef[]) => void;
  /** A RENAME commit (#11 rename-carry): the caller rewrites the matching VOLATILE pool name in the same
   *  gesture (same dial, new label — the value survives). Falls back to `onCommit` when absent. */
  readonly onRename?: (oldName: string, next: readonly RpgPoolDef[]) => void;
}

/** The pool-definition rows (name · max · the free-hex color picker) + "Add meter". Every commit is the
 *  WHOLE `poolDefs` array (the wire shape). Colors ride the swatch's `ColorField`; only a strict
 *  hex/OKLCH value commits (the contract grammar); the picker's clear (`""`) writes null ⇒ ordinal ramp. */
function PoolDefsEditor({ poolDefs, onCommit, onRename }: PoolDefsEditorProps): ReactElement {
  const replaceAt = (i: number, patch: Partial<RpgPoolDef>): readonly RpgPoolDef[] => poolDefs.map((d, j) => (j === i ? { ...d, ...patch } : d));

  return (
    <Stack gap="field" data-slot="rpg-pool-defs">
      {poolDefs.map((def, i) => {
        const resolved = resolvePoolColor(def.color, i);
        return (
          <Row key={poolRowKey(def, i)} gap="field" align="center">
            <ColorField
              // A ramp-derived pool shows its resolved `--color-track-N` in the swatch (definition and
              // display visibly one system, §3); the var string can never COMMIT (it fails the strict
              // grammar), so the stored color stays null until a real hex/OKLCH is picked.
              value={resolved.kind === "custom" ? resolved.css : `var(--color-track-${resolved.step})`}
              aria-label={`${def.name} color`}
              onValueChange={(next): void => {
                if (next === "") {
                  onCommit(replaceAt(i, { color: null }));
                } else if (RPG_POOL_COLOR_RE.test(next)) {
                  onCommit(replaceAt(i, { color: next }));
                }
                // A safe-but-off-grammar color (a named color) is refused at the picker — the popover's
                // hex field is the strict path; the contract never receives raw CSS.
              }}
            />
            <TrackerValue
              ariaLabel={`Pool ${i + 1} name`}
              display={def.name}
              onEdit={(next): void => {
                const trimmed = next.trim();
                // Tier-2 refusal (§12.3): an empty pool name is never sent (min(1) on the wire).
                if (trimmed !== "" && trimmed !== def.name) {
                  // A RENAME rides the carry path (#11) so the volatile pool follows its def.
                  (onRename ?? ((_old: string, defs: readonly RpgPoolDef[]): void => onCommit(defs)))(def.name, replaceAt(i, { name: trimmed }));
                }
              }}
              className="flex-1"
            />
            <Row gap="field" align="baseline" className="shrink-0">
              <Text as="span" size="micro" tone="muted">
                max
              </Text>
              <TrackerValue
                ariaLabel={`${def.name} max`}
                display={String(def.max)}
                kind="numeric"
                onEdit={(next): void => {
                  const n = Number.parseInt(next, 10);
                  // Tier-1 clamp (§12.3): max ≥ 1 is the real wire floor.
                  if (!Number.isNaN(n)) {
                    onCommit(replaceAt(i, { max: Math.max(1, n) }));
                  }
                }}
                className="!w-avatar-lg px-field text-right tabular-nums"
                restClassName="tabular-nums"
              />
            </Row>
          </Row>
        );
      })}
      <Row>
        <Button
          intent="ghost"
          size="sm"
          onClick={(): void => {
            onCommit([...poolDefs, { name: `Pool ${poolDefs.length + 1}`, max: DEFAULT_POOL_MAX, color: null }]);
          }}
        >
          Add meter
        </Button>
      </Row>
    </Stack>
  );
}

export interface RpgSheetTabProps {
  readonly state: RpgPanelState;
}

/** The Sheet tab — member selector · identity line · attribute grid · pool definitions. */
export function RpgSheetTab({ state }: RpgSheetTabProps): ReactElement {
  const { tracker, game, viewerUserId, isHost, chatId, canEditShared } = state;
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const patchSheet = usePatchSheet({ trpc, invalidation });
  const editSnapshot = useEditSnapshot({ trpc, invalidation });

  const fallback = viewerActor(tracker.actors, viewerUserId);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const actor = tracker.actors.find((a) => actorKey(a) === selectedKey) ?? fallback;

  if (actor === undefined) {
    return <Text tone="muted">No sheet yet — add characters in Members.</Text>;
  }
  // A member may edit only their OWN `user` sheet; a host may edit any. Cast actors have no sheet.
  // `trackersReadOnly` is NOT a factor (D108 — it gates the MODEL write path only; the sheet is a HAND
  // plane, always hand-editable by its owner/host).
  const ownRow = actor.actorRef.kind === "user" && actor.actorRef.userId === viewerUserId;
  const canEdit = (isHost || ownRow) && actor.actorRef.kind !== "cast";

  const profile: RpgStatProfile = game.publicConfig.statProfile;
  const attrDefs = profile.attributes;
  const wallet = actor.volatile?.wallet ?? [];

  return (
    <Stack gap="section" data-slot="rpg-sheet-tab">
      <Row gap="block" align="center" data-slot="rpg-sheet-identity">
        <Avatar size="md" shape="rounded" alt={actor.name} hueSeed={actor.name} {...(actor.avatar === undefined ? {} : { src: actor.avatar })}>
          {actor.name.slice(0, 1).toUpperCase()}
        </Avatar>
        <Stack gap="field" className="min-w-0 flex-1">
          <SheetIdentityLine
            actors={tracker.actors}
            actor={actor}
            canEdit={canEdit}
            onSelect={setSelectedKey}
            onEditTitle={(next): void => {
              patchSheet.mutate({ chatId, actorRef: actor.actorRef, patch: { className: next.trim() } });
            }}
          />
          <Row gap="field" align="center" className="flex-wrap">
            <SheetLevel
              level={actor.sheet.level}
              {...(canEdit
                ? {
                    onEditLevel: (next: number | null): void => {
                      patchSheet.mutate({ chatId, actorRef: actor.actorRef, patch: { level: next } });
                    },
                  }
                : {})}
            />
            {wallet.map((coin) => (
              <WalletChip
                key={coin.name}
                coin={coin}
                {...(canEditShared
                  ? {
                      locked: tracker.lockedPaths.includes(`${actorLockBase(actor.actorRef)}.wallet.${coin.name}`),
                      onEditAmount: (next: number): void =>
                        editSnapshot.mutate({
                          chatId,
                          patch: actorStatePatch(tracker.actors, actor.actorRef, (v) => ({
                            ...v,
                            wallet: v.wallet.map((w) => (w.name === coin.name ? { ...w, amount: next } : w)),
                          })),
                          lockPaths: [`${actorLockBase(actor.actorRef)}.wallet.${coin.name}`],
                        }),
                      onRelease: (): void => editSnapshot.mutate({ chatId, patch: {}, releaseLocks: [`${actorLockBase(actor.actorRef)}.wallet.${coin.name}`] }),
                    }
                  : {})}
              />
            ))}
          </Row>
        </Stack>
      </Row>

      {attrDefs.length === 0 ? (
        // The freeform teaching state + a doorway to where attributes are defined (§12.1.5 DoorwayLine).
        <RpgDoorwayLine>This game steers on prose — attributes are defined in the Game tab.</RpgDoorwayLine>
      ) : (
        <Stack gap="field">
          <Text size="label" tone="muted" transform="caps" className="tracking-micro">
            Attributes
          </Text>
          <Grid cols="tile" gap="field">
            {attrDefs.map((def) => (
              <StatCell
                key={def.key}
                label={def.label}
                value={actor.sheet.attributes[def.key] ?? profile.range.min}
                {...(def.hint === "" ? {} : { hint: def.hint })}
                {...(canEdit
                  ? {
                      onEditValue: (next: number): void => {
                        // Tier-1 clamp-and-tell (§12.3): a value snaps into the profile range at commit.
                        const clamped = Math.min(profile.range.max, Math.max(profile.range.min, next));
                        patchSheet.mutate({ chatId, actorRef: actor.actorRef, patch: { attributes: { [def.key]: clamped } } });
                      },
                    }
                  : {})}
              />
            ))}
          </Grid>
        </Stack>
      )}

      {actor.sheet.poolDefs.length === 0 && !canEdit ? null : (
        <Stack gap="field">
          <Text size="label" tone="muted" transform="caps" className="tracking-micro">
            Pools
          </Text>
          {canEdit ? (
            <PoolDefsEditor
              poolDefs={actor.sheet.poolDefs}
              onCommit={(next): void => {
                patchSheet.mutate({ chatId, actorRef: actor.actorRef, patch: { poolDefs: [...next] } });
              }}
              onRename={(oldName, next): void => {
                // #11 RENAME-CARRY: the def rename + the matching VOLATILE pool rename land in ONE gesture
                // (same dial, new label — the value survives; matched-by-name would otherwise orphan it).
                patchSheet.mutate({ chatId, actorRef: actor.actorRef, patch: { poolDefs: [...next] } });
                const renamed = next.find((d) => !actor.sheet.poolDefs.some((p) => p.name === d.name));
                const newName = renamed?.name;
                if (newName === undefined || actor.volatile?.pools.some((p) => p.name === oldName) !== true) {
                  return; // no volatile pool to carry — the def rename alone suffices
                }
                // Carry a per-pool pin (#10) with its pool: release the old path, stamp the new one.
                const oldLock = `${actorLockBase(actor.actorRef)}.pools.${oldName}`;
                const wasLocked = tracker.lockedPaths.includes(oldLock);
                editSnapshot.mutate({
                  chatId,
                  patch: actorStatePatch(tracker.actors, actor.actorRef, (v) => ({
                    ...v,
                    pools: v.pools.map((p) => (p.name === oldName ? { ...p, name: newName } : p)),
                  })),
                  lockPaths: wasLocked ? [`${actorLockBase(actor.actorRef)}.pools.${newName}`] : [],
                  ...(wasLocked ? { releaseLocks: [oldLock] } : {}),
                });
              }}
            />
          ) : (
            actor.sheet.poolDefs.map((pool) => (
              <Row key={pool.name} gap="block" align="baseline" justify="between">
                <Text as="span" size="label" tone="muted">
                  {pool.name}
                </Text>
                <Text as="span" size="label" className="tabular-nums">
                  max {pool.max}
                </Text>
              </Row>
            ))
          )}
        </Stack>
      )}
    </Stack>
  );
}
