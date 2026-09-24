---
kind: plan
status: active
updated: 2026-09-24
---

# Data layout: the runtime data dir splits state from cache

## Goal

The runtime data dir separates what a backup must copy from what the app regenerates, and an existing install migrates itself at boot.

The backup rule becomes one sentence: copy `data/` except `data/cache/`. It reads the same on bare metal and in the container.

## Shape

### Findings that decide the design

- The database stores no filesystem path. The `assets` table holds `owner_id` and `hash` only (`packages/db/src/schema/assets.ts` L23-63); the CAS derives every path at run time from its root (`packages/server/src/infra/storage/cas.ts` L163-171). A staged upload is a single path segment resolved under the staging root at run time (`packages/contracts/src/workloads/params.ts` L32-78, `packages/server/src/domain/import/workload-contributions.ts` L104). `plugin_assets.bundle_path` is a path inside a plugin bundle, never a disk path (`packages/db/src/schema/plugin.ts` L240, L257). So a directory move needs no row rewrite.
- Variants regenerate on demand. `resolveVariant` reads the cache, and on a miss reads the CAS original, transforms it and writes the cache (`packages/server/src/domain/assets/verbs/resolve-variant.ts` L28-41). The cache header states every entry is reproducible (`packages/server/src/infra/storage/variant-cache.ts` L1-4). The test `transforms on a cache miss with the snapped width, then serves from cache` proves it (`tests/server/domain/assets/verbs/resolve-variant.int.test.ts` L41). Variants are cache.
- The local-light weights are a download cache: transformers.js fetches into `LOCAL_LIGHT_CACHE_DIR` on first use (`packages/server/src/foundation/env/index.ts` L343-349). Cache.
- Import staging is transient: the run deletes the staged tree in a `finally` (`packages/server/src/domain/import/workload-contributions.ts` L148-186). Cache.
- Backups sit beside the db by construction: `backupBeforeMigrate` writes `<path>.backup-<stamp>` (`packages/db/src/client/index.ts` L212-236) and `pruneDbBackups` scans `dirname(path)` (L292-314, L362-383). The `.keep` pin lives in the same directory (L272). Moving backups needs a directory parameter in `@orb/db`.
- The credentials key sits beside the db by derivation: `dataDirFromDbUrl` takes `dirname` of the `file:` URL (`packages/server/src/infra/crypto/key.ts` L49-56, L86-93). Moving the db without changing this derivation would move the key into `db/`.
- The container already has a secrets dir. `docker/entrypoint.sh` L85-86 sets `secrets_dir="${data_dir}/secrets"` and writes `session_secret` and `initial_password` there (L111-119, L148-169). It does not write a credentials key. `docker/README.md` L121-122 tells the user the key is at `secrets/credentials_key`; today it is at `/app/data/.credentials-key`. The doc is wrong today, and the target below makes it true.
- The import report dir is a literal, not an env key: `REPORTS_DIR = "data/import-reports"` (`packages/server/src/entry/import/import-report.ts` L11, L327).
- The variants dir is derived in three places from `ASSETS_DIR`: `packages/server/src/entry/lifecycle.ts` L457, `tooling/src/seed/ops/demo.ts` L354, `tooling/src/seed/ops/chat.ts` L122. One home per concept: the resolver below replaces all three.
- There is no data-root key. Every slot is its own env key with a `./data/...` default (`packages/server/src/foundation/env/index.ts` L336, L342, L349, L383, L391). A test that isolates one slot leaves the others writing into the checkout's `data/` (the `importStagingDir` fixture comment, `tests/support/fixtures.ts` L11-13).
- The `.session-secret` keyfile is generated beside the db through the same `keyfileBesideDb` rule as the credentials key (`packages/server/src/infra/crypto/key.ts`), on every boot in every auth mode. It joins the migration table below.
- Keyfile creation is atomic: a private temp file is hard-linked into place, so a planted symlink is never written through and two racing boots share the one key that won (`packages/server/src/infra/crypto/key.ts` `publishKeyfile`). The move keeps that path for a fresh box.
- A stack that sets only `DATABASE_URL` and `ASSETS_DIR` leaves every other slot at its default. Once secrets, reports and variants derive from `DATA_DIR`, such a stack writes its keyfiles into the checkout's `data/secrets/`. The e2e mode projects (`tests/e2e/support/modes.ts`), the multi-user fixture (`tooling/src/stack/multi-user-fixture.sh`), the snap stage (`tooling/src/snap/ops/stage.ts`) and every lifecycle test suite that stubs slots are affected, not "unaffected": each sets `DATA_DIR`.
- The package exports map resolves only `<dir>/index.ts` (`packages/server/package.json`), so a tooling reader of the pure resolver needs a module directory. The resolver lives in a new `data-layout/index.ts` under `packages/server/src/foundation/`, not in a file under `packages/server/src/foundation/env/`.
- No skill, rule or `AGENTS.md` cites a data path.

