// The per-injection-row autosave form (task #28 — one row in the Injections tab). Each persisted
// injection is edited in place by its OWN `useInjectionRowForm` instance (a component per row, keyed by
// the injection id ⇒ stable `mountKey`), autosaving each change back through `chat.setChatInjection`
// (upsert with the row's id). The factory is module-scope (stable hook identity, §13.1); the persist fn
// arrives at CALL time (closes over the live tRPC client + the row's id/chatId) — the appearance-form seam.
//
// ALL-STRINGS-plus-number projection: position/role are the wire unions but the bound `SelectField` is
// string-valued by design (§ bound-fields), so the form works in `string` and the save seam casts back at
// the boundary; `depth` is `number | null` (the bound `NumberField`'s controlled shape — null = empty →
// coerced to 0 on save). `order` (priority-within-depth) is NOT surfaced in v1 (a rarely-touched tiebreak).

import type { ChatInjection } from "@orb/contracts/chat";
import { createAutosaveEntityForm } from "#forms";

/** The row form's edit shape (see the header — position/role as strings, depth as the NumberField's
 *  `number | null`). */
export interface InjectionFormValues {
  readonly position: string;
  readonly role: string;
  readonly depth: number | null;
  readonly content: string;
}

const DEFAULT_INJECTION_FORM: InjectionFormValues = {
  position: "in_chat",
  role: "system",
  depth: 0,
  content: "",
};

/** A persisted injection (the `chat.listChatInjections` row) → the row form's edit shape. */
export function toInjectionForm(injection: ChatInjection): InjectionFormValues {
  return {
    position: injection.position,
    role: injection.role,
    depth: injection.depth,
    content: injection.content,
  };
}

export const useInjectionRowForm = createAutosaveEntityForm<InjectionFormValues>({
  defaultValues: DEFAULT_INJECTION_FORM,
});
