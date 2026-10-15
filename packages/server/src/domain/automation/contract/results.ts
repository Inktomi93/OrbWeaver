/** The `automation.stream` subscriber's authority tier over a chat. The stream is the ONE procedure
 *  projecting by caller authority (the agents host/member filter): a `host` subscriber receives every bus event;
 *  a `member` receives only the room-visible `quickReplySurfaced` (rule fire/error/disable are the host's hidden
 *  hand). A non-present member never resolves an authority (the verb throws a leak-free `AutomationChatNotFound`
 *  → NOT_FOUND) — the fail-closed visibility gate the subscription tail is built on. */
export type StreamAuthority = "host" | "member";
