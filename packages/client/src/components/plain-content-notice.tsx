// The plain-content notices: the copy and the control for the verdicts `render-trust.ts` resolves. Only those verdicts
// decide which setting is named and whether the viewer gets a control; this file hands them the roster's policy and
// never judges it. A row shows one plain-content notice, however many plain cards and styled runs it holds. A framed
// card or styled reply whose external media the frame refuses shows its own framed-media notice under it, and one whose
// controls need scripts the frame's posture does not run shows its framed-script notice. The chat transcript and the
// game's card archive both draw authored markup, so both mount these from this one home.

import { installAllowsCardScripts } from "@orb/contracts/chat";
import { viewerRunsCardScripts } from "@orb/contracts/settings";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import type { PlainNoticeAction } from "@orb/ui/immersive-card";
import { PlainNotice } from "@orb/ui/immersive-card";
import { holdsExternalMedia, holdsScript } from "@orb/ui/sandbox-frame";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { roomRosterOptions, useAuthConfig, useGatedQuery, useSettingsViewerView, useTRPC } from "#data";
import type { FramedMediaReason, FramedScriptReason, PlainReason, PlainRemedy, PlainReplyReason, PlainSubject } from "#lib";
import {
  buildParticipantsById,
  DEFAULT_HTML_STEP_SETTING_LABEL,
  HELD_CARDS_REASON,
  PLAIN_REPLY_REASON,
  resolveFramedMediaVerdict,
  resolveFramedScriptVerdict,
  resolvePlainVerdict,
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

const UNNAMED_CHARACTER = "this character";
const NO_AUTHORS: readonly CharacterId[] = [];
const PLAIN_REPLY_CAUSE: Record<PlainReplyReason, string> = {
  [PLAIN_REPLY_REASON.carriedStylesOverBudget]: "This reply carries more styling than its frame may hold, so it shows as plain.",
  [PLAIN_REPLY_REASON.frameUnavailable]: "This reply's frame could not be drawn, so it shows as plain.",
};
const NO_REMEDY: PlainRemedy = "none";
const OWN_SCRIPTS_ACTION_LABEL = "Open your card script setting";
const ASK_HOST_LINE = "Only the room's host can turn it on.";
const ASK_ADMIN_LINE = "Only the server's admin can turn it on.";
const FRAMED_MEDIA_CAUSE: Record<FramedMediaReason, (name: string) => string> = {
  "install-media": () => "External images and media are blocked on this server, so this shows without them.",
  "character-media": (name) => `External images and media are blocked for ${name}, so this shows without them.`,
  "unattributed-media": () => "No character's settings cover this message, so its external images and media stay blocked.",
};
// A control says where it goes, so only a viewer without one is told who can turn it on.
const FRAMED_MEDIA_REMEDY_LINE: Record<PlainRemedy, string | undefined> = {
  "character-trust": undefined,
  "system-trust": undefined,
  "ask-host": ASK_HOST_LINE,
  "ask-admin": ASK_ADMIN_LINE,
  "own-scripts": undefined,
  "game-settings": undefined,
  none: undefined,
};
const HELD_CARDS_CAUSE = "This reply holds HTML the game would draw as a card, and immersive HTML cards are off in this game, so it is not drawn as one.";
const GAME_SETTINGS_ACTION_LABEL = "Open the game's settings";
const FRAMED_SCRIPT_CAUSE: Record<FramedScriptReason, (name: string) => string> = {
  "install-scripts": () => `This server's ${DEFAULT_HTML_STEP_SETTING_LABEL} is below Interactive, so the controls here do nothing.`,
  "character-scripts": (name) => `${name} isn't set to Interactive, so the controls here do nothing.`,
  "viewer-scripts": () => "Your setting for scripts in cards and styled replies is off, so the controls here do nothing.",
  "unattributed-scripts": () => "No character's settings cover this message, so its controls do nothing.",
};

function causeLine(reason: PlainReason, name: string): string {
  switch (reason) {
    case "character":
      return `Rich HTML is off for ${name}, so this shows as plain.`;
    case "install":
      return `${name} uses this server's ${DEFAULT_HTML_STEP_SETTING_LABEL}, which is Plain text, so this shows as plain.`;
    case "no-card":
      return "This character's card isn't available in this room, so this shows as plain.";
    case "no-host":
      return "This room has no active host, so this shows as plain.";
    case "member":
      return "Another person wrote this, so it shows as plain.";
    case "unattributed":
      return "No character's settings cover this message, so it shows as plain.";
    default:
      return assertNever(reason);
  }
}

function remedyLine(remedy: PlainRemedy, reason: PlainReason, name: string): string | undefined {
  switch (remedy) {
    case "character-trust":
      return reason === "install" ? `You can turn it on for ${name}.` : undefined;
    case "system-trust":
    case "own-scripts":
    case "game-settings":
    case "none":
      return undefined;
    case "ask-host":
      return ASK_HOST_LINE;
    case "ask-admin":
      return ASK_ADMIN_LINE;
    default:
      return assertNever(remedy);
  }
}

// The install setting a "system-trust" control opens: the default step for a plain row or framed scripts, the media one
// for framed media.
type SystemSetting = typeof DEFAULT_HTML_STEP_CONFIG_SETTING | typeof FORBID_EXTERNAL_MEDIA_CONFIG_SETTING;

function remedyAction(
  remedy: PlainRemedy,
  characterId: CharacterId | null,
  name: string,
  systemSetting: SystemSetting = DEFAULT_HTML_STEP_CONFIG_SETTING,
): PlainNoticeAction | undefined {
  switch (remedy) {
    case "character-trust":
      return characterId === null
        ? undefined
        : {
            label: `Open ${name}'s Trust settings`,
            onAction: (): void => {
              openCharacterTrust(characterId);
            },
          };
    case "system-trust":
      return {
        label: "Open media and trust settings",
        onAction: (): void => {
          openConfigTo("admin", MEDIA_TRUST_CONFIG_SUB, systemSetting);
        },
      };
    case "own-scripts":
      return {
        label: OWN_SCRIPTS_ACTION_LABEL,
        onAction: (): void => {
          openConfigTo("chat-behavior", MESSAGE_HANDLING_CONFIG_SUB, RUN_CARD_SCRIPTS_CONFIG_SETTING);
        },
      };
    case "game-settings":
      return {
        label: GAME_SETTINGS_ACTION_LABEL,
        onAction: (): void => {
          openGameSettings();
        },
      };
    case "ask-host":
    case "ask-admin":
    case "none":
      return undefined;
    default:
      return assertNever(remedy);
  }
}

function assertNever(value: never): never {
  throw new Error(`PlainContentNotice: unhandled ${String(value)}`);
}

/** Why this row's rich content is plain and, when the viewer may change it, the control that opens the setting. */
export function PlainContentNotice({ subject }: { readonly subject: PlainSubject }): ReactElement {
  const { isAdmin } = useSettingsViewerView();
  const verdict = resolvePlainVerdict(subject, isAdmin);
  const name = verdict.characterName === undefined || verdict.characterName === "" ? UNNAMED_CHARACTER : verdict.characterName;
  const remedy = remedyLine(verdict.remedy, verdict.reason, name);
  const message = remedy === undefined ? causeLine(verdict.reason, name) : `${causeLine(verdict.reason, name)} ${remedy}`;
  return <PlainNotice reason={verdict.reason} remedy={verdict.remedy} message={message} action={remedyAction(verdict.remedy, verdict.characterId, name)} />;
}

export interface FramedMediaNoticeProps {
  /** The room the frame mints under; absent ⇒ no roster, so no setting to name and no notice. */
  readonly chatId: ChatId | undefined;
  readonly characterId: CharacterId | null;
  /** The other characters whose stylesheets the frame carries (the mint's `carriedFrom`); each one's media setting
   *  also holds the frame's external media. */
  readonly carriedFrom?: readonly CharacterId[] | undefined;
  /** The markup and stylesheet the frame document is built from. */
  readonly html: string;
  readonly css: string | undefined;
  /** What the server granted this document (the mint's `granted`): whether it loads external media is this, never a
   *  guess from the roster; the roster only names who holds it out. */
  readonly granted: { readonly externalMedia: boolean; readonly interactive: boolean };
}

/** Why a framed card or styled reply shows without its external images and media, and, when the viewer may change it,
 *  the control that opens the setting. Nothing when the document loads external media or the markup names none. */
export function FramedMediaNotice({ chatId, characterId, carriedFrom = NO_AUTHORS, html, css, granted }: FramedMediaNoticeProps): ReactElement | null {
  const trpc = useTRPC();
  const { isAdmin } = useSettingsViewerView();
  const config = useAuthConfig().data;
  const { data: room } = useGatedQuery(chatId, (id) => roomRosterOptions(trpc, { chatId: id }));
  // Until both reads land the binding setting is unknown, and naming a guess would send the reader to the wrong one.
  if (config === undefined || room === undefined) {
    return null;
  }
  const participants = buildParticipantsById(room.participants);
  // The frame's own author first, then each author whose stylesheet it carries: the first that withholds is named.
  const verdict = [characterId, ...carriedFrom]
    .map((author) =>
      resolveFramedMediaVerdict(
        { characterId: author, participants, narrator: room.narratorRender, installForbids: config.forbidExternalMedia, viewerIsHost: room.viewerIsHost },
        isAdmin,
      ),
    )
    .find((found) => found !== undefined);
  if (granted.externalMedia || verdict === undefined || !holdsExternalMedia(html, css)) {
    return null;
  }
  const name = verdict.characterName === undefined || verdict.characterName === "" ? UNNAMED_CHARACTER : verdict.characterName;
  const cause = FRAMED_MEDIA_CAUSE[verdict.reason](name);
  const remedy = FRAMED_MEDIA_REMEDY_LINE[verdict.remedy];
  return (
    <PlainNotice
      reason={verdict.reason}
      remedy={verdict.remedy}
      message={remedy === undefined ? cause : `${cause} ${remedy}`}
      action={remedyAction(verdict.remedy, verdict.characterId, name, FORBID_EXTERNAL_MEDIA_CONFIG_SETTING)}
    />
  );
}

/** Why a styled reply its row's tier would frame shows plain whole. No setting changes it, so it has no control. */
export function PlainReplyNotice({ reason }: { readonly reason: PlainReplyReason }): ReactElement {
  return <PlainNotice reason={reason} remedy={NO_REMEDY} message={PLAIN_REPLY_CAUSE[reason]} />;
}

/** Why a framed card's or styled reply's controls do nothing when its markup needs scripts the frame's posture does not
 *  run, and, when the viewer may change it, the control that opens the setting. Nothing when the document runs scripts
 *  or the markup needs none. */
export function FramedScriptNotice({ chatId, characterId, html, granted }: Omit<FramedMediaNoticeProps, "css">): ReactElement | null {
  const trpc = useTRPC();
  const { isAdmin } = useSettingsViewerView();
  const config = useAuthConfig().data;
  const { data: settings } = useQuery(trpc.settings.getUserSettings.queryOptions());
  const { data: room } = useGatedQuery(chatId, (id) => roomRosterOptions(trpc, { chatId: id }));
  // Until every read lands the binding consent is unknown, and naming a guess would send the reader to the wrong one.
  if (config === undefined || settings === undefined || room === undefined) {
    return null;
  }
  const verdict = resolveFramedScriptVerdict(
    {
      characterId,
      participants: buildParticipantsById(room.participants),
      narrator: room.narratorRender,
      installAllowsScripts: installAllowsCardScripts(config),
      viewerRunsScripts: viewerRunsCardScripts(settings),
      viewerIsHost: room.viewerIsHost,
    },
    isAdmin,
  );
  if (granted.interactive || verdict === undefined || !holdsScript(html)) {
    return null;
  }
  const name = verdict.characterName === undefined || verdict.characterName === "" ? UNNAMED_CHARACTER : verdict.characterName;
  const cause = FRAMED_SCRIPT_CAUSE[verdict.reason](name);
  const remedy = FRAMED_MEDIA_REMEDY_LINE[verdict.remedy];
  return (
    <PlainNotice
      reason={verdict.reason}
      remedy={verdict.remedy}
      message={remedy === undefined ? cause : `${cause} ${remedy}`}
      action={remedyAction(verdict.remedy, verdict.characterId, name)}
    />
  );
}

/** Why a game room's reply shows card markup that the game's card wrap would draw: its immersive HTML switch is off.
 *  The host gets the control that opens the game's settings; a member is told who can turn it on. */
export function HeldCardsNotice({ viewerIsHost }: { readonly viewerIsHost: boolean }): ReactElement {
  const remedy: PlainRemedy = viewerIsHost ? "game-settings" : "ask-host";
  const line = FRAMED_MEDIA_REMEDY_LINE[remedy];
  return (
    <PlainNotice
      reason={HELD_CARDS_REASON}
      remedy={remedy}
      message={line === undefined ? HELD_CARDS_CAUSE : `${HELD_CARDS_CAUSE} ${line}`}
      action={remedyAction(remedy, null, UNNAMED_CHARACTER)}
    />
  );
}
