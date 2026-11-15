// The chat half of the plain-content notice: the copy and the control for the verdict `render-trust.ts` resolves. Only
// that verdict decides which setting is named and whether the viewer gets a control; this file never reads a policy. It
// renders nothing until the install's render policy is read, rather than blaming a switch nobody read.

import type { CharacterId } from "@orb/kit/ids";
import type { PlainNoticeAction } from "@orb/ui/immersive-card";
import { PlainNotice } from "@orb/ui/immersive-card";
import type { ReactElement } from "react";
import type { PlainReason, PlainRemedy, PlainSubject } from "#lib";
import { resolvePlainVerdict } from "#lib";
import { MEDIA_TRUST_CONFIG_SUB, openCharacterTrust, openConfigTo, TRUST_HTML_CONFIG_SETTING } from "#state";
import { useRenderStanding } from "../hooks/use-render-standing.ts";

const UNNAMED_CHARACTER = "this character";

function causeLine(reason: PlainReason, name: string): string {
  switch (reason) {
    case "character":
      return `Rich HTML is off for ${name}, so this shows as plain.`;
    case "install":
      return "Rich HTML is off by default on this server, so this shows as plain.";
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
    default:
      return assertNever(remedy);
  }
}

function remedyAction(remedy: PlainRemedy, characterId: CharacterId | null, name: string): PlainNoticeAction | undefined {
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
          openConfigTo("admin", MEDIA_TRUST_CONFIG_SUB, TRUST_HTML_CONFIG_SETTING);
        },
      };
    case "ask-host":
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
export function PlainContentNotice({ subject, placement }: { readonly subject: PlainSubject; readonly placement: "card" | "reply" }): ReactElement | null {
  const standing = useRenderStanding();
  if (standing === undefined) {
    return null;
  }
  const verdict = resolvePlainVerdict(subject, standing);
  const name = verdict.characterName === undefined || verdict.characterName === "" ? UNNAMED_CHARACTER : verdict.characterName;
  const remedy = remedyLine(verdict.remedy, verdict.reason, name);
  const message = remedy === undefined ? causeLine(verdict.reason, name) : `${causeLine(verdict.reason, name)} ${remedy}`;
  return (
    <PlainNotice
      reason={verdict.reason}
      remedy={verdict.remedy}
      message={message}
      action={remedyAction(verdict.remedy, verdict.characterId, name)}
      placement={placement}
    />
  );
}
