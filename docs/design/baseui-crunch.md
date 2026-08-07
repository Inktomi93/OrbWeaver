# Base UI Crunch Findings

This document tracks findings from an exploratory spike (August 2026) regarding how Orbweaver integrates with Base UI, identifying where we are fighting the framework, missing out on its features, or triggering browser warnings.

## 1. SettingRow vs Field (Fighting the Framework and the ID System)
The codebase currently maintains a parallel abstraction called `<SettingRow>` (and its wrappers `SettingSwitchRow`, `SettingCheckboxRow`). 
*   **The Issue:** We have over **40 instances** across feature components (e.g., `appearance-effects-section.tsx`) manually generating random IDs (`const id = useId()`) and passing them down to both the row and the control to wire up a manual `<label htmlFor={id}>`. This completely bypasses Base UI's field context.
*   **The Base UI Way:** Base UI's `<Field>` natively supports this exact layout via the `<FieldLayout orientation="horizontal">` context. We should delete `SettingRow` and migrate settings panes to use `<Field orientation="horizontal">` which automatically generates and inherits IDs, wires up `aria-describedby` for hints/descriptions, and eliminates the `useId()` boilerplate entirely.

## 2. The 26 "Missing Name" Warnings (Browser Autofill Issues)
Chromium consistently logs a blue info warning: *"A form field element has neither an id nor a name attribute. This might prevent the browser from correctly autofilling the form."*
*   **The Issue:** We have 26 instances across the app (like `PresetRenameDialog`, the main chat composer, and `CharacterCreateActions`) where a bare `<Input>` or `<Textarea>` is rendered inside a `<form>` without a `name` or `id` attribute. 
*   **The Base UI Way:** Either wrap these standalone inputs in our `<Field>` component (which automatically provisions an ID and label wiring) or manually apply a `name="xyz"` attribute to silence the browser's autofill heuristics.

## 3. TanStack Form Integration (Missing State Sync & `onBlur` Plumbing)
*   **The Context:** Unlike simple native forms, the app correctly uses `@tanstack/react-form` for complex validation. The Base UI documentation explicitly states that when using TanStack Form, you *should* use native HTML `<form>` tags with `form.handleSubmit()` rather than `@base-ui/react/form`. Our architecture correctly follows this via our `packages/client/src/forms/bound-fields` wrappers.
*   **The Issue:** We have two critical gaps in how we synchronize state between TanStack Form and Base UI:
    1.  **Dropped State Flags:** `useBoundField.ts` extracts `field.name` and validation `error` from TanStack's `field.state.meta` to pass into `@orb/ui/field`, but it completely omits the `dirty` and `touched` states.
    2.  **Dropped Blur Events:** TanStack Form relies on `field.handleBlur` to know when a user leaves a field (which sets `isTouched` to true). However, most of our sealed primitives (`Select`, `Combobox`, `Autocomplete`, `Slider`) do not expose an `onBlur` prop in their TypeScript interfaces. Because of this, wrappers like `select-field.tsx` are physically unable to pass `field.handleBlur` down to the Base UI trigger/input. 
*   **The Base UI Way:** The handbook requires two things: mapping `invalid={!field.state.meta.isValid}`, `dirty={field.state.meta.isDirty}`, and `touched={field.state.meta.isTouched}` directly onto `<Field.Root>`, AND passing `onBlur={field.handleBlur}` to the interactive element (e.g., `<Select.Trigger>`, `<Combobox.Input>`). 
*   **The Result:** Because `useBoundField` drops `dirty` and `touched`, and because `onBlur` never fires for many complex controls, Base UI cannot apply its `data-dirty` and `data-touched` DOM attributes. This permanently breaks any CSS that relies on these states (e.g., only showing an error style after a field has been touched).

## 4. The 7 Base UI Gates (Ready for Lock Down)
The structural gates for Base UI alignment are fully defined. We ran an AST probe across the codebase (`packages/ui` and `packages/client`) which revealed exactly what needs to be fixed before these gates can be activated without debt suppression:
*   `baseui-anatomy-completeness`: Ensures all required structural anatomy parts are rendered. **(Probe found 3 violations: Combobox missing Backdrop, Popover missing Viewport, Menu missing Viewport)**.
*   `baseui-render-prop-composition`: Bans Radix-style `asChild` and enforces the `render` prop. **(Probe found 0 violations on main, 1 planted test caught)**.
*   `baseui-state-data-attributes`: Enforces styling via Base UI's data attributes over React state classes.
*   `baseui-portal-container-seam`: Ensures `container` prop is universally exposed on all `.Portal` primitives.
*   `baseui-field-control-registration`: Mandates that `<Field.Root>` always wraps its input in `<Field.Control>`. **(Probe found 33 violations: The Field primitive itself, plus 32 downstream consumers in `packages/client/src/`)**.
*   `baseui-event-signature-preservation`: Bans custom change handlers that drop the `eventDetails` argument. **(Probe found 0 violations on main, 1 planted test caught)**.
*   `baseui-namespace-imports`: Enforces the 1.7 namespace pattern (`Select.Root.Props`). **(Probe found 14 violations in `packages/ui/src/primitives` using the old flat types)**.

**Status:** The AST probe proved these gates work perfectly and hook on any file importing from `@base-ui/react*`. The implementer must fix the 50 total violations listed above (the anatomy gaps, the Field.Control wrappers, and the namespace imports) before the gates can be safely merged.

