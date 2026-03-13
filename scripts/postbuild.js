import { writeFileSync, existsSync } from 'fs';

const esmIndex = `export * from './esm/index.js';\n`;
writeFileSync('dist/index.js', esmIndex);

const cjsIndex = `exports.__esModule = true;\nmodule.exports = require('./cjs/index.js');\n`;
writeFileSync('dist/index.cjs', cjsIndex);

// Ensure dist/cjs is treated as CommonJS when package root is "type": "module"
const cjsPackageJson = JSON.stringify({ type: 'commonjs' }, null, 2) + '\n';
try {
  writeFileSync('dist/cjs/package.json', cjsPackageJson);
} catch (err) {
  // best-effort; if dist/cjs doesn't exist yet, postbuild is often run after tsc outputs
  // and this write will create the package.json when possible.
}

const typesPath = 'dist/index.d.ts';
if (!existsSync(typesPath)) {
  writeFileSync(typesPath, 'export {}\n');
}
