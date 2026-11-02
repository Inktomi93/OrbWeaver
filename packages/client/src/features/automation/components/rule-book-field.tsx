import type { ChatId, WorldBookId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { Field } from "@orb/ui/field";
import { Stack } from "@orb/ui/layout";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { QueryBoundary } from "#components";
import { QueryErrorState, SkeletonRows, useSuspenseQuery, useTRPC } from "#data";

interface RuleBookFieldProps {
  readonly chatId: ChatId | null;
  readonly value: WorldBookId | "";
  readonly onChange: (value: WorldBookId) => void;
  readonly error: string | null;
  readonly onBlur: () => void;
}

interface BookRow {
  readonly id: string;
  readonly name: string;
}

/** Chat writes choose attached books; global writes choose the caller's own library. */
export function RuleBookField(props: RuleBookFieldProps): ReactElement {
  return (
    <QueryBoundary
      resetKeys={[props.chatId]}
      fallback={<SkeletonRows count={2} shape="line" />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="world books" onRetry={retry} />}
    >
      {props.chatId === null ? <OwnedBookField {...props} /> : <AttachedBookField {...props} chatId={props.chatId} />}
    </QueryBoundary>
  );
}

function OwnedBookField(props: RuleBookFieldProps): ReactElement {
  const trpc = useTRPC();
  const { data: books } = useSuspenseQuery(trpc.worldInfo.listBooks.queryOptions());
  return <BookSelect {...props} books={books} />;
}

function AttachedBookField(props: RuleBookFieldProps & { readonly chatId: ChatId }): ReactElement {
  const trpc = useTRPC();
  const { data: books } = useSuspenseQuery(trpc.worldInfo.listForChat.queryOptions({ chatId: props.chatId }));
  return <BookSelect {...props} books={books} />;
}

function BookSelect({ chatId, value, onChange, error, onBlur, books }: RuleBookFieldProps & { readonly books: readonly BookRow[] }): ReactElement {
  const items = books.map((book) => ({ value: book.id, label: book.name }));
  const unavailable = value.length > 0 && !items.some((item) => item.value === value);
  return (
    <Stack gap="tight">
      <Field label="World book" error={error}>
        {/* eslint-disable-next-line jsx-a11y/control-has-associated-label -- the label association flows through Base UI's FieldRootContext at render time, the same as `SelectField`. */}
        <Select
          onOpenChange={(open): void => {
            if (!open) {
              onBlur();
            }
          }}
          value={value === "" ? null : value}
          placeholder="Choose a world book…"
          items={unavailable ? [...items, { value, label: `Unavailable book (${value})` }] : items}
          onValueChange={(next): void => {
            const book = typeIdSchema(ID_PREFIX.worldBook).safeParse(next);
            if (book.success) {
              onChange(book.data);
            }
          }}
        />
      </Field>
      {items.length === 0 ? <Text voice="gloss">{emptyBookGuidance(chatId)}</Text> : null}
      {unavailable ? <Text voice="gloss">The saved book is retained. Replace it deliberately; an unavailable book can prevent saving.</Text> : null}
    </Stack>
  );
}

function emptyBookGuidance(chatId: ChatId | null): string {
  return chatId === null
    ? "Create a world book in your library to use this action."
    : "Attach a world book in this chat’s World books section to use this action.";
}
