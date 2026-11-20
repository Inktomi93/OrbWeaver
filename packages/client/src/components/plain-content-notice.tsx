// The row notices: the copy and the control for the verdicts `render-trust.ts` resolves. Only those verdicts decide
// which setting is named and whether the viewer gets a control; this file hands them the roster's policy and never
// judges it. Character trust is one question, so a row shows ONE trust notice: every kind it holds back (its styling,
// its scripts, its internet media), what holds each, and one control, the one that decides the first kind this viewer
// can change. A framed card or styled reply reports its server grant to the row (`RowTrustScope`) and never speaks for
// itself, so a row with several frames still says it once. The chat transcript and the game's card archive both draw
// authored markup, so both mount these from this one home.

import { viewerRunsCardScripts } from "@orb/contracts/settings";
import type { PlainNoticeAction } from "@orb/ui/immersive-card";
import { PlainNotice } from "@orb/ui/immersive-card";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { roomRosterOptions, useAuthConfig, useGatedQuery, useSettingsViewerView, useTRPC } from "#data";
import type { HeldKind, PlainContentNeeds, PlainRemedy, PlainReplyReason, PlainSubject, TrustCause, TrustHold } from "#lib";
import {
  actionHold,
  buildParticipantsById,
  DEFAULT_HTML_STEP_SETTING_LABEL,
  HELD_CARDS_REASON,
  mergeTrustHolds,
  PLAIN_REPLY_REASON,
  resolveFramedHolds,
  resolvePlainHolds,
} from "#lib";
import {
  DEFAULT_HTML_STEP_CONFIG_SETTING,
  FORBID_EXTERNAL_MEDIA_CONFIG_SETTING,
  MEDIA_TRUST_CONFIG_SUB,
  MESSAGE_HANDLING_CONFIG_SUB,
  openCharacterTrust,
  openConfigTo,
  openGameSettings,
  RUN_CARD_SCRIPTS_CONFIG_SETTING,
} from "#state";
import type { ReportedFrame, RowTrust } from "./row-trust.ts";
import { RowTrustFrames, RowTrustReport, sameFrame } from "./row-trust.ts";

const UNNAMED_CHARACTER = "this character";
const PLAIN_REPLY_CAUSE: Record<PlainReplyReason, string> = {
  [PLAIN_REPLY_REASON.carriedStylesOverBudget]: "This reply carries more styling than its frame may hold, so it shows as plain.",
  [PLAIN_REPLY_REASON.frameUnavailable]: "This reply's frame could not be drawn, so it shows as plain.",
};
const NO_REMEDY: PlainRemedy = "none";
const OWN_SCRIPTS_ACTION_LABEL = "Open your card script setting";
const SYSTEM_TRUST_ACTION_LABEL = "Open the server's Character trust settings";
const HELD_CARDS_CAUSE = "This reply holds HTML the game would draw as a card, and immersive HTML cards are off in this game, so it is not drawn as one.";
const GAME_SETTINGS_ACTION_LABEL = "Open the game's settings";

const HELD_KIND_LABELS: Record<HeldKind, string> = {
  styling: "its styling",
  scripts: "its scripts",
  media: "its internet media",
};
// A character that turns media off for itself leaves each image a click-to-load control, so media is held back from loading on its own, not hidden.
const CLICK_TO_LOAD_MEDIA_LABEL = "internet media loading on its own";

function heldKindLabel(kind: HeldKind, holds: readonly TrustHold[]): string {
  const clickToLoad = holds.every((hold) => hold.kind !== "media" || hold.cause === "character-media");
  return kind === "media" && clickToLoad ? CLICK_TO_LOAD_MEDIA_LABEL : HELD_KIND_LABELS[kind];
}

const NOT_COVERED = "No character's settings cover this message.";
const TRUST_CAUSE_LINES: Record<TrustCause, (name: string) => string> = {
  character: (name) => `${name} is set to Plain text.`,
  install: (name) => `${name} uses this server's ${DEFAULT_HTML_STEP_SETTING_LABEL}, which is Plain text.`,
  "no-card": () => "This character's card isn't available in this room.",
  "no-host": () => "This room has no active host.",
  member: () => "Another person wrote this.",
  unattributed: () => NOT_COVERED,
  "install-scripts": (name) => `${name} uses this server's ${DEFAULT_HTML_STEP_SETTING_LABEL}, which is below Interactive.`,
  "character-scripts": (name) => `${name} isn't set to Interactive.`,
  "viewer-scripts": () => "Your setting for scripts in cards and styled replies is off.",
  "unattributed-scripts": () => NOT_COVERED,
  "install-media": () => "Internet media is blocked on this server.",
  "character-media": (name) => `Internet media is off for ${name}.`,
  "unattributed-media": () => NOT_COVERED,
};