### Target tree

```text
data/
  db/
    orbweaver.db  orbweaver.db-wal  orbweaver.db-shm
  backups/
    orbweaver.db.backup-<stamp>  orbweaver.db.backup-<stamp>.keep
  assets/<owner>/<ab>/<cd>/<hash>
  users/<owner>/<tool>/
  secrets/
    credentials_key  session_secret  initial_password
  reports/
    import-<stamp>.md
  cache/
    models/transformers/
    variants/<owner>/<ab>/<cd>/<hash>/<kind>-w<width>-q<quality>.webp
    import-staging/<owner>/
  .layout-migration.json      only while a move is in progress
```

Deviations from the proposed target, each with its reason:

- The CAS stays `assets/`, not `blobs/`. The table, the domain, the env key and the docs all say `assets`; a second word for the same thing is the defect the vocabulary map exists to stop, and the rename buys nothing.
- The credentials keyfile is `secrets/credentials_key`, not `.credentials-key`. A dotfile inside a directory that exists to hold secrets hides nothing. `docker/secrets/README.md` and `docker/README.md` already use this name, so the container docs become true without a rewrite.
- `bug-reports/` stays at the repository root. It is the dev bug button's capture (`packages/kit/src/bug-report/index.ts` L24, `packages/server/src/foundation/observability/debug/bug-report.ts` L296), read by the repo-rooted `pnpm bug:reports` tool (`tooling/src/bug-reports/lib/read.ts` L17-18). It is checkout evidence, not user state, and nothing backs it up.
- `.st-data` stays at the repository root (`packages/server/src/entry/compose/portability-runner.ts` L54). It is an import input, not app state.
- Import reports go to `reports/` directly, not `reports/import/`. The file name already says `import`.

### The resolver: one home for every path

A new `data-layout/index.ts` under `packages/server/src/foundation/` will export a pure `resolveDataLayout(raw)` and the schema will call it from the existing `.transform` (`packages/server/src/foundation/env/index.ts` L693), the same place `AUTH_FALLBACK` is resolved per mode. The resolved layout is published as `env.DATA_LAYOUT`, so a consumer of a slot with no env key (`variants`, `backups`, `secrets`, `reports`) reads it from the one frozen env.

- A new env key `DATA_DIR` is the root. Its default is `data` under the process working directory, cwd-relative like every slot today.
- The slot keys stay: `DATABASE_URL`, `ASSETS_DIR`, `LOCAL_LIGHT_CACHE_DIR`, `USER_RUNTIME_DIR`, `IMPORT_STAGING_DIR`, `ST_PROFILE_DIR`. Each becomes optional in the schema; the resolver fills an unset one from `DATA_DIR`. `env.DATABASE_URL` and the others stay resolved strings, so every reader keeps its shape.
- New slots with no env key: `backups`, `variants`, `secrets`, `reports`. They derive from `DATA_DIR` only. An operator who overrides `ASSETS_DIR` keeps the blobs where they are; the variants for them start empty under `DATA_DIR/cache/variants` and regenerate.
- The resolver returns the resolved paths and the set of slots the operator set explicitly. The migration reads that set: only a defaulted slot moves.
- The entrypoint's `ORB_DATA_DIR` (`docker/entrypoint.sh` L85) becomes `DATA_DIR` and is exported, so the shell and the server read one name.

