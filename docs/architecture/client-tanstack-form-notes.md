# TanStack Form — Full-Docs Mine for Orbweaver's Form/Editor Layer

Scope read **in full**: every React guide (`docs/framework/react/guides/*` — arrays, async-initial-values, basic-concepts, custom-errors, debugging, devtools, dynamic-validation, focus-management, form-composition, form-groups, linked-fields, listeners, reactivity, react-native, ssr, submission-handling, ui-libraries, validation), the React reference (`docs/framework/react/reference/**`), the core reference (`docs/reference/**` — FieldApi, FieldGroupApi, FormApi, FormGroupApi, all functions/interfaces/variables/type-aliases), and the top-level docs (overview, philosophy, comparison, installation, typescript, quick-start, community-resources).

Version reality check: docs reflect the current line (form-core with `onDynamic`/`revalidateLogic`, `withFieldGroup`, `createFieldMap`, `formDevtoolsPlugin`, `isDefaultValue`/`isPristine`, the 22-generic FieldApi). Matches orbweaver's `@tanstack/react-form ~1.33+` target.

---

## A. Best-practice / capability map (full surface, grouped)

### Form & field creation
- **`useForm({ defaultValues, onSubmit, validators })`** — the headless core. `defaultValues` is the type source of truth (`philosophy.md` "Generics are grim": never `useForm<T>()`, infer from a typed default object). *(basic-concepts.md, quick-start.md, philosophy.md)*
- **`formOptions(opts)`** — extract shared, typed config; spread into `useForm`/`useAppForm`/`withForm`. Returns `TOptions`, fully inferred. *(reference/functions/formOptions.md, basic-concepts.md)*
- **`form.Field` / render-prop** — most explicit, most verbose; "avoid hasty abstractions, render props are great." *(overview.md, basic-concepts.md)*
- **`field.state`** = `{ value, meta }`; mutate via `field.handleChange(updater)` and `field.handleBlur()`. Always controlled (`philosophy.md` "Controlled is Cool"). *(basic-concepts.md)*

### Composition (the orbweaver backbone)
- **`createFormHookContexts()`** → `{ fieldContext, formContext, useFieldContext, useFormContext }`. Export `useFieldContext`/`useFormContext` for your bound components. *(form-composition.md, reference/functions/createFormHookContexts.md)*
- **`createFormHook({ fieldContext, formContext, fieldComponents, formComponents })`** → `{ useAppForm, withForm, withFieldGroup, useTypedAppFormContext, extendForm }`. "Define this **once**." *(form-composition.md, quick-start.md)* — directly endorses orbweaver's single-instance hard rule.
- **`form.AppField` / `field.<BoundComponent>`** — field bound to context, type-safe `name`. **`form.AppForm` + `form.<FormComponent>`** — form-context components (e.g. SubscribeButton). *(form-composition.md)*
- **`withForm({ ...formOpts, props, render: function Render({form,...}) })`** — split big forms; `defaultValues` here are **type-only**, not runtime. Use a **named** `render` fn (ESLint hooks). Limit chained `extendForm` to **3–5** (TS perf). *(form-composition.md)*
- **`withFieldGroup({ defaultValues, props, onSubmitMeta?, render: ({group}) })`** — reuse a cluster of fields across forms; consumer passes `fields="path"` or a `{key: deepKey}` map (or `createFieldMap(defaults)` for top-level). **Validators here see `form.state.values` as `unknown`** — "ensure your fields can accept unknown error types." *(form-composition.md, reference/functions/createFieldMap.md)*
- **`extendForm({...})`** — downstream teams add components; duplicate component names are a **type error**. *(form-composition.md, reference/functions/createFormHook.md)*
- **Context-as-last-resort** (`useTypedAppFormContext`) — only when you can't pass `form` (e.g. Router `<Outlet/>`); **not type-checked, runtime-error risk.** *(form-composition.md)*
- **Tree-shaking**: `lazy()` + `Suspense` on field components registered in the hook. *(form-composition.md)*
- **Perf note**: context values are **static class instances with reactive props** (TanStack Store signals), so bound-via-context fields do **not** cause the usual context re-render storm. *(form-composition.md "A note on performance")* — validates orbweaver's bound-component plan.

