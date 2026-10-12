---
kind: tooling
status: doing
updated: 2026-10-12
priority: P2
area: tooling
lane: wt/agent-a6e686370488ccec5
plan: test-mirror
---

# Side-eye reviews run on the owner's container data with any auth mode

## What

Side-eye and the snap-driving skill default to a docker cp of the orbweaver container db via --stage-db; --stage-db composes with --stage-auth local by seeding the fixture member into the clone; the container assets come with the clone (folds 878); a stage-band wait survives the driving agent stopping; snap --motion captures the full transition instead of two frames.

## Why

Owner: his container db is chunky real data and reviewers should copy it and switch auth mode; side-eyes this session started from a thin dev db, hit band waits that died, and got no motion verdict.

## Done when

snap-driving and the side-eye role name the container-copy recipe as the default; snap --stage-db plus --stage-auth local boots with owner and member signed in on the cloned data; cloned stages render the owner's avatars and art; a band wait resumes after the agent stops; --motion on a section switch captures the whole fade; tests cover each.

## Evidence

Filled at landing: what ran and where its output is.
