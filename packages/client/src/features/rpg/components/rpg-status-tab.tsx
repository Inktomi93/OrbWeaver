// The STATUS tab ("Status" + the tracked-field unification IA repair):
// **the ONLY list of people**, and expanding an entry IS the sheet. Two states, one tab:
//   • the CHARACTERS — portrait-led instrument cards (D44 portrait · name · relationship badge ON the name line,
//     rendered ONLY when the character also stands in the scene npcs — never a phantom
//     "neutral") with the quick edits that belong on a glanceable row: the volatile `status` line, the
//     tracker meters (value AND max click-to-edit), the lit condition chips;
//   • the CHARACTER TAKEOVER (`RpgCharacterDetail`) — the whole character, breadcrumb back to the list.
// Sheet-the-tab dissolved into that second state (SETTLED, owner 2026-07-31): its title/level/wallet/
// attribute planes live in the takeover, its tracker DEF rows moved to the Game tab's one def home.
//
// VEILED (P3) — the host-only standing-secrets ledger is a WIRED-WHEN-READY section shell
// (`RpgVeiledSection`): the deception plane is being built by its own lane; until entries arrive the
// shell renders NOTHING (the honest empty plane — no filler). The section + crown-gold grammar land here
// because secrets are game-state about the CHARACTERS (the same lens this tab already is).
//
// The per-actor edit callbacks (`ActorEdit`) are built ONCE here and handed to whichever state is showing —
// the character card and the takeover write through the same overlays, so a value edited in one place is the
// same write in the other.

