// The RULED duplicate-action-door pairs (#252/#568/#569/#2101), authored HERE because both consumers of
// "what is a door" need them and neither may import the other.
//
//   · `tooling/src/verify/lib/reviewed-grants.ts` maps every row below into the CENTRAL reviewed-grant table,
//     which is still the one place `duplicate-action-doors`' exceptions are consumed from. The policy module
//     itself reads neither this file nor that table.
//   · `tooling/src/ast/ops/subset-callers.ts` annotates a flagged payload subset whose verb is a RULED door
//     pair, so a decision somebody already made is not re-litigated every sweep (#572).
//
// WHY NOT SIMPLY AUTHOR THEM IN THE GRANT TABLE. The lens would then have to read `verify`, and a cross-tool
// import must enter through `verify/index.ts` — which imports `ops/debt.ts`, which reaches `ast/index.ts`,
// which reaches this very lens. Measured 2026-09-13: five `lint/suspicious/noImportCycles` errors. The
// retired `DOORS_BASELINE_REL` sat in `_shared/trpc-doors.ts` for exactly this reason and said so; this file
// is that precedent, carrying rows instead of a path. `_shared` is `@orb/tooling`'s floor and reaches up to
// nothing, so a row here is readable by both tools and by neither's internals.
//
// THE RULED UNIT IS THE DOOR SET, NOT A CARDINALITY (#2101). `doors` is the complete set; the policy derives
// the grant `operation` from the LIVE set through `doorSetOperation`, so a third door, a moved door, a
// swapped door or a pure RENAME changes the string, the row stops matching, the finding is effective and the
// orphaned row alarms `stale-reviewed-grant`. Editing a row is therefore the whole ritual: there is no count
// to bump.
import { doorSetOperation } from "./trpc-doors.ts";

/** One ruled pair. `subject` is the `<plane>::<procedure>` key; `doors` is the complete ruled set. */
export interface ActionDoorRuling {
  /** The central grant id, `duplicate-action-doors:<short-kebab-subject>`. */
  readonly id: string;
  readonly subject: string;
  readonly doors: readonly string[];
  readonly why: string;
  readonly endsWhen: string;
}

/** The settings-SECTION contributor seam's ruling, shared by the four planes it qualifies on. */
const SEAM_WHY =
  "the settings-SECTION contributor seam (client-architecture-lockdown.md §6c): one contributed section owns " +
  "one `owns:` key-set and saves it itself, so N sections on one plane means N call sites BY CONSTRUCTION — " +
  "they are N different verbs sharing one wire procedure, not one verb wearing N doors. Carried VERBATIM from " +
  "the retired gate-local `EXEMPT_PROCEDURES` table, whose stated END condition is this row's `endsWhen`. THE " +
  "COST OF THE MIGRATION IS STATED RATHER THAN HIDDEN: the retired table keyed on the PROCEDURE and dropped it " +
  "out of the census entirely, so a third door landed silently; this row names the exact door SET, so a NEW " +
  "settings section on this plane reds until the row is re-pointed. The structural alternative the sentence " +
  "above actually argues for — deriving each site's verb identity from its `section` discriminant, so these " +
  "sites stop being one procedure at all — is predicate work with its own proof corpus and was deliberately " +
  "not invented inside a conversion.";

const SEAM_ENDS =
  "ENDS when the save seam stops being per-section (a single pane-level committer), at which point every row " +
  "here goes to 1 — the plane drops below the duplication floor, this row is consumed zero times and central " +
  "liveness reports it stale.";

const STALE_TAIL = "the door set then changes, this row is consumed zero times and central liveness reports it stale.";

