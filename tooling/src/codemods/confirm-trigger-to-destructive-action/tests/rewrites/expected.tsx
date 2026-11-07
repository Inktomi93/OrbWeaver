import { ConfirmDialog, DestructiveAction, QueryBoundary } from "#components";

export const Row = ({ onDelete, title }) => (
  <>
    <DestructiveAction confirm={{ confirmLabel: "Delete", title: `Delete "${title}"?` }} onConfirm={onDelete} trigger={<Button variant="ghost">Delete</Button>} />
    <ConfirmDialog open={true} onOpenChange={onDelete} onConfirm={onDelete} title="Held" />
  </>
);
