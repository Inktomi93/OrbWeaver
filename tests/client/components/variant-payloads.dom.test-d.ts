import type { ReactElement } from "react";
import { expectTypeOf, test } from "vitest";
import type { ConfirmDialogProps } from "#client/components/confirm-dialog.tsx";

test("a controlled confirm supplies its state and its change callback, and takes no trigger", () => {
  type Common = Pick<ConfirmDialogProps, "title" | "onConfirm">;
  type Controlled = Common & { open: boolean; onOpenChange: (open: boolean) => void };
  expectTypeOf<Common & { open: true }>().not.toExtend<ConfirmDialogProps>();
  expectTypeOf<Common & { onOpenChange: (open: boolean) => void }>().not.toExtend<ConfirmDialogProps>();
  expectTypeOf<Common & { trigger: ReactElement }>().not.toExtend<ConfirmDialogProps>();
  expectTypeOf<Controlled>().toExtend<ConfirmDialogProps>();
});
