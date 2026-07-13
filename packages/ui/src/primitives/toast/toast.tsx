import type {
  ToastPortalProps as BasePortalProps,
  ToastProviderProps as BaseProviderProps,
  ToastRootProps as BaseRootProps,
} from "@base-ui/react/toast";
import { Toast as BaseToast } from "@base-ui/react/toast";
import type { ReactElement } from "react";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the #primitives/icons subpath; tsc + vite resolve X/Icon fine.
import { Icon, X } from "#primitives/icons";
import { toastVariants } from "./variants";

const slots = toastVariants();

/** App-wide toast state — seals the Base UI Toast manager. Mount ONCE near the root. */
export function ToastProvider(props: BaseProviderProps): ReactElement {
  return <BaseToast.Provider {...props} />;
}

interface ToastItemsProps {
  swipeDirection?: BaseRootProps["swipeDirection"];
}

function ToastItems({ swipeDirection }: ToastItemsProps): ReactElement {
  const { toasts } = BaseToast.useToastManager();
  return (
    <>
      {toasts.map((toast) => (
        <BaseToast.Root
          className={slots.root()}
          data-slot="toast-root"
          key={toast.id}
          swipeDirection={swipeDirection}
          toast={toast}
        >
          <BaseToast.Content className={slots.content()}>
            <BaseToast.Title className={slots.title()} />
            <BaseToast.Description className={slots.description()} />
            {/* Renders null unless the toast carries `actionProps`; do NOT hand-roll a <button>. */}
            <BaseToast.Action className={slots.action()} data-slot="toast-action" />
          </BaseToast.Content>
          <BaseToast.Close aria-label="Close notification" className={slots.close()}>
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
  /** Override when a consumer repositions the Viewport (e.g. top-anchored wants `swipeDirection="up"`). */
  swipeDirection?: BaseRootProps["swipeDirection"];
}

/**
 * The toast outlet — bundles Portal → Viewport and renders every managed toast with
 * title/description/close. Mount ONCE inside `<ToastProvider>`. Every toast shares one bottom-right
 * stack, so `Toast.Positioner`/`Toast.Arrow` (per-toast anchored placement) are not wrapped here.
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
