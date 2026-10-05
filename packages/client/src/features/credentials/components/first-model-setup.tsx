// The first-model step of "Add a connection": the first connection that can chat becomes the Chat model, and the same
// step asks which model background work runs on (this one, another connection, a new one, or none for now). Whichever
// is picked gets Allow background work turned on, said before it happens, because a role binding alone never runs.

import type { RoutableTask } from "@orb/contracts/inference";
import { errorMessage } from "@orb/kit/error-message";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { RadioGroup, RadioGroupItem } from "@orb/ui/radio-group";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useEffect, useId, useState } from "react";
import { useSetBinding, useUpdateConnection } from "#components";
import type { Invalidation, Trpc } from "#data";
import { CHAT_ROLE_DOOR, connectionSummary, MEMORY_COST_SENTENCE, notify } from "#lib";
import { openConfigTo } from "#state";
import { CLAUDE_SUBSCRIPTION_NOTICE, isClaudeSubscription } from "../lib/add-connection-form-model.ts";

type ConnectionListItem = inferOutput<Trpc["connection"]["list"]>[number];

const UTILITY_CHOICES = ["same", "existing", "add", "later"] as const;
type UtilityChoice = (typeof UTILITY_CHOICES)[number];

const UTILITY_TASK: RoutableTask = "summarize";

function isUtilityChoice(value: unknown): value is UtilityChoice {
  return (UTILITY_CHOICES as readonly unknown[]).includes(value);
}

/** What each choice tells the person will happen, read before they press Finish. */
const CHOICE_NOTES: Record<UtilityChoice, string> = {
  same: "Allow background work is turned on for it, so these can run while you chat.",
  existing: "Allow background work is turned on for the one you pick, so these can run while you chat.",
  add: "You add it next. Allow background work is on for it, so these can run while you chat.",
  later: "Until you pick one under Model roles, memory summaries, captions and extraction wait.",
};

/** A connection just added for the role is the pick; else none for a subscription, whose plan the background work
 *  would spend; else this one when it can do the job; else adding one. */
function initialChoice(picked: string | null, subscription: boolean, canUseSame: boolean): UtilityChoice {
  if (picked !== null) {
    return "existing";
  }
  if (subscription) {
    return "later";
  }
  return canUseSame ? "same" : "add";
}

export interface FirstModelSetupProps {
  /** The connection just added, which becomes the Chat model. */
  readonly chat: ConnectionListItem;
  /** The immediate Chat write started by the add flow; resolves to its inline refusal or success. */
  readonly chatBinding: Promise<string | null>;
  readonly onRetryChat: () => void;
  /** A connection added for the Utility role a moment ago, offered as the pick. */
  readonly picked: ConnectionListItem["id"] | null;
  readonly onAddUtility: () => void;
  readonly onDone: () => void;
  readonly onChangeChat: () => void;
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
}

function chatAssignmentText(pending: boolean, failure: string | null, name: string): string {
  if (pending) {
    return `Setting Chat to ${name}…`;
  }
  return failure === null ? `Chat now uses ${name}.` : `Your connection was saved, but Chat isn't set: ${failure}`;
}