import { blobUrl } from "@orb/contracts/assets";
import type { RpgActorOp, RpgActorRef, RpgActorView } from "@orb/contracts/rpg";
import { resolveTrackerMaxOverride, rpgActorVolatileLockBase, trackerNumber } from "@orb/contracts/rpg";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { ChevronRight, Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import type { RpgPanelState } from "../hooks/use-rpg-context-state.ts";
import { useEditSnapshot, usePatchActor } from "../hooks/use-rpg-mutations.ts";
import { actorKey, actorSubjects } from "../lib/actor-key.ts";
import type { ActorEdit } from "./rpg-actor-trackers.tsx";
import { ActorMeters, ActorTrackerRows, ConditionChips, StatusLine } from "./rpg-actor-trackers.tsx";
import { RpgCharacterDetail } from "./rpg-character-detail.tsx";
import { RpgDoorwayLine } from "./rpg-doorway-line.tsx";
import { RpgFieldLock } from "./rpg-field-lock.tsx";
import { Kicker } from "./rpg-kicker.tsx";
import { RpgVeiledSection } from "./rpg-veiled-section.tsx";

export interface RpgStatusTabProps {
  readonly state: RpgPanelState;
}

/** The Status tab — the character list, or the character takeover when an entry is open. */
export function RpgStatusTab({ state }: RpgStatusTabProps): ReactElement {
  const { tracker, canEditShared, chatId, isHost } = state;
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const editSnapshot = useEditSnapshot({ trpc, invalidation });
  const patchActor = usePatchActor({ trpc, invalidation });
  // The open character (the takeover) — null = the list. Keyed by the stable actor selector key.
  const [openKey, setOpenKey] = useState<string | null>(null);

  // THE CHARACTERS, and only the characters (R2). `tracker.actors` now carries every actor the game tracks, npcs
  // included — one shape, so the filter is a partition, not a projection. Cast actors home on the SCENE tab
  // (on stage) and in its Known-characters disclosure (offstage); duplicating them here would give one person
  // two edit homes, which is the dual-homing rule this IA exists to obey.
  const characters = tracker.actors.filter((a) => a.actorRef.kind !== "npc");
  // The a11y subject per character — the display name, qualified by participant position ONLY where two entries
  // carry the same name (#1531). Derived over the FILTERED list, because the collision that matters is the
  // one a reader actually hears in this tab: an npc with the same name lives on Scene and is never in
  // this tree, so qualifying against it would rename a character for a rival nobody here can reach.
  const subjects = actorSubjects(characters);

  if (characters.length === 0) {
    return <Text>No characters yet — add them in Members.</Text>;
  }

  // One op-and-mutate for a target actor's volatile: the panel names the OP it performed, the server applies
  // it against the true head and derives the FINE lock path (#10). No image, no client-named lock paths.
  const patch = (ref: RpgActorRef, ...ops: readonly RpgActorOp[]): void => patchActor.mutate({ chatId, targetRef: ref, ops: [...ops] });

  const editFor = (actor: RpgActorView): ActorEdit | undefined => {
    if (!canEditShared) {
      return;
    }
    const ref = actor.actorRef;
    // The VOLATILE base — every `sub` these callbacks take (`.status`, `.conditions`, `.trackerValues.<key>`)
    // is a volatile field, and the server has stamped them under `…<actorKey>.volatile.<field>` since R2
    // moved the fields under it (`rpgActorVolatileLockBase`, whose header says the segment is a real path
    // segment, not a naming choice). Reading them off the bare actor base matched nothing, so no per-actor
    // pin has rendered since — the affordance existed and could never fire.
    const base = rpgActorVolatileLockBase(ref);
    return {
      onEditTracker: (key, next): void => patch(ref, { op: "setTracker", key, value: { value: Math.max(0, next) } }),
      onEditTrackerText: (key, next): void => {
        const def = actor.trackers.find((d) => d.key === key);
        const trimmed = next.trim();
        patch(
          ref,
          def?.shape === "list"
            ? { op: "setTracker", key, value: { items: trimmed === "" ? [] : trimmed.split(",").map((x) => x.trim()) } }
            : { op: "setTracker", key, value: { value: trimmed } },
        );
      },
      onEditTrackerMax: (key, nextMax): { readonly draggedTo: number } | null => {
        const clampedMax = Math.max(1, nextMax); // the real `max ≥ 1` floor (Tier-1)
        const def = actor.trackers.find((d) => d.key === key);
        const reading = trackerNumber(actor.volatile?.trackerValues[key]);
        // THIS character's ceiling (owner amendment): the override rides the actor's own value plane, and
        // resolves to `null` when it equals the game default — one gesture, one write, no drift class.
        const override = def === undefined ? clampedMax : resolveTrackerMaxOverride(def, clampedMax);
        // Lowering below the reading drags the stored VALUE down in the SAME commit (never a silent truncate).
        const drag = reading !== null && reading > clampedMax;
        patch(ref, { op: "setTracker", key, value: drag ? { max: override, value: clampedMax } : { max: override } });
        return drag ? { draggedTo: clampedMax } : null;
      },
      // `addCondition` is a name-keyed UPSERT server-side, so re-adding a standing condition is idempotent —
      // the panel no longer has to check the list before writing.
      onAddCondition: (name): void => patch(ref, { op: "addCondition", condition: { name } }),
      onRemoveCondition: (name): void => patch(ref, { op: "removeCondition", name }),
      onEditStatus: (next): void => patch(ref, { op: "setStatus", status: next.trim() }),
      isLocked: (sub): boolean => tracker.lockedPaths.includes(`${base}${sub}`),
      onRelease: (sub): void => editSnapshot.mutate({ chatId, patch: {}, releaseLocks: [`${base}${sub}`] }),
    };
  };

  // THE TAKEOVER: the open character replaces the list in the viewport (one panel, one place at a time).
  const openActor = characters.find((a) => actorKey(a) === openKey);
  if (openActor !== undefined) {
    const edit = editFor(openActor);
    return <RpgCharacterDetail state={state} actor={openActor} onBack={(): void => setOpenKey(null)} {...(edit === undefined ? {} : { edit })} />;
  }

  return (
    <Stack gap="section" data-slot="rpg-status-tab">
      {/* The plane-wide hand-lock pin. Nothing MINTS this coarse `actorState` pin any more — the ops
          door stamps fine per-datum paths — but a snapshot written before R1 can carry one, and a pin with no
          Release is a trap: the section keeps the affordance so a stored plane-wide lock can be let go. */}
      <Kicker
        trailing={
          canEditShared && tracker.lockedPaths.includes("actorState") ? (
            <RpgFieldLock field="the characters" onRelease={(): void => editSnapshot.mutate({ chatId, patch: {}, releaseLocks: ["actorState"] })} />
          ) : null
        }
      >
        Characters — {characters.length}
      </Kicker>
      {/* THE ORIENTING LEAD (#863 P1). A just-started game lands here with a list of cards that are all
          em-dashes and `+ condition`, and nothing on the screen said a game had started or what would fill
          it in — the cold 5-second test failed outright. The line shows only while the story has written
          NOTHING (every actor's volatile plane is still null), so it teaches once and then gets out of the
          way; an established game never carries it ([[empty-states-are-load-bearing]]). */}
      {characters.length === 0 || characters.every((actor) => actor.volatile === null) ? (
        <RpgDoorwayLine>The story fills this in as you play. Set up trackers in the Game tab.</RpgDoorwayLine>
      ) : null}
      {characters.map((actor) => {
        const edit = editFor(actor);
        return (
          <RpgStatusCard
            key={actorKey(actor)}
            actor={actor}
            subject={subjects.get(actorKey(actor)) ?? actor.name}
            onOpen={(): void => setOpenKey(actorKey(actor))}
            {...(edit === undefined ? {} : { edit })}
          />
        );
      })}
      {/* The host-only Veiled ledger — LIVE off `rpg.revealHidden` (its own boundary; empty/error ⇒
          null). PERMISSION-omit: a member never mounts it, so member DOM carries zero veiled content. */}
      {isHost ? <RpgVeiledSection chatId={chatId} /> : null}
    </Stack>
  );
}

interface RpgStatusCardProps {
  readonly actor: RpgActorView;
  /** How this character is NAMED to a reader — `actor.name`, qualified by participant position when a same-named
   *  entry shares the tab (`actorSubjects`, #1531). Every accessible name on the card is built from it. */
  readonly subject: string;
  readonly edit?: ActorEdit;
  /** Open this character's takeover (the card's name is the door). */
  readonly onOpen: () => void;
}

/** One character instrument card: portrait+name as the DOOR into the character · title · status line · meters ·
 *  condition chips. The name is a real button (the takeover's entry point); every other control on the card
 *  stays a sibling of it, never nested inside it.
 *
 *  A NAMED GROUP, AND EVERY CONTROL SAYS WHOSE (#1383). The Status region was one flat tree: four cards
 *  deep it published 4x "Add condition", 4x "Status line", 3x "HP value", 3x "HP max" — byte-identical
 *  accessible names on an EDITING surface, with nothing between one character's block and the next. A
 *  reader heard "button, 17" and could not tell whose sheet was being edited. Two halves, both needed: the
 *  card is a `role="group"` named for the character (the boundary), and every control inside runs its name
 *  through the tracker kit's `subject` grammar (the disambiguation). Either alone still collides — a group
 *  boundary does not rename the controls, and unique names alone leave no structure to navigate by.
 *
 *  …AND THE SUBJECT IS NOT THE RAW NAME (#1531). Both halves above are built on the display name, so two
 *  participant entries carrying the SAME name (legal — #1366 keys distinct spellings distinctly, identical ones
 *  stay allowed) put the region straight back where it started: two groups sharing one label, and every
 *  control name duplicated across them. The card is handed a `subject` that `actorSubjects` has already
 *  qualified where — and only where — it collides.
 *
 *  There is no relationship badge here (R2). It joined a seated character to a scene-npc row by
 *  `presentCharacters[].characterId` — a field NO writer in the tree ever set, so the badge rendered for
 *  nobody. A stance is a NPC actor's datum (it lives on `identity`, and the Scene card is its home); a seated
 *  member's relationship to the player is the story's, not a tracked plane's. */
function RpgStatusCard({ actor, subject, edit, onOpen }: RpgStatusCardProps): ReactElement {
  const volatile = actor.volatile;
  return (
    <Stack gap="field" data-slot="rpg-status-card" role="group" aria-label={subject} className="rounded-base border border-border bg-card px-block py-row">
      <Row gap="block" align="center" justify="between">
        <Row gap="field" align="center" className="min-w-0">
          <Button
            intent="ghost"
            size="inline"
            onClick={onOpen}
            aria-label={`Open ${subject}`}
            title={`Open ${subject}'s sheet`}
            className="min-w-0 px-field font-medium"
          >
            <Avatar size="md" shape="rounded" alt={actor.name} hueSeed={actor.name} {...(actor.avatar === undefined ? {} : { src: blobUrl(actor.avatar) })}>
              {actor.name.slice(0, 1).toUpperCase()}
            </Avatar>
            <Text as="span" voice="label" className="truncate">
              {actor.name}
            </Text>
            <Icon icon={ChevronRight} size="xs" className="shrink-0 text-muted-foreground" />
          </Button>
        </Row>
        {actor.sheet.className === "" ? null : (
          <Text as="span" voice="gloss" className="shrink-0">
            {actor.sheet.className}
          </Text>
        )}
      </Row>
      <StatusLine status={volatile?.status ?? ""} subject={subject} {...(edit === undefined ? {} : { edit })} />

      <ActorMeters actor={actor} subject={subject} {...(edit === undefined ? {} : { edit })} />
      <ActorTrackerRows actor={actor} subject={subject} {...(edit === undefined ? {} : { edit })} />

      <ConditionChips
        conditions={volatile?.conditions ?? []}
        subject={subject}
        {...(edit === undefined ? {} : { onAdd: edit.onAddCondition, onRemove: edit.onRemoveCondition, edit })}
      />
    </Stack>
  );
}
