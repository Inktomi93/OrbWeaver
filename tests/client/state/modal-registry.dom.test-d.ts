import type { ModalCommit, ModalDefinition } from "@orb/client/state";
import { expectTypeOf, test } from "vitest";

declare const base: Pick<ModalDefinition, "id" | "title" | "trigger">;
declare const content: ModalCommit["content"];

test("a commit modal declares its submit, so the host can draw its footer", () => {
  const commit: ModalDefinition = { ...base, body: { useCommit: (): ModalCommit => ({ content, submit: { label: "Add", onSubmit: (): void => undefined } }) } };
  const drawer: ModalDefinition = {
    ...base,
    presentation: "drawer",
    body: { useCommit: (): ModalCommit => ({ content, submit: { label: "Add", onSubmit: (): void => undefined } }) },
  };
  // @ts-expect-error a commit body that returns no submit is refused
  const noSubmit: ModalDefinition = { ...base, body: { useCommit: () => ({ content }) } };
  // @ts-expect-error a submit with no handler is refused
  const noHandler: ModalDefinition = { ...base, body: { useCommit: () => ({ content, submit: { label: "Add" } }) } };
  expectTypeOf([commit, drawer, noSubmit, noHandler]).toEqualTypeOf<ModalDefinition[]>();
});
