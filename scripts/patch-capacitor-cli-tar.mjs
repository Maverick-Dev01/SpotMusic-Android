import { readFile, writeFile } from 'node:fs/promises';

// Capacitor CLI 6 imports tar as a default CommonJS export. tar 7 removed that
// compatibility default, so keep the supported CLI while using the patched tar.
const file = new URL('../node_modules/@capacitor/cli/dist/util/template.js', import.meta.url);
const source = await readFile(file, 'utf8');
const legacy = 'await tar_1.default.extract({ file: src, cwd: dir });';
const compatible = 'await (tar_1.default || tar_1).extract({ file: src, cwd: dir });';

if (source.includes(legacy)) {
  await writeFile(file, source.replace(legacy, compatible));
} else if (!source.includes(compatible)) {
  throw new Error('No se reconoció la implementación de extracción de Capacitor CLI.');
}
