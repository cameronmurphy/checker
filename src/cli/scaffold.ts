import { dirname } from '@std/path';
import { expand } from '../utils/path.ts';

const EXAMPLE_CONFIG = new URL('../../config.example.yml', import.meta.url);

export default async function scaffoldConfig(configFile: string): Promise<string | null> {
  const path = expand(configFile);

  if (await Deno.stat(path).then(() => true).catch(() => false)) {
    return null;
  }

  const example = await Deno.readTextFile(EXAMPLE_CONFIG);
  await Deno.mkdir(dirname(path), { recursive: true });

  try {
    await Deno.writeTextFile(path, example, { createNew: true });
  } catch (error) {
    if (error instanceof Deno.errors.AlreadyExists) return null;
    throw error;
  }

  return path;
}
