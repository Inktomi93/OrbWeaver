import { Toast as BaseToast } from "@base-ui/react/toast";

/**
 * Imperative toast API — `const toast = useToastManager(); toast.add({ title: "Saved" })`.
 * Also exposes `close`/`update`/`promise` per the live Base UI Toast docs. Must be called under
 * `<ToastProvider>`.
 * Spec: ui-package-design §6.1 (the imperative add/toast API the live docs prescribe).
 */
export const useToastManager = BaseToast.useToastManager;

/**
 * Creates a global toast manager for use OUTSIDE React (pass it to `<ToastProvider toastManager>`).
 * `const manager = createToastManager(); manager.add({ title: "Synced" });`
 * Spec: live Base UI Toast docs — global manager pattern.
 */
export const createToastManager = BaseToast.createToastManager;
