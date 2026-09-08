// @orb/server — public barrel. TYPE-ONLY surface for `@orb/client`: the client imports AppRouter
// for end-to-end inference, while dependency-cruiser restricts that exact source/target edge and
// rejects runtime client→server imports. `AppRouter` is `typeof` a server-owned router value.
export type { AppRouter } from "./transport/trpc/router.ts";
