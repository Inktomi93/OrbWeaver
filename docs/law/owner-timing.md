---
kind: law
status: active
updated: 2026-10-09
---

# Run timing qualification on the owner machine

## Scope

[D308](../adr/0308-hardware-scoped-timing-budgets.md) owns timing qualification policy. This procedure installs its local controller on the registered owner machine.

The controller reads trusted remote `main`, not pull request branches. It is not a GitHub runner.

Install only from independently reviewed source already published on trusted `main`. Installation does not establish a passing timing result.

The host needs Git, Bash, `flock`, `stat`, `lscpu`, `jq` and Chromium system libraries.
Confirm `/run/user/1000` exists and belongs to UID `1000` before enabling the service.

## Install

1. Confirm the pinned Node version from the approved checkout.

```bash
owner_timing_node=$(pnpm exec node -p 'process.execPath')
"$owner_timing_node" --version
```

2. Create root-owned runtime directories and owner-owned working directories.

```bash
sudo install -d -o root -g root -m0755 /usr/local/lib/orbweaver-owner-timing /var/lib/orbweaver-owner-timing /var/lib/orbweaver-owner-timing/runtime
sudo install -d -o inktomi -g inktomi -m0700 /var/lib/orbweaver-owner-timing/state /var/lib/orbweaver-owner-timing/checkout
```

3. Install the runtime and controller outside the protected home directory.

```bash
sudo install -o root -g root -m0755 "$owner_timing_node" /var/lib/orbweaver-owner-timing/runtime/node
sudo cp -a /usr/lib/node_modules/corepack /var/lib/orbweaver-owner-timing/runtime/corepack
sudo install -o root -g root -m0755 scripts/ci/owner-timing-pnpm /var/lib/orbweaver-owner-timing/runtime/pnpm
sudo install -o root -g root -m0755 scripts/ci/owner-timing.sh /usr/local/lib/orbweaver-owner-timing/owner-timing.sh
sudo -u inktomi git clone --branch main --single-branch https://github.com/Inktomi93/OrbWeaver.git /var/lib/orbweaver-owner-timing/checkout
```

4. Copy `scripts/ci/owner-timing.conf` to a private temporary file.
5. Set its machine identity from `/etc/machine-id` and confirm its UID and exact CPU model.
6. Install that file as root-owned `/etc/orbweaver-owner-timing.conf`, mode `0644`, then delete the temporary file.
7. Install and validate the service and timers before enabling them.

```bash
sudo install -o root -g root -m0644 scripts/ci/owner-timing@.service scripts/ci/owner-timing-poll.timer scripts/ci/owner-timing-scheduled.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemd-analyze verify /etc/systemd/system/owner-timing@.service /etc/systemd/system/owner-timing-poll.timer /etc/systemd/system/owner-timing-scheduled.timer
sudo systemctl enable --now owner-timing-poll.timer owner-timing-scheduled.timer
```

## Read results

The poll timer observes changed main commits. The scheduled timer observes its configured daily boundary.
Read timer definitions in `scripts/ci/owner-timing-poll.timer` and `scripts/ci/owner-timing-scheduled.timer`.

```bash
systemctl list-timers 'owner-timing-*'
journalctl -u owner-timing@poll.service -u owner-timing@scheduled.service
```

Completed attempts retain their source, class, exit result and native component-test evidence under `/var/lib/orbweaver-owner-timing/state/runs/`.
Read the current attempt and its validated evidence. A previous success does not establish the current result.

The controller uses private cache, package-manager and data directories. It preserves `HOME` and uses the shared component-test host slot.
Production configuration, Docker sockets and model engines are not inputs to this qualification.

## Stop

```bash
sudo systemctl disable --now owner-timing-poll.timer owner-timing-scheduled.timer
sudo systemctl stop owner-timing@poll.service owner-timing@scheduled.service
```
