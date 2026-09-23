import { join } from 'node:path';
import { TRACE_FILE, verifyTrace } from '../src/audit.mjs';
import { projectRoot } from '../src/config.mjs';

const path = process.argv[2] ?? join(projectRoot, '.runs', TRACE_FILE);
const result = await verifyTrace(path);
console.log(`${result.valid ? 'VALID' : 'INVALID'} ${path}: ${result.count} entries${result.error ? `, ${result.error}` : ''}`);
if (!result.valid) process.exitCode = 1;
