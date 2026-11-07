import { ConfirmDialog, QueryBoundary } from "#components";

export const Row = ({ onDelete, title }) => (
  <>
    <ConfirmDialog
      confirmLabel="Delete"
      onConfirm={onDelete}
      title={`Delete "${title}"?`}
      trigger={<Button variant="ghost">Delete</Button>}
    />
    <ConfirmDialog open={true} onOpenChange={onDelete} onConfirm={onDelete} title="Held" />
  </>
);
