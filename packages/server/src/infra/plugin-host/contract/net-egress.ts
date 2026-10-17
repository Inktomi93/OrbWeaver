import type { PluginHostV1 } from "@orb/contracts/plugin";

/** The guest's canonical net.fetch result, exposed read-only inside the adapter. */
export type PluginNetResponse = Readonly<Awaited<ReturnType<PluginHostV1["net"]["fetch"]>>>;
