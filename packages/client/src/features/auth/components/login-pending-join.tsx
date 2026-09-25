// D254 — the OIDC pending join: the callback held a JIT-closed identity that arrived with a signup invite and
// landed here. The preview names the room, the joiner names their persona, and the confirm posts only that
// persona, because the pending cookie alone names the join. Plain state (a submit-once confirm, the
// credential-form carve-out).

import type { PendingJoinErrorCode } from "@orb/contracts/chat";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Skeleton } from "@orb/ui/skeleton";
import { Heading, Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { confirmPendingJoin, usePendingJoinPreview } from "#data";
import { testId } from "#lib";
import { joinerPersonaOf } from "../lib/joiner-persona.ts";
import { JoinerPersonaFields } from "./joiner-persona-fields.tsx";

/** Where a confirm left the visitor. `approval` means the account exists, disabled, with its seat. */
type ConfirmState =
  | { readonly kind: "idle" }
  | { readonly kind: "confirming" }
  | { readonly kind: "approval" }
  | { readonly kind: "refused"; readonly copy: string };

/** The copy for a confirm refusal. Exhaustive: a new wire code fails `tsc` here. */
function refusalCopy(code: PendingJoinErrorCode | null, providerName: string): string {
  switch (code) {
    case null:
    case "invalid_request":
      return "Joining didn't go through. Try again in a minute.";
    case "already_signed_in":
      return "You're already signed in. Open the invite link again from the app.";
    case "join_unavailable":
      return `This invite has expired or is used up. Ask the host for a new one, or continue with ${providerName}.`;
    case "account_exists":
      return `An account already exists for this identity. Continue with ${providerName} to sign in.`;
    default: {
      const exhaustive: never = code;
      return String(exhaustive);
    }
  }
}

export interface LoginPendingJoinProps {
  readonly providerName: string;
  /** Fires after the account is created and signed in. */
  readonly onJoined: () => void;
  /** Leave the pending join and show the plain sign-in card. */
  readonly onDismiss: () => void;
}

/** The pending-join card: the room, then Join or Not now. */
export function LoginPendingJoin({ providerName, onJoined, onDismiss }: LoginPendingJoinProps): ReactElement {
  const preview = usePendingJoinPreview();
  const [state, setState] = useState<ConfirmState>({ kind: "idle" });
  const [personaName, setPersonaName] = useState("");
  const [personaDescription, setPersonaDescription] = useState("");
  const persona = joinerPersonaOf(personaName, personaDescription);

  if (preview.isPending) {
    return (
      <Stack gap="row" aria-label="Loading your invite">
        <Skeleton className="h-control-md w-full" />
        <Skeleton className="h-control-md w-full" />
      </Stack>
    );
  }
  if (state.kind === "approval") {
    return (
      <Stack gap="block" data-testid={testId("pendingJoinApproval")}>
        <Heading level={1}>Waiting for approval</Heading>
        <Text voice="quiet">Your account is created and has a seat in the room. An admin must approve it before you can sign in.</Text>
        <Button intent="ghost" onClick={onDismiss}>
          Back to sign in
        </Button>
      </Stack>
    );
  }
  const room = preview.data;
  if (room === null || room === undefined) {
    return (
      <Stack gap="block" data-testid={testId("pendingJoinUnavailable")}>
        <Heading level={1}>This invite isn't available</Heading>
        <Text voice="quiet">It may have expired, run out of uses, or waited too long. Ask the host for a new link.</Text>
        <Button intent="primary" onClick={onDismiss}>
          Back to sign in
        </Button>
      </Stack>
    );
  }

  const confirm = (): void => {
    if (persona === null) {
      return;
    }
    setState({ kind: "confirming" });
    confirmPendingJoin({ persona }).then(
      (result) => {
        if (!result.ok) {
          setState({ kind: "refused", copy: refusalCopy(result.code, providerName) });
          return;
        }
        if (result.signedIn) {
          onJoined();
          return;
        }
        setState({ kind: "approval" });
      },
      () => setState({ kind: "refused", copy: refusalCopy(null, providerName) }),
    );
  };

  return (
    <Stack gap="block" data-testid={testId("pendingJoin")}>
      <Heading level={1}>You're invited</Heading>
      <Text voice="quiet">
        {`${room.hostHandle} invited you to ${room.roomName.length > 0 ? room.roomName : "a room"} (${room.memberCount} ${room.memberCount === 1 ? "member" : "members"}, ${room.modeLabel}). Joining creates your account here.`}
      </Text>
      <JoinerPersonaFields name={personaName} description={personaDescription} onNameChange={setPersonaName} onDescriptionChange={setPersonaDescription} />
      {state.kind === "refused" ? (
        <Text voice="label" className="text-destructive" role="alert" data-testid={testId("pendingJoinError")}>
          {state.copy}
        </Text>
      ) : null}
      <Row gap="row">
        <Button intent="primary" disabled={state.kind === "confirming" || persona === null} onClick={confirm} data-testid={testId("pendingJoinConfirm")}>
          {state.kind === "confirming" ? "Joining…" : "Create account and join"}
        </Button>
        <Button intent="ghost" onClick={onDismiss} data-testid={testId("pendingJoinDismiss")}>
          Not now
        </Button>
      </Row>
    </Stack>
  );
}
