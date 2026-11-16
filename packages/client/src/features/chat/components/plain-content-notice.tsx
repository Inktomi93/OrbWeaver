// The chat half of the plain-content notice: the copy and the control for the verdict `render-trust.ts` resolves. Only
// that verdict decides which setting is named and whether the viewer gets a control; this file never reads a policy.
// A row shows one notice, however many plain cards and styled runs it holds.

import type { CharacterId } from "@orb/kit/ids";
import type { PlainNoticeAction } from "@orb/ui/immersive-card";
import { PlainNotice } from "@orb/ui/immersive-card";
import type { ReactElement } from "react";
import { useSettingsViewerView } from "#data";
import type { PlainReason, PlainRemedy, PlainReplyReason, PlainSubject } from "#lib";
import { PLAIN_REPLY_REASON, resolvePlainVerdict } from "#lib";
import { MEDIA_TRUST_CONFIG_SUB, openCharacterTrust, openConfigTo, TRUST_HTML_CONFIG_SETTING } from "#state";

const UNNAMED_CHARACTER = "this character";
const PLAIN_REPLY_CAUSE: Record<PlainReplyReason, string> = {
  [PLAIN_REPLY_REASON.carriedStylesOverBudget]: "This reply carries more styling than its frame may hold, so it shows as plain.",
};
const NO_REMEDY: PlainRemedy = "none";

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
      return "Only the room's host can turn it on.";
    case "ask-admin":
      return "Only the server's admin can turn it on.";
    default:
      return assertNever(remedy);
  }
}

// A narrator row can be held by several characters at once; lifting it means lifting each, so each gets its control.
function remedyActions(remedy: PlainRemedy, characters: readonly NamedCharacter[]): readonly PlainNoticeAction[] {
  switch (remedy) {
    case "character-trust":
      return characters.map(({ characterId, name }) => ({
        key: characterId,
        label: `Open ${name}'s Trust settings`,
        onAction: (): void => {
          openCharacterTrust(characterId);
        },
      }));
    case "system-trust":
      return [
        {
          key: remedy,
          label: "Open media and trust settings",
          onAction: (): void => {
            openConfigTo("admin", MEDIA_TRUST_CONFIG_SUB, TRUST_HTML_CONFIG_SETTING);
          },
        },
      ];
    case "ask-host":
    case "ask-admin":
    case "none":
      return [];
    default:
      return assertNever(remedy);
  }
}

interface NamedCharacter {
  readonly characterId: CharacterId;
  readonly name: string;
}

const NAME_LIST = new Intl.ListFormat("en", { type: "conjunction" });

function joinNames(names: readonly string[]): string {
  return names.length === 0 ? UNNAMED_CHARACTER : NAME_LIST.format(names);
}

function assertNever(value: never): never {
  throw new Error(`PlainContentNotice: unhandled ${String(value)}`);
}

/** Why this row's rich content is plain and, when the viewer may change it, the control that opens the setting. */
export function PlainContentNotice({ subject }: { readonly subject: PlainSubject }): ReactElement {
  const { isAdmin } = useSettingsViewerView();
  const verdict = resolvePlainVerdict(subject, isAdmin);
  const characters = verdict.characters.map(({ characterId, characterName }) => ({
    characterId,
    name: characterName === undefined || characterName === "" ? UNNAMED_CHARACTER : characterName,
  }));
  const name = joinNames(characters.map((character) => character.name));
  const remedy = remedyLine(verdict.remedy, verdict.reason, name);
  const message = remedy === undefined ? causeLine(verdict.reason, name) : `${causeLine(verdict.reason, name)} ${remedy}`;
  return <PlainNotice reason={verdict.reason} remedy={verdict.remedy} message={message} actions={remedyActions(verdict.remedy, characters)} />;
}

/** Why a styled reply its row's tier would frame shows plain whole. No setting changes it, so it has no control. */
export function PlainReplyNotice({ reason }: { readonly reason: PlainReplyReason }): ReactElement {
  return <PlainNotice reason={reason} remedy={NO_REMEDY} message={PLAIN_REPLY_CAUSE[reason]} />;
}
