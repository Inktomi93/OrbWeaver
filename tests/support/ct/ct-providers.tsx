// Shared CT provider harness — the GLOBAL chrome every mounted component gets, injected once via
// `beforeMount` (playwright/index.tsx). This is the @orb/ui-scoped sibling of Spine-Testing §7's
// client provider harness, minus QueryClient/tRPC (@orb/ui is domain-agnostic). See the primitive
// contract §4.3: the app-wide providers live here so no `.ct.tsx` re-wraps them inline.
//
// NOT here: drawer's DrawerProvider / DrawerVirtualKeyboardProvider — those are drawer-scoped
// context, not global chrome; they stay in the drawer fixture.

import type { TextDirection } from "@base-ui/react/direction-provider";
import { DirectionProvider } from "@base-ui/react/direction-provider";
import type { ThemeScopeTokens } from "@orb/ui/theme-scope";
import { ThemeScope } from "@orb/ui/theme-scope";
import { Toaster, ToastProvider } from "@orb/ui/toast";
import { TooltipProvider } from "@orb/ui/tooltip";
import type { ReactElement, ReactNode } from "react";

export interface CtProvidersProps {
  readonly children: ReactNode;
  /** Per-character theme override tokens; omitted = base theme (tokens already live at `:root`). */
  readonly theme?: ThemeScopeTokens;
  /** Reading direction; defaults to `"ltr"`. */
  readonly direction?: TextDirection;
}

/**
 * Stacks the app-wide providers around a mounted component. Toast / Tooltip / Direction are
 * context-only (zero DOM), so they wrap every mount transparently — Tooltip delays are pinned to 0
 * so CT hover/focus assertions open instantly.
 *
 * ThemeScope is different: it renders a real wrapping `<div>`, which would shift the mount-handle
 * root for every test that reads the mounted element directly (`mount(...).evaluate(...)`). Base
 * tokens already resolve at `:root` (globals.css `@theme`), so with no override the wrapper is a
 * pure no-op — we therefore mount ThemeScope ONLY when a case actually supplies override tokens via
 * `mount(<C/>, { hooksConfig: { theme } })`. A test that reads a scoped `--color-*` override wraps;
 * everything else mounts flush against the component root.
 */
export function CtProviders({
  children,
  theme,
  direction = "ltr",
}: CtProvidersProps): ReactElement {
  const body =
    theme !== undefined && Object.keys(theme).length > 0 ? (
      <ThemeScope tokens={theme}>{children}</ThemeScope>
    ) : (
      children
    );
  return (
    <ToastProvider>
      <TooltipProvider closeDelay={0} delay={0}>
        <DirectionProvider direction={direction}>{body}</DirectionProvider>
      </TooltipProvider>
      <Toaster />
    </ToastProvider>
  );
}
