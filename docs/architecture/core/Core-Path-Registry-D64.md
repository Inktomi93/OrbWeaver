---
kind: reference
status: active
updated: 2026-07-13
---

# Orbweaver — Path/Home Registry: D64

> Split-sibling of `Core-Laws-and-Precedents.md` §7. Slimmed to the standing ruling 2026-07-13 (D66).

---

- **D64** — A host-handoff (`acceptHostHandoff`) and a non-owner fork (`forkChat`) SUCCEED: they transfer the room + history but DROP the prior host's character seats (humans and agents are never dropped); the new owner adds their own cast. Cards are single-owned, and the engine loads cast + memory under the ONE new-owner `runAsUserId` — a seat whose card resolves `null` under the new owner is `leftSeq`-stamped in the SAME atomic batch as the role swap (handoff), or omitted from the copied roster (fork; the canon/history is copied WHOLE, so a dropped character's prior lines survive). An owner forking their own chat keeps the full cast unchanged. The outgoing host's synthetic group-memory bucket is naturally orphaned — expected, not migrated. There is NO `cast_not_owned` error (the fail-closed refuse is superseded; no path throws it).
