// The GAME tab (panel-redesign DESIGN.md §4 "Game" — the crown host-admin console): the ONE host-authored
// surface, crown-tinted so the privilege reads at the strip. It is DEFINITIONS & RULES (the tracked-field
// unification §3): the STAT PROFILE vocabulary (add / rename / gloss / remove + the value range — RV-4/RV-12),
// the TRACKERS (every tracked field in the game, one section, one vocabulary, one add flow — it absorbed the
// Sheet tab's per-actor pool defs, the old cast-field schemas and the band-orb pin section), the relationship
// hints, and the scalar knobs. VALUES are never authored here — they live on the character (Status → the
// character takeover). Everything autosaves (D66 A4 — no Save buttons).
//
// The CRUD grammar is the shared RV-8 primitive set (`AddRow` · `TrackerValue` · `HintEditor`), so every def
// plane in the panel creates, renames and glosses with the same gesture: a name is REQUIRED before anything
// persists (the unification's default-name hygiene — the old "Add meter"/"+ Meter field" buttons instantly
// wrote "Pool 4"/"Meter 3" orphans into live games), Enter commits the draft, and the hint editor is present
// on every def (non-negotiable per the unification: the gloss is the PROVEN steering lever, R4b, and was
// previously unauthorable from the product for half the def planes).
//
// HOST-ONLY: this tab's `when` is `isGameChat && isHost`, and the read (`getConfigView`) is a second,
// server-side host gate (a member gets a leak-free NOT_FOUND).

