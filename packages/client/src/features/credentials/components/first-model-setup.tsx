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
import { useId, useState } from "react";
import { useSetBinding, useUpdateConnection } from "#components";
import type { Invalidation, Trpc } from "#data";
import { connectionSummary, MEMORY_COST_SENTENCE } from "#lib";

type ConnectionListItem = inferOutput<Trpc["connection"]["list"]>[number];

const UTILITY_CHOICES = ["same", "existing", "add", "later"] as const;
type UtilityChoice = (typeof UTILITY_CHOICES)[number];

const CHAT_TASK: RoutableTask = "chat";
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

/** A connection just added for the role is the pick; else this one when it can do the job; else adding one. */
function initialChoice(picked: string | null, canUseSame: boolean): UtilityChoice {
  if (picked !== null) {
    return "existing";
  }
  return canUseSame ? "same" : "add";
}

export interface FirstModelSetupProps {
  /** The connection just added, which becomes the Chat model. */
  readonly chat: ConnectionListItem;
  /** A connection added for the Utility role a moment ago, offered as the pick. */
  readonly picked: ConnectionListItem["id"] | null;
  readonly onAddUtility: () => void;
  readonly onDone: () => void;
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
}

export function FirstModelSetup({ chat, picked, onAddUtility, onDone, trpc, invalidation }: FirstModelSetupProps): ReactElement {
  const deps = { trpc, invalidation };
  const setBinding = useSetBinding(deps);
  const update = useUpdateConnection(deps);
  const { data: connections } = useSuspenseQuery(trpc.connection.list.queryOptions());
  const others = connections.filter((connection) => connection.id !== chat.id && connection.tasks.includes(UTILITY_TASK));
  const canUseSame = chat.tasks.includes(UTILITY_TASK);
  const [choice, setChoice] = useState<UtilityChoice>(initialChoice(picked, canUseSame));
  const [otherId, setOtherId] = useState<string>(picked ?? others[0]?.id ?? "");
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const labelId = useId();
  const name = connectionSummary(chat);

  const utilityRow = (): ConnectionListItem | undefined => {
    if (choice === "same") {
      return chat;
    }
    return choice === "existing" ? others.find((row) => row.id === otherId) : undefined;
  };

  const bindRoles = async (): Promise<void> => {
    await setBinding.mutateAsync({ task: CHAT_TASK, connectionId: chat.id });
    const utility = utilityRow();
    if (utility !== undefined) {
      // The bind refuses a background role on a row that does not allow background work, so the switch goes first.
      if (!utility.allowBackground) {
        await update.mutateAsync({ connectionId: utility.id, patch: { allowBackground: true } });
      }
      await setBinding.mutateAsync({ task: UTILITY_TASK, connectionId: utility.id });
    }
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
      <Text prose={true} voice="gloss">{`Chat will run on ${name}.`}</Text>
      <Stack gap="tight">
        <Text id={labelId} voice="label">
          Utility model
        </Text>
        <Text prose={true} voice="gloss">
          {`Memory summaries, image captions and extraction run in the background on a Utility model, and a cheaper model is fine for it. ${MEMORY_COST_SENTENCE}`}
        </Text>
      </Stack>
      <RadioGroup
        aria-labelledby={labelId}
        disabled={saving}
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
          <Button intent="primary" onClick={onAddUtility}>
            Add a model
          </Button>
        ) : (
          <Button
            // A picked connection the list read has not caught up with yet would bind Chat alone; wait for it.
            disabled={choice === "existing" && utilityRow() === undefined}
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
