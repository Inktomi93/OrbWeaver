// The GAME tab ("Game" — the crown host-admin console): the ONE host-authored
// surface, crown-tinted so the privilege reads at the strip. It is DEFINITIONS & RULES (the tracked-field
// unification): the STAT PROFILE vocabulary (add / rename / gloss / remove + the value range — RV-4/RV-12),
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
import { Crown, Eye, EyeOff, Icon, Lock, LockOpen, Plus, RotateCcw, Trash2 } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { TrackBar } from "@orb/ui/meter";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { AddRow, HintEditor, SettingCheckboxRow, TrackerValue } from "#components";
import { QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import type { RpgPanelState } from "../hooks/use-rpg-context-state.ts";
import { useReattributePersona, useResyncFromStory, useUpdateConfig } from "../hooks/use-rpg-mutations.ts";
import { mintDefKey } from "../lib/mint-key.ts";
import { resolveTrackerColor, trackColorProps } from "../lib/track-color.ts";
import { RpgDoorwayLine } from "./rpg-doorway-line.tsx";
import { RpgGameMacros } from "./rpg-game-macros.tsx";
import { RpgHintMapEditor } from "./rpg-hint-map-editor.tsx";
import { HostConsoleScalars } from "./rpg-host-scalars.tsx";
import { Kicker } from "./rpg-kicker.tsx";
import { DEF_ROW_CLASS, RpgStatProfileEditor } from "./rpg-stat-profile-editor.tsx";

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
        {def.shape === "meter" ? <TrackBar value={1} max={1} {...trackColorProps(resolveTrackerColor(def.color, index))} width="swatch" /> : null}
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
            <Text as="span" voice="gloss">
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
          size="glyph-md"
          onClick={(): void => patch({ pinned: !def.pinned })}
          // BAND vocabulary + Eye glyph, never "pin" (owner ruling 08-01): "pin" is the HAND-LOCK's word
          // (RpgFieldLock's "Pinned by hand"), and the band toggle even shared its Pin icon — two different
          // concepts, one verb+glyph. Band = visibility, so it speaks visibility.
          title={def.pinned ? `Remove ${def.label} from the band` : `Show ${def.label} as a band orb`}
        >
          <Icon icon={def.pinned ? Eye : EyeOff} size="xs" />
        </Button>
        <Button
          intent="ghost"
          size="glyph-md"
          onClick={(): void => patch({ locked: !def.locked })}
          title={def.locked ? `Let the story write ${def.label} again` : `Lock ${def.label} — the story can no longer write it`}
        >
          <Icon icon={def.locked ? Lock : LockOpen} size="xs" />
        </Button>
        <Button intent="ghost" size="glyph-md" onClick={(): void => onCommit({ ...def, key: "" })} title={`Remove ${def.label}`}>
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
      <Text voice="gloss">
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

/** The relationship-hint editor — a `custom-label → steering gloss` record (the hint glosses CUSTOM
 *  labels, per the contract). Whole-record replace on commit. */
function RelationshipHintsEditor({ chatId, config }: { readonly chatId: ChatId; readonly config: RpgConfigView }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const updateConfig = useUpdateConfig({ trpc, invalidation });
  return (
    <RpgHintMapEditor
      kicker="Relationship hints — gloss custom labels"
      emptyLine="No custom relationship labels glossed yet — the six built-in kinds need none."
      labelNoun="relationship label"
      addPlaceholder="custom label (e.g. debtor)"
      hints={config.relationshipHints}
      onCommit={(next): void => updateConfig.mutate({ chatId, patch: { relationshipHints: next } })}
    />
  );
}

/** The JOURNAL-TYPE hint editor (R4c) — the exact sibling of the relationship hints, on the plane that fires on
 *  ~79% of turns: a journal entry may ride `type:"custom"` with a free label, and this maps that label to the
 *  gloss the extraction prompt teaches with it. Stored + read (the tool descriptions render it) with no editor
 *  until now — the D107 dead-switch class. Whole-record replace on commit. */
function JournalTypeHintsEditor({ chatId, config }: { readonly chatId: ChatId; readonly config: RpgConfigView }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const updateConfig = useUpdateConfig({ trpc, invalidation });
  return (
    <RpgHintMapEditor
      kicker="Journal type hints — gloss your own beat types"
      emptyLine="No custom journal types glossed yet — the built-in beat types need none."
      labelNoun="journal type"
      addPlaceholder="custom type (e.g. omen)"
      hints={config.journalTypeHints}
      onCommit={(next): void => updateConfig.mutate({ chatId, patch: { journalTypeHints: next } })}
    >
      <Text voice="gloss">
        A beat the story records as your own type carries only its bare label unless you say what it means. The gloss rides the same instruction that teaches
        the built-in types.
      </Text>
    </RpgHintMapEditor>
  );
}

/** The RESYNC control (§1.3 — the host re-derive escape hatch). Host-only (this whole tab is host-gated; the
 *  `resyncFromStory` verb is a second server-side host gate). One host-initiated model call re-reads a deep
 *  story window and rebuilds the drifted panel — an honest consequence line states the cost. Disabled while a
 *  resync is in flight (the model call takes seconds); the tracker/journal repaint on settle.
 *
 *  THE OPT-IN RESTAMP (the persona half of the two reattribution affordances — the other lives in the persona
 *  panel, and they are deliberately NOT fused: this one is a HOST game rebuild, that one is a self-stamp on a
 *  plain chat). Checked, the caller's own user rows are re-stamped to their current chat persona FIRST, so the
 *  deep story window the rebuild re-reads resolves the NEW name per row (`resolveCanonWindow` resolves identity
 *  macros off each row's stamp) and the re-extracted planes are written with it. Order is load-bearing: a
 *  rebuild that ran first would bake the old name in again. The copy is honest about the limit — assistant
 *  PROSE keeps the vocatives the model wrote, because we never edit message content (D26). */
function ResyncControl({ chatId }: { readonly chatId: ChatId }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const resync = useResyncFromStory({ trpc, invalidation });
  const restamp = useReattributePersona({ trpc, invalidation });
  const { data: chat } = useSuspenseQuery(trpc.chat.getChat.queryOptions({ chatId }));
  const [restampFirst, setRestampFirst] = useState(false);
  const personaId = chat.viewerActivePersonaId;
  const canRestamp = personaId !== null;
  const busy = resync.isPending || restamp.isPending;

  // Sequential by necessity (restamp → rebuild). A failed restamp ABORTS the rebuild: the mutation's own
  // error toast has already spoken, and rebuilding on the old stamps is exactly what the host didn't ask for.
  const onResync = async (): Promise<void> => {
    try {
      if (restampFirst && personaId !== null) {
        await restamp.mutateAsync({ chatId, scope: { kind: "mine" }, personaId });
      }
      const verdict = await resync.mutateAsync({ chatId });
      // The THIRD ending (RESYNC-OR): the round RAN and re-derived nothing. The refusal seam owns `{ok:false}`
      // (it toasts an error, which this is not), and a real rebuild announces itself by repainting the panel —
      // so this arm is the only one with no signal of its own. The host paid for a model call; say what it found.
      if (verdict.ok && !verdict.rebuilt) {
        notify.info("Nothing to rebuild — the tracked state already matches the story.");
      }
    } catch {
      // The failed mutation's own error toast has already spoken; the rest of the sequence is abandoned.
    }
  };

  return (
    <Stack gap="field">
      <Kicker>Resync from story</Kicker>
      <Text voice="gloss">
        Re-reads the recent story and rebuilds the tracked panel — the escape hatch when the state has drifted. Runs one model call (a few seconds); your
        hand-locked fields are never overwritten.
      </Text>
      <SettingCheckboxRow
        label="Restamp my messages first"
        description="Re-stamps every line you wrote in this chat to the persona you're playing now, then rebuilds — so the rebuilt state uses that name. Replies keep the names the story already wrote."
        checked={restampFirst && canRestamp}
        onChange={setRestampFirst}
        disabled={!canRestamp || busy}
        {...(canRestamp ? {} : { disabledReason: "Pick a persona for this chat first — there's nothing to re-stamp to." })}
      />
      <Row gap="field">
        <Button
          intent="secondary"
          size="sm"
          disabled={busy}
          onClick={(): void => {
            void onResync();
          }}
        >
          <Icon icon={RotateCcw} size="xs" />
          {busy ? "Resyncing…" : "Resync from story"}
        </Button>
      </Row>
    </Stack>
  );
}

/** The host config read + the console body. Host-gated (the tab `when` + the server verb).
 *
 *  THERE IS NO "GM" IN LITE (owner rule): the person running the room is the HOST, and a solo game is just the
 *  user. Every user-visible string here says HOST; the `Gm*` code identifiers below and the `gmPresetId` /
 *  `gmUserId` wire+column names are the residue of the retired vocabulary and are NOT renamed here — a wire
 *  field and a db column are a migration, not a copy change, and this lane is not the place to spend one. */
function HostConsole({ state }: { readonly state: RpgPanelState }): ReactElement {
  const trpc = useTRPC();
  const { data: config } = useSuspenseQuery(trpc.rpg.getConfigView.queryOptions({ chatId: state.chatId }));
  return (
    <Stack gap="section" data-slot="rpg-game-tab">
      <Row gap="field" align="center">
        <Icon icon={Crown} size="sm" className="text-highlight" />
        <Text voice="kicker" className="tracking-micro text-highlight">
          Host console — host only
        </Text>
      </Row>
      {/* Section order: Stat profile (the sheet vocabulary) → TRACKERS (the unified def surface that absorbed
          the Sheet tab's pool defs, the old cast-field schemas, and the band-pin section) → the two gloss maps
          (relationship labels, then journal types — same block, same gesture) → the scalar form (Play style →
          Immersive cards → Hidden channels → Prompt budget → Steering note → Delivery model → Extraction depth)
          → GAME MACROS (WAVE MU — the game half of the two authoring homes; its own autosave boundary because
          it owns a structural array). */}
      <RpgStatProfileEditor chatId={state.chatId} config={config} />
      <TrackersEditor chatId={state.chatId} config={config} />
      <RelationshipHintsEditor chatId={state.chatId} config={config} />
      <JournalTypeHintsEditor chatId={state.chatId} config={config} />
      <HostConsoleScalars chatId={state.chatId} config={config} />
      <RpgGameMacros chatId={state.chatId} config={config} />
      <ResyncControl chatId={state.chatId} />
      {/* The graduate doorway — the omitted full-only arms all point here ("Graduate to full"). */}
      <RpgDoorwayLine>Full mode adds skills, combat, sessions, and the map arc — coming with the full graft.</RpgDoorwayLine>
    </Stack>
  );
}

export interface RpgGameTabProps {
  readonly state: RpgPanelState;
}

/** The Game tab — the HOST console (its own boundary; a config read failure is contained). */
export function RpgGameTab({ state }: RpgGameTabProps): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text voice="gloss">Loading the console…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="the host console" onRetry={retry} />}
    >
      <HostConsole state={state} />
    </QueryBoundary>
  );
}
