// The Share card's rows before a share starts: each precondition with its verdict and its fix, then the
// Start button, held with a visible reason while any row blocks it. The server re-checks every row on start.
// The seating confirm stays mounted above its row: the row unmounts once the write lands, and focus moves to Start.

import type { AuthMode } from "@orb/contracts/identity";
import { SETUP_COMMAND } from "@orb/contracts/identity";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { CopyButton } from "@orb/ui/copy-button";
import { Kbd } from "@orb/ui/kbd";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode, RefObject } from "react";
import { useId, useState } from "react";
import { ConfirmDialog } from "#components";
import { SkeletonRows } from "#data";
import { CONTAINER_LOGIN_LINES, CONTAINER_LOGIN_STEP } from "../lib/container-login.ts";
import type { PreconditionRow, ShareStartFailure } from "../lib/share-model.ts";
import { canStartSharing, refusalRow, sharePreconditions } from "../lib/share-model.ts";
import { ShareProse } from "./share-prose.tsx";

/** The launcher command that starts this box in the local sign-in mode with a relay, without writing `.env`. */
const SHARE_COMMAND = "pnpm start --share";

const MODE_NAME: Record<AuthMode, string> = {
  "single-user": "single-user, no sign-in",
  local: "handle and password",
  oidc: "your identity provider",
  "forward-header": "your reverse proxy",
};

const MODE_UNMET: Record<AuthMode, string> = {
  "single-user": "Single-user mode has no sign-in, so this server would refuse every friend who comes through the link.",
  "forward-header":
    "Forward-header mode trusts a proxy on this machine to name the user, and the relay also arrives from this machine, so a visitor could claim any account.",
  local: "",
  oidc: "",
};

const VERDICT_BADGE: Record<PreconditionRow["verdict"], { readonly label: string; readonly intent: "success" | "warning" | "neutral" | "danger" }> = {
  met: { label: "Ready", intent: "success" },
  unmet: { label: "Needs a fix", intent: "warning" },
  waiting: { label: "Waiting", intent: "neutral" },
  unchecked: { label: "Checked on start", intent: "neutral" },
  refused: { label: "Refused", intent: "danger" },
};

const PRECONDITION_LABEL: Record<PreconditionRow["id"], string> = {
  mode: "Sign-in mode",
  owner: "Owner password",
  seating: "Invites and a blank sign-in page",
  relay: "Relay",
};

// The two seating settings, named as their switches above the card name them.
const SEATING_SETTINGS = ["localMultiUser", "discreetLogin"] as const;
type SeatingSetting = (typeof SEATING_SETTINGS)[number];

const SEATING_NAME: Record<SeatingSetting, string> = {
  localMultiUser: "Allow multiple humans",
  discreetLogin: "Discreet login",
};

const SEATING_WHY: Record<SeatingSetting, string> = {
  localMultiUser: "Allow multiple humans lets you seat friends in rooms.",
  discreetLogin: "Discreet login shows a blank sign-in form, so a stranger has to guess the handle as well as the password.",
};

interface SeatingFacts {
  readonly localMultiUser: boolean;
  readonly discreetLogin: boolean;
  readonly onEnableSeating: () => Promise<void>;
}

export interface SharePreconditionsProps extends SeatingFacts {
  /** Undefined until `/api/auth/config` lands; the rows wait for it. */
  readonly mode: AuthMode | undefined;
  readonly failure: ShareStartFailure | null;
  readonly onStart: () => void;
  readonly starting: boolean;
  /** The Start button, which the card and the seating confirm send focus to. */
  readonly startRef: RefObject<HTMLButtonElement | null>;
}

/** The rows and the Start button; the rows wait for the sign-in mode. */
export function SharePreconditions({ mode, ...rest }: SharePreconditionsProps): ReactElement {
  if (mode === undefined) {
    return <SkeletonRows count={4} />;
  }
  return <PreconditionList mode={mode} {...rest} />;
}

function PreconditionList({
  mode,
  failure,
  onStart,
  starting,
  startRef,
  localMultiUser,
  discreetLogin,
  onEnableSeating,
}: SharePreconditionsProps & { readonly mode: AuthMode }): ReactElement {
  const blockedId = useId();
  // The confirm keeps the settings it was opened for: the write empties `off` while the dialog is still closing.
  const [seatingAsk, setSeatingAsk] = useState<{ readonly open: boolean; readonly settings: readonly SeatingSetting[] }>({ open: false, settings: [] });
  const rows = sharePreconditions({ mode, localMultiUser, discreetLogin, refusal: failure?.code ?? null });
  const ready = canStartSharing(rows);
  const seating: Record<SeatingSetting, boolean> = { localMultiUser, discreetLogin };
  const off = SEATING_SETTINGS.filter((setting) => !seating[setting]);
  return (
    <Stack gap="field">
      <Stack gap="field" role="list" aria-label="Before you share">
        {rows.map((row) => (
          <PreconditionItem
            key={row.id}
            row={row}
            mode={mode}
            failure={failure !== null && refusalRow(failure.code) === row.id ? failure : null}
            seatingOff={off}
            onFixSeating={(): void => setSeatingAsk({ open: true, settings: off })}
          />
        ))}
      </Stack>
      <Stack gap="tight">
        <Row gap="field" align="center" className="flex-wrap">
          <Button
            ref={startRef}
            type="button"
            intent="primary"
            size="sm"
            disabled={!ready}
            focusableWhenDisabled={true}
            aria-describedby={ready ? undefined : blockedId}
            loading={starting}
            onClick={onStart}
          >
            Start sharing
          </Button>
        </Row>
        {ready ? null : <ShareProse id={blockedId}>Fix every row marked Needs a fix first; a waiting row clears when the row above it does.</ShareProse>}
      </Stack>
      <ConfirmDialog
        open={seatingAsk.open}
        onOpenChange={(open): void => setSeatingAsk({ open, settings: seatingAsk.settings })}
        title={`Turn on ${seatingNames(seatingAsk.settings)}?`}
        description={`${seatingReasons(seatingAsk.settings)} ${seatingAsk.settings.length === 1 ? "It stays" : "Both stay"} on after sharing stops.`}
        confirmLabel={seatingActionLabel(seatingAsk.settings)}
        confirmIntent="primary"
        onConfirm={onEnableSeating}
        finalFocus={startRef}
      />
    </Stack>
  );
}

