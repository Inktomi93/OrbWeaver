import type { ToastPortalProps as BasePortalProps, ToastProviderProps as BaseProviderProps, ToastRootProps as BaseRootProps } from "@base-ui/react/toast";
import { Toast as BaseToast } from "@base-ui/react/toast";
import type { ReactElement } from "react";
import { AlertTriangle, Icon, X } from "#primitives/icons";
import { toastVariants } from "./variants.ts";

const slots = toastVariants();

/** The viewport is TOP-anchored (see `variants.ts`), so the natural flick-away is UP — Base UI's own
 *  default (`['down','right']`) would ask the user to drag a top-edge toast toward the page. */
const TOP_ANCHORED_SWIPE: BaseRootProps["swipeDirection"] = ["up", "right"];

/** Base UI stamps `data-type` from the toast's `type`; `"warning"` is the app's degrade channel
 *  (`notify.warn`) and is the one type that carries a glyph — meaning is never colour alone (WCAG 1.4.1). */
const WARNING_TYPE = "warning";

/** App-wide toast state — seals the Base UI Toast manager. Mount ONCE near the root. */
export function ToastProvider(props: BaseProviderProps): ReactElement {
  // @orb-gate-ignore no-context-provider: Base UI's Toast.Provider is a namespace COMPONENT, not a React Context — the React-19 `<Context.Provider>` deprecation the gate targets doesn't apply.
  return <BaseToast.Provider {...props} />;
}

interface ToastItemsProps {
  swipeDirection?: BaseRootProps["swipeDirection"];
}

function ToastItems({ swipeDirection = TOP_ANCHORED_SWIPE }: ToastItemsProps): ReactElement {
  const { toasts } = BaseToast.useToastManager();
  return (
    <>
      {toasts.map((toast) => (
        // `aria-hidden={false}` OVERRIDES Base UI: `ToastRoot.mjs` hides a `priority: "high"` root from the
        // accessibility tree until it is focused (`isHighPriority && !focused`), which on a `tabIndex: 0`
        // element is an axe `aria-hidden-focus` violation AND silences our loudest toasts — every
        // `notify.error` is high-priority, so the errors that most need announcing announced nothing. The
        // Viewport is `aria-live="polite"`, so the toast is announced exactly once with this restored.
        <BaseToast.Root aria-hidden={false} className={slots.root()} data-slot="toast-root" key={toast.id} swipeDirection={swipeDirection} toast={toast}>
          {toast.type === WARNING_TYPE ? <Icon className={slots.warningIcon()} icon={AlertTriangle} size="sm" /> : null}
          <BaseToast.Content className={slots.content()}>
            <BaseToast.Title className={slots.title()} />
            <BaseToast.Description className={slots.description()} />
            {/* Renders null unless the toast carries `actionProps`; do NOT hand-roll a <button>. */}
            <BaseToast.Action className={slots.action()} data-slot="toast-action" />
          </BaseToast.Content>
          {/* Same override, same reason (`ToastClose.mjs`: `aria-hidden: !expanded && !hasFocus`) — the only
              dismiss affordance was outside the accessibility tree until it already had focus, so a screen
              reader user could never find it. The `aria-label` below is the name it then reports. */}
          <BaseToast.Close aria-hidden={false} aria-label="Close notification" className={slots.close()}>
            <Icon icon={X} size="xs" />
          </BaseToast.Close>
        </BaseToast.Root>
      ))}
    </>
  );
}

export interface ToasterProps {
  className?: string;
  /** Portal target — render the toast viewport into a specific container (default: document.body). */
  container?: BasePortalProps["container"];
  /** Override when a consumer repositions the Viewport away from the default top-right anchor. */
  swipeDirection?: BaseRootProps["swipeDirection"];
}

/**
 * The toast outlet — bundles Portal → Viewport and renders every managed toast with
 * title/description/close. Mount ONCE inside `<ToastProvider>`. Every toast shares one top-right stack
 * (`variants.ts` states why it is not bottom-right), so `Toast.Positioner`/`Toast.Arrow` (per-toast
 * anchored placement) are not wrapped here.
 */
export function Toaster(props: ToasterProps): ReactElement {
  const { className, container, swipeDirection } = props;
  return (
    <BaseToast.Portal container={container}>
      <BaseToast.Viewport className={slots.viewport({ className })} data-slot="toast-viewport">
        <ToastItems swipeDirection={swipeDirection} />
      </BaseToast.Viewport>
    </BaseToast.Portal>
  );
}
