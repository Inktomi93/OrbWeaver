// Shared CT provider harness — the GLOBAL chrome every mounted component gets, injected once via
// `beforeMount` (playwright/index.tsx). This is the @orb/ui-scoped sibling of Spine-Testing §7's
// client provider harness, minus QueryClient/tRPC (@orb/ui is domain-agnostic). See the primitive
// contract §4.3: the app-wide providers live here so no `.ct.tsx` re-wraps them inline.
//
// NOT here:
//   • drawer's DrawerProvider / DrawerVirtualKeyboardProvider — drawer-scoped context, not global
//     chrome; they stay in the drawer fixture.
//   • a DirectionProvider — Base UI defaults to `ltr` and no CT exercises RTL, so it would be an
//     unused seam; adding it would also mean reaching around @orb/ui into raw `@base-ui/react`,
//     cracking the Base-UI seal (D42). When a real RTL test lands, expose the direction seam
//     THROUGH @orb/ui, not via a direct Base UI import here.

import type { ThemeScopeTokens } from "@orb/ui/theme-scope";
import { ThemeScope } from "@orb/ui/theme-scope";
import { Toaster, ToastProvider } from "@orb/ui/toast";
import { TooltipProvider } from "@orb/ui/tooltip";
import type { ReactElement, ReactNode } from "react";

export interface CtProvidersProps {
  readonly children: ReactNode;
  /** Per-character theme override tokens; omitted = base theme (tokens already live at `:root`). */
  readonly theme?: ThemeScopeTokens;
}

/**
 * Stacks the app-wide providers around a mounted component. Toast + Tooltip are context-only (zero
 * DOM), so they wrap every mount transparently — Tooltip delays are pinned to 0 so CT hover/focus
 * assertions open instantly.
 *
 * ThemeScope is different: it renders a real wrapping `<div>`, which would shift the mount-handle
 * root for every test that reads the mounted element directly (`mount(...).evaluate(...)`). Base
 * tokens already resolve at `:root` (globals.css `@theme`), so with no override the wrapper is a
 * pure no-op — we therefore mount ThemeScope ONLY when a case actually supplies override tokens via
 * `mount(<C/>, { hooksConfig: { theme } })`. A test that reads a scoped `--color-*` override wraps;
 * everything else mounts flush against the component root.
 */
export function CtProviders({ children, theme }: CtProvidersProps): ReactElement {
  const body = theme !== undefined && Object.keys(theme).length > 0 ? <ThemeScope tokens={theme}>{children}</ThemeScope> : children;
  return (
    <ToastProvider>
      <TooltipProvider closeDelay={0} delay={0}>
        {body}
      </TooltipProvider>
      <Toaster />
    </ToastProvider>
  );
}
