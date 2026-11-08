---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: server
plan: test-foundation
---

# Secrecy follow-ups: count pre-fix case-variant stamps in chat_events on the prod copy, fix ADR 0285's per-turn warning wording, record that an away host misses the warning

## What

Do three secrecy follow-ups. Count the pre-fix case-variant stamps in chat_events on a copy of the production database. Correct the per-turn warning wording in ADR 0285. Record in the ADR that an away host misses the warning.

## Why

ADR 0285 describes the per-turn warning in words that need a fix, and the reach of the case-variant stamps written before the fix is not yet measured.

## Done when

The count of stamps is recorded in the Evidence with the command that produced it. ADR 0285 states the corrected wording and names the away-host gap.

## Evidence

The count is zero. The copy of the release database held `768` rows in `chat_events`, and none carries a hidden tag open in any case, so none carries a case variant. `message_variants` holds no `<lie ` open either. The rows reach from before the case-insensitive fix in `9a4212a4d9` to after it, so the owner data holds no pre-fix stamp. The copy was read-only and was deleted after the count. A planted `<LIE truth="x"/>` and `<Ofilter reason="y"/>` both match the pattern, and `<lie down on the bed` does not.

```bash
docker cp orbweaver:/app/data/db/orbweaver.db "$SCRATCH/"
docker cp orbweaver:/app/data/db/orbweaver.db-wal "$SCRATCH/"
docker cp orbweaver:/app/data/db/orbweaver.db-shm "$SCRATCH/"
python3 -I count.py "$SCRATCH/orbweaver.db"
```

```python
import re, sqlite3, sys
open_tag = re.compile(r"<(lie|ofilter)\s+[A-Za-z_][\w-]*\s*=", re.IGNORECASE)
db = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
rows = [p for (p,) in db.execute("select payload from chat_events") if any(m != m.lower() for m in open_tag.findall(p))]
print(db.execute("select count(*) from chat_events").fetchone()[0], len(rows))
```

ADR 0285 now says the host receives one warning per reply, not per turn: a group round commits a reply per speaker, and each is judged at its own commit. It also names the gap: an away host misses the warning. A room opened after the commit attaches at its event high-water mark, so the warning event is never replayed. The host's render keeps the broken tag literal, but nothing tells the host that members lost the tail. The ADR sits at its size cap, so the reason lives here.
