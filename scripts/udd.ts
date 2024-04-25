import { udd } from '../dev_deps.ts';

const DEPS_FILES = [
  'deps.ts',
  'dev_deps.ts',
];

if (import.meta.main) {
  await Deno.remove('deno.lock');

  DEPS_FILES.forEach(async (depsFile) => {
    await udd(depsFile, {});

    const cmd = new Deno.Command(Deno.execPath(), {
      args: [
        'cache',
        depsFile,
      ],
    });

    const { code } = await cmd.output();
    console.assert(code === 0);
  });
}
