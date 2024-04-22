import { udd } from '../dev_deps.ts';

if (import.meta.main) {
  await udd('deps.ts', {});
  await udd('dev_deps.ts', {});
}