### Reactivity
- **`form.Subscribe selector={...}`** — subscribe **inside the UI**; only that component re-renders. *(reactivity.md)*
- **`useStore(form.store, selector)`** — subscribe **in component logic**; re-renders the whole component. **Always pass a selector** (omitting = re-render on any state change). **`useStore` is a deprecated alias for `useSelector`** and takes an optional 3rd `compare(a,b)` arg. *(reactivity.md, basic-concepts.md, reference/variables/useStore.md)*
- **Field meta flags** *(basic-concepts.md)*: `isTouched` (changed or blurred), `isBlurred`, `isDirty` (changed once — **persists even after revert**; opposite `isPristine`), `isDefaultValue` (value === default). Form-level mirrors exist on `FormState`: `isDirty/isPristine/isTouched/isBlurred/isDefaultValue/isValid/canSubmit/isSubmitting/isSubmitted/isSubmitSuccessful/submissionAttempts`. *(reference/interfaces/FormState.md)*
- **Dirty model is a documented choice**: "We have chosen the **persistent** 'dirty' state model. However, we introduced the `isDefaultValue` flag to also support a **non-persistent** dirty state: `const nonPersistentIsDirty = !isDefaultValue`." *(basic-concepts.md "Understanding 'isDirty' in Different Libraries")*

### Validation
- Field- and form-level `validators: { onChange, onBlur, onSubmit, onMount, onChangeAsync, onBlurAsync, onSubmitAsync, ... }`; truthy return = error. Sync runs first, async only if sync passes (unless `asyncAlways: true`). *(validation.md, philosophy.md)*
- **Debounce**: `asyncDebounceMs` (field default) + per-validator `onChangeAsyncDebounceMs`. *(validation.md)*
- **Form-level → field errors**: form validator returns `{ form?, fields: { 'a': ..., 'socials[0].url': ..., 'details.email': ... } }`; field-specific validators **override** form-set errors for that field. *(validation.md)*
- **Standard Schema** (Zod ≥3.24, Valibot, ArkType, Yup, Effect): pass the schema directly to `validators.onChange`; form-level schema auto-propagates to fields. **Validation uses the schema's INPUT type and does NOT return transformed output** — to get output, `schema.parse(value)` inside `onSubmit`. *(validation.md, submission-handling.md, basic-concepts.md)*
- **`field.parseValueWithSchema(schema)` / `form.parseValuesWithSchema(schema)`** — parse + return issues **without** setting internal errors (mix schema with custom logic). *(reference/classes/FieldApi.md, FormApi.md)*
- **`disableErrorFlat`** — keep `errorMap.onChange/onBlur/onSubmit` separate instead of flattening into `errors[]`. *(custom-errors.md)*
- Standard-Schema form errors arrive as `Record<string, StandardSchemaV1Issue[]>` keyed by field (iterate `.flat().map(i=>i.message)`). *(validation.md)*

### Dynamic validation (`revalidateLogic` / `onDynamic`)
- `validationLogic: revalidateLogic({ mode, modeAfterSubmission })` + `validators.onDynamic`/`onDynamicAsync`. Default behavior = **validate on submit, then on change after first submit** (RHF-style). `onDynamic` is NOT called unless `revalidateLogic()` is set. *(dynamic-validation.md, reference/functions/revalidateLogic.md)*

### Custom errors
- Any truthy value is an error: strings, numbers, booleans, objects (`{message,severity,code}`), arrays. `errors[]` is a typed union of all validator returns; `errorMap[source]` is exactly that source's type. *(custom-errors.md)*

