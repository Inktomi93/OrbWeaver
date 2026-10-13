// Group identity comes from production; only the placeholder body is an explicit host-isolation case.
import { configGroups } from "./ct-door.ts";
import { isolationRegistry } from "./ct-isolation.ts";

export { configGroups as realConfigGroups } from "./ct-door.ts";

/** Isolate the declared placeholder branch with the real connections identity and all other real groups. */
export const placeholderConfigGroups = isolationRegistry(
  "config-groups",
  "isolates the config host placeholder body",
  configGroups.list().map((group) => (group.id === "connections" ? { ...group, body: { placeholder: true as const } } : group)),
);
