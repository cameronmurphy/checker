import BaseDestinationPlugin, { DestinationConfigSchema } from './base.ts';
import { expand } from '../../utils/path.ts';
import { z } from 'zod';

const ScriptConfigSchema = DestinationConfigSchema.extend({
  command: z.string(),
  args: z.array(z.string()).default([]),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).default({}),
  timeout: z.number().int().positive().default(900),
});

type ScriptConfig = z.infer<typeof ScriptConfigSchema>;

/**
 * Runs a local command and treats a zero exit status as delivery. A non-zero one leaves the source's
 * stored value alone, so a script that failed is handed the same update again on the next check —
 * which is the behaviour you want when the script is doing the upgrade rather than announcing it.
 */
export default class ScriptDestination extends BaseDestinationPlugin<ScriptConfig> {
  public override getSchema() {
    return ScriptConfigSchema;
  }

  public override async notify(message: string): Promise<boolean> {
    const { command, args, cwd, env, timeout } = this.getConfig();
    const path = expand(command);

    const process = new Deno.Command(path, {
      args: args.map((arg) => arg.replaceAll('{{message}}', message)),
      ...(cwd ? { cwd: expand(cwd) } : {}),
      env: { ...env, CHECKER_MESSAGE: message, CHECKER_DESTINATION: this.getAlias() },
      // The message goes in on stdin as well as in the environment: it is multi-line for most
      // sources, and a script reading stdin doesn't have to care how long it got.
      stdin: 'piped',
      // Inherited rather than captured, so a long upgrade reports progress into the daemon's log as
      // it happens. It also keeps the timeout honest: a piped stdout is held open by anything the
      // script spawned, so killing the script alone would still leave the daemon waiting on curl.
      stdout: 'inherit',
      stderr: 'inherit',
      signal: AbortSignal.timeout(timeout * 1000),
    });

    let child: Deno.ChildProcess;

    try {
      child = process.spawn();
    } catch (error) {
      console.error(`Script ${path} could not be run: ${error instanceof Error ? error.message : error}`);
      return false;
    }

    const writer = child.stdin.getWriter();
    await writer.write(new TextEncoder().encode(`${message}\n`));
    await writer.close();

    const { code, signal } = await child.status;

    if (code === 0) {
      console.log(`Script ${path} finished`);
      return true;
    }

    console.error(
      `Script ${path} ${
        signal ? `was killed by ${signal}${signal === 'SIGTERM' ? `, timeout is ${timeout}s` : ''}` : `exited ${code}`
      } — its output is above`,
    );

    return false;
  }
}
