-- Filled by item 1525: adds the assets-rebuild-index workload kind to the workloads and workload_schedules kind CHECKs.
UPDATE `workloads` SET `kind` = `kind` WHERE 0;
