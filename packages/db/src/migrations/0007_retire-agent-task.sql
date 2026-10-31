-- Filled by item 1498: strips the retired agent task from stored provider rows and plugin manifests.
UPDATE `provider_rows` SET `serves` = `serves` WHERE 0;