// A control says where it goes, so only a viewer without one is told who can change it.
const ASK_LINES: Record<PlainRemedy, string | undefined> = {
  "character-trust": undefined,
  "system-trust": undefined,
  "ask-host": "Only the room's host can change that.",
  "ask-admin": "Only the server's admin can change that.",
  "own-scripts": undefined,
  "game-settings": undefined,
  none: undefined,
};

const NAME_LIST = new Intl.ListFormat("en", { type: "conjunction" });

function nameOf(characterName: string | undefined): string {
  return characterName === undefined || characterName === "" ? UNNAMED_CHARACTER : characterName;
}

function namesOf(hold: TrustHold): string {
  return hold.characters.length === 0 ? UNNAMED_CHARACTER : NAME_LIST.format(hold.characters.map((character) => nameOf(character.characterName)));
}

// The install default is the admin's; a host who is not an admin can still give their own character a step of its own.
const INSTALL_CAUSES: ReadonlySet<TrustCause> = new Set<TrustCause>(["install", "install-scripts"]);

// One sentence per hold: its cause, then who can change it when this viewer cannot. Two holds with one sentence (a plain
// row's styling and scripts under one step) say it once.
function holdLines(holds: readonly TrustHold[], action: TrustHold | undefined): readonly string[] {
  const lines = holds.map((hold) => {
    const cause = TRUST_CAUSE_LINES[hold.cause](namesOf(hold));
    const ask = ASK_LINES[hold.remedy];
    if (ask !== undefined) {
      return `${cause} ${ask}`;
    }
    return hold === action && hold.remedy === "character-trust" && INSTALL_CAUSES.has(hold.cause) ? `${cause} You can turn it on for ${namesOf(hold)}.` : cause;
  });
  return [...new Set(lines)];
}

// The install setting a "system-trust" control opens: the default step for styling and scripts, the media one for media.
function systemSettingOf(kind: HeldKind): typeof DEFAULT_HTML_STEP_CONFIG_SETTING | typeof FORBID_EXTERNAL_MEDIA_CONFIG_SETTING {
  return kind === "media" ? FORBID_EXTERNAL_MEDIA_CONFIG_SETTING : DEFAULT_HTML_STEP_CONFIG_SETTING;
}

// The one hold's control. A narrator row can be held by several characters at once; lifting it means lifting each, so
// each gets its Trust control.
function holdActions(hold: TrustHold | undefined): readonly PlainNoticeAction[] {
  if (hold === undefined) {
    return [];
  }
  switch (hold.remedy) {
    case "character-trust":
      return hold.characters.map(({ characterId, characterName }) => ({
        key: characterId,
        label: `Open ${nameOf(characterName)}'s Trust settings`,
        onAction: (): void => {
          openCharacterTrust(characterId);
        },
      }));
    case "system-trust":
      return [
        { key: hold.remedy, label: SYSTEM_TRUST_ACTION_LABEL, onAction: (): void => openConfigTo("admin", MEDIA_TRUST_CONFIG_SUB, systemSettingOf(hold.kind)) },
      ];
    case "own-scripts":
      return [
        {
          key: hold.remedy,
          label: OWN_SCRIPTS_ACTION_LABEL,
          onAction: (): void => openConfigTo("chat-behavior", MESSAGE_HANDLING_CONFIG_SUB, RUN_CARD_SCRIPTS_CONFIG_SETTING),
        },
      ];
    case "game-settings":
    case "ask-host":
    case "ask-admin":
    case "none":
      return [];
    default:
      return assertNever(hold.remedy);
  }
}

function assertNever(value: never): never {
  throw new Error(`CharacterTrustNotice: unhandled ${String(value)}`);
}

