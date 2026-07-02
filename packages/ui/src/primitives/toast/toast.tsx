import type { ToastProviderProps as BaseProviderProps } from "@base-ui/react/toast";
import { Toast as BaseToast } from "@base-ui/react/toast";
import type { ReactElement } from "react";
import { toastVariants } from "./variants";

const slots = toastVariants();

/**
 * App-wide toast state — seals the Base UI Toast manager (auto-dismiss timers, hover/focus pause,
 * stacking limit, F6 viewport focus, and a11y announcements come free). Mount ONCE near the root.
 * `<ToastProvider><App /><Toaster /></ToastProvider>`
 * Spec: ui-package-design §6.1 dictate — the app-wide toast seal (D54: Base UI native, no sonner).
 */
export function ToastProvider(props: BaseProviderProps): ReactElement {
  return <BaseToast.Provider {...props} />;
}

function ToastItems(): ReactElement {
  const { toasts } = BaseToast.useToastManager();
  return (
    <>
      {toasts.map((toast) => (
        <BaseToast.Root
          className={slots.root()}
          data-slot="toast-root"
          key={toast.id}
          toast={toast}
        >
          <BaseToast.Content className={slots.content()}>
            <BaseToast.Title className={slots.title()} />
            <BaseToast.Description className={slots.description()} />
          </BaseToast.Content>
          <BaseToast.Close aria-label="Close notification" className={slots.close()}>
            ×
          </BaseToast.Close>
        </BaseToast.Root>
      ))}
    </>
  );
}

export interface ToasterProps {
  className?: string;
}

/**
 * The toast outlet — bundles Portal → Viewport (`--z-toast`, bottom-right stack) and renders every
 * managed toast with title/description/close. Mount ONCE inside `<ToastProvider>`.
 * `<Toaster />`
 * Spec: ui-package-design §6.1 dictate — the Provider/Viewport wrap (UI-Gates §8 meta-toast
 * consumers arrive Phase 6).
 */
export function Toaster(props: ToasterProps): ReactElement {
  const { className } = props;
  return (
    <BaseToast.Portal>
      <BaseToast.Viewport className={slots.viewport({ className })} data-slot="toast-viewport">
        <ToastItems />
      </BaseToast.Viewport>
    </BaseToast.Portal>
  );
}
