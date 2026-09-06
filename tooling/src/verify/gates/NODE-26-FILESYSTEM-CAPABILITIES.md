---
kind: reference
status: active
updated: 2026-09-05
---

# Node 26 filesystem capabilities for Orb tooling

This is the filesystem companion to [TS-MORPH-CAPABILITIES.md](TS-MORPH-CAPABILITIES.md). The verified workspace runtime is Node `v26.5.0`. Check the installed `@types/node` and runtime before using a feature added by a later 26.x release.

Authority: [Node 26 filesystem documentation](https://nodejs.org/api/fs.html). A local feature probe on 2026-09-05 confirmed `globSync`, pattern arrays, `exclude`, `followSymlinks`, recursive `readdirSync` with `Dirent.parentPath`, and `statSync(..., {throwIfNoEntry:false})` on Node 26.5.

## Use the native operation when it owns the whole behavior

| Need | Node API | Status/use | Trap |
| - | - | - | - |
| globbed inventory | `glob` / `globSync` | stable; arrays, `exclude`, `withFileTypes` | exclusion patterns are separate; `!` negation is unsupported |
| symlink traversal policy | `glob(..., {followSymlinks})` | Node 26.1+; default false; cycles are not recursively followed | following a link does not prove it remains inside the repo root |
| materialized recursive list | `readdir` / `readdirSync` with `{recursive:true, withFileTypes:true}` | stable | array cost grows with the whole tree; OS entry order is unspecified |
| streamed recursive list | `opendir(..., {recursive:true})` | async iterable; `bufferSize` controls batching | fact hooks are synchronous today; do not introduce an async side runner |
| exact entry path | `Dirent.parentPath` + `Dirent.name` | stable and verified | Dirent type comes from the filesystem and may require `lstat` confirmation |
| optional metadata | `statSync(path, {throwIfNoEntry:false})` | avoids exception control flow | use `lstat` when symlink identity matters |
| copy trees | `cp` / `cpSync` | stable; supports filters and symlink behavior | not atomic; partial copies remain possible on failure |
| remove trees | `rm` / `rmSync` with `{recursive:true, force:true}` | current recursive removal | recursive `rmdir` was removed in Node 25 |
| filesystem capacity | `statfs` / `statfsSync` | mount capacity/inode facts | not a content or path-liveness check |
| large sequential directory scan | `opendir` | bounded buffering, automatic close through async iteration | tune only with a benchmark; larger buffers spend memory |

Avoid experimental `fs.Utf8Stream` in gate/runtime infrastructure until Node marks it stable and a measured writer needs it.

## Orb rules

1. ResourceHost owns filesystem access for policies and shared facts. A gate never calls `fs` directly.
2. Missing, empty, malformed, unresolved, and ready remain separate ResourceHost states. A native API exception must be classified; it cannot become an empty list.
3. Sort every returned path before a receipt or verdict. Node and the underlying filesystem do not promise directory order.
4. Normalize to repo-relative POSIX identities once and prove root containment. Never compare platform paths throughout a policy.
5. Keep `followSymlinks:false` unless the resource contract explicitly includes linked directories. When following links, still resolve and verify containment; cycle avoidance alone is not a security boundary.
6. Use `lstat` when the distinction between a link and its target affects policy. Dirent metadata is a fast candidate fact, not infallible identity on every filesystem.
7. Synchronous operations are acceptable inside the current synchronous command runner for bounded, one-time provider acquisition. Promise APIs use the libuv threadpool but do not make a sequential one-shot scan inherently faster.
8. A fact provider acquires a filesystem resource once. Sibling policies consume its immutable result instead of repeating `glob`/`readdir`.
9. Do not shell out to `find`, `tree`, `ls`, or an ad hoc glob package when a native API provides the exact required behavior.
10. Do not replace a working reader on API resemblance alone. Prove path set, entry kind, symlink behavior, missing/empty/error classification, deterministic order, timing, and peak RSS.

## Current repository opportunity

The tooling/verify/shared/AST/codemod surface currently contains 49 `readdirSync` calls across 32 files, only three of them using native recursive mode. Native glob already has four live uses, including both gate loaders.

This is an opportunity census, not a bulk migration list. The likely wins are:

- recursive file inventories that hand-walk directories only to apply extension/path filters;
- repeated package/test-root enumeration;
- temporary-tree cleanup still using older recursive patterns;
- provider code that can return `Dirent` facts directly without a separate `stat` for ordinary file/directory classification.

The poor candidates are readers whose loop also enforces topology, computes implicit directories, counts bytes/lines/NULs, handles partial unreadability, or records exact per-root receipts. `ops/resource-reader.ts` does several of those jobs; replacing its traversal requires behavioral equivalence, not fewer lines.

## Choosing among glob, readdir, and opendir

Use `globSync` when the subject is a path pattern and the complete result fits comfortably in memory. Use recursive `readdirSync` when every entry matters and filtering happens after enumeration. Use `opendir` when a very large tree should be streamed and the surrounding command is already async.

For the gate runtime, prefer one synchronous provider acquisition over adding asynchronous hook phases. If a real resource exceeds that scale, change the provider/runtime contract deliberately and test cancellation/cleanup rather than spawning an untracked promise.

## Required replacement proof

A filesystem refactor is complete only when the old and new implementations agree on:

- ordinary files and nested directories;
- empty and absent roots;
- permission/read errors;
- symlinks to files, directories, outside-root targets, and cycles;
- extension and exclusion semantics;
- path normalization and deterministic sorting;
- overlay/virtual resource behavior where applicable;
- current-repository path set and policy findings;
- wall time and peak RSS.

Keep the proof beside the shared reader or in its focused test. Do not add a second permanent inventory command merely to compare implementations.
