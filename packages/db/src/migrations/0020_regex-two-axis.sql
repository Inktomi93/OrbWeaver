-- Rewrite every regex script's behavior from the one placement set onto two axes: `targets` (what text) and `passes`
-- (when it runs). The same mapping lifts a file exported before the change; packages/contracts/src/regex/schemas.ts
-- states it beside `liftPlacementSetBehavior`, and tests/contracts/regex/legacy-behavior-lift.contract.test.ts pins
-- each shape, including that every result parses through the write schema.
--
-- Two readings, in order:
--   1. A DISPLAY or PROMPT_HISTORY member means the editor here wrote the row (the old lift never did).
--      a. With a save member (USER_INPUT, AI_OUTPUT, REASONING): the save reading wins. The row is the save pass on
--         its save members alone, and its DISPLAY, PROMPT_HISTORY and WORLD_INFO members are dropped, since one
--         script is saved or ephemeral, never both, and the save pass is the one that has been changing stored text.
--      b. With no save member: DISPLAY is the display pass and PROMPT_HISTORY or WORLD_INFO the prompt pass. A target
--         is kept only where every kept pass reached it before (a pass that cannot read a target, such as display
--         on world info, does not count against it), so the rewrite never widens a script's reach:
--           USER_INPUT and AI_OUTPUT when PROMPT_HISTORY, or when DISPLAY without WORLD_INFO;
--           REASONING when DISPLAY alone (the old history pass never read reasoning);
--           WORLD_INFO when WORLD_INFO.
--         The display pass stays when it keeps a target it reads; the prompt pass always does. PROMPT_HISTORY's
--         depth comes along, an old floor of 0 becoming -1 (the new "no floor").
--   2. Otherwise the stored flags are read at their word, with SillyTavern's meaning: markdownOnly is display,
--      promptOnly is prompt, both is both, neither is save. An editor-written save-time script also carries
--      promptOnly: true (the old derive set it whenever DISPLAY was absent), so it moves to the prompt pass. Owner
--      ruling: accepted because only the owner has installed the app.
--
-- Boot names every row this moves off the save pass or narrows, read before it runs by
-- packages/db/src/client/regex-two-axis-report.ts.

UPDATE regex_scripts
SET behavior = (
  SELECT json_remove(
    json_set(
      CASE WHEN f.depth_min IS NULL THEN regex_scripts.behavior
           ELSE json_set(regex_scripts.behavior, '$.depth', json_object('min', f.depth_min, 'max', f.depth_max)) END,
      '$.targets', json(f.targets),
      '$.passes', json(f.passes)
    ),
    '$.placement', '$.markdownOnly', '$.promptOnly', '$.historyDepth'
  )
  FROM (
    SELECT
      -- targets, in REGEX_TARGETS order
      (SELECT json_group_array(t) FROM (
        SELECT 'USER_INPUT' AS t, 1 AS o WHERE (m.native = 0 AND m.u) OR (m.native = 1 AND m.save_n > 0 AND m.u) OR (m.native = 1 AND m.save_n = 0 AND m.user_ai)
        UNION ALL SELECT 'AI_OUTPUT', 2 WHERE (m.native = 0 AND m.a) OR (m.native = 1 AND m.save_n > 0 AND m.a) OR (m.native = 1 AND m.save_n = 0 AND m.user_ai)
        UNION ALL SELECT 'WORLD_INFO', 3 WHERE (m.native = 0 AND m.wi) OR (m.native = 1 AND m.save_n = 0 AND m.wi)
        UNION ALL SELECT 'REASONING', 4 WHERE (m.native = 0 AND m.r) OR (m.native = 1 AND m.save_n > 0 AND m.r) OR (m.native = 1 AND m.save_n = 0 AND m.reasoning)
        ORDER BY o
      )) AS targets,
      -- passes, in REGEX_PASSES order
      (SELECT json_group_array(p) FROM (
        SELECT 'save' AS p, 1 AS o WHERE (m.native = 0 AND m.md = 0 AND m.po = 0) OR (m.native = 1 AND m.save_n > 0)
        UNION ALL SELECT 'display', 2 WHERE (m.native = 0 AND m.md = 1) OR (m.native = 1 AND m.save_n = 0 AND m.disp AND (m.hist OR NOT m.wi))
        UNION ALL SELECT 'prompt', 3 WHERE (m.native = 0 AND m.po = 1) OR (m.native = 1 AND m.save_n = 0 AND (m.hist OR m.wi))
        ORDER BY o
      )) AS passes,
      CASE WHEN m.native = 1 AND m.save_n = 0 AND m.hist AND NOT (coalesce(m.hmin, 0) = 0 AND m.hmax IS NULL)
           THEN CASE WHEN coalesce(m.hmin, 0) = 0 THEN -1 ELSE m.hmin END END AS depth_min,
      CASE WHEN m.native = 1 AND m.save_n = 0 AND m.hist THEN m.hmax END AS depth_max
    FROM (
      SELECT
        x.*,
        (x.disp OR x.hist) AS native,
        (x.u + x.a + x.r) AS save_n,
        (x.hist OR (x.disp AND NOT x.wi)) AS user_ai,
        (x.disp AND NOT x.hist AND NOT x.wi) AS reasoning
      FROM (
        SELECT
          EXISTS (SELECT 1 FROM json_each(regex_scripts.behavior, '$.placement') WHERE value = 'USER_INPUT') AS u,
          EXISTS (SELECT 1 FROM json_each(regex_scripts.behavior, '$.placement') WHERE value = 'AI_OUTPUT') AS a,
          EXISTS (SELECT 1 FROM json_each(regex_scripts.behavior, '$.placement') WHERE value = 'REASONING') AS r,
          EXISTS (SELECT 1 FROM json_each(regex_scripts.behavior, '$.placement') WHERE value = 'WORLD_INFO') AS wi,
          EXISTS (SELECT 1 FROM json_each(regex_scripts.behavior, '$.placement') WHERE value = 'DISPLAY') AS disp,
          EXISTS (SELECT 1 FROM json_each(regex_scripts.behavior, '$.placement') WHERE value = 'PROMPT_HISTORY') AS hist,
          coalesce(json_extract(regex_scripts.behavior, '$.markdownOnly'), 0) AS md,
          coalesce(json_extract(regex_scripts.behavior, '$.promptOnly'), 0) AS po,
          json_extract(regex_scripts.behavior, '$.historyDepth.min') AS hmin,
          json_extract(regex_scripts.behavior, '$.historyDepth.max') AS hmax
      ) AS x
    ) AS m
  ) AS f
)
WHERE json_type(behavior, '$.placement') = 'array' AND json_type(behavior, '$.targets') IS NULL;
