import { QueryBoundary } from "@orb/client/components";
import { QueryErrorState, useInvalidation, useTRPC } from "@orb/client/data";
import { RulesSection } from "@orb/client/features/automation";
import { bindDurableLocalToUser } from "@orb/client/state";
import type { ChatId, VerifiedUserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { CtDataProviders } from "../../../support/browser/ct-data-providers.tsx";
import { CtToastSurface } from "../../lib/_ct-stories.tsx";
import { OwnerAutomationSectionsStory } from "./_ct-stories.tsx";

function BoundRules({ chatId, owner }: { readonly chatId: ChatId | null; readonly owner: string }): ReactElement {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    // Test-only verified identity: production still mints this brand solely from sessions.me.
    bindDurableLocalToUser(castId<VerifiedUserId>(owner))
      .then(() => setReady(true))
      .catch((reason: Error) => setError(reason.message));
  }, [owner]);
  if (error !== null) {
    return <Text role="alert">{error}</Text>;
  }
  if (!ready) {
    return <Text>Loading account drafts…</Text>;
  }
  if (chatId === null) {
    return <OwnerAutomationSectionsStory />;
  }
  return (
    <QueryBoundary fallback={<Text>Loading rules…</Text>} renderError={(_error, retry): ReactElement => <QueryErrorState label="rules" onRetry={retry} />}>
      <RulesSection chatId={chatId} />
    </QueryBoundary>
  );
}

/** The real per-user durable binding and remount boundary, with network controlled by CT. */
export function RuleEditorRulesStory({
  chatId,
  firstOwner,
  secondOwner,
  secondChatId,
  paneWidth,
}: {
  readonly chatId: ChatId | null;
  readonly firstOwner: string;
  readonly secondOwner: string;
  readonly secondChatId?: ChatId;
  /** The host pane width; defaults to the docked context pane (chat) or the configuration column (library). */
  readonly paneWidth?: number;
}): ReactElement {
  const [owner, setOwner] = useState(firstOwner);
  const [epoch, setEpoch] = useState(0);
  const [currentChat, setCurrentChat] = useState(chatId);
  return (
    <CtDataProviders>
      <CtToastSurface>
        <div style={{ width: paneWidth ?? (chatId === null ? 560 : 384) }}>
          <Text>Current account: {owner === firstOwner ? "First" : "Second"}</Text>
          <Button onClick={(): void => setOwner(owner === firstOwner ? secondOwner : firstOwner)}>Switch account</Button>
          <Button onClick={(): void => setEpoch((value) => value + 1)}>Reopen rules surface</Button>
          {secondChatId === undefined ? null : (
            <Button onClick={(): void => setCurrentChat(currentChat === chatId ? secondChatId : chatId)}>Switch chat</Button>
          )}
          {secondChatId === undefined ? null : <WarmRules chatId={secondChatId} />}
          <RefreshRules chatId={currentChat} />
          <BoundRules key={`${owner}:${epoch}`} chatId={currentChat} owner={owner} />
        </div>
      </CtToastSurface>
    </CtDataProviders>
  );
}

function RefreshRules({ chatId }: { readonly chatId: ChatId | null }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  return (
    <Button
      onClick={(): void =>
        invalidation.invalidateFilters([chatId === null ? trpc.automation.listOwnerRules.queryFilter() : trpc.automation.listRules.queryFilter({ chatId })])
      }
    >
      Refresh rules
    </Button>
  );
}

function WarmRules({ chatId }: { readonly chatId: ChatId }): ReactElement {
  const trpc = useTRPC();
  const query = useQuery(trpc.automation.listRules.queryOptions({ chatId }));
  return <Text>{query.isSuccess ? "Second chat loaded" : "Loading second chat"}</Text>;
}
