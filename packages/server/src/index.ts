// @orb/server — public barrel. TYPE-ONLY surface for `@orb/client` (a devDependency there): the
// client type-imports the router contract and nothing else — a runtime client→server import fails
// to resolve (the cake). `AppRouter` has no other possible home (it is `typeof` a server value).
export type { AppRouter } from "./transport/trpc/router";
