import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const sourceDir = resolve(scriptDir, '../src/features/user-stage-sync/persistence/migrations');
const destinationDir = resolve(scriptDir, '../dist/features/user-stage-sync/persistence/migrations');
mkdirSync(destinationDir, { recursive: true });
for (const file of readdirSync(sourceDir).filter((name) => /^\d{3}-.+\.sql$/.test(name))) {
  copyFileSync(resolve(sourceDir, file), resolve(destinationDir, file));
}
