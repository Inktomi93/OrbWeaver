import type { RefinerySchemaId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import type { ReactElement } from "react";
import { DestructiveAction } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { deleteConfirmTitle, notify } from "#lib";
import { useDeleteRefinerySchema } from "../hooks/use-refinery-schemas.ts";

interface DeletableSchema {
  readonly id: RefinerySchemaId;
  readonly name: string;
}

/** Deletion removes the reusable library row. Prior runs embedded the schema they used, while a session
 * still pointing at this row must choose another schema before its next run. */
function deleteBody(name: string): string {
  return `“${name}” leaves your schema library. Past refinery runs keep their embedded results, but sessions using it must choose another schema before running again.`;
}

export function DeleteSchemaAction({ schema, onDeleted }: { readonly schema: DeletableSchema; readonly onDeleted: () => void }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const remove = useDeleteRefinerySchema({ trpc, invalidation, failureShownInline: "the delete-schema confirm's alert line" });

  const deleteSchema = (): Promise<void> =>
    remove.mutateAsync({ schemaId: schema.id }).then((): void => {
      notify.success(`Deleted “${schema.name}”.`);
      onDeleted();
    });

  return (
    <DestructiveAction
      confirm={{ confirmLabel: "Delete", description: deleteBody(schema.name), title: deleteConfirmTitle(schema.name) }}
      forceRender={true}
      onConfirm={deleteSchema}
      trigger={
        <Button tone="destructive" size="sm" type="button">
          Delete schema
        </Button>
      }
    />
  );
}