export const ACTION_DOOR_RULINGS: readonly ActionDoorRuling[] = Object.freeze([
  {
    id: "duplicate-action-doors:chats-continue-turn",
    subject: "chats::chat.continueTurn",
    doors: ["packages/client/src/features/chat/hooks/use-continue-turn.ts", "packages/client/src/features/chat/hooks/use-guided-actions.ts"],
    why:
      "#568: two AFFORDANCE KINDS, not one verb wearing two faces — use-continue-turn.ts is a settings-gated " +
      "empty-Send KEYBOARD gesture firing the bare verb (off entirely unless `continueOnSend`), " +
      "use-guided-actions.ts is the always-present composer wand whose payload carries the guided steer. " +
      "Retiring either deletes a whole interaction mode (no-pointer, or steerable). Stays a COUNT rather than " +
      "an EXEMPT_PROCEDURES row on purpose: an exempt procedure leaves the census, so a THIRD door would land " +
      "silently. THE RULING SURVIVES, ITS INPUT CHANGED (2026-09-13, #1584): there is no count any more, and " +
      "the protection that last sentence bought is now the door SET this row names — a third door changes the " +
      "set, the row stops matching, and the finding is effective.",
    endsWhen: `ENDS if one arm is retired — ${STALE_TAIL}`,
  },
  {
    id: "duplicate-action-doors:chats-delete-messages",
    subject: "chats::chat.deleteMessages",
    doors: ["packages/client/src/features/chat/components/message-actions-row.tsx", "packages/client/src/features/chat/components/message-selection-bar.tsx"],
    why:
      "#568: different MODES and different cardinalities — message-selection-bar.tsx exists only in bulk-select " +
      "mode, deletes the whole selected set behind a counted confirm and exits the mode; the row's ⋯ item is " +
      "the single-message door available at rest. Collapsing either way makes deleting one message require " +
      "entering a mode, or deleting twenty require twenty confirms.",
    endsWhen: `ENDS if bulk-select mode is retired — ${STALE_TAIL}`,
  },
  {
    id: "duplicate-action-doors:chats-generate",
    subject: "chats::chat.generate",
    doors: ["packages/client/src/features/chat/hooks/use-continue-turn.ts", "packages/client/src/features/chat/hooks/use-guided-actions.ts"],
    why:
      "#568: the settings-gated empty-Send keyboard gesture (`generateOnEmptySend`, bare verb) vs the composer " +
      "wand's `fireResponse`, whose payload carries the guided steer plus `speakerCharacterId` and the " +
      "`afterAssistant` responseNudge. Retiring the gesture strands two shipped user settings; retiring the " +
      "wand deletes the only steerable arm.",
    endsWhen: `ENDS if one arm is retired — ${STALE_TAIL}`,
  },
  {
    id: "duplicate-action-doors:chats-revert-continue",
    subject: "chats::chat.revertContinue",
    doors: ["packages/client/src/features/chat/components/message-actions-row.tsx", "packages/client/src/features/chat/hooks/use-composer-utilities.ts"],
    why:
      "#568: composer-side vs transcript-side, and the target sets do not contain each other — " +
      "use-composer-utilities.ts always resolves the TAIL assistant slot (reachable with no pointer), the row's " +
      "⋯ item targets THAT row and is the only way to act on a reply that is no longer the tail.",
    endsWhen: `ENDS if the row item becomes tail-derived — ${STALE_TAIL}`,
  },
  {
    id: "duplicate-action-doors:chats-swipe",
    subject: "chats::chat.swipe",
    doors: ["packages/client/src/features/chat/components/swipe-strip.tsx", "packages/client/src/features/chat/hooks/use-guided-actions.ts"],
    why:
      "#568: reader-side vs composer-side — swipe-strip.tsx is the transcript row's variant PAGER (generating " +
      "only at the tip) and the home of the ‹/› keyboard nav; the wand's `fireSwipe`/`fireRewrite` carries a " +
      "`guided` steer the pager structurally cannot send. Neither is the #539 class (same home, strict payload " +
      "subset). The rendered-affordance overlap the triage did NOT settle is tracked as #570, not here.",
    endsWhen:
      "ENDS if the pager gains the guided steer the wand carries, or if either door is retired — this is the " +
      `one #568 ruling that stated no END condition, so the condition is derived from what it rests on: ${STALE_TAIL}`,
  },
  {
    id: "duplicate-action-doors:chats-undo-continue",
    subject: "chats::chat.undoContinue",
    doors: ["packages/client/src/features/chat/components/message-actions-row.tsx", "packages/client/src/features/chat/hooks/use-composer-utilities.ts"],
    why:
      "#568: the same tail-vs-row split as revertContinue — the ✨ composer menu acts on the tail assistant slot " +
      "without a pointer, the per-message row item is phase-gated per row (`hasContinuation`) and reaches " +
      "replies that are no longer the tail.",
    endsWhen: `ENDS if the row item becomes tail-derived — ${STALE_TAIL}`,
  },
  {
    id: "duplicate-action-doors:settings-section-seam-app-shell",
    subject: "feature:app-shell::settings.updateUserSettingsSection",
    doors: [
      "packages/client/src/features/app-shell/components/appearance-background-section.tsx",
      "packages/client/src/features/app-shell/components/appearance-effects-section.tsx",
      "packages/client/src/features/app-shell/components/appearance-reading-section.tsx",
      "packages/client/src/features/app-shell/components/appearance-sizing-section.tsx",
    ],
    why: SEAM_WHY,
    endsWhen: SEAM_ENDS,
  },
  {
    id: "duplicate-action-doors:settings-section-seam-characters",
    subject: "characters::settings.updateUserSettingsSection",
    doors: [
      "packages/client/src/features/character/components/library-settings-section.tsx",
      "packages/client/src/features/character/hooks/use-character-context-mutations.ts",
    ],
    why: SEAM_WHY,
    endsWhen: SEAM_ENDS,
  },
  {
    id: "duplicate-action-doors:settings-section-seam-chats",
    subject: "chats::settings.updateUserSettingsSection",
    doors: [
      "packages/client/src/features/chat/components/appearance-avatars-section.tsx",
      "packages/client/src/features/chat/components/appearance-message-details-section.tsx",
      "packages/client/src/features/chat/components/appearance-message-style-section.tsx",
      "packages/client/src/features/chat/components/chat-behavior-message-handling-section.tsx",
      "packages/client/src/features/chat/components/chat-behavior-streaming-section.tsx",
      "packages/client/src/features/chat/components/databank-settings-section.tsx",
      "packages/client/src/features/chat/components/imagery-templates-section.tsx",
      "packages/client/src/features/chat/components/memory-settings-section.tsx",
      "packages/client/src/features/chat/components/prose-settings-section.tsx",
    ],
    why: SEAM_WHY,
    endsWhen: SEAM_ENDS,
  },
  {
    id: "duplicate-action-doors:settings-section-seam-persona",
    subject: "feature:persona::settings.updateUserSettingsSection",
    doors: [
      "packages/client/src/features/persona/components/persona-notifications-section.tsx",
      "packages/client/src/features/persona/hooks/use-persona-identity.ts",
    ],
    why: SEAM_WHY,
    endsWhen: SEAM_ENDS,
  },
]);

/** The `operation` each ruling licenses — derived through the ONE formatter, never re-spelled, so a row and
 *  the policy that must match it cannot drift. */
export function rulingOperation(ruling: ActionDoorRuling): string {
  return doorSetOperation(ruling.doors);
}
