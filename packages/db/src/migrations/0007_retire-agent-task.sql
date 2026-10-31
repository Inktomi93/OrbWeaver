-- Strip the retired `agent` task (RETIRED_TASKS in packages/contracts/src/inference/tasks.ts) from stored provider rows and plugin manifests.
-- A plugin row's definition_hash still covers the old list; the boot step in packages/server/src/entry/boot/rehash-plugin-provider-definitions.ts rewrites it and its claims.
UPDATE provider_rows SET serves = (
 SELECT json_group_array(entry.value) FROM (SELECT value FROM json_each(provider_rows.serves) WHERE value <> 'agent' ORDER BY key) AS entry
)
WHERE EXISTS (SELECT 1 FROM json_each(provider_rows.serves) WHERE value = 'agent');
--> statement-breakpoint
UPDATE plugins SET manifest = json_set(manifest, '$.providers', (
 SELECT json_group_array(json(CASE
  WHEN json_type(provider.value, '$.serves') = 'array' THEN json_set(provider.value, '$.serves', json((
   SELECT json_group_array(task.value) FROM (SELECT value FROM json_each(provider.value, '$.serves') WHERE value <> 'agent' ORDER BY key) AS task
  )))
  ELSE provider.value
 END))
 FROM (SELECT value FROM json_each(plugins.manifest, '$.providers') ORDER BY key) AS provider
))
WHERE EXISTS (
 SELECT 1 FROM json_each(plugins.manifest, '$.providers') AS provider, json_each(provider.value, '$.serves') AS task
 WHERE task.value = 'agent'
);
