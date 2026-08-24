// snippet-console — the SECOND authoring mode: type code, run it once in this room as yourself, read what
// it logged. A personal REPL against the same `PluginHostV1` membrane an installed plugin sees, with no
// residency, no manifest and no registrations (`domain/plugin/verbs/run-snippet.ts`).
//
// WHY IT LIVES IN THE CHAT AND NOT THE PLUGINS PANE: `runSnippet` takes a `chatId` and runs against THAT
// room's canon and variables. A console in the settings modal would have no room to speak of, so it would
// have to invent a chat picker — a surface lying about its own scope. The room is the scope, so the room is
// the home.
//
// THE FIXED GRANT PROFILE IS THE CALLER'S, and the console says so before anyone wonders why a write
// silently did nothing: a snippet always gets `chat.read` + `global_vars`, and `chat.variables.write` ONLY
// when the caller hosts the room (`run-snippet.ts:32`). Everything else — quick replies, storage, notify,
// tools, events, transforms — is absent from the profile by construction, because a transient anonymous
// snippet has no plugin identity to attribute or disable.
//
// REFUSALS ARE SHOWN, NEVER HUNG. Two distinct outcomes and they are not the same thing: the mutation
// THROWS on the per-user concurrency ceiling (`PluginSnippetBusyError` — up to 4 contexts at once, whose
// message already says "wait for one to finish"), which rides the shared error toast; and the mutation
// RESOLVES with a contained `error` field when the snippet itself threw or hit its 5 s wall, which is data
// and is rendered inline beside the log. A REPL that swallowed the second one would look like a hang.

import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { LogViewer } from "@orb/ui/log-viewer";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Trpc } from "#data";
import { useInvalidation, useTRPC } from "#data";
import { useRunSnippet } from "../lib/plugin-mutations.ts";

type SnippetResult = inferOutput<Trpc["plugin"]["runSnippet"]>;

/** The transport's own `code` ceiling (`SNIPPET_CODE_MAX`) — a REPL line typed in a box, not a shipped
 *  bundle, which rides install. Mirrored so an over-cap paste is refused inline. */
const SNIPPET_CODE_MAX = 65_536;

/** What the box starts with — a runnable line that reads the room, so the first Run proves the membrane is
 *  there instead of returning an empty log. The inner backticks are escaped: this is guest SOURCE, and it
 *  has to reach the textarea spelled exactly as a plugin author would type it. */
const STARTER = `const chat = host.chat.current();
const messages = await host.chat.listMessages(chat, { limit: 5 });
host.log.info(\`\${messages.length} messages\`);
`;

export interface SnippetConsoleProps {
  readonly chatId: ChatId;
}

export function SnippetConsole({ chatId }: SnippetConsoleProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const runSnippet = useRunSnippet({ trpc, invalidation });
  const [code, setCode] = useState(STARTER);
  const [result, setResult] = useState<SnippetResult | null>(null);

  const overCap = code.length > SNIPPET_CODE_MAX;

  const onRun = (): void => {
    setResult(null);
    runSnippet.mutateAsync({ chatId, code }).then(setResult, () => undefined);
  };

  return (
    <Stack gap="block">
      <Text voice="gloss">
        Run a one-off script against this room, as you. It can read the messages and variables you can, and write room variables only if you host the room.
        Nothing is installed and nothing sticks around.
      </Text>

      <Textarea
        aria-label="Snippet code"
        className="font-mono"
        onChange={(event): void => setCode(event.target.value)}
        rows={8}
        spellCheck={false}
        value={code}
      />

      {overCap ? (
        <Text className="text-destructive" role="alert">
          That's longer than a snippet can be. Ship code this size as an installed plugin instead.
        </Text>
      ) : null}

      <Row gap="field" justify="start">
        <Button disabled={overCap || code.trim().length === 0} intent="secondary" loading={runSnippet.isPending} onClick={onRun}>
          Run
        </Button>
      </Row>

      {result === null ? null : <SnippetOutput result={result} />}
    </Stack>
  );
}

/** The drained log plus the contained error, if the run produced one. `role="status"`: the output appears
 *  asynchronously after a button press, so without it a screen-reader user hears nothing at all. */
function SnippetOutput({ result }: { readonly result: SnippetResult }): ReactElement {
  return (
    <Stack aria-label="Snippet output" gap="block" role="status">
      {result.logLines.length === 0 ? <Text voice="gloss">It ran and logged nothing.</Text> : <LogViewer className="max-h-48" lines={[...result.logLines]} />}
      {result.error === undefined ? null : (
        <Text className="text-destructive" voice="gloss">
          {result.error}
        </Text>
      )}
    </Stack>
  );
}