### Listeners (the autosave backbone)
- **Field**: `listeners: { onChange, onBlur, onMount, onSubmit, onUnmount, onChangeDebounceMs, onBlurDebounceMs }`. *(listeners.md, reference/interfaces/FieldListeners.md)*
- **Form-level**: `listeners: { onMount, onChange, onBlur, onSubmit, onChangeDebounceMs, onFieldUnmount, ... }`. `onChange/onBlur` get `{ formApi, fieldApi }` and **propagate to all fields**. Docs' explicit example **is autosave**: `onChange: ({formApi}) => { if (formApi.state.isValid) formApi.handleSubmit() }, onChangeDebounceMs: 500`. *(listeners.md, reference/interfaces/FormListeners.md)*
- **`onFieldUnmount`** is a real `FormListeners` property (reference) but appears in **no guide** — it's the documented-but-unprosed flush hook the autosave factory wants.

### Arrays
- `<form.Field name="x" mode="array">`; helpers on field/form: `pushValue/insertValue/removeValue/replaceValue/swapValues/moveValue/clearValues` (+ form `pushFieldValue/insertFieldValue/...`), each taking `options?: UpdateMetaOptions`. Subfields by index name `x[${i}].y`. *(arrays.md, reference/classes/FieldApi.md, FormApi.md)*
- `<button type="reset">` must `event.preventDefault()` before `form.reset()` (native reset clobbers `<select>`). *(arrays.md)*

### Linked fields
- `validators: { onChangeListenTo: ['password'], onChange: ({value, fieldApi}) => ... }` (also `onBlurListenTo`) — re-run a field's validation when a sibling changes. *(linked-fields.md)*

### Submission handling
- `onSubmitMeta: defaultMeta` + `form.handleSubmit(meta)` → `onSubmit({ value, meta })`. Meta is for routing the submit ("continue"/"backToMenu"), **not** a post-submit hook. *(submission-handling.md, reference/interfaces/FormOptions.md)*
- `form.Subscribe selector={s=>[s.canSubmit,s.isSubmitting]}` to gate the submit button; `canSubmit` stays `true` until touched; `!canSubmit || isPristine` to block pre-interaction. Use `aria-disabled`, not `disabled` (a11y). *(validation.md)*
- `onSubmitInvalid({formApi})` for invalid-submit handling / focus. *(focus-management.md, reference/interfaces/FormOptions.md)*

### Async initial values
- Official pattern = **TanStack Query + `defaultValues: data?.x ?? ''` + loading spinner on `isLoading`.** That's the whole guide. *(async-initial-values.md)* — see Footgun #4: it does **not** handle refetch/clobber.

### Focus management
- **Intentionally not built-in** ("TanStack Form does not have insights into your markup", `philosophy.md`). Hand-roll: `onSubmitInvalid` + `querySelector('[aria-invalid="true"]').focus()` (DOM) or a manual ref list (Native). *(focus-management.md)*

### Devtools / debugging
- `@tanstack/react-devtools` + `@tanstack/react-form-devtools` → `<TanStackDevtools plugins={[formDevtoolsPlugin()]} />`. *(devtools.md, installation.md)*
- Common errors: uncontrolled→controlled (missing `defaultValues`); `field.state.value: unknown` (form type too large → split it); `Type instantiation is excessively deep` (type bug → report; runtime still fine). *(debugging.md)*

### Reset / re-baseline (core)
- **`form.reset(values?, opts?)`** — "Resets to default values. **If values are provided, resets to those values AND the default values are updated.**" `opts.keepDefaultValues?: boolean`. *(reference/classes/FormApi.md)* — this is the official re-baseline primitive.
- `form.resetField(name)`, `form.resetFieldMeta(...)`, `form.setFieldValue(name, updater, opts?: UpdateMetaOptions)`, `form.update(options?)`. *(reference/classes/FormApi.md)*

---

## B. The verdict — per area (doc-cited)

