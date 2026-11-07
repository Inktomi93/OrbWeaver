import { ConfirmDialog } from "#components";

export const Held = ({ open, setOpen, onConfirm }) => <ConfirmDialog open={open} onOpenChange={setOpen} onConfirm={onConfirm} title="Held" />;