Consumers switch to the resolver: `packages/server/src/entry/lifecycle.ts` L456-459 and L654, `packages/server/src/entry/compose/services.ts` L373 and L459, `packages/server/src/entry/app.ts` L382 and L388, `packages/server/src/entry/compose/portability-runner.ts` L213-217, `packages/server/src/entry/import/import-report.ts` L11 (the dir becomes a parameter the runner passes from the layout), `packages/server/src/infra/crypto/key.ts` L86-93 (`resolveAutoKey` takes the secrets dir; `dataDirFromDbUrl` is deleted; a non-`file:` `DATABASE_URL` still yields a disabled box, unchanged), `tooling/src/seed/ops/demo.ts` L332-354, `tooling/src/seed/ops/chat.ts` L101-122, `tooling/src/verify/ops/db-baseline-parity.ts` L150-159 (imports the default instead of mirroring the literal), `tooling/src/snap/ops/stage-source.ts` L91 and L103 (reads the dev db and assets from the new paths; a stale literal here makes every isolated stage boot empty and say nothing).

`@orb/db` gains a backup directory parameter: `backupBeforeMigrate(db, url, backupDir)` and `pruneDbBackups(url, backupDir)`; `runBootMigrations` deps gain `backupDir` (`packages/server/src/entry/boot/migrate.ts` L38-55). The file naming and the retention rules do not change. A new `listBackupFiles(dir, base)` export reuses the existing anchored pattern (`packages/db/src/client/index.ts` L292-314) so the migration enumerates legacy backups and pins with the one regex.

### Secrets

`secrets/` holds three files. `credentials_key` is written by `loadOrCreateKeyfile` (`packages/server/src/infra/crypto/key.ts`, unchanged) at the path the resolver gives. The session keyfile is `join(layout.secrets, "session_secret")` through the same `loadOrCreateKeyfile`; that is the exact file the container entrypoint already generates, so bare metal and the container converge on one file. The two writers are byte-compatible: the entrypoint writes bare hex, the keyfile writer writes hex plus a newline, and the reader trims. `initial_password` stays entrypoint-only. A non-`file:` `DATABASE_URL` still generates nothing: a keyfile joins the db's backup unit, and a remote db has none on this disk.

### Boot secrets refuse when data depends on them

Owner ruling: a boot secret is generated only when no data depends on it. Otherwise the boot refuses with one message that names the missing file and where it is expected.

- The credentials key depends on data when any `user_credentials` row exists.
- The session secret depends on data when any `users` row carries a `password_hash`, any `sessions` row exists, or any `chat_invites` row is `pending` and not yet expired (its token hash is peppered with the same secret).

The check needs the db, and the db needs the migrated layout, so the secrets resolve in two phases around the db open:

1. Before `createDb`: `resolveCredentialsKey` and `resolveSessionSecret` (`infra/crypto/key.ts`) read the explicit env value, else the keyfile at the layout's secrets path. An explicit value wins. A keyfile that exists but cannot be used still fails closed and is never replaced. A remote db still yields no auto key. A keyfile that does not exist yields `absent` with its path, and nothing is written yet.
2. After `runBootMigrations`: `settleBootSecrets` (`entry/boot/boot-secrets.ts`) runs the two dependence queries for each `absent` secret. A dependent secret throws the refusal; an independent one is generated through `loadOrCreateKeyfile`, the atomic path a fresh box uses.

A cookie mode still refuses before the db opens when the session secret is unusable (remote db, or a corrupt keyfile), as today; only the `absent` case waits for the db. The `Tier-3-Infra.md` "degrades, never throws at boot" rule narrows to the corrupt-keyfile and bad-explicit-value cases; a missing keyfile with dependents is a boot refusal in `entry/boot`.

The snap stage copies a dev db and must be able to read its rows, so `seedStageData` also copies `secrets/credentials_key` and `secrets/session_secret` into the stage's own data root, and `SESSION_SECRET` joins `STAGE_INHERITED_ENV_KEYS` beside `CREDENTIALS_KEY` for a dev box that sets it explicitly.

### The migration step

A new `migrate-data-layout.ts` under `packages/server/src/entry/boot/` runs before `createDb` in `lifecycle.boot` (`packages/server/src/entry/lifecycle.ts` L335) and at the top of both seed tools, which open the db themselves (`tooling/src/seed/ops/demo.ts` L345, `tooling/src/seed/ops/chat.ts` L101). The step takes the resolved layout and does nothing else with the environment.

The legacy table, applied only to a slot the operator did not set:

