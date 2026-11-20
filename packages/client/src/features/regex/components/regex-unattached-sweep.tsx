// The library's line for the scripts attached nowhere: no preset, character or room uses them and they do not run in
// every chat, so they run nowhere. A preset delete leaves one behind when its owner unchecks it. The line counts them
// and offers one delete for all of them, whose confirm lists each by name. The server deletes only those still
// attached nowhere when the confirm lands, so a script another scope took up meanwhile is kept.
//
// The line is omitted, not emptied, while the read settles and when every script is attached somewhere.

import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { ScrollArea } from "@orb/ui/scroll-area";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { DestructiveAction } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { notify, regexScriptTitle } from "#lib";
import { useRemoveUnattachedRegexScripts } from "../hooks/use-regex-library.ts";
import { REGEX_DELETE_UNATTACHED_NAME, REGEX_UNATTACHED_LIST_NAME, regexUnattachedDeleteTitle, regexUnattachedLine } from "../lib/regex-names.ts";

export function RegexUnattachedSweep({ onDeleted }: { readonly onDeleted: (ids: readonly string[]) => void }): ReactElement | null {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const scripts = useQuery(trpc.regex.listUnattached.queryOptions()).data;
  const remove = useRemoveUnattachedRegexScripts({ trpc, invalidation });
  if (scripts === undefined || scripts.length === 0) {
    return null;
  }
  const scriptIds = scripts.map((script) => script.id);
  return (
    <Row align="center" wrap={true} gap="field" data-slot="regex-unattached-sweep">
      <Text voice="gloss">{regexUnattachedLine(scripts.length)}</Text>
      <DestructiveAction
        confirm={{
          confirmLabel: REGEX_DELETE_UNATTACHED_NAME,
          title: regexUnattachedDeleteTitle(scripts.length),
          description: "No preset, character or room uses these scripts, and none runs in every chat. This can't be undone.",
          body: (
            <ScrollArea maxHeight="scrollSm" wrapContent={true}>
              <Stack aria-label={REGEX_UNATTACHED_LIST_NAME} gap="row" role="list">
                {scripts.map((script, index) => (
                  <Text aria-posinset={index + 1} aria-setsize={scripts.length} key={script.id} role="listitem" voice="label">
                    {regexScriptTitle(script)}
                  </Text>
                ))}
              </Stack>
            </ScrollArea>
          ),
        }}
        onConfirm={(): Promise<void> =>
          remove.mutateAsync({ scriptIds }).then(({ affected }): void => {
            onDeleted(scriptIds);
            // The line leaves with the rows it named, so only a sweep that deleted fewer than it listed is told.
            if (affected !== scripts.length) {
              notify.info(`${String(affected)} of ${String(scripts.length)} scripts deleted; the rest are attached again.`);
            }
          })
        }
        trigger={
          <Button variant="outline" size="sm">
            {REGEX_DELETE_UNATTACHED_NAME}
          </Button>
        }
      />
    </Row>
  );
}
