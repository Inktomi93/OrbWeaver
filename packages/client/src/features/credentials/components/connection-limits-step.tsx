// The add dialog's limits step: a new connection whose context window is the fold's guess says so the moment it is
// saved, and takes the real numbers there. It writes the connection's `declared` block through the same fact rows,
// parser and `withDeclaredOverride` the Advanced tier uses, so the step adds no second home for a limit or its rules.
//
// The dialog moves here as soon as the row is created and the step reads the capability itself, with `cachedFacts`: a
// read that dials would run the per-model probe that loads or wakes a local model, only to learn its limits. A row
// with nothing to ask goes straight on, and a failed read offers the same way on as keeping the guess.

import type { DeclaredCapability, ProviderId } from "@orb/contracts/inference";
import { errorMessage } from "@orb/kit/error-message";
import type { UserConnectionId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { CommitFooter, QueryBoundary, useUpdateConnection } from "#components";
import type { Invalidation, Trpc } from "#data";
import { QueryErrorState, SkeletonRows, useSuspenseQuery } from "#data";
import { DIALOG_VERBS } from "#lib";
import type { GuessedLimit } from "../lib/connection-capability-fact-model.ts";
import { guessedLimits } from "../lib/connection-capability-fact-model.ts";
import { boundRefusal, parseFactValue, tokens, withDeclaredOverride } from "../lib/connection-fact-model.ts";
import {
  CONNECTION_LIMIT_FIELD_NAMES,
  CONNECTION_LIMITS_KEEP_NAME,
  CONNECTION_LIMITS_READ_LABEL,
  CONNECTION_LIMITS_SAVE_NAME,
  connectionLimitGuessLabel,
  connectionLimitsFailureLabel,
  connectionLimitsLead,
} from "../lib/credentials-names.ts";

export interface ConnectionLimitsStepProps {
  readonly connectionId: UserConnectionId;
  /** The saved row's provider, which picks where the step says to look for the real numbers. */
  readonly providerId: ProviderId;
  /** The saved row's own declaration, which the step's write extends rather than replaces. */
  readonly declared: DeclaredCapability | null;
  /** Called after a save lands, when the user keeps the guess, or at once when nothing is a guess. */
  readonly onDone: () => void;
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
}

export function ConnectionLimitsStep(props: ConnectionLimitsStepProps): ReactElement {
  return (
    <QueryBoundary
      resetKeys={[props.connectionId]}
      fallback={<SkeletonRows count={3} />}
      renderError={(_error, retry): ReactElement => (
        <QueryErrorState
          label={CONNECTION_LIMITS_READ_LABEL}
          onRetry={retry}
          renderRetry={(onRetry): ReactElement => (
            <Row gap="field" justify="center" wrap={true}>
              <Button onClick={onRetry} variant="ghost">
                {DIALOG_VERBS.retry}
              </Button>
              <Button onClick={props.onDone}>{CONNECTION_LIMITS_KEEP_NAME}</Button>
            </Row>
          )}
        />
      )}
    >
      <ConnectionLimitsBody {...props} />
    </QueryBoundary>
  );
}

function ConnectionLimitsBody(props: ConnectionLimitsStepProps): ReactElement | null {
  const { data: view } = useSuspenseQuery(props.trpc.connection.capabilities.queryOptions({ connectionId: props.connectionId, cachedFacts: true }));
  // Frozen at the first read: the save's own invalidation re-reads a capability whose limits are no longer guesses.
  const [limits] = useState(() => guessedLimits(view.capability, props.declared, view.baseline));
  const { onDone } = props;
  const nothingToAsk = limits.length === 0;
  useEffect(() => {
    if (nothingToAsk) {
      onDone();
    }
  }, [nothingToAsk, onDone]);
  return nothingToAsk ? null : <LimitsForm {...props} limits={limits} />;
}

function LimitsForm({
  connectionId,
  providerId,
  declared,
  onDone,
  trpc,
  invalidation,
  limits,
}: ConnectionLimitsStepProps & { readonly limits: readonly GuessedLimit[] }): ReactElement {
  const update = useUpdateConnection({ trpc, invalidation, failureShownInline: "the add dialog's limits step failure line" });
  const [drafts, setDrafts] = useState<Readonly<Record<GuessedLimit["kind"], string>>>({ window: "", output: "" });
  const [failure, setFailure] = useState<string | null>(null);
  const refusals = limits.map(({ kind, row }) => boundRefusal(row.edit, drafts[kind]));
  const declaring = limits.filter(({ kind }) => drafts[kind].trim() !== "");
  const invalid = refusals.some((refusal) => refusal !== null);

  const save = (): void => {
    setFailure(null);
    const next = declaring.reduce<DeclaredCapability | null>(
      (block, { kind, row }) => withDeclaredOverride(block, row, parseFactValue(row.edit, drafts[kind])),
      declared,
    );
    update
      .mutateAsync({ connectionId, patch: { declared: next } })
      .then(onDone)
      .catch((error: unknown): void => setFailure(errorMessage(error)));
  };

  return (
    <Stack gap="block" data-slot="connection-limits-step">
      <Stack gap="tight">
        {connectionLimitsLead(
          limits.some(({ kind }) => kind === "output"),
          providerId,
        ).map((line) => (
          <Text cap="prose" key={line} prose={true} voice="gloss">
            {line}
          </Text>
        ))}
      </Stack>
      {limits.map(({ kind, row }, index) => (
        <Field
          description={connectionLimitGuessLabel(tokens(Number(row.draft)))}
          error={refusals[index] ?? undefined}
          key={kind}
          label={CONNECTION_LIMIT_FIELD_NAMES[kind]}
          orientation="vertical"
        >
          <Input
            autoComplete="off"
            disabled={update.isPending}
            inputMode="text"
            onChange={(event): void => setDrafts((current) => ({ ...current, [kind]: event.target.value }))}
            value={drafts[kind]}
          />
        </Field>
      ))}
      {failure === null ? null : (
        <Text tone="destructive" role="alert" voice="gloss">
          {connectionLimitsFailureLabel(failure)}
        </Text>
      )}
      {/* The row already exists, so the corner close is the way out and keeping the guess is the lead. */}
      <CommitFooter
        exit="corner"
        footerLead={
          <Button disabled={update.isPending} onClick={onDone} variant="ghost">
            {CONNECTION_LIMITS_KEEP_NAME}
          </Button>
        }
        submit={{ label: CONNECTION_LIMITS_SAVE_NAME, onSubmit: save, disabled: invalid || declaring.length === 0, loading: update.isPending }}
      />
    </Stack>
  );
}
