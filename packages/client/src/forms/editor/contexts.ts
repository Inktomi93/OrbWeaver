// The ONE `createFormHookContexts()` call (UI-Lib-TanStack-Form.md §"Composition": "define this
// once") — the context plumbing the bound fields (`useFieldContext<T>`) and form chrome
// (`useFormContext`) consume. Split from use-app-form.ts so the bound components can import the
// contexts without a circular edge through the hook that registers them.

import { createFormHookContexts } from "@tanstack/react-form";

export const { fieldContext, formContext, useFieldContext, useFormContext } = createFormHookContexts();
