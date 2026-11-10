// A triggered confirm cannot be written without its copy, only DestructiveAction carries a trigger, and only the
// confirm's owner can hand a row a ConfirmedAction opener.
import type { ConfirmedAction } from "@orb/client/components";
import { ConfirmDialog, confirmedAction, DestructiveAction } from "@orb/client/components";
import { createElement } from "react";
import { expectTypeOf, test } from "vitest";

const onConfirm = (): void => undefined;
const trigger = createElement("button", { type: "button" });

test("DestructiveAction requires its question and the verb that answers it", () => {
  createElement(DestructiveAction, { confirm: { title: "Delete it?", confirmLabel: "Delete" }, onConfirm, trigger });
  // @ts-expect-error no confirm copy
  createElement(DestructiveAction, { onConfirm, trigger });
  // @ts-expect-error a confirm needs its verb, or it asks the reader to press "Confirm"
  createElement(DestructiveAction, { confirm: { title: "Delete it?" }, onConfirm, trigger });
  // @ts-expect-error a confirm needs its question
  createElement(DestructiveAction, { confirm: { confirmLabel: "Delete" }, onConfirm, trigger });
  // @ts-expect-error the control is the point
  createElement(DestructiveAction, { confirm: { title: "Delete it?", confirmLabel: "Delete" }, onConfirm });
  expectTypeOf<Parameters<typeof DestructiveAction>[0]>().toHaveProperty("confirm");
});

test("a bare ConfirmDialog is controlled, so it never carries the control", () => {
  createElement(ConfirmDialog, { title: "Delete it?", onConfirm, open: true, onOpenChange: (): void => undefined });
  // @ts-expect-error the trigger arm belongs to DestructiveAction
  createElement(ConfirmDialog, { title: "Delete it?", onConfirm, trigger });
  expectTypeOf<Parameters<typeof ConfirmDialog>[0]>().toHaveProperty("title");
});

test("a plain handler is not a ConfirmedAction; only confirmedAction mints one", () => {
  expectTypeOf(onConfirm).not.toExtend<ConfirmedAction>();
  expectTypeOf(confirmedAction(onConfirm)).toExtend<ConfirmedAction>();
  // @ts-expect-error a plain function claims no confirm upstream
  const unproven: ConfirmedAction = onConfirm;
  expectTypeOf(unproven).toBeFunction();
});
