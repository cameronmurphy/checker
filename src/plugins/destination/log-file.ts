import BaseDestinationPlugin, { DestinationConfigSchema } from './base.ts';
import { dirname } from '@std/path/dirname';
import { ensureDir } from '@std/fs/ensure-dir';
import { expand } from '../../utils/path.ts';
import { z } from 'zod';

const LogFileConfigSchema = DestinationConfigSchema.extend({
  path: z.string(),
});

type LogFileConfig = z.infer<typeof LogFileConfigSchema>;

export default class LogFileDestination extends BaseDestinationPlugin<LogFileConfig> {
  public override getSchema() {
    return LogFileConfigSchema;
  }

  public override async notify(message: string): Promise<boolean> {
    const path = expand(this.getConfig().path);
    const line = `${new Date().toISOString()} ${message.replace(/\s+/g, ' ').trim()}\n`;

    try {
      await ensureDir(dirname(path));
      await Deno.writeTextFile(path, line, { append: true });
    } catch (error) {
      console.error(`Failed to append to ${path}: ${error instanceof Error ? error.message : error}`);
      return false;
    }

    return true;
  }
}
