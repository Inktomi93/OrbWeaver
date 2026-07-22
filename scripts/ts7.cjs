#!/usr/bin/env node
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const args = process.argv.slice(2);
const tscPath = path.resolve(__dirname, '../node_modules/ts7/bin/tsc');
const result = spawnSync(process.execPath, [tscPath, ...args], { stdio: 'inherit' });
process.exit(result.status ?? 1);
