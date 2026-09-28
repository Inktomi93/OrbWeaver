# RPG 0078 private live-proof setup

Run from the repository root:

```sh
node scripts/probes/prelaunch-rpg/setup.ts
```

The process owns ports 8896, 5281, and 8897. It refuses occupied ports, creates a unique data root under
`.cache/prelaunch-rpg-0078/`, boots a harness-stamped single-user stack with `.env` loading disabled, and seeds
the lineage game only through the product's public tRPC API. Its loopback provider accepts exactly three
validated streaming requests and has no credential.

On success it prints the chat and variant ids plus an immutable JSON receipt path and SHA-256 sidecar under
`reports/prelaunch-closeout-2026-09-28/`. Keep the process open while driving snap. `Ctrl-C` closes the provider
and terminates only the private stack process group; it retains the private data root, stack log, and receipt
for inspection. The printed `ORPHAN_RECOVERY` command names that exact process group for recovery if the
launcher itself is killed before its cleanup handler runs.