export function FirstModelSetup({
  chat,
  chatBinding,
  onRetryChat,
  picked,
  onAddUtility,
  onDone,
  onChangeChat,
  trpc,
  invalidation,
}: FirstModelSetupProps): ReactElement {
  // The step's own alert line carries a failure and stays open as the retry, so the writes raise no toast.
  const deps = { trpc, invalidation, failureShownInline: true };
  const setBinding = useSetBinding(deps);
  const update = useUpdateConnection(deps);
  const { data: connections } = useSuspenseQuery(trpc.connection.list.queryOptions());
  const { data: available } = useSuspenseQuery(trpc.connection.providersAvailable.queryOptions());
  const chatProvider = available.find((row) => row.provider.id === chat.providerId)?.provider;
  const subscription = chatProvider !== undefined && isClaudeSubscription(chatProvider);
  const others = connections.filter((connection) => connection.id !== chat.id && connection.tasks.includes(UTILITY_TASK));
  const canUseSame = chat.tasks.includes(UTILITY_TASK);
  const [choice, setChoice] = useState<UtilityChoice>(initialChoice(picked, subscription, canUseSame));
  const [otherId, setOtherId] = useState<string>(picked ?? others[0]?.id ?? "");
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [chatState, setChatState] = useState<{ readonly pending: boolean; readonly failure: string | null }>({ pending: true, failure: null });
  useEffect(() => {
    let mounted = true;
    const settled = (reason: string | null): void => {
      if (mounted) {
        setChatState({ pending: false, failure: reason });
      } else if (reason !== null) {
        notify.error({
          title: "Chat wasn't assigned",
          description: `Your connection was saved, but Chat isn't set: ${reason}`,
          action: { label: "Choose Chat model", onClick: (): void => openConfigTo(CHAT_ROLE_DOOR.group, CHAT_ROLE_DOOR.sub, CHAT_ROLE_DOOR.setting) },
        });
      }
    };
    // @orb-waive caught-failure-ownership(chatBinding): settled writes the inline failure while mounted and a recovery toast after close; ends if that owner no longer surfaces either outcome.
    void chatBinding.then(settled, (error: unknown): void => settled(errorMessage(error)));
    return (): void => {
      mounted = false;
    };
  }, [chatBinding]);
  const labelId = useId();
  const reasonId = useId();
  const name = connectionSummary(chat);

  const utilityRow = (): ConnectionListItem | undefined => {
    if (choice === "same") {
      return chat;
    }
    return choice === "existing" ? others.find((row) => row.id === otherId) : undefined;
  };

  const bindRoles = async (): Promise<void> => {
    const utility = utilityRow();
    if (utility !== undefined) {
      // The bind refuses a background role on a row that does not allow background work, so the switch goes first.
      if (!utility.allowBackground) {
        await update.mutateAsync({ connectionId: utility.id, patch: { allowBackground: true } });
      }
      await setBinding.mutateAsync({ task: UTILITY_TASK, connectionId: utility.id });
    }
  };

  const retryChat = (): void => {
    setChatState({ pending: true, failure: null });
    onRetryChat();
  };

  const finish = (): void => {
    setFailure(null);
    setSaving(true);
    // @orb-waive caught-failure-ownership(bindRoles): owned by the step's inline failure line (`first-model-setup-failure`, role=alert), which stays open as the retry surface. Ends if that line is removed.
    bindRoles()
      .then((): void => {
        setSaving(false);
        onDone();
      })
      .catch((error: unknown): void => {
        setSaving(false);
        setFailure(errorMessage(error));
      });
  };

  return (
    <Stack gap="block" data-slot="first-model-setup">
      <Row gap="field" className="flex-wrap">
        <Text prose={true} role={chatState.failure === null ? undefined : "alert"} voice="gloss">
          {chatAssignmentText(chatState.pending, chatState.failure, name)}
        </Text>
        {chatState.failure === null ? (
          <Button disabled={chatState.pending} intent="ghost" onClick={onChangeChat} size="sm">
            Change
          </Button>
        ) : (
          <Button intent="ghost" onClick={retryChat} size="sm">
            Retry Chat assignment
          </Button>
        )}
      </Row>
      <Stack gap="tight">
        <Text id={labelId} voice="label">
          Utility model
        </Text>
        <Text prose={true} voice="gloss">
          {`Memory summaries, image captions and extraction run in the background on a Utility model, and a cheaper model is fine for it. ${MEMORY_COST_SENTENCE}`}
        </Text>
        {subscription ? (
          <Text id={reasonId} prose={true} voice="gloss">
            {CLAUDE_SUBSCRIPTION_NOTICE.utility}
          </Text>
        ) : null}
      </Stack>
      <RadioGroup
        aria-describedby={subscription ? reasonId : undefined}
        aria-labelledby={labelId}
        disabled={saving || chatState.pending || chatState.failure !== null}
        onValueChange={(value): void => {
          if (isUtilityChoice(value)) {
            setChoice(value);
          }
        }}
        value={choice}
      >
        {canUseSame ? <RadioGroupItem value="same">{`Use the same one, ${name}`}</RadioGroupItem> : null}
        {others.length === 0 ? null : <RadioGroupItem value="existing">Use another connection</RadioGroupItem>}
        <RadioGroupItem value="add">Add a different model for it</RadioGroupItem>
        <RadioGroupItem value="later">Not now</RadioGroupItem>
      </RadioGroup>
      {choice === "existing" ? (
        <Select
          aria-label="Utility model connection to use"
          disabled={saving}
          items={others.map((row) => ({ label: connectionSummary(row), value: row.id as string }))}
          onValueChange={(value): void => {
            if (value !== null) {
              setOtherId(value);
            }
          }}
          value={otherId}
        />
      ) : null}
      <Text prose={true} voice="gloss">
        {CHOICE_NOTES[choice]}
      </Text>
      {failure === null ? null : (
        <Text className="text-destructive" data-slot="first-model-setup-failure" role="alert" voice="gloss">
          {`That didn't go through: ${failure}`}
        </Text>
      )}
      <Row gap="field" justify="end">
        {choice === "add" ? (
          <Button disabled={chatState.pending || chatState.failure !== null} intent="primary" onClick={onAddUtility}>
            Add a model
          </Button>
        ) : (
          <Button
            // A picked connection the list read has not caught up with yet would bind Chat alone; wait for it.
            disabled={chatState.pending || chatState.failure !== null || (choice === "existing" && utilityRow() === undefined)}
            intent="primary"
            loading={saving}
            onClick={finish}
          >
            Finish
          </Button>
        )}
      </Row>
    </Stack>
  );
}