| Area | Orbweaver plan | Verdict | Doc basis |
|---|---|---|---|
| Single `createFormHook` instance (`useAppForm`/`withForm`/`withFieldGroup`) | One instance, bound components | ✅ CORRECT | form-composition.md ("define this once"), quick-start.md |
| Form **only** for multi-field entity editors; plain inputs for 1–2-field | — | ✅ CORRECT | overview/philosophy: library is for "wrapping into your own design system"; verbosity is the tradeoff |
| Zod via Standard Schema | `validators.onChange: zodSchema` | ✅ CORRECT | validation.md, basic-concepts.md |
| React Compiler ON | — | ✅ CORRECT (explicit) | comparison.md row "React Compiler support ✅" (RHF = 🛑) |
| Reactivity via `form.Subscribe`/`useStore` selectors | DirtyPill/Save chrome | ✅ CORRECT — but prefer `useSelector` (useStore is a deprecated alias) | reactivity.md, reference/variables/useStore.md |
| Bound field components via `useFieldContext<T>()` | — | ✅ CORRECT; context is loosely typed (`any`), `<T>` is a manual cast seam | form-composition.md, createFormHookContexts.md |
| `listeners` (form `onChange` + `onChangeDebounceMs` + `onFieldUnmount`) as autosave backbone | `createAutosaveEntityForm` | ✅ CORRECT — docs' own autosave example | listeners.md, reference/interfaces/FormListeners.md |
| `revalidateLogic()` + `onDynamic` (validate-on-submit-then-revalidate) | not yet in plan | 🔼 SHOULD-ADOPT for editors | dynamic-validation.md |
| `reset(value)` after submit to re-baseline + clear "Unsaved" | `createSavedEntityForm` | ✅ mechanism CORRECT, but **recipe is yours** (no guide ties reset→submit) | FormApi.reset; submission-handling.md is silent |
| Seed-on-load + `seededRef + !isDirty` reseed guard | `createSavedEntityForm` | ⚠️ FACTORY-ORIGINAL (docs punt) — correct to own it | async-initial-values.md (naive only) |
| Mount-time non-user promotion via `setValue(...,{dontUpdateMeta})` | factories | ⚠️ relies on **undocumented** flag (typed as `UpdateMetaOptions`, shape not in docs) | FieldApi/FormApi setValue signatures only |
| Structural `fieldValuesEqual` (`Object.is` woes) | factories | 🔼 SHOULD-ADOPT lib's `isDefaultValue`/`evaluate` instead of hand-rolling | basic-concepts.md, reference/functions/evaluate.md |
| Zustand-`persist` draft store (version+migrate) | both factories | ⏭️ CORRECTLY-SKIP by lib (no persistence in docs) — fully yours | no doc coverage |
| `reset()` REMOVED from autosave type | `createAutosaveEntityForm` | ✅ CORRECT (reset re-baselines defaults; wrong for a live draft mirror) | FormApi.reset semantics |
| `key`-remount on entity id change | `createSavedEntityForm` | ✅ CORRECT — only clean way to re-seed `defaultValues` (not reactive) | async-initial-values.md (defaultValues seed-once) |
| Focus-first-error | — | ⏭️ CORRECTLY-SKIP (lib has none by design) — hand-roll | focus-management.md, philosophy.md |
| Devtools plugin | — | 🔼 SHOULD-ADOPT (dev only) | devtools.md |
| `withFieldGroup` for shared field clusters (e.g. card sub-sections) | — | 🔼 CONSIDER; note `unknown` error typing caveat | form-composition.md |

---

## C. THE SIX FOOTGUNS — DOC-PROVIDED vs FACTORY-ORIGINAL