| Legacy path under the root | New path |
| - | - |
| `orbweaver.db`, `orbweaver.db-wal`, `orbweaver.db-shm` | `db/` |
| `orbweaver.db.backup-<stamp>` with `-wal`, `-shm` and `.keep` siblings | `backups/` |
| `.credentials-key` | `secrets/credentials_key` |
| `.session-secret` | `secrets/session_secret` |
| `variants/` | `cache/variants/` |
| `models/` | `cache/models/` |
| `import-staging/` | `cache/import-staging/` |
| `import-reports/` | `reports/` |
| `assets/`, `users/`, `secrets/initial_password` | unchanged |

The `variants/`, `import-reports/`, backup and keyfile rows have no env key and move whenever present. The `models/` and `import-staging/` rows move only when their slot key is unset; a set key names a directory the operator owns. `DATA_LAYOUT_SKIP` names legacy entries, comma-separated by their root name (`import-reports`, `variants`, a backup file), that stay where they are; it is the way out for an entry no env key keeps when its target cannot take it, and both a fresh plan and a resume honor it, so no journal is ever edited by hand. The env parse refuses a name an env key keeps (the db, a keyfile, `models`, `import-staging`) and names that key, and refuses a name that is no legacy entry, listing the names it takes. A skipped entry stays at its old path, where the app does not read it; the refusal and the boot's warn line say so. An explicit `CREDENTIALS_KEY` or `SESSION_SECRET` keeps its legacy keyfile in place, the way a slot key keeps its slot.

The protocol:

1. Read the root directory once. No legacy name present and no journal: create the target directories and return. This is every boot after the first, and the fresh install.
2. Take the lock. The journal file `.layout-migration.json` is created with `wx` and holds the pid and the planned moves. An existing journal whose pid is alive refuses the boot; a dead pid means a crashed move, and the step resumes from the journal.
3. Refuse before any write when a legacy path and its target both hold data. The message names both paths and says to move or delete one by hand. Nothing merges. Refuse before any write, too, when a source, an existing target (an empty mount point at `cache/models` or `reports`) or the directory a target would land in sits on another filesystem than the root; the message names the entry and its way out (the slot key, or `DATA_LAYOUT_SKIP`).
4. Claim the db, then snapshot it. Open the legacy db with `createDb` and leave WAL (`detachWal` in `packages/db/src/client/index.ts`), which SQLite grants only to the sole connection on the file: any other open connection, busy or idle between requests, answers `SQLITE_BUSY` and is a refusal before anything is written. Leaving WAL folds the sidecars into the main file, so the db then moves as one file. Only after the claim does `backupBeforeMigrate` copy it into `backups/`.
5. Write the journal, then rename each entry. Every move is a same-filesystem `rename`. A directory moves as one entry. A rename that fails for any reason is a named refusal, never a raw errno: the message names the entry, the error code and its way out, and the journal keeps the remaining moves for the next boot.
6. Resume applies each journal entry by its state: source present and target absent means rename; source absent and target present means done; both present or both absent means refuse, because a rename cannot produce either. The pending entries are re-planned against the current env, so a slot key or `DATA_LAYOUT_SKIP` set after a failed move leaves its entry in place. A pending db is claimed again before it moves but never snapshotted again: the snapshot taken before the journal still covers it, and a snapshot per failed boot would fill the volume under a restart policy.
7. Delete the journal, then log one info line listing every move. A root entry the table does not name is left in place and named in one warn line.

The container runs the same code against `/app/data`. The entrypoint's `chown` walk (`docker/entrypoint.sh` L98) already covers new subdirectories. The rootfs is read-only; the volume is the only writable root, and every move stays inside it.

The credentials key moves by rename, so the bytes do not change and no stored credential rotates. The boot probe `probeKeyDecrypt` (`packages/server/src/entry/lifecycle.ts` L465) is the check.

## Rejected

