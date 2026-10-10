// Connection authoring and first-model setup; the form reads only saved-key metadata.

import type { ProviderDef } from "@orb/contracts/inference";
import { errorMessage } from "@orb/kit/error-message";
import { WebSpinner } from "@orb/ui/spinner";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { FormDialog, QueryBoundary, useSetBinding } from "#components";
import type { Invalidation, Trpc } from "#data";
import { ADD_CONNECTION_DOOR, CHAT_ROLE_DOOR } from "#lib";
import { configSettingControlId, openConfigTo } from "#state";
import { ADD_DIALOG_COPY } from "../lib/add-connection-form-model.ts";
import { providerPickerItems } from "../lib/connections-model.ts";
import type { AddConnectionFormBodyProps } from "./add-connection-form-body.tsx";
import { AddConnectionFormBody } from "./add-connection-form-body.tsx";
import { FirstModelSetup } from "./first-model-setup.tsx";

export interface AddConnectionDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
}

type ConnectionView = inferOutput<Trpc["connection"]["create"]>;

/** What the dialog is doing: adding a connection, the first-model step, or adding the Utility model that step asked for. */
type AddStep =
  | { readonly kind: "add" }
  | { readonly kind: "setup"; readonly chat: ConnectionView; readonly picked: ConnectionView["id"] | null; readonly chatBinding: Promise<string | null> }
  | { readonly kind: "add-utility"; readonly chat: ConnectionView; readonly chatBinding: Promise<string | null> };

const ADD_STEP: AddStep = { kind: "add" };

export function AddConnectionDialog({ open, onOpenChange, trpc, invalidation }: AddConnectionDialogProps): ReactElement {
  const [step, setStep] = useState<AddStep>(ADD_STEP);
  const [closeTarget, setCloseTarget] = useState({ open, chat: false });
  if (closeTarget.open !== open) {
    setCloseTarget({ open, chat: open ? false : closeTarget.chat });
  }
  const setBinding = useSetBinding({ trpc, invalidation, failureShownInline: true });
  // @orb-waive caught-failure-ownership(setBinding.mutateAsync): the returned refusal is carried to FirstModelSetup's inline failure or its late-refusal toast, never discarded; ends if either result stops reaching that component.
  const bindChat = (chat: ConnectionView): Promise<string | null> =>
    setBinding.mutateAsync({ task: "chat", connectionId: chat.id }).then(() => null, errorMessage);
  // Every close starts the next open at the add form.
  const changeOpen = (next: boolean): void => {
    if (!next) {
      setStep(ADD_STEP);
    }
    onOpenChange(next);
  };
  const onSaved = (created: ConnectionView, firstChatModel: boolean): void => {
    if (step.kind === "add-utility") {
      setStep({ kind: "setup", chat: step.chat, picked: created.id, chatBinding: step.chatBinding });
      return;
    }
    if (firstChatModel) {
      // Start before mounting setup: closing it never cancels the saved connection's Chat assignment.
      const chatBinding = bindChat(created);
      setStep({ kind: "setup", chat: created, picked: null, chatBinding });
      return;
    }
    changeOpen(false);
  };
  return (
    <FormDialog
      anchor="top"
      finalFocus={(): HTMLElement | false | null =>
        closeTarget.chat ? false : document.getElementById(configSettingControlId(ADD_CONNECTION_DOOR.group, ADD_CONNECTION_DOOR.setting))
      }
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
      <QueryBoundary fallback={<WebSpinner label="Checking key storage…" />}>
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
        ) : (
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
        )}
      </QueryBoundary>
    </FormDialog>
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
  const providers = new Map(available.map((row) => [row.provider.id as string, row.provider]));
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
