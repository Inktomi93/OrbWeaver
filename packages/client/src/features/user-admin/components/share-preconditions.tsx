// The Share card's rows before a share starts: each precondition with its verdict and its fix, then the
// Start button, held with a visible reason while any row blocks it. The server re-checks every row on start.

import type { AuthMode } from "@orb/contracts/identity";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { CopyButton } from "@orb/ui/copy-button";
import { Kbd } from "@orb/ui/kbd";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { useId } from "react";
import { ConfirmDialog } from "#components";
import { SkeletonRows } from "#data";
import type { PreconditionRow, ShareStartFailure } from "../lib/share-model.ts";
import { canStartSharing, refusalRow, sharePreconditions } from "../lib/share-model.ts";

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

interface SeatingFacts {
  readonly mode: AuthMode;
  readonly localMultiUser: boolean;
  readonly discreetLogin: boolean;
  readonly onEnableSeating: () => Promise<void>;
}

export interface SharePreconditionsProps extends Omit<SeatingFacts, "mode"> {
  /** Undefined until `/api/auth/config` lands; the rows wait for it. */
  readonly mode: AuthMode | undefined;
  readonly failure: ShareStartFailure | null;
  readonly onStart: () => void;
  readonly starting: boolean;
}

/** The rows and the Start button; the rows wait for the sign-in mode. */
export function SharePreconditions({ mode, failure, onStart, starting, ...seating }: SharePreconditionsProps): ReactElement {
  if (mode === undefined) {
    return <SkeletonRows count={4} />;
  }
  const rows = sharePreconditions({ mode, localMultiUser: seating.localMultiUser, discreetLogin: seating.discreetLogin, refusal: failure?.code ?? null });
  return <PreconditionList rows={rows} mode={mode} failure={failure} onStart={onStart} starting={starting} {...seating} />;
}

interface PreconditionListProps extends SeatingFacts {
  readonly rows: readonly PreconditionRow[];
  readonly failure: ShareStartFailure | null;
  readonly onStart: () => void;
  readonly starting: boolean;
}

function PreconditionList({ rows, failure, onStart, starting, ...facts }: PreconditionListProps): ReactElement {
  const blockedId = useId();
  const ready = canStartSharing(rows);
  return (
    <Stack gap="field">
      <Stack gap="field" role="list" aria-label="Before you share">
        {rows.map((row) => (
          <PreconditionItem key={row.id} row={row} failure={failure !== null && refusalRow(failure.code) === row.id ? failure : null} {...facts} />
        ))}
      </Stack>
      <Stack gap="tight">
        <Row gap="field" align="center" className="flex-wrap">
          <Button
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
        {ready ? null : (
          <Text voice="gloss" id={blockedId}>
            Fix every row marked Needs a fix first; a waiting row clears when the row above it does.
          </Text>
        )}
      </Stack>
    </Stack>
  );
}

interface PreconditionItemProps extends SeatingFacts {
  readonly row: PreconditionRow;
  readonly failure: ShareStartFailure | null;
}

function PreconditionItem({ row, failure, ...facts }: PreconditionItemProps): ReactElement {
  const badge = VERDICT_BADGE[row.verdict];
  return (
    <Stack gap="tight" role="listitem" data-precondition={row.id} data-verdict={row.verdict}>
      <Row gap="field" align="center" className="flex-wrap">
        <Text voice="label">{PRECONDITION_LABEL[row.id]}</Text>
        <Badge intent={badge.intent}>{badge.label}</Badge>
      </Row>
      {failure === null ? null : <Text voice="gloss">{failure.message}</Text>}
      <PreconditionDetail row={row} {...facts} />
    </Stack>
  );
}

function PreconditionDetail({ row, mode, localMultiUser, discreetLogin, onEnableSeating }: Omit<PreconditionItemProps, "failure">): ReactNode {
  const id: PreconditionRow["id"] = row.id;
  switch (id) {
    case "mode":
      return row.verdict === "met" ? <Text voice="gloss">Visitors sign in through {MODE_NAME[mode]}.</Text> : <ModeFix mode={mode} />;
    case "owner":
      return <Text voice="gloss">{ownerSentence(row.verdict, mode)}</Text>;
    case "seating":
      return row.verdict === "met" ? (
        <Text voice="gloss">
          {mode === "oidc"
            ? "Your identity provider signs friends in, and this mode can seat them in rooms."
            : "Friends can be seated in rooms, and the sign-in page names no account."}
        </Text>
      ) : (
        <SeatingFix localMultiUser={localMultiUser} discreetLogin={discreetLogin} onEnableSeating={onEnableSeating} />
      );
    case "relay":
      return row.verdict === "refused" ? null : (
        <Text voice="gloss">The first share downloads the relay program and runs it only if it matches its pinned checksum.</Text>
      );
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
  if (verdict === "refused") {
    return "Sign out, then open this server on this machine; the sign-in page asks for the owner password first.";
  }
  return mode === "oidc"
    ? "Your identity provider holds every password, so there is no owner password to set."
    : "You signed in with it, so no stranger can claim this server through the link.";
}

function ModeFix({ mode }: { readonly mode: AuthMode }): ReactElement {
  return (
    <Stack gap="tight">
      <Text voice="gloss">{MODE_UNMET[mode]}</Text>
      <Text voice="gloss">
        Stop the server and start it with this command. It uses the local sign-in mode for that run and starts the relay; .env is not changed.
      </Text>
      <CopyButton text={SHARE_COMMAND} what={`the command ${SHARE_COMMAND}`}>
        <Kbd size="command">{SHARE_COMMAND}</Kbd>
      </CopyButton>
      <Text voice="gloss">In Docker, set AUTH_MODE=local in docker/orbweaver.local.env and run docker compose up -d.</Text>
    </Stack>
  );
}

interface SeatingFixProps {
  readonly localMultiUser: boolean;
  readonly discreetLogin: boolean;
  readonly onEnableSeating: () => Promise<void>;
}

function SeatingFix({ localMultiUser, discreetLogin, onEnableSeating }: SeatingFixProps): ReactElement {
  const off = [localMultiUser ? null : "Allow multiple humans", discreetLogin ? null : "Discreet login"].filter((name) => name !== null);
  return (
    <Stack gap="tight">
      <Text voice="gloss">{`Off now: ${off.join(" and ")}. Invites need the first; the second keeps the sign-in page from showing the owner's handle.`}</Text>
      <Row gap="field" align="center" className="flex-wrap">
        <ConfirmDialog
          title="Turn on invites and discreet login?"
          description="Allow multiple humans lets you seat friends in rooms. Discreet login shows a blank sign-in form, so a stranger has to guess the handle as well as the password. Both stay on after sharing stops."
          confirmLabel="Turn both on"
          confirmIntent="primary"
          onConfirm={onEnableSeating}
          trigger={
            <Button type="button" intent="secondary" size="sm">
              Turn both on
            </Button>
          }
        />
      </Row>
    </Stack>
  );
}