- Keep the flat layout and document the exceptions. The exception list is what a user gets wrong; the owner ruled the split.
- Delete the caches instead of moving them. A rename is free and keeps a warm variant cache and a multi-gigabyte model download; deletion costs the user both on the next boot.
- A layout-version marker file. A marker can disagree with the tree. The tree is the state, detection is one directory read, and the journal exists only while a move is in progress.
- One env key per new directory (`BACKUPS_DIR`, `VARIANTS_DIR`, `SECRETS_DIR`, `REPORTS_DIR`). Every extra knob is a new way to split the backup unit. One root key plus the existing slot keys.
- Move the db by copy. Rename is atomic on one filesystem; a copy doubles the disk and leaves two live databases for a window.
- Run the move inside `runBootMigrations`. That step needs an open connection; the move must complete before `createDb` opens the new path.
- Rename `assets/` to `blobs/`. See the deviations above.
- Move `bug-reports/` and `.st-data` under `data/`. See the deviations above.
- Keep the db at the data root and move only the backups. Loose files at the root are exactly what the rule "copy everything except `cache/`" makes a user think about; `db/` and `backups/` as siblings make the WAL sidecars and the backup copies legible as two things.

## Coupled sites

Every reader and writer of a data path, by slot. A line number is a locator, not a contract.

| Slot | Site | Role |
| - | - | - |
| env defaults | `packages/server/src/foundation/env/index.ts` L336, L342, L349, L383, L386, L391 | the schema defaults; `.transform` at L693 gains the resolver |
| db | `packages/server/src/entry/lifecycle.ts` L335, L341 | `createDb`, `runBootMigrations` |
| db | `packages/db/src/client/index.ts` L106-120, L132-135 | `localPath`, the parent-dir `mkdir` |
| db | `tooling/src/seed/ops/demo.ts` L104-113, L332-346; `tooling/src/seed/ops/chat.ts` L101-102 | `--fresh` wipe, open, migrate |
| db | `tooling/src/verify/ops/db-baseline-parity.ts` L150, L159 | mirrors the default literal |
| db | `tooling/src/snap/ops/stage-source.ts` L91-101; `tooling/src/snap/lib/stage-plan.ts` L64-65 | copies the dev db into a stage |
| root | `tests/e2e/support/modes.ts` L242-244, L283-285, L329-330; `tooling/src/stack/multi-user-fixture.sh` L53-54 | each stack sets `DATA_DIR` under its `.cache` tree, so its secrets and reports never land in the checkout's `data/` |
| root | `tests/server/entry/lifecycle.int.test.ts` L20-29 and every `lifecycle-*.suite.int.test.ts`, `tests/server/entry/boot/local-light-prefetch-*.suite.int.test.ts` | stub `DATA_DIR` to the temp root instead of one slot each |
| root | `tooling/src/snap/ops/stage.ts` L121; `tooling/src/snap/lib/stage-plan.ts` L64-65, L291 | the stage sets `DATA_DIR` to `<stage>/data`; `SESSION_SECRET` joins the inherited keys |
| secrets | a new `boot-secrets.ts` under `packages/server/src/entry/boot/`; `packages/server/src/entry/lifecycle.ts` L348-360 | the two-phase resolution and the dependence refusal |
| root | `tooling/src/render-trace/ops/fire.ts` L113 | the probe sets `DATA_DIR` beside its throwaway db, so its boot never migrates or writes the checkout's `data/` |
| backups | `packages/db/src/client/index.ts` L212-236, L238-272, L292-314, L362-383 | `backupBeforeMigrate`, retention constants, the `.keep` pin, `pruneDbBackups` |
| backups | `packages/server/src/entry/boot/migrate.ts` L38-55, L66-101 | the boot step passes the dir |
| backups | `tests/db/client.int.test.ts` L273-431, L621-715; `tests/server/entry/boot/migrate.int.test.ts` L77-146, L171-222 | assert the backup dir |
| backups | `docs/law/Tier-1-DB.md` L108-110; `README.md` L39-43; `docker/README.md` L160-166 | the pin and rollback instructions |
| assets | `packages/server/src/entry/lifecycle.ts` L456, L654; `packages/server/src/entry/compose/services.ts` L369 | `createCas` |
| assets | `packages/server/src/infra/storage/cas.ts` L163-171 | the path derivation |
| assets | `tooling/src/snap/ops/stage-source.ts` L103-107; `tooling/src/snap/ops/stage.ts` L121 | symlinks the dev assets into a stage |
| variants | `packages/server/src/entry/lifecycle.ts` L457; `tooling/src/seed/ops/demo.ts` L354; `tooling/src/seed/ops/chat.ts` L122 | three derivations, replaced by the resolver |
| variants | `packages/server/src/infra/storage/variant-cache.ts` L38-58; `packages/server/src/domain/assets/verbs/resolve-variant.ts` L28-41 | derivation and regeneration |
| models | `packages/server/src/entry/compose/services.ts` L459; `packages/inference/src/backends/local-light/model-cache.ts` L306 | the transformers.js cache dir |
| models | `tests/server/foundation/env/index.test.ts` L440-444; `tests/server/entry/boot/local-light-prefetch-boot.suite.int.test.ts` L49; `tests/server/entry/boot/local-light-prefetch-off.suite.int.test.ts` L43 | pin the default and stub it |
| models | `docker/orbweaver.env` L53; `docker/README.md` L124-128 | the container knob and its doc |
| users | `packages/server/src/entry/compose/services.ts` L373; `packages/server/src/infra/storage/user-runtime-dir.ts`; `packages/inference/src/backends/agent-sdk/env.ts` L193 | per-user runtime dirs; path unchanged |
| staging | `packages/server/src/domain/import/substrate/staging.ts` L34; `packages/server/src/entry/http/import.ts` L91; `packages/server/src/entry/http/import-tree.ts` L308; `packages/server/src/entry/app.ts` L382, L388; `packages/server/src/entry/compose/portability-runner.ts` L92-93, L213 | the default literal, the two writers, the reader |
| staging | `packages/server/src/domain/import/workload-contributions.ts` L104-186 | resolve and cleanup |
| staging | `tests/server/domain/import/substrate/staging.test.ts` L46-47; `tests/support/fixtures.ts` L11-13, L174 | pin the default; the temp fixture |
| reports | `packages/server/src/entry/import/import-report.ts` L11, L325-331; `tests/server/entry/import/import-report.test.ts` L113-126 | the literal and its test |
| secrets | `packages/server/src/infra/crypto/key.ts` L20, L49-56, L86-93; `tests/server/infra/crypto/key.test.ts` L41-52, L55, L67, L74 | the keyfile name and the dir derivation |
| secrets | `packages/server/src/entry/lifecycle.ts` L337, L465 | key load and the decrypt probe |
| secrets | `docker/entrypoint.sh` L46, L85-86, L111-119, L148-169 | `secrets_dir`, the two generated files |
| secrets | `.gitignore` L2; `packages/client/vite.config.ts` L419-421, L458; `tests/tooling/vite-fs-deny.test.ts` L35-42 | the name in the ignore and deny lists |
| secrets | `docs/law/Tier-3-Infra.md` L29, L70, L79; `README.md` L35-38; `docker/README.md` L121-122; `docs/plans/network-and-auth-modes/design.md` L61 | the location in law, docs and the sibling plan |
| root | `Dockerfile` L77-83; `docker-compose.yaml` L38, L62; `docker/compose.dev.yaml` L46; `docker/README.md` L118-135 | the volume and its doc |
| root | `.gitignore` L19-21; `.dockerignore` L9; `packages/client/vite.config.ts` L425-437, L464 | root-anchored `data/` rules; unchanged, the new subdirectories inherit them |
| root | `.env.example` | gains a commented `DATA_DIR` line |
| root | `tests/tooling/tool-guard.int.test.ts` L556 | a sample command naming the old db path; the guard matches `sqlite3`, not the path |

