import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { skipToken, useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useId } from "react";
import { useTRPC } from "#data";
import { notify } from "#lib";

/** Chat writes choose attached books; global writes choose the caller's own library. */
export function RuleBookField({
  chatId,
  value,
  onChange,
  error,
  onBlur,
}: {
  readonly chatId: ChatId | null;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly error: string | null;
  readonly onBlur: () => void;
}): ReactElement {
  const trpc = useTRPC();
  const id = useId();
  const labelId = `${id}-label`;
  const attached = useQuery(trpc.worldInfo.listForChat.queryOptions(chatId === null ? skipToken : { chatId }));
  const owned = useQuery(trpc.worldInfo.listBooks.queryOptions(undefined, { enabled: chatId === null }));
  const query = chatId === null ? owned : attached;
  const items = (query.data ?? []).map((book) => ({ value: book.id, label: book.name }));
  const unavailable = value.length > 0 && !items.some((item) => item.value === value);
  return (
    <Stack gap="tight">
      <label id={labelId} htmlFor={id}>
        World book
      </label>
      <Select
        id={id}
        aria-labelledby={labelId}
        aria-invalid={error !== null}
        {...(error === null ? {} : { "aria-describedby": `${id}-error` })}
        onOpenChange={(open): void => {
          if (!open) {
            onBlur();
          }
        }}
        value={value || null}
        placeholder="Choose a world book…"
        items={unavailable ? [...items, { value, label: `Unavailable book (${value})` }] : items}
        onValueChange={(next): void => {
          if (next !== null) {
            onChange(next);
          }
        }}
      />
      {error === null ? null : (
        <Text id={`${id}-error`} role="alert" className="text-destructive">
          {error}
        </Text>
      )}
      {query.isPending ? <Text voice="gloss">Loading world books…</Text> : null}
      {query.isError ? (
        <>
          <Text voice="gloss">Couldn't load world books. Your selection is unchanged.</Text>
          <Button
            intent="ghost"
            onClick={(): void => {
              query.refetch().catch(() => notify.error("Couldn’t refresh world books."));
            }}
          >
            Retry world books
          </Button>
        </>
      ) : null}
      {!(query.isPending || query.isError) && items.length === 0 ? <Text voice="gloss">{emptyBookGuidance(chatId)}</Text> : null}
      {unavailable ? <Text voice="gloss">The saved book is retained. Replace it deliberately; an unavailable book can prevent saving.</Text> : null}
    </Stack>
  );
}

function emptyBookGuidance(chatId: ChatId | null): string {
  return chatId === null
    ? "Create a world book in your library to use this action."
    : "Attach a world book in this chat’s World books section to use this action.";
}
