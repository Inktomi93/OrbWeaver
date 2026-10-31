-- Strip the retired `agent` task (RETIRED_TASKS in packages/contracts/src/inference/tasks.ts) from stored provider rows and plugin manifests.
-- A plugin definition's hash covers its serves list and SQL cannot recompute it, so that definition and its claims go; the stripped manifest re-claims the id on its next activation.
DELETE FROM plugin_provider_claims
WHERE EXISTS (
 SELECT 1 FROM provider_rows
 WHERE provider_rows.id = plugin_provider_claims.provider_id
  AND provider_rows.definition_hash = plugin_provider_claims.definition_hash
  AND provider_rows.origin_kind = 'plugin'
  AND EXISTS (SELECT 1 FROM json_each(provider_rows.serves) WHERE value = 'agent')
);
--> statement-breakpoint
DELETE FROM provider_rows
WHERE origin_kind = 'plugin' AND EXISTS (SELECT 1 FROM json_each(provider_rows.serves) WHERE value = 'agent');
--> statement-breakpoint
-- An admin row is keyed by id alone, so its stored hash is provenance and stays.
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
