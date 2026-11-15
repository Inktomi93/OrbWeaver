// Connection authoring and first-model setup; the form reads only saved-key metadata.

import type { ProviderDef } from "@orb/contracts/inference";
import { errorMessage } from "@orb/kit/error-message";
import { WebSpinner } from "@orb/ui/spinner";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement, RefObject } from "react";
import { useState } from "react";
import { DismissDialog, QueryBoundary, useSetBinding } from "#components";
import type { Invalidation, Trpc } from "#data";
import { useSuspenseQuery } from "#data";
import { CHAT_ROLE_DOOR } from "#lib";
import { openConfigTo } from "#state";
import { ADD_DIALOG_COPY } from "../lib/add-connection-form-model.ts";
import { providerPickerItems } from "../lib/connections-model.ts";
import type { AddConnectionFormBodyProps } from "./add-connection-form-body.tsx";
import { AddConnectionFormBody } from "./add-connection-form-body.tsx";
import { ConnectionLimitsStep } from "./connection-limits-step.tsx";
import { FirstModelSetup } from "./first-model-setup.tsx";

export interface AddConnectionDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
  /** The control that opened the dialog; a plain close hands focus back to it. */
  readonly returnFocus: RefObject<HTMLElement | null>;
}

type ConnectionView = inferOutput<Trpc["connection"]["create"]>;

/** A step that follows a save: the first-model step, or the Utility add it asked for. */
type FollowStep =
  | { readonly kind: "setup"; readonly chat: ConnectionView; readonly picked: ConnectionView["id"] | null; readonly chatBinding: Promise<string | null> }
  | { readonly kind: "add-utility"; readonly chat: ConnectionView; readonly chatBinding: Promise<string | null> };

/** What the dialog is doing: adding a connection, asking for the real limits of one just saved (then going on to `next`,
 *  or closing when it is `null`), or one of the steps that follow a save. */
type AddStep = { readonly kind: "add" } | { readonly kind: "limits"; readonly created: ConnectionView; readonly next: FollowStep | null } | FollowStep;

const ADD_STEP: AddStep = { kind: "add" };

export function AddConnectionDialog({ open, onOpenChange, trpc, invalidation, returnFocus }: AddConnectionDialogProps): ReactElement {
  const [step, setStep] = useState<AddStep>(ADD_STEP);
  const [closeTarget, setCloseTarget] = useState({ open, chat: false });
  if (closeTarget.open !== open) {
    setCloseTarget({ open, chat: open ? false : closeTarget.chat });
  }
  const setBinding = useSetBinding({ trpc, invalidation });
  // the binding's refusal string is returned to FirstModelSetup, whose `settled` writes it to `setChatState` (inline alert) while mounted or to `notify.error` after close, beside the mutation's own toast; ends if either path stops reaching that component.
  const bindChat = (chat: ConnectionView): Promise<string | null> =>
    setBinding.mutateAsync({ task: "chat", connectionId: chat.id }).then(() => null, errorMessage);
  // Every close starts the next open at the add form.
  const changeOpen = (next: boolean): void => {
    if (!next) {
      setStep(ADD_STEP);
    }
    onOpenChange(next);
  };
  const followOrClose = (next: FollowStep | null): void => {
    if (next === null) {
      changeOpen(false);
    } else {
      setStep(next);
    }
  };
  const followStep = (created: ConnectionView, firstChatModel: boolean): FollowStep | null => {
    if (step.kind === "add-utility") {
      return { kind: "setup", chat: step.chat, picked: created.id, chatBinding: step.chatBinding };
    }
    if (firstChatModel) {
      // Start before mounting setup: closing it never cancels the saved connection's Chat assignment.
      return { kind: "setup", chat: created, picked: null, chatBinding: bindChat(created) };
    }
    return null;
  };
  // Every save moves to the limits step at once; the step reads the row's held limits itself and goes straight on when
  // nothing is a guess. Nothing here awaits that read, so a late answer can never land a step on a closed dialog.
  const onSaved = (created: ConnectionView, firstChatModel: boolean): void => {
    setStep({ kind: "limits", created, next: followStep(created, firstChatModel) });
  };
  return (
    <DismissDialog
      anchor="top"
      finalFocus={(): HTMLElement | false | null => (closeTarget.chat ? false : returnFocus.current)}
      onOpenChangeComplete={(next): void => {
        if (!next && closeTarget.chat) {
          openConfigTo(CHAT_ROLE_DOOR.group, CHAT_ROLE_DOOR.sub, CHAT_ROLE_DOOR.setting);
        }
      }}
      closeButton={true}
      description={ADD_DIALOG_COPY[step.kind].description}
      onOpenChange={changeOpen}
      open={open}
      title={ADD_DIALOG_COPY[step.kind].title}
    >
      {/* DELIBERATELY UNRESERVED (#1098): a dialog body sizes itself around its content. */}
      <QueryBoundary resetKeys={[step.kind]} fallback={<WebSpinner label="Checking key storage…" />}>
        {step.kind === "limits" ? (
          <ConnectionLimitsStep
            connectionId={step.created.id}
            providerId={step.created.providerId}
            declared={step.created.declared}
            invalidation={invalidation}
            onDone={(): void => followOrClose(step.next)}
            trpc={trpc}
          />
        ) : null}
        {step.kind === "setup" ? (
          <FirstModelSetup
            chat={step.chat}
            chatBinding={step.chatBinding}
            onRetryChat={(): void => setStep({ ...step, chatBinding: bindChat(step.chat) })}
            invalidation={invalidation}
            onAddUtility={(): void => setStep({ kind: "add-utility", chat: step.chat, chatBinding: step.chatBinding })}
            onDone={(): void => changeOpen(false)}
            onChangeChat={(): void => {
              // Native close owns focus until dismissal completes; the canonical leaf landing owns it next.
              setCloseTarget({ open, chat: true });
              changeOpen(false);
            }}
            picked={step.picked}
            trpc={trpc}
          />
        ) : null}
        {step.kind === "add" || step.kind === "add-utility" ? (
          <AddConnectionGate
            invalidation={invalidation}
            key={step.kind}
            onCancel={
              step.kind === "add-utility" ? (): void => setStep({ kind: "setup", chat: step.chat, picked: null, chatBinding: step.chatBinding }) : undefined
            }
            onSaved={onSaved}
            purpose={step.kind === "add-utility" ? "utility" : "connection"}
            trpc={trpc}
          />
        ) : null}
      </QueryBoundary>
    </DismissDialog>
  );
}

