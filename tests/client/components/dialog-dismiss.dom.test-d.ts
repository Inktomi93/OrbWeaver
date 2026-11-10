// Every dialog has a way out by type: a commit dialog needs a submit, the rest name a dismiss, and only the forced ask has neither.
import {
  ConfirmDialog,
  DestructiveAction,
  DismissDialog,
  FlowDialog,
  FormDialog,
  FormDialogPopup,
  PickerDialog,
  RequiredFormDialog,
  ViewerDialog,
} from "@orb/client/components";
import { createElement } from "react";
import { expectTypeOf, test } from "vitest";

const shared = { title: "Title", open: true, onOpenChange: (): void => undefined, children: "Body" };
const submit = { label: "Save", onSubmit: (): void => undefined };
const frame = { title: "Title", children: "Body" };

test("a footer dismiss has a word on it", () => {
  const word: string = "Close";
  createElement(DismissDialog<"Close">, { ...shared, dismissLabel: "Close" });
  createElement(DismissDialog<string>, { ...shared, dismissLabel: word });
  // @ts-expect-error an empty label draws a button with no name
  createElement(DismissDialog<"">, { ...shared, dismissLabel: "" });
  expectTypeOf<Parameters<typeof DismissDialog<"Close">>[0]>().toHaveProperty("dismissLabel");
});

test("a commit dialog cannot be written without its submit", () => {
  createElement(FormDialog, { ...shared, submit });
  createElement(FormDialogPopup, { ...frame, submit });
  // @ts-expect-error a form with no submit has no commit and no footer
  createElement(FormDialog, shared);
  // @ts-expect-error the popup owns the footer, so it needs the submit too
  createElement(FormDialogPopup, frame);
  // @ts-expect-error a submit names what it does
  createElement(FormDialog, { ...shared, submit: { onSubmit: submit.onSubmit } });
  // @ts-expect-error a commit dialog's dismiss is its Cancel, so no other verb replaces it
  createElement(FormDialog, { ...shared, submit, dismissLabel: "Close" });
  expectTypeOf<Parameters<typeof FormDialog>[0]>().toHaveProperty("submit");
});

test("a dialog with nothing to commit names its way out", () => {
  createElement(DismissDialog, { ...shared, dismissLabel: "Close" });
  createElement(DismissDialog, { ...shared, closeButton: true });
  createElement(DismissDialog, { ...shared, dismissLabel: "Close", closeButton: true });
  // @ts-expect-error neither a footer verb nor a corner glyph
  createElement(DismissDialog, shared);
  // @ts-expect-error `false` draws no glyph
  createElement(DismissDialog, { ...shared, closeButton: false });
  expectTypeOf<Parameters<typeof DismissDialog>[0]>().toHaveProperty("dismissLabel");
});

test("the forced ask takes a submit and no open state", () => {
  createElement(RequiredFormDialog, { ...frame, submit });
  // @ts-expect-error even a forced ask commits
  createElement(RequiredFormDialog, frame);
  // @ts-expect-error it is always open, so nothing can close it
  createElement(RequiredFormDialog, { ...frame, submit, onOpenChange: shared.onOpenChange });
  expectTypeOf<Parameters<typeof RequiredFormDialog>[0]>().toHaveProperty("submit");
});

// Called as functions, the composites infer their label parameter from the literal exactly as JSX does.
test("every composite label refuses an empty literal and takes a computed string", () => {
  const word: string = ["Save", "Close"].join(" ");
  const confirm = { title: "Delete it?", onConfirm: (): void => undefined };
  const trigger = createElement("span");
  FormDialog({ ...shared, submit: { ...submit, label: word } });
  // @ts-expect-error an empty submit label draws a button with no name
  FormDialog({ ...shared, submit: { ...submit, label: "" } });
  // @ts-expect-error the popup's submit is the same button
  FormDialogPopup({ ...frame, submit: { ...submit, label: "" } });
  // @ts-expect-error the forced ask's one button needs its word most of all
  RequiredFormDialog({ ...frame, submit: { ...submit, label: "" } });
  DismissDialog({ ...shared, dismissLabel: word });
  // @ts-expect-error the footer dismiss
  DismissDialog({ ...shared, dismissLabel: "" });
  FlowDialog({ ...shared, dismiss: { at: "footer", label: word } });
  // @ts-expect-error a content dialog's footer dismiss
  FlowDialog({ ...shared, dismiss: { at: "footer", label: "" } });
  ConfirmDialog({ ...confirm, open: true, onOpenChange: shared.onOpenChange, confirmLabel: "Delete", cancelLabel: word });
  // @ts-expect-error a confirm's verb
  ConfirmDialog({ ...confirm, open: true, onOpenChange: shared.onOpenChange, confirmLabel: "" });
  // @ts-expect-error one empty label among two refuses the call
  ConfirmDialog({ ...confirm, open: true, onOpenChange: shared.onOpenChange, confirmLabel: "Delete", cancelLabel: "" });
  DestructiveAction({ onConfirm: confirm.onConfirm, trigger, confirm: { title: confirm.title, confirmLabel: "Delete" } });
  // @ts-expect-error a destructive action's confirm verb
  DestructiveAction({ onConfirm: confirm.onConfirm, trigger, confirm: { title: confirm.title, confirmLabel: "" } });
  expectTypeOf<Parameters<typeof FormDialog<"">>[0]["submit"]["label"]>().toBeNever();
  expectTypeOf<Parameters<typeof FormDialog<string>>[0]["submit"]["label"]>().toBeString();
});

test("a content dialog carries its dismiss, and a viewer or picker defaults it", () => {
  createElement(FlowDialog, { ...shared, dismiss: { at: "footer", label: "Not now" } });
  createElement(FlowDialog, { ...shared, dismiss: { at: "header", glyph: true } });
  createElement(ViewerDialog, shared);
  createElement(PickerDialog, shared);
  // @ts-expect-error a flow's stages own their actions, so it names its way out
  createElement(FlowDialog, shared);
  // @ts-expect-error a footer dismiss needs its verb
  createElement(FlowDialog, { ...shared, dismiss: { at: "footer" } });
  // @ts-expect-error a viewer's dismiss stays in its header
  createElement(ViewerDialog, { ...shared, dismiss: { at: "footer", label: "Close" } });
  expectTypeOf<Parameters<typeof FlowDialog>[0]>().toHaveProperty("dismiss");
});