### #1 — `isDirty` is event-based / persistent, never auto-clears after submit
- **Is the persistence documented as intended?** YES — but in **basic-concepts.md**, not philosophy.md: *"isDirty: is `true` once the field's value is changed, even if it's reverted to the default… We have chosen the **persistent** 'dirty' state model. However, we have introduced the `isDefaultValue` flag to also support a non-persistent 'dirty' state: `const nonPersistentIsDirty = !isDefaultValue`."* `philosophy.md` says nothing about dirty.
- **Is there an official "clear isDirty / re-baseline after submit" recipe?** NO. `submission-handling.md` never mentions `reset`, `isDirty`, or post-submit cleanup. `reactivity.md` doesn't either. **The mechanism exists** — `form.reset(savedValue)` "resets to those values AND the default values are updated" (FormApi.reset) — but **no guide assembles the post-submit recipe.**
- **`isSubmitSuccessful` / post-submit hook?** `FormState.isSubmitSuccessful` and `isSubmitted` exist (reference/interfaces/FormState.md) but **no guide** wires them to re-baseline. There is **no** `onSubmitSuccess` hook; `onSubmitMeta` is unrelated (submit-routing meta only).
- **Verdict: SPLIT.** The re-baseline **primitive** (`reset(value)` updating defaults) is **DOC-PROVIDED**; the *"call it on submit success to clear Unsaved and re-arm the seed guard"* **recipe is FACTORY-ORIGINAL** — orbweaver must own it. **Sharpening:** for the DirtyPill, the *documented* non-persistent signal is **`!isDefaultValue`**, which auto-clears on revert and after `reset(value)` — strictly better than raw `isDirty` for a Save/Discard pill.

### #2 — `reset(value)` inside `onSubmit` can ignore new defaults (known bug)
- **Doc coverage: NONE.** Not acknowledged anywhere — not submission-handling.md, not FormApi.reset's doc text. The docs present `reset(value)` as if it always updates defaults.
- **Verdict: FACTORY-ORIGINAL.** Entirely yours to work around (e.g. reset **outside/after** the `onSubmit` resolution, or via a post-submit effect keyed on `isSubmitSuccessful`). Confirm your factory does not call `reset(value)` synchronously inside the `onSubmit` body.

### #3 — Non-user `setFieldValue` marks form dirty; need `dontUpdateMeta`
- **Doc coverage: NONE for the flag.** `dontUpdateMeta` does not appear in any doc. `setValue/setFieldValue` and all array ops accept `options?: UpdateMetaOptions`, but **the shape of `UpdateMetaOptions` is never documented** (no interface page, no prose). `listeners.md` shows `form.setFieldValue('province','')` in a listener and says nothing about the dirty side effect.
- **Verdict: FACTORY-ORIGINAL** (riding an undocumented-but-typed option). Correct shape; just be aware it's an unprosed API — pin the version and add a regression test, since "types are patch-semver, lock your version" (typescript.md) means this could shift silently.

### #4 — Query × Form seed/clobber (refetch overwrites unsaved typing)
- **Does async-initial-values.md solve it?** NO. The entire guide is: `useQuery` → `defaultValues: data?.x ?? ''` → spinner on `isLoading`. Because `defaultValues` seeds **once at mount and is not reactive**, the naive example doesn't even *reseed* on refetch — and never discusses an `isDirty` guard. The SSR `mergeForm`/`useTransform` path (ssr.md) is a different mechanism (server-action state merge), not background-refetch reconciliation.
- **Verdict: FACTORY-ORIGINAL — confirmed on us.** Your `seededRef + !isDirty` guard (and `key`-remount on id change) is the right shape; the docs punt exactly as the EXAMPLES audit found. **Sharpening:** gate on **`!isDirty`** (persistent) here, *not* `!isDefaultValue` — you want "user has touched anything since seed," which is precisely persistent `isDirty`; `!isDefaultValue` would wrongly allow a reseed after the user types then reverts.

### #5 — Persisted draft store (Zustand `persist`, version+migrate)
- **Doc coverage: NONE.** No guide covers form persistence, localStorage, drafts, or storage. (The only "persistent" hits are the **dirty-model** discussion — unrelated.) `mergeForm`/`useTransform` is server-state hydration, not client draft survival.
- **Verdict: FACTORY-ORIGINAL — entirely your Zustand layer.** The library is deliberately headless/storage-agnostic. `version`+`migrate` is correct and orbweaver-owned. One doc-anchored tie-in: feed the persisted draft in as the form's seed (over server data), then drive the form from `form.store` — the library imposes nothing here.

