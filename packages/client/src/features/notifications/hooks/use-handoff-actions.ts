// The NOMINEE's handoff→accept action (two-party host handoff, step 2 — FINAL-Chats §8.3): Accept on a
// `handoff-nominated` inbox row rides `invites.acceptHostHandoff` (a SELF-action: only the exact
// pending nominee passes the verb's `pendingHostUserId` check; a stale/foreign accept is a coded
// refusal). `multiHumanProcedure`-belted server-side; the bell that fires it mounts only while the
// deployment is capable. There is NO decline verb by design (a nomination is host-retractable, not
// invitee-settleable) — the inbox row's other affordance is a plain Dismiss.
//
// Mutation-vs-bus audit (data/invalidation.ts): the verb swaps roles + drops the outgoing host's
// character seats and emits `chatUpdated` on the CHAT bus — delivered only if the nominee happens to
// have that room OPEN. The inbox is chrome the nominee acts from anywhere, so the affected reads are
// THIS mutation's own keys: the room's detail (`chat.getChat` — viewerIsHost/roster flip) and the list
// (`chat.listChats` — participant chrome).

import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

export const useAcceptHostHandoff = createEntityMutation<
  inferInput<Trpc["invites"]["acceptHostHandoff"]>,
  inferOutput<Trpc["invites"]["acceptHostHandoff"]>
>({
  options: (trpc) => trpc.invites.acceptHostHandoff.mutationOptions(),
  invalidates: (trpc) => [trpc.chat.getChat.pathFilter(), trpc.chat.listChats.pathFilter()],
  errorToast: "Couldn't accept the host handoff — it may have been withdrawn.",
});