## Test plan

Legs, in merge order. Leg B never merges alone: with new defaults and no migration a running install boots an empty db and regenerates its key.

### Leg A: the backup directory parameter in `@orb/db`

No behavior change; callers pass `dirname(path)`.

- `tests/db/client.int.test.ts`: the `pruneDbBackups` and `backupBeforeMigrate` tests take a `backupDir` that differs from the db dir; a new test proves a `.keep` pin in that dir is honored and a pin beside the db is not read.
- `tests/server/entry/boot/migrate.int.test.ts`: the backup and prune assertions read the passed dir.
- Red first: the new dir-differs test fails on the old signature because the copy lands beside the db.
- Floor: `pnpm test:scoped tests/db/client.int.test.ts tests/server/entry/boot/migrate.int.test.ts`, a scoped typecheck of the db and server programs, Biome and ESLint on the touched files.

### Leg B: the resolver, the new defaults, the migration step, and the tooling readers

- A new `data-layout.test.ts` under `tests/server/foundation/env/`: every slot derives from `DATA_DIR`; an explicit slot key wins and lands in the explicit set; a non-`file:` `DATABASE_URL` still disables the auto key.
- `tests/server/foundation/env/index.test.ts`: the default literals move to the new paths.
- A new `migrate-data-layout.int.test.ts` under `tests/server/entry/boot/`, each case on a temp root:
  - fresh install: an empty root gets the target directories, no journal remains, no move is logged;
  - legacy install: a legacy tree with a db carrying a row committed only in the WAL, one CAS blob, one variant, two backups with one `.keep` pin, a credentials key, model files, a staged upload and a report; after the step every file is at its new path, the blob's sha256 equals its hash, the WAL row reads from the new db path, a complete backup exists in `backups/`, the pin moved, the key bytes are identical and no legacy name remains at the root;
  - resume: a planted journal with half its entries applied completes the rest; the control plants an entry whose source and target both exist and proves the refusal;
  - both present: a legacy db and a new db refuse before any rename, and the message names both paths;
  - explicit override: with `ASSETS_DIR` set, `assets/` stays and appears in no journal; the control is the same tree without the override, which moves;
  - lock: a journal holding a live pid refuses; a dead pid resumes;
  - unknown root entries stay and are named in the warn line;
  - a second run is a no-op with zero renames.
