// The add dialog's limits step: a new connection whose context window is the fold's guess says so the moment it is
// saved, and takes the real answers there, with the image answer beside them when that is a guess too. It writes the
// connection's `declared` block through the same fact rows, parser and `withDeclaredOverride` the Advanced tier uses,
// so the step adds no second home for a limit, the image answer or their rules. The image switch opens on the guess and
// writes only when the user changes it.
//
// The dialog moves here as soon as the row is created and the step reads the capability itself, with `listFacts`: the
// server's model list states what it states about the model, but the per-model probe that loads or wakes a local
// model is never run just to learn its limits. A row with nothing to ask goes straight on, and a failed read offers
// the same way on as keeping the guess. Both add dialogs mount this one step.

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
import type { GuessedLimit, ImageInputSwitch } from "../lib/connection-capability-fact-model.ts";
import { guessedLimits, imageInputSwitch, withImageInput } from "../lib/connection-capability-fact-model.ts";
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
import { ConnectionImageSwitch } from "./connection-image-switch.tsx";

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
  const { data: view } = useSuspenseQuery(props.trpc.connection.capabilities.queryOptions({ connectionId: props.connectionId, listFacts: true }));
  // Frozen at the first read: the save's own invalidation re-reads a capability whose answers are no longer guesses.
  // A guessed window raises the step; an assumed image answer rides along but never raises it alone, since every add on
  // a server that reports no inputs would otherwise stop here.
  const [asks] = useState(() => {
    const limits = guessedLimits(view.capability, props.declared, view.baseline);
    const image = limits.length === 0 ? undefined : imageInputSwitch(view.capability, props.declared, view.baseline);
    return { limits, image: image?.provenance === "assumed" ? image : undefined };
  });
  const { onDone } = props;
  const nothingToAsk = asks.limits.length === 0;
  useEffect(() => {
    if (nothingToAsk) {
      onDone();
    }
  }, [nothingToAsk, onDone]);
  return nothingToAsk ? null : <LimitsForm {...props} image={asks.image} limits={asks.limits} />;
}

function LimitsForm({
  connectionId,
  providerId,
  declared,
  onDone,
  trpc,
  invalidation,
  limits,
  image,
}: ConnectionLimitsStepProps & { readonly limits: readonly GuessedLimit[]; readonly image: ImageInputSwitch | undefined }): ReactElement {
  const update = useUpdateConnection({ trpc, invalidation, failureShownInline: "the add dialog's limits step failure line" });
  const [drafts, setDrafts] = useState<Readonly<Record<GuessedLimit["kind"], string>>>({ window: "", output: "" });
  const [takesImages, setTakesImages] = useState(image?.on ?? false);
  const [failure, setFailure] = useState<string | null>(null);
  const refusals = limits.map(({ kind, row }) => boundRefusal(row.edit, drafts[kind]));
  const declaring = limits.filter(({ kind }) => drafts[kind].trim() !== "");
  // The switch opens on the guess, so only an answer that differs from it is a declaration; leaving it keeps the guess.
  const imageChange = image !== undefined && takesImages !== image.on ? image : undefined;
  const invalid = refusals.some((refusal) => refusal !== null);

  const save = (): void => {
    setFailure(null);
    const limited = declaring.reduce<DeclaredCapability | null>(
      (block, { kind, row }) => withDeclaredOverride(block, row, parseFactValue(row.edit, drafts[kind])),
      declared,
    );
    const next = imageChange === undefined ? limited : withImageInput(limited, imageChange, takesImages);
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
      {image === undefined ? null : <ConnectionImageSwitch answer={image} checked={takesImages} disabled={update.isPending} onCheckedChange={setTakesImages} />}
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
        submit={{
          label: CONNECTION_LIMITS_SAVE_NAME,
          onSubmit: save,
          disabled: invalid || (declaring.length === 0 && imageChange === undefined),
          loading: update.isPending,
        }}
      />
    </Stack>
  );
}