## 5. Broken `className` Function Signature (Styling Best Practices)
*   **The Context:** The Base UI documentation explicitly defines that components rendering HTML elements accept a `className` prop that can *either* be a string or a function receiving the component's state (e.g. `(state) => string`), enabling dynamic styling based on state.
*   **The Issue:** In virtually every primitive in `@orb/ui/src/primitives/` (Button, Input, Accordion, Checkbox, etc.), the prop interface explicitly overrides this with `className?: string;`. This overrides Base UI's typing and forces the `className` straight into the `cn()` (tailwind-merge) utility, which does not support function arguments.
*   **The Result:** We have entirely destroyed Base UI's render-prop pattern for class names. While our architecture leans heavily on data attributes (`group-data-[panel-open]`) instead of `className` functions to style states, this explicit override means the `className` prop is structurally broken for anyone attempting to use Base UI's documented function pattern.

## 6. Broken Customization Event Handlers (`eventDetails` missing)
*   **The Context:** Base UI passes an `eventDetails` object as the second argument to its change event handlers (e.g., `onValueChange: (value, eventDetails) => void`). This object provides critical functions like `eventDetails.cancel()` and `eventDetails.allowPropagation()`, which are essential for advanced Customization (like preventing a tooltip from closing or leaving a component uncontrolled).
*   **The Issue:** While 95% of the `@orb/ui` primitives (Dialog, Popover, Menu, Tooltip) perfectly preserve this signature because they inherit directly from `Base*Props`, **two primitives have explicitly overwritten it**:
    - `packages/ui/src/primitives/combobox/combobox.tsx`
    - `packages/ui/src/primitives/autocomplete/autocomplete.tsx`
*   **The Cause:** Because `Combobox` and `Autocomplete` were heavily customized (e.g., to handle manual array chips and inline rendering modes), their props interface manually re-declares `onValueChange?: (value: string) => void;`. 
*   **The Result:** The `eventDetails` argument is completely stripped out of the TypeScript interface for these two primitives. Furthermore, the internal prop mappers (like `const onValueChangeProp = (next: string): void => onValueChange?.(next);`) actively discard the second argument before passing it back up to the caller, permanently destroying the ability to use `eventDetails.cancel()` on Autocomplete or Combobox.

## 7. TypeScript Namespaces (1.7 Breaking Change)
*   **The Context:** Base UI 1.7 completely overhauled its TypeScript exports, moving from flat type names to component namespaces (e.g., `Props`, `State`, and `Events` are now nested under the component part).
*   **The Issue:** Every single primitive in `@orb/ui` imports the old flat types. For example:
    *   `import type { SelectRootProps } from "@base-ui/react/select"`
    *   `import type { FieldRootProps } from "@base-ui/react/field"`
*   **The Base UI Way:** The documentation explicitly defines the new namespace pattern:
    *   `Select.Root.Props` instead of `SelectRootProps`
    *   `Field.Root.Props` instead of `FieldRootProps`
    *   `Combobox.Root.ChangeEventDetails` instead of custom TS inference.
*   **The Fix:** During the upgrade, we must perform a global find-and-replace across `packages/ui/src/primitives` to migrate all type imports to the new namespace syntax. This will also allow us to simplify some of the complex generic type inferences we currently use (like `ComboboxValueChangeDetails`) by pulling the types directly from the namespace.

## 8. Base UI Component Coverage & Missing Anatomy
*   **The Context:** A full sweep of the codebase was conducted to compare our implemented wrappers against the complete Base UI component catalog.
*   **The Issue:** Several anatomy parts are missing from our primitive library, and we have deliberately opted out of certain Base UI components:
    1.  **Component Coverage & Opt-Outs:** 
        *   `Meter` was found! (It's properly wrapped in `packages/ui/src/charts/meter`, not `primitives`).
        *   `Context Menu` was intentionally skipped; we map the `onContextMenu` React event to open the standard Base UI `Menu` primitive instead.
        *   `Checkbox Group` was intentionally skipped; we use a `<ToggleGroup multiple>` under the hood for multi-select bounded fields.
        *   `OTP Field`, `Preview Card`, `Menubar`, `Navigation Menu`, and `Toolbar` (Base UI's Toolbar, wait, no, `Toolbar` is in `packages/ui/src/layout/toolbar.tsx`!) are absent.
    2.  **Missing Anatomy in Overlays/Menus:** The `Viewport` component is missing from `Popover`, `Tooltip`, and `Menu`. This is likely a new Base UI anatomy part for scroll boundaries/bounding boxes that we need to wire up during the 1.7 upgrade.
    3.  **Missing Anatomy in Combobox:** `Combobox` is missing `Group`, `GroupLabel`, `Collection`, `Clear`, `ItemIndicator`, `Backdrop`, and `Separator`.
    4.  **Missing Anatomy in Autocomplete:** `Autocomplete` is missing `Backdrop` and `Separator`.
    5.  **Missing Anatomy in Field:** As noted in Finding #3, we completely circumvented `<BaseField.Control>` which has cascading effects on Base UI's ability to inject ARIA attributes natively.
*   **The Fix:** During the 1.7 upgrade, we should patch the missing anatomy parts (`Viewport`, `Backdrop`, `Group`, etc.) into our sealed primitive wrappers so that they natively support the full layout boundaries Base UI provides.