- `tests/server/entry/lifecycle.int.test.ts`: a credential sealed with the legacy keyfile decrypts after a boot that moved it (`probeKeyDecrypt` true), with the tree stubbed through `DATA_DIR`.
- `tests/server/domain/assets/verbs/resolve-variant.int.test.ts`: a variant present under the moved cache is served without a transform call; with the cache dir absent it regenerates with one call.
- `tests/server/infra/crypto/key.test.ts`: `dataDirFromDbUrl` cases are deleted with the function; the resolvers write to the secrets dir they are given; an absent keyfile resolves to `absent` with its path and writes nothing.
- A new `boot-secrets.int.test.ts` under `tests/server/entry/boot/`, each case on a migrated `:memory:` db and a temp secrets dir: an empty db generates both keyfiles at mode 0600; a `user_credentials` row with the credentials keyfile absent refuses and names the file, and writes nothing; a user with a `password_hash` and no session keyfile refuses and names the file; a `sessions` row alone refuses too; an explicit value with dependents present neither refuses nor writes; a `resolved` secret passes through untouched.
- `tests/server/entry/lifecycle-session-secret.suite.int.test.ts`: the first boot stores a credential through `OPENROUTER_API_KEY` and generates both keyfiles under `secrets/`; a restart reuses them; deleting `session_secret` then makes the boot refuse and name that path with no listener bound; the same for `credentials_key`. The refusal replaces the former "regenerate and 401" control.
- Red first: the `boot-secrets` suite fails because the module does not exist; the lifecycle refusal cases fail on the unmodified tree because the boot regenerates and serves.
- `tests/server/entry/import/import-report.test.ts` and `tests/server/domain/import/substrate/staging.test.ts`: the new defaults.
- `tests/tooling/snap/lib/stage-plan.test.ts` and a new `stage-source.test.ts` under `tests/tooling/snap/ops/` for `seedStageData`: a dev root in the new shape copies the db and both keyfiles and links the assets; a control root in the old shape copies nothing, returns null provenance and prints a line naming the legacy layout.
- Existing round trips run unchanged as the regression floor: `tests/server/infra/storage/cas.int.test.ts`, `tests/server/infra/storage/variant-cache.int.test.ts`, `tests/server/entry/import/bundle-round-trip.suite.int.test.ts`, `tests/server/entry/http/portability-routes.suite.int.test.ts`, `tests/server/entry/import/run-profile-dir-import.test.ts`, `tests/server/domain/import/workload-contributions.test.ts`, `tests/server/entry/compose/portability-runner.test.ts`, `tests/server/entry/boot/local-light-prefetch-boot.suite.int.test.ts`, `tests/server/entry/boot/local-light-prefetch-off.suite.int.test.ts`.
- Red first: the migration suite fails on the unmodified tree because the step does not exist; the default-literal tests fail on the old literals.
- Floor: the suites above by path, a scoped typecheck of the server, db, inference and tooling programs, Biome and ESLint on the touched files, `pnpm check:structure`.

### Leg C: container, docs and law

