// Front door for the composition root; app/boot/lifecycle import compose factories from here, never an
// internal file. `services.ts` is the keystone graph; the sibling files are the seams it composes.

export { createHttpApp } from "../http/app.ts";
export { createConfiguredOidc } from "../http/oidc.ts";

export { createProcessSeams } from "./process-seams.ts";
export type { ServicesDeps, ServicesResult } from "./services.ts";
export { createServices, NO_SHARE_RELAY, UNSUPERVISED_RESTART } from "./services.ts";
export { SessionsCrypto } from "./sessions-crypto.ts";
export { createShareGraph } from "./share.ts";
