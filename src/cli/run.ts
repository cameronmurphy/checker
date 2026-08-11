import app from './app.ts';
import { Command } from '@cliffy/command';
import { DEFAULT_CONFIG_FILE_PATH } from '../constants.ts';
import { send } from './socket.ts';
import { describeError } from '../utils/format.ts';
import denoJson from '../../deno.json' with { type: 'json' };

export default function run() {
  return new Command()
    .name('checker')
    .description('Check the stuff')
    .version(`v${denoJson.version}`)
    .globalOption('-c, --config-file <config-file>', 'Path to the config file.', {
      default: DEFAULT_CONFIG_FILE_PATH,
    })
    .action(app)
    .command('self-update', 'Ask the running checker to replace itself with the newest release.')
    .action(async ({ configFile }) => {
      try {
        const { ok, message } = await send(configFile, 'self-update');
        console.log(message);

        if (!ok) Deno.exit(1);
      } catch (error) {
        console.error(describeError(error));
        Deno.exit(1);
      }
    })
    .parse();
}