/** Why the form is open: an ordinary add, or the Utility model the first-model step asked for, which is saved with
 *  background work on because that role never runs without it. */
type AddPurpose = AddConnectionFormBodyProps["purpose"];

interface GateProps {
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
  readonly purpose: AddPurpose;
  /** Called once the row exists; `firstChatModel` = it is the first of the user's connections that can chat. */
  readonly onSaved: (created: ConnectionView, firstChatModel: boolean) => void;
  /** Replaces the footer's Cancel close with a step back, where the form is a step inside a longer flow. */
  readonly onCancel: (() => void) | undefined;
}

/** CREDENTIAL-STORAGE-SILENT-FAIL — ASK BEFORE COLLECTING: the deployment's SecretBox capability is read
 *  first and the INPUT refused, never the save, so nobody types a live key into a form that cannot keep it.
 *  The refusal is per provider (`keyStorageBlocks`): a keyless own-server row needs no storage at all. */
function AddConnectionGate({ trpc, invalidation, purpose, onSaved, onCancel }: GateProps): ReactElement {
  const { data: storage } = useSuspenseQuery(trpc.credentials.storageStatus.queryOptions());
  const { data: available } = useSuspenseQuery(trpc.connection.providersAvailable.queryOptions());
  const { data: credentials } = useSuspenseQuery(trpc.credentials.list.queryOptions());
  const { data: connections } = useSuspenseQuery(trpc.connection.list.queryOptions());
  // Read once, at open: the list refetches the moment this form's own row lands, and the question is about before.
  const [hadChatModel] = useState(() => connections.some((connection) => connection.tasks.includes("chat")));
  const providers = new Map<string, (typeof available)[number]["provider"]>(available.map((row) => [row.provider.id, row.provider]));
  return (
    <AddConnectionFormBody
      trpc={trpc}
      invalidation={invalidation}
      purpose={purpose}
      onSaved={(created): void => onSaved(created, !hadChatModel && created.tasks.includes("chat"))}
      onCancel={onCancel}
      credentials={credentials}
      keyStorage={storage.enabled}
      pickerItems={providerPickerItems(available)}
      providerOf={(id): ProviderDef | undefined => providers.get(id)}
    />
  );
}