- `docker/entrypoint.sh`: `ORB_DATA_DIR` becomes `DATA_DIR` and is exported; the comments name the new tree.
- `docker/README.md`, `README.md`, `docker/orbweaver.env`, `.env.example`, `docs/law/Tier-3-Infra.md`, `docs/law/Tier-1-DB.md`, `.gitignore`, `packages/client/vite.config.ts` and `tests/tooling/vite-fs-deny.test.ts`: the new paths and names.
- Floor: `pnpm check:agents`, `pnpm check:docs`, `pnpm check:structure`, `pnpm test:scoped tests/tooling/vite-fs-deny.test.ts`, and `tests/inference/backends/agent-sdk/env.test.ts` because it parses the entrypoint's secret line.

### Leg D: the container proof

- `docker build --target runtime` and a boot on a volume pre-seeded with the legacy layout: the log shows the one migration line, `/healthz` is 200 without `credentials_key_mismatch`, and a blob stored before the move serves by hash after it.
- A second boot on the same volume logs no move.
- The owner or the orchestrator runs this; a lane does not start containers.

The legacy volume comes from the image at the branch's base commit, never from the checkout's `data/`. Host networking keeps the request a loopback peer, so the single-user owner fallback answers the upload and the blob read. Run from the merged tree:

```sh
BASE=00b02f66a
git worktree add /tmp/orb-legacy "$BASE"
docker build --target runtime -t orbweaver:legacy /tmp/orb-legacy
docker build --target runtime -t orbweaver:datalayout .
docker volume create orb-datalayout-probe
RUN="docker run -d --network host -v orb-datalayout-probe:/app/data --env-file docker/orbweaver.env -e LOCAL_LIGHT_PREFETCH=off"

# 1. The legacy image writes the flat tree and stores one blob.
$RUN --name orb-legacy orbweaver:legacy
until curl -fsS localhost:8788/healthz; do sleep 2; done
printf 'x' > /tmp/orb-probe.png
HASH=$(curl -fsS -H 'x-orb-csrf: 1' -F file=@/tmp/orb-probe.png -F kind=gallery localhost:8788/api/assets/upload | jq -r .hash)
docker stop orb-legacy && docker rm orb-legacy
docker run --rm -v orb-datalayout-probe:/app/data alpine ls -la /app/data   # orbweaver.db, .credentials-key, .session-secret at the root

# 2. The new image moves it on the first boot and serves the same blob.
$RUN --name orb-new orbweaver:datalayout
until curl -fsS localhost:8788/healthz; do sleep 2; done
docker logs orb-new 2>&1 | grep 'boot/data-layout'                        # one line: moved N entries
curl -fsS localhost:8788/healthz                                           # status ok, never credentials_key_mismatch
curl -fsS -o /dev/null -w '%{http_code}\n' "localhost:8788/api/blob/$HASH" # 200
docker run --rm -v orb-datalayout-probe:/app/data alpine ls -la /app/data   # db/ backups/ assets/ secrets/ cache/ … and no legacy name

# 3. The second boot moves nothing.
docker restart orb-new
until curl -fsS localhost:8788/healthz; do sleep 2; done
docker logs --since 2m orb-new 2>&1 | grep -c 'boot/data-layout: moved'   # 0

docker rm -f orb-new
docker volume rm orb-datalayout-probe
git worktree remove /tmp/orb-legacy
```

The upload answers with the stored asset's `hash`; if the field is named otherwise on the base image, read it from the response body. The shipped `docker/orbweaver.env` sets the bridge ranges as trusted peers; under host networking the request is loopback, which the fallback admits without them.

### Whole tree

`pnpm check` after the train, and the push floor's node, CT and e2e smoke through the pre-push hook. No CT asserts a data path.

### Owner forks

Each with the default the legs build unless the owner rules otherwise.

- Keyfile name: `secrets/credentials_key` (default) or `secrets/.credentials-key`.
- CAS directory: `assets/` (default) or the proposal's `blobs/`.
- `bug-reports/` at the repository root (default) or under `data/reports/`.
- Law edits to `docs/law/Tier-3-Infra.md` and `docs/law/Tier-1-DB.md` describe the new locations, and an ADR records the layout as a standing on-disk contract (default: mint it on approval).
- The root key name `DATA_DIR` for both the server and the entrypoint (default) or keep the entrypoint's `ORB_DATA_DIR` as a second name.
