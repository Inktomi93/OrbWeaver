// D259 — the OIDC pending join: the callback held a JIT-closed identity that arrived with a signup invite and
// landed here. The preview names the room, the joiner names their persona, and the confirm posts only that
// persona, because the pending cookie alone names the join. Plain state (a submit-once confirm, the
// credential-form carve-out).

import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Skeleton } from "@orb/ui/skeleton";
import { Heading, Text } from "@orb/ui/text";
import type { ReactElement, SyntheticEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { QueryBoundary } from "#components";
import { confirmPendingJoin, pendingJoinPreviewOptions, QueryErrorState, useSuspenseQuery } from "#data";
import { focusFirstInvalidFieldIn } from "#forms/editor";
import { inviteRoomSentence, testId } from "#lib";
import { joinerPersonaOf } from "../lib/joiner-persona.ts";
import { pendingJoinRefusalCopy } from "../lib/pending-join-copy.ts";
import {
  BACK_TO_SIGN_IN_NAME,
  INVITE_LOADING_NAME,
  INVITED_HEADING,
  JOINER_PERSONA_NAME_REQUIRED,
  PENDING_JOIN_APPROVAL_NOTE,
  PENDING_JOIN_APPROVAL_TITLE,
  PENDING_JOIN_NOT_NOW_NAME,
  pendingJoinConfirmLabel,
} from "../lib/pending-join-names.ts";
import { InviteUnavailable } from "./invite-unavailable.tsx";
import { JoinerPersonaFields } from "./joiner-persona-fields.tsx";

/** Where a confirm left the visitor. `approval` means the account exists, disabled, with its seat. */
type ConfirmState =
  | { readonly kind: "idle" }
  | { readonly kind: "confirming" }
  | { readonly kind: "approval" }
  | { readonly kind: "refused"; readonly copy: string };

export interface LoginPendingJoinProps {
  readonly providerName: string;
  /** Fires after the account is created and signed in. */
  /** Signed in and seated: the caller lands in the joined room. */
  readonly onJoined: (chatId: ChatId) => void;
  /** Leave the pending join and show the plain sign-in card. */
  readonly onDismiss: () => void;
}

/** The pending-join card: the room, then Join or Not now. */
export function LoginPendingJoin(props: LoginPendingJoinProps): ReactElement {
  return (
    <QueryBoundary
      fallback={
        <Stack gap="row" aria-label={INVITE_LOADING_NAME}>
          <Skeleton width="full" height="controlMd" />
          <Skeleton width="full" height="controlMd" />
        </Stack>
      }
      renderError={(_error, retry): ReactElement => <QueryErrorState label="your invite" onRetry={retry} />}
      resetKeys={[]}
    >
      <PendingJoinCard {...props} />
    </QueryBoundary>
  );
}

function PendingJoinCard({ providerName, onJoined, onDismiss }: LoginPendingJoinProps): ReactElement {
  const { data: room } = useSuspenseQuery(pendingJoinPreviewOptions);
  const [state, setState] = useState<ConfirmState>({ kind: "idle" });
  const [personaName, setPersonaName] = useState("");
  const [personaDescription, setPersonaDescription] = useState("");
  const persona = joinerPersonaOf(personaName, personaDescription);
  // Counts confirms that met an unnamed persona, so each one moves focus to the name the card asks for.
  const [attempts, setAttempts] = useState(0);
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    if (attempts > 0) {
      focusFirstInvalidFieldIn(formRef.current);
    }
  }, [attempts]);

  if (state.kind === "approval") {
    return (
      <Stack gap="block" data-testid={testId("pendingJoinApproval")}>
        <Heading level={1}>{PENDING_JOIN_APPROVAL_TITLE}</Heading>
        <Text voice="quiet">{PENDING_JOIN_APPROVAL_NOTE}</Text>
        <Button variant="ghost" onClick={onDismiss}>
          {BACK_TO_SIGN_IN_NAME}
        </Button>
      </Stack>
    );
  }
  if (room === null) {
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
          setState({ kind: "refused", copy: pendingJoinRefusalCopy(result.code, providerName) });
          return;
        }
        if (result.signedIn) {
          onJoined(result.chatId);
          return;
        }
        setState({ kind: "approval" });
      },
      () => setState({ kind: "refused", copy: pendingJoinRefusalCopy(null, providerName) }),
    );
  };

  return (
    <form aria-label="Join the room" ref={formRef} onSubmit={confirm} noValidate={true}>
      <Stack gap="block" data-testid={testId("pendingJoin")}>
        <Heading level={1}>{INVITED_HEADING}</Heading>
        <Text voice="quiet">{`${inviteRoomSentence(room)} ${room.modeLabel} Joining creates your account here.`}</Text>
        <JoinerPersonaFields
          name={personaName}
          nameError={attempts > 0 && persona === null ? JOINER_PERSONA_NAME_REQUIRED : null}
          description={personaDescription}
          onNameChange={setPersonaName}
          onDescriptionChange={setPersonaDescription}
        />
        {state.kind === "refused" ? (
          <Text tone="destructive" voice="label" role="alert" data-testid={testId("pendingJoinError")}>
            {state.copy}
          </Text>
        ) : null}
        <Row wrap={true} gap="row">
          <Button cap="fit" wrap={true} type="submit" disabled={state.kind === "confirming"} data-testid={testId("pendingJoinConfirm")}>
            {pendingJoinConfirmLabel(state.kind === "confirming")}
          </Button>
          <Button variant="ghost" onClick={onDismiss} data-testid={testId("pendingJoinDismiss")}>
            {PENDING_JOIN_NOT_NOW_NAME}
          </Button>
        </Row>
      </Stack>
    </form>
  );
}