/** The scope one row's frames report into, so the row's one trust notice reads every frame's grant. */
export function RowTrustScope({ children }: { readonly children: ReactNode }): ReactElement {
  const [frames, setFrames] = useState<ReadonlyMap<string, ReportedFrame>>(() => new Map());
  // One reporter for the row's lifetime, so a frame's report effect never re-runs for the row's own re-render.
  const [trust] = useState<RowTrust>(() => ({
    report: (key, frame): void => {
      setFrames((previous) => {
        if (sameFrame(previous.get(key), frame)) {
          return previous;
        }
        const next = new Map(previous);
        if (frame === undefined) {
          next.delete(key);
        } else {
          next.set(key, frame);
        }
        return next;
      });
    },
  }));
  return (
    <RowTrustReport value={trust}>
      <RowTrustFrames value={[...frames.values()]}>{children}</RowTrustFrames>
    </RowTrustReport>
  );
}

export interface CharacterTrustNoticeProps {
  /** A `tierA` row's subject and what its content asks for beside styling; absent on a framed row. */
  readonly plain?: { readonly subject: PlainSubject; readonly needs: PlainContentNeeds } | undefined;
  /** The row's framed documents, each with its server grant. */
  readonly frames: readonly ReportedFrame[];
}

// The framed holds, once the roster, the auth config and the viewer's settings land. Until then the holder is unknown,
// and naming a guess would send the reader to the wrong setting.
function useFramedHolds(frames: readonly ReportedFrame[], isAdmin: boolean): readonly TrustHold[] {
  const trpc = useTRPC();
  const config = useAuthConfig().data;
  const { data: settings } = useQuery(trpc.settings.getUserSettings.queryOptions());
  const { data: room } = useGatedQuery(frames[0]?.chatId, (id) => roomRosterOptions(trpc, { chatId: id }));
  if (frames.length === 0 || config === undefined || settings === undefined || room === undefined) {
    return [];
  }
  const reads = {
    participants: buildParticipantsById(room.participants),
    narrator: room.narratorRender,
    installForbids: config.forbidExternalMedia,
    viewerRunsScripts: viewerRunsCardScripts(settings),
    viewerIsHost: room.viewerIsHost,
  };
  return frames.flatMap((frame) => resolveFramedHolds(frame, reads, isAdmin));
}

/** A row's one character-trust notice: every kind it holds back and why, and the control that changes the first one
 *  this viewer can change. Nothing when the row holds nothing back. */
export function CharacterTrustNotice({ plain, frames }: CharacterTrustNoticeProps): ReactElement | null {
  const { isAdmin } = useSettingsViewerView();
  const framed = useFramedHolds(frames, isAdmin);
  const holds = mergeTrustHolds([...(plain === undefined ? [] : resolvePlainHolds(plain.subject, plain.needs, isAdmin)), ...framed]);
  if (holds.length === 0) {
    return null;
  }
  const action = actionHold(holds);
  const kinds = [...new Set(holds.map((hold) => hold.kind))];
  const message = [`This shows without ${NAME_LIST.format(kinds.map((kind) => heldKindLabel(kind, holds)))}.`, ...holdLines(holds, action)].join(" ");
  return (
    <PlainNotice
      reason={[...new Set(holds.map((hold) => hold.cause))].join(" ")}
      remedy={action?.remedy ?? holds[0]?.remedy ?? NO_REMEDY}
      held={kinds.join(" ")}
      message={message}
      actions={holdActions(action)}
    />
  );
}

/** Why a styled reply its row's tier would frame shows plain whole. No setting changes it, so it has no control. */
export function PlainReplyNotice({ reason }: { readonly reason: PlainReplyReason }): ReactElement {
  return <PlainNotice reason={reason} remedy={NO_REMEDY} message={PLAIN_REPLY_CAUSE[reason]} />;
}

/** Why a game room's reply shows card markup that the game's card wrap would draw: its immersive HTML switch is off.
 *  The host gets the control that opens the game's settings; a member is told who can turn it on. */
export function HeldCardsNotice({ viewerIsHost }: { readonly viewerIsHost: boolean }): ReactElement {
  const remedy: PlainRemedy = viewerIsHost ? "game-settings" : "ask-host";
  return (
    <PlainNotice
      reason={HELD_CARDS_REASON}
      remedy={remedy}
      message={viewerIsHost ? HELD_CARDS_CAUSE : `${HELD_CARDS_CAUSE} Only the room's host can turn it on.`}
      actions={viewerIsHost ? [{ key: remedy, label: GAME_SETTINGS_ACTION_LABEL, onAction: openGameSettings }] : []}
    />
  );
}
