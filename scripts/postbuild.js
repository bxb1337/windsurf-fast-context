import { writeFileSync, existsSync } from 'fs';

const esmIndex = `export * from './esm/index.js';\n`;
writeFileSync('dist/index.js', esmIndex);

const cjsIndex = `exports.__esModule = true;\nmodule.exports = require('./cjs/index.js');\n`;
writeFileSync('dist/index.cjs', cjsIndex);

// Ensure dist/cjs is treated as CommonJS when package root is "type": "module"
const cjsPackageJson = JSON.stringify({ type: 'commonjs' }, null, 2) + '\n';
// Ensure directory exists before writing; only ignore if the error is ENOENT on parent dirs
import { mkdirSync } from 'fs';
try {
  mkdirSync('dist/cjs', { recursive: true });
  writeFileSync('dist/cjs/package.json', cjsPackageJson);
} catch (err) {
  // If error is missing permissions or other unexpected failures, rethrow.
  // Only silently ignore ENOENT when the filesystem reports missing path components (very unlikely
  // because we created the directory), but be explicit: rethrow for any non-ENOENT error.
  if (err && err.code && err.code !== 'ENOENT') throw err;
}

const typesPath = 'dist/index.d.ts';
if (!existsSync(typesPath)) {
  writeFileSync(typesPath, 'export {}\n');
}
