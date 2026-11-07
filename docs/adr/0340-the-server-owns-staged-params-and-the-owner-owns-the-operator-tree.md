---
kind: adr
status: active
updated: 2026-11-07
---

# The server owns staged params and the box owner owns the operator tree

## Context

A staged upload is named by a handle and vouched for by a digest. Both sit in the workload row. The wire's params record could name them, so an actor with staging write rights and an account could pick the path a run reads and deletes, and could ask whether a file hashes to a guess. Separately, import-st with no upload reads ST_PROFILE_DIR, the operator's own tree, and any account could start it.

## Decision

Only an upload route mints staged params. wireStartWorkloadEnvelope in packages/contracts/src/workloads/params.ts is what start, createSchedule, updateSchedule and estimateModelCalls accept. import-bundle has no wire form, and a wire import-st has no spelling of stagedDir or stagedDigest. startWorkloadEnvelope stays the domain door's envelope, because the routes reach that door with params they minted. Only the box owner runs import-st against the operator's tree. The kind declares this with ownerOnly on its contribution, and parseWorkloadInput in packages/server/src/domain/workloads/substrate/params.ts answers it for every door that reads a person's input, so no door can read input without naming its caller. retry answers it on the row it clones. A member imports their own folder through the upload route, which is the same kind with a staged handle, and the owner's bulk run may target any account. resolveStagedPath anchors its real-path comparison above the owner's staging folder, so a link at that folder moves only one end of the comparison.

## Consequences

A client can no longer start a staged import by hand; nothing in the product did. An admin who is not the box owner cannot run or schedule the operator import. A trusted system trigger is not judged, so a bare import-st schedule a member already held still fires; the only install has none. A wire import-st keeps dryRun and personaCollisions. The run dialog and the schedule dialog hide the operator import from a member.

## Alternatives rejected

A runtime check in the router that refuses named keys: the shape stays representable, and each new staged field needs the check extended. A signed or private params column: the routes already reach the domain door directly, so closing the wire door is enough. An owner gate in the router alone: retry and any later door would skip it. A precondition on admit: a schedule is not admitted, and admit answers whether work is meaningful, not who may ask.
