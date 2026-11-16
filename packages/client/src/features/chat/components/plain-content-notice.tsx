// The chat half of the plain-content notice: the copy and the control for the verdicts `render-trust.ts` resolves. Only
// those verdicts decide which setting is named and whether the viewer gets a control; this file hands them the roster's
// policy and never judges it. A row shows one plain-content notice, however many plain cards and styled runs it holds.
// A framed card or styled reply whose external media the frame refuses shows its own framed-media notice under it.

import type { CharacterId, ChatId } from "@orb/kit/ids";
import type { PlainNoticeAction } from "@orb/ui/immersive-card";
import { PlainNotice } from "@orb/ui/immersive-card";
import { holdsExternalMedia } from "@orb/ui/sandbox-frame";
import type { ReactElement } from "react";
import { roomRosterOptions, useAuthConfig, useGatedQuery, useSettingsViewerView, useTRPC } from "#data";
import type { FramedMediaReason, PlainReason, PlainRemedy, PlainReplyReason, PlainSubject } from "#lib";
import { PLAIN_REPLY_REASON, resolveFramedMediaVerdict, resolvePlainVerdict } from "#lib";
import { FORBID_EXTERNAL_MEDIA_CONFIG_SETTING, MEDIA_TRUST_CONFIG_SUB, openCharacterTrust, openConfigTo, TRUST_HTML_CONFIG_SETTING } from "#state";
import { buildParticipantsById } from "../lib/roster.ts";

const UNNAMED_CHARACTER = "this character";
const PLAIN_REPLY_CAUSE: Record<PlainReplyReason, string> = {
  [PLAIN_REPLY_REASON.carriedStylesOverBudget]: "This reply carries more styling than its frame may hold, so it shows as plain.",
};
const NO_REMEDY: PlainRemedy = "none";
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
  none: undefined,
};

function causeLine(reason: PlainReason, name: string): string {
  switch (reason) {
    case "character":
      return `Rich HTML is off for ${name}, so this shows as plain.`;
    case "install":
      return "Rich HTML is off by default on this server, so this shows as plain.";
    case "no-card":
      return "This character's card isn't available in this room, and rich HTML is off by default on this server, so this shows as plain.";
    case "no-host":
      return "This room has no active host, and rich HTML is off by default on this server, so this shows as plain.";
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

// The install setting a "system-trust" control opens: the rich-HTML one for a plain row, the media one for framed media.
type SystemSetting = typeof TRUST_HTML_CONFIG_SETTING | typeof FORBID_EXTERNAL_MEDIA_CONFIG_SETTING;

function remedyAction(
  remedy: PlainRemedy,
  characterId: CharacterId | null,
  name: string,
  systemSetting: SystemSetting = TRUST_HTML_CONFIG_SETTING,
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
  /** The markup and stylesheet the frame document is built from. */
  readonly html: string;
  readonly css: string | undefined;
}

/** Why a framed card or styled reply shows without its external images and media, and, when the viewer may change it,
 *  the control that opens the setting. Nothing when the row's policy loads external media or the markup names none. */
export function FramedMediaNotice({ chatId, characterId, html, css }: FramedMediaNoticeProps): ReactElement | null {
  const trpc = useTRPC();
  const { isAdmin } = useSettingsViewerView();
  const config = useAuthConfig().data;
  const { data: room } = useGatedQuery(chatId, (id) => roomRosterOptions(trpc, { chatId: id }));
  // Until both reads land the binding setting is unknown, and naming a guess would send the reader to the wrong one.
  if (config === undefined || room === undefined) {
    return null;
  }
  const verdict = resolveFramedMediaVerdict(
    {
      characterId,
      participants: buildParticipantsById(room.participants),
      narrator: room.narratorRender,
      installForbids: config.forbidExternalMedia,
      viewerIsHost: room.viewerIsHost,
    },
    isAdmin,
  );
  if (verdict === undefined || !holdsExternalMedia(html, css)) {
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
