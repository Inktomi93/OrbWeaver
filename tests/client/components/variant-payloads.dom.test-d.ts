import type { ReactElement } from "react";
import { expectTypeOf, test } from "vitest";
import type { ConfirmDialogProps } from "#client/components/confirm-dialog.tsx";

test("a controlled confirm supplies its change callback without excluding a trigger", () => {
  type Common = Pick<ConfirmDialogProps, "title" | "onConfirm">;
  expectTypeOf<Common & { open: true }>().not.toExtend<ConfirmDialogProps>();
  expectTypeOf<Common & { onOpenChange: (open: boolean) => void }>().not.toExtend<ConfirmDialogProps>();
  expectTypeOf<Common>().toExtend<ConfirmDialogProps>();
  expectTypeOf<Common & { open: boolean; onOpenChange: (open: boolean) => void; trigger: ReactElement }>().toExtend<ConfirmDialogProps>();
});
