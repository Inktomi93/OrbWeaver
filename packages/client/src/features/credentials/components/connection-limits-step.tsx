// The add dialog's limits step: a new connection whose context window or longest reply is the fold's guess says so
// the moment it is saved, and takes the real numbers there. It writes the connection's `declared` block through the
// same fact rows and `withDeclaredOverride` the Advanced tier uses, so the step adds no second home for a limit.

import type { DeclaredCapability } from "@orb/contracts/inference";
import { errorMessage } from "@orb/kit/error-message";
import type { UserConnectionId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { DialogFooter } from "@orb/ui/dialog";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { QueryBoundary, useUpdateConnection } from "#components";
import type { Invalidation, Trpc } from "#data";
import { QueryErrorState, SkeletonRows, useSuspenseQuery } from "#data";
import type { GuessedLimit } from "../lib/connection-capability-fact-model.ts";
import { guessedLimits } from "../lib/connection-capability-fact-model.ts";
import { tokens, withDeclaredOverride } from "../lib/connection-fact-model.ts";
import {
  CONNECTION_LIMIT_FIELD_NAMES,
  CONNECTION_LIMIT_INVALID,
  CONNECTION_LIMITS_KEEP_NAME,
  CONNECTION_LIMITS_LEAD,
  CONNECTION_LIMITS_READ_LABEL,
  CONNECTION_LIMITS_SAVE_NAME,
  connectionLimitGuessLabel,
  connectionLimitsFailureLabel,
} from "../lib/credentials-names.ts";

export interface ConnectionLimitsStepProps {
  readonly connectionId: UserConnectionId;
  /** The saved row's own declaration, which the step's write extends rather than replaces. */
  readonly declared: DeclaredCapability | null;
  /** Called after a save lands, or when the user keeps the guess. */
  readonly onDone: () => void;
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
}

export function ConnectionLimitsStep(props: ConnectionLimitsStepProps): ReactElement {
  return (
    <QueryBoundary
      resetKeys={[props.connectionId]}
      fallback={<SkeletonRows count={3} />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label={CONNECTION_LIMITS_READ_LABEL} onRetry={retry} />}
    >
      <ConnectionLimitsBody {...props} />
    </QueryBoundary>
  );
}

/** A typed limit: empty keeps the guess, a whole number above zero declares it, anything else is refused. */
function parsedLimit(raw: string): number | null | undefined {
  const text = raw.trim();
  if (text === "") {
    return null;
  }
  const value = Number(text);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function ConnectionLimitsBody({ connectionId, declared, onDone, trpc, invalidation }: ConnectionLimitsStepProps): ReactElement {
  const { data: view } = useSuspenseQuery(trpc.connection.capabilities.queryOptions({ connectionId }));
  const update = useUpdateConnection({ trpc, invalidation, failureShownInline: "the add dialog's limits step failure line" });
  const [limits] = useState(() => guessedLimits(view.capability, declared, view.baseline));
  const [drafts, setDrafts] = useState<Readonly<Record<GuessedLimit["kind"], string>>>({ window: "", output: "" });
  const [failure, setFailure] = useState<string | null>(null);
  const typed = limits.map((limit) => ({ limit, value: parsedLimit(drafts[limit.kind]) }));
  const invalid = typed.some((entry) => entry.value === undefined);
  const declaring = typed.filter((entry): entry is { readonly limit: GuessedLimit; readonly value: number } => typeof entry.value === "number");

  const save = (): void => {
    setFailure(null);
    const next = declaring.reduce<DeclaredCapability | null>((block, entry) => withDeclaredOverride(block, entry.limit.row, entry.value), declared);
    update
      .mutateAsync({ connectionId, patch: { declared: next } })
      .then(onDone)
      .catch((error: unknown): void => setFailure(errorMessage(error)));
  };

  return (
    <Stack gap="block" data-slot="connection-limits-step">
      <Text cap="prose" prose={true} voice="gloss">
        {CONNECTION_LIMITS_LEAD}
      </Text>
      {limits.map(({ kind, row }) => {
        const refused = parsedLimit(drafts[kind]) === undefined;
        return (
          <Field
            description={connectionLimitGuessLabel(tokens(Number(row.draft)))}
            error={refused ? CONNECTION_LIMIT_INVALID : undefined}
            key={kind}
            label={CONNECTION_LIMIT_FIELD_NAMES[kind]}
            orientation="vertical"
          >
            <Input
              autoComplete="off"
              disabled={update.isPending}
              inputMode="numeric"
              onChange={(event): void => setDrafts((current) => ({ ...current, [kind]: event.target.value }))}
              value={drafts[kind]}
            />
          </Field>
        );
      })}
      {failure === null ? null : (
        <Text tone="destructive" role="alert" voice="gloss">
          {connectionLimitsFailureLabel(failure)}
        </Text>
      )}
      <DialogFooter>
        <Button disabled={update.isPending} onClick={onDone} variant="ghost">
          {CONNECTION_LIMITS_KEEP_NAME}
        </Button>
        <Button disabled={invalid || declaring.length === 0} loading={update.isPending} onClick={save}>
          {CONNECTION_LIMITS_SAVE_NAME}
        </Button>
      </DialogFooter>
    </Stack>
  );
}
