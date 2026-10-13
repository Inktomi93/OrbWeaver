// Both boot and the lazy authenticated graph share this runtime for the document lifetime.
import { createClientRuntime } from "./client-runtime.ts";

export const appRuntime = createClientRuntime();
export const { queryClient, trpcClient, trpcProxy } = appRuntime;
