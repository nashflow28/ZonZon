/* eslint-disable */
/**
 * lucide-angular@1.0.0 ships `.d.ts` files under `lib/` but the corresponding
 * `.mjs` runtime files only live in `esm2020/lib/`. Angular 21's esbuild
 * bundler follows the `.d.ts` paths at partial-compile time and can't resolve
 * them. This tiny postinstall script creates thin `.mjs` shims under `lib/`
 * that re-export from `esm2020/lib/`.
 *
 * Safe no-op if the package layout ever changes.
 */
const fs = require('fs');
const path = require('path');

const pkgRoot = path.resolve(__dirname, '..', 'node_modules', 'lucide-angular');
const libDir = path.join(pkgRoot, 'lib');
const esmLibDir = path.join(pkgRoot, 'esm2020', 'lib');

if (!fs.existsSync(libDir) || !fs.existsSync(esmLibDir)) {
  process.exit(0);
}

const files = [
  'icons.provider',
  'lucide-angular.component',
  'lucide-angular.module',
  'lucide-icon.config',
  'lucide-icon.provider'
];

for (const name of files) {
  const target = path.join(libDir, name + '.mjs');
  const source = path.join(esmLibDir, name + '.mjs');
  if (!fs.existsSync(source)) continue;
  if (fs.existsSync(target)) continue;
  fs.writeFileSync(target, `export * from '../esm2020/lib/${name}.mjs';\n`, 'utf8');
}
