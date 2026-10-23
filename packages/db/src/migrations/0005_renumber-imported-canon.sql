-- Renumber every room whose canon starts at seq 0 so it starts at seq 1, moving each plane that names its
-- message seqs. The rule and the plane list are recorded on docs/work/1236-imported-chats-drop-their-seq-0-row-from.md.
-- The seq-0 selection must run before the messages update, so the messages statements come last.
-- An import writes the bundle's updated_at and the import instant as started_at, and every compaction write
-- sets updated_at to now. A row untouched since its import therefore still holds the bundle's marker, which
-- names source seqs and must stay; any other marker shifts with the rows so it covers what it covers today.
UPDATE chats SET compacted_at_seq = compacted_at_seq + 1
WHERE compacted_at_seq IS NOT NULL
 AND (started_at IS NULL OR updated_at >= started_at)
 AND id IN (SELECT chat_id FROM messages WHERE seq = 0);
--> statement-breakpoint
UPDATE chats SET standalone_variable_deltas = (
 SELECT json_group_array(json_set(entry.value, '$.seq', json_extract(entry.value, '$.seq') + 1))
 FROM (SELECT value FROM json_each(chats.standalone_variable_deltas) ORDER BY key) AS entry
)
WHERE json_valid(standalone_variable_deltas) AND json_type(standalone_variable_deltas) = 'array'
 AND id IN (SELECT chat_id FROM messages WHERE seq = 0);
--> statement-breakpoint
-- join_seq 0 admits every row under either numbering, and a founding seat keeps it.
UPDATE chat_participants SET
 join_seq = CASE WHEN join_seq > 0 THEN join_seq + 1 ELSE join_seq END,
 left_seq = CASE WHEN left_seq IS NULL THEN NULL ELSE left_seq + 1 END
WHERE chat_id IN (SELECT chat_id FROM messages WHERE seq = 0);
--> statement-breakpoint
UPDATE chat_segments SET seq_start = seq_start + 1, seq_end = seq_end + 1
WHERE chat_id IN (SELECT chat_id FROM messages WHERE seq = 0);
--> statement-breakpoint
UPDATE chat_events SET payload = json_set(payload, '$.view.seq', json_extract(payload, '$.view.seq') + 1)
WHERE json_valid(payload) AND json_type(payload, '$.view.seq') = 'integer'
 AND chat_id IN (SELECT chat_id FROM messages WHERE seq = 0);
--> statement-breakpoint
UPDATE chat_events SET payload = json_set(payload, '$.slotSeq', json_extract(payload, '$.slotSeq') + 1)
WHERE json_valid(payload) AND json_type(payload, '$.slotSeq') = 'integer'
 AND chat_id IN (SELECT chat_id FROM messages WHERE seq = 0);
--> statement-breakpoint
-- A watermark of 0 means nothing is settled, so it stays 0 and the next pass re-covers from the start.
UPDATE automation_rule_state SET state = json_set(state, '$.settledThroughSeq', json_extract(state, '$.settledThroughSeq') + 1)
WHERE json_valid(state) AND json_type(state, '$.settledThroughSeq') = 'integer' AND json_extract(state, '$.settledThroughSeq') > 0
 AND rule_id IN (SELECT id FROM automation_rules WHERE chat_id IN (SELECT chat_id FROM messages WHERE seq = 0));
--> statement-breakpoint
-- Park the rows below zero first so the (chat_id, seq) unique index never sees two rows on one seq.
UPDATE messages SET seq = -(seq + 1)
WHERE chat_id IN (SELECT chat_id FROM messages WHERE seq = 0);
--> statement-breakpoint
UPDATE messages SET seq = -seq WHERE seq < 0;