function seatingNames(off: readonly SeatingSetting[]): string {
  return off.map((setting) => SEATING_NAME[setting]).join(" and ");
}

function seatingReasons(off: readonly SeatingSetting[]): string {
  return off.map((setting) => SEATING_WHY[setting]).join(" ");
}

/** "Turn both on" only when both are off; one setting is named. */
function seatingActionLabel(off: readonly SeatingSetting[]): string {
  const [only] = off;
  return off.length === 1 && only !== undefined ? `Turn on ${SEATING_NAME[only]}` : "Turn both on";
}

interface PreconditionItemProps {
  readonly row: PreconditionRow;
  readonly mode: AuthMode;
  readonly failure: ShareStartFailure | null;
  readonly seatingOff: readonly SeatingSetting[];
  readonly onFixSeating: () => void;
}

function PreconditionItem({ row, mode, failure, seatingOff, onFixSeating }: PreconditionItemProps): ReactElement {
  const badge = VERDICT_BADGE[row.verdict];
  return (
    <Stack gap="tight" role="listitem" data-precondition={row.id} data-verdict={row.verdict}>
      <Row gap="field" align="center" className="flex-wrap">
        <Text voice="label">{PRECONDITION_LABEL[row.id]}</Text>
        <Badge intent={badge.intent}>{badge.label}</Badge>
      </Row>
      {/* The server's refusal names its own fix, so it replaces the row's standing detail; `alert` because it lands
          after the press while the status line above still reads Not sharing. */}
      {failure === null ? (
        <PreconditionDetail row={row} mode={mode} seatingOff={seatingOff} onFixSeating={onFixSeating} />
      ) : (
        <ShareProse role="alert">{`Sharing was refused. ${failure.message}`}</ShareProse>
      )}
    </Stack>
  );
}

function PreconditionDetail({ row, mode, seatingOff, onFixSeating }: Omit<PreconditionItemProps, "failure">): ReactNode {
  const id: PreconditionRow["id"] = row.id;
  switch (id) {
    case "mode":
      return row.verdict === "met" ? <ShareProse>Visitors sign in through {MODE_NAME[mode]}.</ShareProse> : <ModeFix mode={mode} />;
    case "owner":
      return <ShareProse>{ownerSentence(row.verdict, mode)}</ShareProse>;
    case "seating":
      return row.verdict === "met" ? (
        <ShareProse>
          {mode === "oidc"
            ? "Your identity provider signs friends in, and this mode can seat them in rooms."
            : "Friends can be seated in rooms, and the sign-in page names no account."}
        </ShareProse>
      ) : (
        <SeatingFix off={seatingOff} onFix={onFixSeating} />
      );
    case "relay":
      return <ShareProse>The first share downloads the relay program and runs it only if it matches its pinned checksum.</ShareProse>;
    default: {
      const exhaustive: never = id;
      return exhaustive;
    }
  }
}

function ownerSentence(verdict: PreconditionRow["verdict"], mode: AuthMode): string {
  if (verdict === "waiting") {
    return "After the switch to the local mode, this browser opens the setup screen, where you set the owner password before anything is shared.";
  }
  return mode === "oidc"
    ? "Your identity provider holds every password, so there is no owner password to set."
    : "You signed in with it, so no stranger can claim this server through the link.";
}

function ModeFix({ mode }: { readonly mode: AuthMode }): ReactElement {
  return (
    <Stack gap="tight">
      <ShareProse>{MODE_UNMET[mode]}</ShareProse>
      <ShareProse>
        {`To share, stop the server and start it with ${SHARE_COMMAND}. It uses the local sign-in mode for that run only and starts the relay; .env is not changed. ${SETUP_COMMAND}, under Who can sign in, changes the mode for every run instead.`}
      </ShareProse>
      <CopyButton text={SHARE_COMMAND} what={`the command ${SHARE_COMMAND}`}>
        <Kbd size="command">{SHARE_COMMAND}</Kbd>
      </CopyButton>
      <ShareProse>
        {`${CONTAINER_LOGIN_STEP}, then run docker compose up -d. This card cannot start a relay inside a container yet; to share a container now, run a Cloudflare tunnel beside it (docker/README.md, "Cloudflare Tunnel, as a sidecar").`}
      </ShareProse>
      <CopyButton text={CONTAINER_LOGIN_LINES} what="the docker-compose environment lines" />
    </Stack>
  );
}

function SeatingFix({ off, onFix }: { readonly off: readonly SeatingSetting[]; readonly onFix: () => void }): ReactElement {
  return (
    <Stack gap="tight">
      <ShareProse>{`Off now: ${seatingNames(off)}. ${seatingReasons(off)}`}</ShareProse>
      <Row gap="field" align="center" className="flex-wrap">
        <Button type="button" intent="secondary" size="sm" onClick={onFix}>
          {seatingActionLabel(off)}
        </Button>
      </Row>
    </Stack>
  );
}
