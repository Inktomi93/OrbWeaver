import { useInvalidation, useTRPC } from "@orb/client/data";
import { beginRuleCreation, bindDurableLocalToUser } from "@orb/client/state";
import type { ChatId, UserId, VerifiedUserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { QueryClient } from "@tanstack/react-query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { useRuleAutosave } from "../../../packages/client/src/features/automation/hooks/use-rule-autosave.ts";
import { ruleEditorValues } from "../../../packages/client/src/features/automation/lib/rule-editor-model.ts";
import { editableRule } from "../../../packages/client/src/features/automation/lib/rule-save-session.ts";
import { CtDataProviders } from "../../support/browser/ct-data-providers.tsx";

interface RuleEchoProps {
  readonly row: Parameters<typeof editableRule>[0];
  readonly firstOwner: UserId;
  readonly secondOwner: UserId;
  readonly firstChat: ChatId;
  readonly secondChat: ChatId;
  readonly creating?: boolean;
  readonly cold?: boolean;
  readonly holdCancellation?: boolean;
}

const OBSERVATION_KEY = ["rule-echo-observation"] as const;
const INITIAL_OBSERVATION: {
  readonly cancelled: string;
  readonly reconciliations: number;
  readonly release: (() => void) | null;
} = { cancelled: "none", reconciliations: 0, release: null };

function configureRuleEchoClient(queryClient: QueryClient, holdCancellation: boolean): void {
  queryClient.setQueryData(OBSERVATION_KEY, INITIAL_OBSERVATION);
  const cancel = queryClient.cancelQueries.bind(queryClient);
  const invalidate = queryClient.invalidateQueries.bind(queryClient);
  queryClient.invalidateQueries = (filters, options): Promise<void> => {
    queryClient.setQueryData<typeof INITIAL_OBSERVATION>(OBSERVATION_KEY, (old) => ({
      ...(old ?? INITIAL_OBSERVATION),
      reconciliations: (old?.reconciliations ?? 0) + 1,
    }));
    return invalidate(filters, options);
  };
  queryClient.cancelQueries = async (filters, options): Promise<void> => {
    queryClient.setQueryData<typeof INITIAL_OBSERVATION>(OBSERVATION_KEY, (old) => ({
      ...(old ?? INITIAL_OBSERVATION),
      cancelled: JSON.stringify(filters),
    }));
    await cancel(filters, options);
    if (holdCancellation) {
      await new Promise<void>((resolve) => {
        queryClient.setQueryData<typeof INITIAL_OBSERVATION>(OBSERVATION_KEY, (old) => ({
          ...(old ?? INITIAL_OBSERVATION),
          release: resolve,
        }));
      });
    }
  };
}

/** Actual rule queue and mutation hooks, with only network and cancellation timing controlled. */
export function RuleMutationEchoStory(props: RuleEchoProps): ReactElement {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    // Test fixture only; production verification is minted by sessions.me recovery.
    void bindDurableLocalToUser(castId<VerifiedUserId>(props.firstOwner))
      .then(() => setReady(true))
      .catch((reason: Error) => setError(reason.message));
  }, [props.firstOwner]);
  if (error !== null) {
    return (
      <CtDataProviders>
        <p role="alert">{error}</p>
      </CtDataProviders>
    );
  }
  return (
    <CtDataProviders configureQueryClient={(client): void => configureRuleEchoClient(client, props.holdCancellation ?? false)}>
      {ready ? <RuleMutationEchoInner {...props} /> : <p>Binding owner</p>}
    </CtDataProviders>
  );
}

function RuleMutationEchoInner(props: RuleEchoProps): ReactElement {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const invalidation = useInvalidation();
  const scope = props.row.chatId;
  const targetKey = scope === null ? trpc.automation.listOwnerRules.queryKey() : trpc.automation.listRules.queryKey({ chatId: scope });
  const [creation] = useState(() => (props.creating ? beginRuleCreation(scope, props.firstOwner) : null));
  const session = useRuleAutosave({
    owner: props.firstOwner,
    chatId: scope,
    creation,
    ruleId: props.creating ? null : props.row.id,
    rule: props.creating ? null : props.row,
  });
  const global = useQuery(trpc.automation.listOwnerRules.queryOptions(undefined, { enabled: !props.cold || scope !== null }));
  const first = useQuery(trpc.automation.listRules.queryOptions({ chatId: props.firstChat }, { enabled: !props.cold || scope !== props.firstChat }));
  const second = useQuery(trpc.automation.listRules.queryOptions({ chatId: props.secondChat }));
  const [owner, setOwner] = useState("First");
  const [settled, setSettled] = useState("idle");
  const { data: observation } = useQuery({ queryKey: OBSERVATION_KEY, enabled: false, initialData: INITIAL_OBSERVATION });
  const { cancelled, reconciliations, release } = observation;
  const readTarget = (): string => {
    const rows = queryClient.getQueryData<readonly Parameters<typeof editableRule>[0][]>(targetKey);
    return rows === undefined ? "absent" : JSON.stringify(rows);
  };
  return (
    <div>
      <output aria-label="Global rules">{global.data === undefined ? "absent" : JSON.stringify(global.data)}</output>
      <output aria-label="First chat rules">{first.data === undefined ? "absent" : JSON.stringify(first.data)}</output>
      <output aria-label="Second chat rules">{second.data === undefined ? "absent" : JSON.stringify(second.data)}</output>
      <output aria-label="Settled cache">{settled}</output>
      <output aria-label="Cancellation">{cancelled}</output>
      <output aria-label="Scope reconciliations">{reconciliations}</output>
      <output aria-label="Bound owner">{owner}</output>
      <button
        type="button"
        onClick={(): void => {
          const body = { ...editableRule(props.row), name: "Committed B" };
          void session
            .save(ruleEditorValues(body, creation?.requestId ?? props.row.id))
            .then(() => setSettled(readTarget()))
            .catch((error: Error) => setSettled(`failed:${error.message}`));
        }}
      >
        Save rule
      </button>
      <button
        type="button"
        onClick={(): void =>
          invalidation.invalidateFilters([
            scope === null ? trpc.automation.listOwnerRules.queryFilter() : trpc.automation.listRules.queryFilter({ chatId: scope }),
          ])
        }
      >
        Refresh scope
      </button>
      <button
        type="button"
        onClick={(): void => {
          void bindDurableLocalToUser(castId<VerifiedUserId>(props.secondOwner))
            .then(() => {
              setOwner("Second");
              invalidation.invalidateFilters([
                scope === null ? trpc.automation.listOwnerRules.queryFilter() : trpc.automation.listRules.queryFilter({ chatId: scope }),
              ]);
            })
            .catch((error: Error) => setSettled(`failed:${error.message}`));
        }}
      >
        Switch verified owner
      </button>
      <button type="button" disabled={release === null} onClick={(): void => release?.()}>
        Release cancellation
      </button>
      <button type="button" onClick={(): void => setSettled(readTarget())}>
        Read cache
      </button>
    </div>
  );
}