import type { RpgConfigView, RpgTrackerCarrierClass, RpgTrackerDef } from "@orb/contracts/rpg";
import { RPG_HINT_MAX, rpgTrackerDefSchema } from "@orb/contracts/rpg";
import type { ChatId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Crown, Icon, Lock, LockOpen, Pin, PinOff, Plus, RotateCcw, Trash2 } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { TrackBar } from "@orb/ui/meter";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { AddRow, HintEditor, TrackerValue } from "#components";
import { QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import type { RpgPanelState } from "../hooks/use-rpg-context-state";
import { useResyncFromStory, useUpdateConfig } from "../hooks/use-rpg-mutations";
import { mintDefKey } from "../lib/mint-key";
import { resolveTrackerColor, trackColorProps } from "../lib/track-color";
import { RpgDoorwayLine } from "./rpg-doorway-line";
import { GmConsoleScalars } from "./rpg-gm-scalars";
import { Kicker } from "./rpg-kicker";
import { DEF_ROW_CLASS, RpgStatProfileEditor } from "./rpg-stat-profile-editor";

/** The carrier-class label a def's `appliesTo` reads as. An explicit ref LIST reads as "chosen" and is not
 *  cycled here (this pass authors classes; a per-actor exception is the sheet's grants/revokes) — the list is
 *  preserved verbatim through every other edit, never silently flattened to a class. */
function appliesToLabel(appliesTo: RpgTrackerDef["appliesTo"]): string {
  return Array.isArray(appliesTo) ? `chosen (${appliesTo.length})` : appliesTo;
}

/** Cycle the carrier class party → npcs → everyone → party. A def carrying an explicit list is untouched. */
function nextAppliesTo(appliesTo: RpgTrackerDef["appliesTo"]): RpgTrackerDef["appliesTo"] {
  if (Array.isArray(appliesTo)) {
    return appliesTo;
  }
  const order: RpgTrackerCarrierClass[] = ["party", "npcs", "everyone"];
  return order[(order.indexOf(appliesTo) + 1) % order.length] ?? "everyone";
}

/** The `write` axis in host words — KEEP IT LOUD (the unification §2): it drives the tool arg shape, the
 *  model's mental model, and how the panel reads (a bar you drain vs a gauge that tracks). */
const WRITE_LABEL: Readonly<Record<RpgTrackerDef["write"], string>> = {
  delta: "spend & restore",
  set: "observe",
};

/** ONE tracker's def row — the whole axis set: shape · write · who carries it · the label · the meter
 *  ceiling · pin · lock · remove, over the steering HINT. */
function TrackerRow({
  def,
  index,
  onCommit,
}: {
  readonly def: RpgTrackerDef;
  readonly index: number;
  readonly onCommit: (next: RpgTrackerDef) => void;
}): ReactElement {
  const patch = (fields: Partial<RpgTrackerDef>): void => onCommit({ ...def, ...fields });
  return (
    <Stack gap="field" className={DEF_ROW_CLASS} data-slot="rpg-tracker-row">
      <Row gap="field" align="center">
        {def.shape === "meter" ? (
          <TrackBar value={1} max={1} {...trackColorProps(resolveTrackerColor(def.color, index))} className="!w-block shrink-0" />
        ) : null}
        <TrackerValue
          ariaLabel={`Tracker ${index + 1} label`}
          display={def.label}
          onEdit={(next): void => {
            const trimmed = next.trim();
            if (trimmed !== "") {
              patch({ label: trimmed });
            }
          }}
          className="min-w-0 flex-1"
        />
        {def.shape === "meter" ? (
          <Row gap="field" align="baseline" className="shrink-0">
            <Text as="span" size="micro" tone="muted">
              default max
            </Text>
            <TrackerValue
              ariaLabel={`${def.label} default max`}
              display={def.max === null ? "—" : String(def.max)}
              editValue={def.max === null ? "" : String(def.max)}
              kind="numeric"
              placeholder="none"
              editTitle={`${def.label}'s DEFAULT ceiling — what a carrier gets unless that character overrides it on their card`}
              onEdit={(next): void => {
                const n = Number.parseInt(next, 10);
                patch({ max: Number.isNaN(n) ? null : Math.max(1, n) });
              }}
              className="!w-avatar-lg px-field text-right tabular-nums"
              restClassName="tabular-nums"
            />
          </Row>
        ) : null}
        <Button
          intent="ghost"
          size="sm"
          className="!size-6 !p-0 shrink-0"
          onClick={(): void => patch({ pinned: !def.pinned })}
          title={def.pinned ? `Unpin ${def.label} from the band` : `Pin ${def.label} as a band orb`}
        >
          <Icon icon={def.pinned ? Pin : PinOff} size="xs" />
        </Button>
        <Button
          intent="ghost"
          size="sm"
          className="!size-6 !p-0 shrink-0"
          onClick={(): void => patch({ locked: !def.locked })}
          title={def.locked ? `Let the story write ${def.label} again` : `Lock ${def.label} — the story can no longer write it`}
        >
          <Icon icon={def.locked ? Lock : LockOpen} size="xs" />
        </Button>
        <Button intent="ghost" size="sm" className="!size-6 !p-0 shrink-0" onClick={(): void => onCommit({ ...def, key: "" })} title={`Remove ${def.label}`}>
          <Icon icon={Trash2} size="xs" />
        </Button>
      </Row>
      <Row gap="field" align="center" className="flex-wrap">
        <Badge tone="soft" size="sm" title="the shape decides how it renders and how the story writes it — fixed when it was named">
          {def.shape}
        </Badge>
        {/* The write axis is a TOGGLE, not a badge: a resource you spend reads and writes differently from a
            state you observe, and a host who mis-picked it at birth could not fix it. */}
        <Button
          intent="ghost"
          size="sm"
          onClick={(): void => patch({ write: def.write === "delta" ? "set" : "delta" })}
          title={
            def.write === "delta"
              ? "a resource the story spends and restores — click to make it an observation"
              : "a state the story observes — click to make it a spendable resource"
          }
        >
          {WRITE_LABEL[def.write]}
        </Button>
        {def.subject === "game" ? (
          <Badge tone="soft" size="sm" intent="neutral" title="one reading for the whole game">
            game-wide
          </Badge>
        ) : (
          <Button intent="ghost" size="sm" onClick={(): void => patch({ appliesTo: nextAppliesTo(def.appliesTo) })} title={`Who carries ${def.label}`}>
            {appliesToLabel(def.appliesTo)}
          </Button>
        )}
      </Row>
      <HintEditor ariaLabel={`${def.label} hint`} hint={def.hint} max={RPG_HINT_MAX} onEdit={(next): void => patch({ hint: next })} />
    </Stack>
  );
}

/** THE TRACKERS editor — the ONE surface where every tracked field in the game is defined. It replaces three
 *  surfaces that each owned a slice of the same concept: the Sheet tab's per-actor pool defs, this tab's
 *  cast-field schemas, and this tab's band-orb pin section. Whole-list replace on every commit (the wire
 *  shape); a removal writes the list without the row. The add flow picks the SHAPE (which derives the write
 *  axis) and the subject, and refuses to persist an unnamed def. */
function TrackersEditor({ chatId, config }: { readonly chatId: ChatId; readonly config: RpgConfigView }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const updateConfig = useUpdateConfig({ trpc, invalidation });
  const defs = config.trackers;
  const commit = (next: readonly RpgTrackerDef[]): void => updateConfig.mutate({ chatId, patch: { trackers: [...next] } });
  const add = (label: string, shape: RpgTrackerDef["shape"], subject: RpgTrackerDef["subject"]): void =>
    commit([
      ...defs,
      rpgTrackerDefSchema.parse({
        key: mintDefKey(
          label,
          defs.map((d) => d.key),
          "tracker",
        ),
        label,
        shape,
        write: shape === "meter" ? "delta" : "set",
        subject,
        appliesTo: subject === "game" ? "everyone" : "party",
        sort: defs.length,
      }),
    ]);
  return (
    <Stack gap="field" data-slot="rpg-trackers-editor">
      <Kicker>Trackers</Kicker>
      <Text size="micro" tone="muted">
        A tracker is one labelled value the story keeps — on the roster, on the scene's characters, or on the game itself. Defined once here; read and edited on
        the character. A meter's max here is the DEFAULT ceiling: an individual character can carry a different one on their card.
      </Text>
      {defs.length === 0 ? <RpgDoorwayLine>No trackers yet — name one below and the story starts keeping it.</RpgDoorwayLine> : null}
      {defs.map((def, i) => (
        <TrackerRow
          key={def.key}
          def={def}
          index={i}
          onCommit={(next): void => {
            // A row commits its whole def; the remove affordance signals itself by blanking the key.
            commit(next.key === "" ? defs.filter((_, j) => j !== i) : defs.map((x, j) => (j === i ? next : x)));
          }}
        />
      ))}
      <AddTracker onAdd={add} />
    </Stack>
  );
}

/** The tracker ADD flow — one name, three shapes, plus the subject axis (per character / game-wide). */
function AddTracker({ onAdd }: { readonly onAdd: (label: string, shape: RpgTrackerDef["shape"], subject: RpgTrackerDef["subject"]) => void }): ReactElement {
  const [subject, setSubject] = useState<RpgTrackerDef["subject"]>("actor");
  return (
    <AddRow
      ariaLabel="New tracker name"
      placeholder="name it first (e.g. Grit)"
      trailing={
        <Button intent="ghost" size="sm" onClick={(): void => setSubject(subject === "actor" ? "game" : "actor")} title="Who this tracker belongs to">
          {subject === "actor" ? "per character" : "game-wide"}
        </Button>
      }
      actions={[
        { key: "meter", label: "meter", icon: Plus, intent: "primary", onAdd: (label: string): void => onAdd(label, "meter", subject) },
        { key: "text", label: "text", icon: Plus, onAdd: (label: string): void => onAdd(label, "text", subject) },
        { key: "list", label: "list", icon: Plus, onAdd: (label: string): void => onAdd(label, "list", subject) },
      ]}
    />
  );
}

/** The relationship-hint editor — a `custom-label → steering gloss` record (M1; the hint glosses CUSTOM
 *  labels, per the contract). Whole-record replace on commit. */
function RelationshipHintsEditor({ chatId, config }: { readonly chatId: ChatId; readonly config: RpgConfigView }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const updateConfig = useUpdateConfig({ trpc, invalidation });
  const hints = config.relationshipHints;
  const entries = Object.entries(hints);
  const commit = (next: Record<string, string>): void => updateConfig.mutate({ chatId, patch: { relationshipHints: next } });
  return (
    <Stack gap="field" data-slot="rpg-relationship-hints">
      <Kicker>Relationship hints — gloss custom labels</Kicker>
      {entries.length === 0 ? <RpgDoorwayLine>No custom relationship labels glossed yet — the six built-in kinds need none.</RpgDoorwayLine> : null}
      {entries.map(([label, hint]) => (
        <Row key={label} gap="field" align="center">
          <Badge tone="soft" size="sm" intent="neutral">
            {label}
          </Badge>
          <HintEditor
            ariaLabel={`${label} hint`}
            hint={hint}
            max={RPG_HINT_MAX}
            placeholder="how this label steers…"
            onEdit={(next): void => commit({ ...hints, [label]: next })}
          />
          <Button
            intent="ghost"
            size="sm"
            className="!size-6 !p-0 shrink-0"
            onClick={(): void => {
              const { [label]: _removed, ...rest } = hints;
              commit(rest);
            }}
            title={`Remove ${label}`}
          >
            <Icon icon={Trash2} size="xs" />
          </Button>
        </Row>
      ))}
      <AddRow
        ariaLabel="New relationship label"
        placeholder="custom label (e.g. debtor)"
        actions={[
          {
            key: "label",
            label: "Add",
            icon: Plus,
            onAdd: (label: string): void => {
              if (!(label in hints)) {
                commit({ ...hints, [label]: "" });
              }
            },
          },
        ]}
      />
    </Stack>
  );
}

/** The RESYNC control (§1.3 — the host re-derive escape hatch). Host-only (this whole tab is host-gated; the
 *  `resyncFromStory` verb is a second server-side host gate). One host-initiated model call re-reads a deep
 *  story window and rebuilds the drifted panel — an honest consequence line states the cost. Disabled while a
 *  resync is in flight (the model call takes seconds); the tracker/journal repaint on settle. */
function ResyncControl({ chatId }: { readonly chatId: ChatId }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const resync = useResyncFromStory({ trpc, invalidation });
  return (
    <Stack gap="field">
      <Kicker>Resync from story</Kicker>
      <Text size="micro" tone="muted">
        Re-reads the recent story and rebuilds the tracked panel — the escape hatch when the state has drifted. Runs one model call (a few seconds); your
        hand-locked fields are never overwritten.
      </Text>
      <Row gap="field">
        <Button intent="secondary" size="sm" disabled={resync.isPending} onClick={(): void => resync.mutate({ chatId })}>
          <Icon icon={RotateCcw} size="xs" />
          {resync.isPending ? "Resyncing…" : "Resync from story"}
        </Button>
      </Row>
    </Stack>
  );
}

/** The host config read + the console body. Host-gated (the tab `when` + the server verb). */
function GmConsole({ state }: { readonly state: RpgPanelState }): ReactElement {
  const trpc = useTRPC();
  const { data: config } = useSuspenseQuery(trpc.rpg.getConfigView.queryOptions({ chatId: state.chatId }));
  return (
    <Stack gap="section" data-slot="rpg-game-tab">
      <Row gap="field" align="center">
        <Icon icon={Crown} size="sm" className="text-highlight" />
        <Text size="micro" transform="caps" weight="semibold" className="tracking-micro text-highlight">
          GM console — host only
        </Text>
      </Row>
      {/* Section order: Stat profile (the sheet vocabulary) → TRACKERS (the unified def surface that absorbed
          the Sheet tab's pool defs, the old cast-field schemas, and the band-pin section) → Relationship hints
          → the scalar form (Play style → Hidden channels → Steering note → Delivery model last). */}
      <RpgStatProfileEditor chatId={state.chatId} config={config} />
      <TrackersEditor chatId={state.chatId} config={config} />
      <RelationshipHintsEditor chatId={state.chatId} config={config} />
      <GmConsoleScalars chatId={state.chatId} config={config} />
      <ResyncControl chatId={state.chatId} />
      {/* The graduate doorway — the omitted full-only arms all point here (§4 "Graduate to full"). */}
      <RpgDoorwayLine>Full mode adds skills, combat, sessions, and the map arc — coming with the full graft.</RpgDoorwayLine>
    </Stack>
  );
}

export interface RpgGameTabProps {
  readonly state: RpgPanelState;
}

/** The Game tab — the host GM console (its own boundary; a config read failure is contained). */
export function RpgGameTab({ state }: RpgGameTabProps): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text tone="muted">Loading the console…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="the GM console" onRetry={retry} />}
    >
      <GmConsole state={state} />
    </QueryBoundary>
  );
}
