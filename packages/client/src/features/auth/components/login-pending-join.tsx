// D259 — the OIDC pending join: the callback held a JIT-closed identity that arrived with a signup invite and
// landed here. The preview names the room, the joiner names their persona, and the confirm posts only that
// persona, because the pending cookie alone names the join. Plain state (a submit-once confirm, the
// credential-form carve-out).

import type { PendingJoinErrorCode } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Skeleton } from "@orb/ui/skeleton";
import { Heading, Text } from "@orb/ui/text";
import type { ReactElement, SyntheticEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { confirmPendingJoin, usePendingJoinPreview } from "#data";
import { DEAD_INVITE_SENTENCE, inviteRoomSentence, testId } from "#lib";
import { joinerPersonaOf } from "../lib/joiner-persona.ts";
import { InviteUnavailable } from "./invite-unavailable.tsx";
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
      return `${DEAD_INVITE_SENTENCE} Or continue with ${providerName}.`;
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
  /** Signed in and seated: the caller lands in the joined room. */
  readonly onJoined: (chatId: ChatId) => void;
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
  // Counts confirms that met an unnamed persona, so each one moves focus to the name the card asks for.
  const [attempts, setAttempts] = useState(0);
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    if (attempts > 0) {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }
  }, [attempts]);

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
    return <InviteUnavailable onBack={onDismiss} />;
  }

  const confirm = (event: SyntheticEvent): void => {
    event.preventDefault();
    if (state.kind === "confirming") {
      return;
    }
    if (persona === null) {
      setAttempts((count) => count + 1);
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
          onJoined(result.chatId);
          return;
        }
        setState({ kind: "approval" });
      },
      () => setState({ kind: "refused", copy: refusalCopy(null, providerName) }),
    );
  };

  return (
    <form ref={formRef} onSubmit={confirm} noValidate={true}>
      <Stack gap="block" data-testid={testId("pendingJoin")}>
        <Heading level={1}>You're invited</Heading>
        <Text voice="quiet">{`${inviteRoomSentence(room)} ${room.modeLabel} Joining creates your account here.`}</Text>
        <JoinerPersonaFields
          name={personaName}
          nameError={attempts > 0 && persona === null ? "Give your persona a name." : null}
          description={personaDescription}
          onNameChange={setPersonaName}
          onDescriptionChange={setPersonaDescription}
        />
        {state.kind === "refused" ? (
          <Text voice="label" className="text-destructive" role="alert" data-testid={testId("pendingJoinError")}>
            {state.copy}
          </Text>
        ) : null}
        <Row gap="row">
          <Button intent="primary" type="submit" disabled={state.kind === "confirming"} data-testid={testId("pendingJoinConfirm")}>
            {state.kind === "confirming" ? "Joining…" : "Create account and join"}
          </Button>
          <Button intent="ghost" onClick={onDismiss} data-testid={testId("pendingJoinDismiss")}>
            Not now
          </Button>
        </Row>
      </Stack>
    </form>
  );
}