### #6 — `fieldValuesEqual` structural compare (`Object.is` on round-tripped refs reads "changed")
- **Doc coverage of the problem: NONE** (`fieldValuesEqual`/`Object.is` not mentioned). **BUT the library already ships structural-equality machinery:**
  - **`isDefaultValue`** (field + form) = value-equals-default; for arrays/objects this is necessarily a **deep** compare (it's paired with the non-persistent dirty model and would never read `true` otherwise). *(basic-concepts.md, FormState.md)*
  - **`evaluate(objA, objB): boolean`** is an **exported** core deep-equality util. *(reference/functions/evaluate.md)*
  - **`useStore`/`useSelector`** accept a `compare(a,b)` arg for custom slice equality. *(reference/variables/useStore.md)*
- **Verdict: SHOULD-ADOPT lib primitives → potentially DELETE the hand-roll.** Rather than a bespoke `fieldValuesEqual` over round-tripped refs, lean on **`!isDefaultValue`** for the dirty signal (library does the structural compare for you) and/or the exported **`evaluate`** if you need an ad-hoc deep compare. This is the clearest "we hand-roll what the docs now provide natively" finding.

**Footgun summary:**
| # | Behavior | Official pattern? | Verdict |
|---|---|---|---|
| 1 | isDirty persistent, no auto-clear post-submit | persistence documented (basic-concepts); `reset(value)` re-baseline primitive documented; **post-submit recipe absent** | reset = DOC-PROVIDED; recipe = FACTORY-ORIGINAL; use `!isDefaultValue` for the pill |
| 2 | reset(value) inside onSubmit ignores defaults | not acknowledged | FACTORY-ORIGINAL |
| 3 | non-user setValue marks dirty (`dontUpdateMeta`) | flag undocumented; `UpdateMetaOptions` shape unprosed | FACTORY-ORIGINAL (typed but unprosed) |
| 4 | Query×Form seed/clobber | async-initial-values punts | FACTORY-ORIGINAL — confirmed on us |
| 5 | persisted draft store | no coverage | FACTORY-ORIGINAL (Zustand) |
| 6 | structural dirty compare | problem unaddressed, but `isDefaultValue`/`evaluate`/`compare` provided | SHOULD-ADOPT lib primitives; delete hand-roll |

---

## D. TypeScript best practices (typescript.md + reference + philosophy)

- **Strict mode + version lock**: `strict: true` required; TS ≥5.4. **Type changes ship as patch semver** → *"lock your react-form package version to a specific patch release."* *(typescript.md)* This is squarely aligned with orbweaver's pinned-version rigor — pin the exact patch, and treat type behavior (incl. the undocumented `dontUpdateMeta`) as version-bound, test-guarded.
- **Never pass generics** (`philosophy.md` "Generics are grim"): type `useAppForm` by passing a **typed `defaultValues`** object, not `useForm<Card>()`. For shared shape use `formOptions({ defaultValues: cardDefaults })` (typed via the default object) and spread it — `formOptions` returns `TOptions`, fully inferred.
- **Bound field components**: `const field = useFieldContext<string>()` from your `createFormHookContexts`. The context is typed `FieldApi<any,...>` — **`<TData>` is a manual cast point**, not inferred from the form. Keep these casts honest (orbweaver's one-home discipline: the field component declares its own `TData`).
- **`withFieldGroup` path-relative typing**: the group's `defaultValues` keys define the relative shape; consumer maps via `fields="account_data"`, a `{relKey: deepKey}` map, or `createFieldMap(defaults)` (top-level only — "field mapping is only allowed for objects"). **Group validators see `fieldApi.form.state.values` as `unknown`** — *"ensure your fields can accept unknown error types."* Type group error consumers defensively.
- **Validator typing**: function validators infer `({value, fieldApi})`; return type flows into `errors[]` (union) and `errorMap[source]` (exact). Standard-Schema validators use the schema's **input** type for `value`/`defaultValues` (`z.input<typeof schema>`); transformed output only via `schema.parse` in `onSubmit`.
- **Big-form TS hazards** (debugging.md): `field.state.value: unknown` and `Type instantiation is excessively deep` appear when the form type is too large — **mitigate by splitting** character-card editors via `withForm`/`withFieldGroup` (also good for the one-home/file-size discipline). Cap `extendForm` chains at 3–5.
- **`extendForm`** enforces **unique component names at the type level** (duplicate = compile error) — useful guardrail if any feature extends the base hook.
- **`onSubmitMeta` typing**: declare `onSubmitMeta: defaultMeta` to type `handleSubmit(meta)` and `onSubmit({meta})`; if a `withFieldGroup` declares `onSubmitMeta`, consuming forms must match it.

---

## E. Adopt-into-factories shortlist (each: doc source + why; ★ = changes/sharpens current plan)

1. **DirtyPill on `!isDefaultValue`, not raw `isDirty`** ★ — *basic-concepts.md*. Library does the structural compare; auto-clears on revert and after `reset(value)`; directly dissolves the visible half of footgun #1 and the whole of footgun #6's hand-roll.
2. **Keep `isDirty` (persistent) strictly for the reseed guard** ★ — *FormState.md / basic-concepts.md*. Footgun #4's `seededRef + !isDirty` wants "touched since seed," which is exactly persistent `isDirty`. Use the two flags for two different jobs — don't unify them.
3. **`form.reset(savedValue)` as the re-baseline primitive on submit-success** — *FormApi.reset*. Bake into `createSavedEntityForm`; it updates `defaultValues`, re-arming the seed guard and clearing `!isDefaultValue`. **But never call it synchronously inside `onSubmit`** (footgun #2) — run it in a post-submit effect keyed on `isSubmitSuccessful`/the resolved promise.
4. **Form-level `listeners.onChange` + `onChangeDebounceMs`** — *listeners.md*. This IS the autosave backbone; docs' own example calls `formApi.handleSubmit()` from it. Bake into `createAutosaveEntityForm`.
5. **`listeners.onFieldUnmount` flush** — *reference/interfaces/FormListeners.md*. Documented-but-unprosed; correct hook for the autosave "flush on unmount." Add a test since no guide exercises it.
6. **`revalidateLogic({mode:'submit', modeAfterSubmission:'change'})` + `onDynamic`** ★ — *dynamic-validation.md*. Editor-friendly UX (don't scream errors before first save; then live-validate). Consider as the default validation seam for both factories. Note `onDynamic` is inert without `revalidateLogic()`.
7. **`schema.parse(value)` in `onSubmit` for Zod transforms** — *submission-handling.md*. Form value is the **input** type; if any card field uses `.transform()`/coercion, parse explicitly before persisting. Bake a typed `parseOnSubmit` step.
8. **`field.parseValueWithSchema` / `form.parseValuesWithSchema`** — *FieldApi.md/FormApi.md*. For "validate with Zod but don't set library errors" (e.g. cross-checking against the persisted draft) without polluting `errorMap`.
9. **`disableErrorFlat` + `errorMap.{onChange,onBlur,onSubmit}`** — *custom-errors.md*. If editors want submit-errors styled differently from live-errors.
10. **`createFieldMap(defaults)`** — *form-composition.md*. If any shared sub-section (e.g. a persona's avatar/name pair) becomes a `withFieldGroup` mounted at top level.
11. **`onSubmitInvalid` + `aria-invalid` focus** — *focus-management.md*. Hand-roll focus-first-error into the Save chrome (library won't).
12. **`formDevtoolsPlugin()`** (dev build only) — *devtools.md*.
13. **Prefer `useSelector` over `useStore`** ★ — *reference/variables/useStore.md*. `useStore` is a deprecated alias; lock to `useSelector` in the bound chrome to avoid a future deprecation churn.
14. **Reset button `event.preventDefault()`** — *arrays.md*. Bake into the Discard control if it's ever a real `<button type="reset">`.

---

## F. "Are we doing anything WEIRD?" (blunt, doc-backed)

- **Weird-but-justified — riding `dontUpdateMeta` (undocumented).** It's typed (`UpdateMetaOptions`) but appears in **zero** docs. Given "types are patch-semver, lock your version" (typescript.md), this is the most fragile load-bearing assumption in the plan. **Not wrong — but pin the exact patch and add a behavioral test** that mount-time non-user promotion does NOT flip `isDirty`.
- **Likely over-built — a hand-rolled `fieldValuesEqual`.** The library already exposes `isDefaultValue` (structural) + `evaluate` (deep-equal) + `useSelector` `compare`. *(basic-concepts.md, evaluate.md, useStore.md)* If your comparator only ever feeds the dirty signal, **delete it** and use `!isDefaultValue`. This is the clearest "the docs now provide it natively" cut.
- **Possible conflation risk — one `isDirty` doing two jobs.** Docs cleanly separate persistent `isDirty` (event) from `!isDefaultValue` (value). The reseed guard (footgun #4) needs the former; the Save/Discard pill (footgun #1) wants the latter. Using one flag for both is the subtle trap basic-concepts.md is warning about.
- **Not weird — single `createFormHook`, bound components, form-for-editors-only, React Compiler.** All explicitly endorsed (form-composition.md "define this once"; comparison.md React-Compiler ✅; philosophy.md "wrap into your own design system"). No daylight between plan and docs.
- **Not weird — Zustand persistence & key-remount.** Library is deliberately silent on persistence and seeds `defaultValues` once (non-reactive), so a `persist` store + `key`-remount is the *only* sanctioned way to re-seed; you're filling a gap the library intends consumers to fill, not fighting it.
- **Minor — `reset` removed from the autosave type.** Correct and arguably *more* correct than the library, which exposes `reset` on every form; for a live draft mirror, `reset(value)` re-baselining defaults would be a footgun, so type-removing it is a clean guardrail. No doc objection.
- **Watch — calling `reset(value)` inside `onSubmit`.** Footgun #2 is real and undocumented; if any factory does this synchronously it can silently ignore new defaults. Verify the Save factory resets *after* submit resolution.

---

## G. Open forks for Nate

1. **DirtyPill signal**: switch to **`!isDefaultValue`** (auto-clears, structural, kills the `fieldValuesEqual` hand-roll) — or keep persistent `isDirty` for parity with some "sticky Unsaved until save" UX? Docs support either; they're semantically different. My read: `!isDefaultValue` for the pill, `isDirty` for the reseed guard.
2. **Validation timing**: adopt **`revalidateLogic({mode:'submit', modeAfterSubmission:'change'})` + `onDynamic`** as the editor default (no pre-save error noise), or keep plain `onChange` Zod? Editors usually want the former.
3. **`dontUpdateMeta` risk posture**: since it's undocumented + patch-semver types, do we (a) pin exact patch + add a guard test, (b) wrap it behind our own typed helper so a rename is one-file, or (c) both? Recommend (c).
4. **`useStore` → `useSelector`**: migrate the bound chrome now (it's a deprecated alias) or defer? Cheap to do up front.
5. **`withFieldGroup` for card sub-sections**: worth it for reuse across character/persona editors, but the `unknown`-error typing caveat costs some safety. Adopt only where a cluster genuinely repeats across ≥2 editors.
6. **Post-submit re-baseline placement**: confirm the Save factory calls `reset(savedValue)` in a post-resolution effect (keyed on `isSubmitSuccessful`), not inside `onSubmit` — to dodge footgun #2.

---

*Output file: `/tmp/claude-1000/-home-inktomi-inktomi-stack-development-orbweaver/e6fcdf37-c41d-4d38-a146-400504dab734/scratchpad/tanstack-form-docs-mine.md`*
