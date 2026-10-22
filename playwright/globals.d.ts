/// <reference types="vite/client" />

declare var mount: (params: { readonly story: string; readonly props?: object }) => Promise<void>;
declare var unmount: () => Promise<void>;
