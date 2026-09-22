import type { RefinerySchemaId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import type { ReactElement } from "react";
import { useState } from "react";
import { ConfirmDialog } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
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
  const [open, setOpen] = useState(false);
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const remove = useDeleteRefinerySchema({ trpc, invalidation });

  const deleteSchema = (): Promise<void> =>
    remove.mutateAsync({ schemaId: schema.id }).then((): void => {
      notify.success(`Deleted “${schema.name}”.`);
      onDeleted();
    });

  return (
    <>
      <Button intent="destructive" onClick={(): void => setOpen(true)} size="sm" type="button">
        Delete schema
      </Button>
      <ConfirmDialog
        confirmLabel="Delete"
        description={deleteBody(schema.name)}
        forceRender={true}
        onConfirm={deleteSchema}
        onOpenChange={setOpen}
        open={open}
        title={`Delete "${schema.name}"?`}
      />
    </>
  );
}
