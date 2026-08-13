import app from './app.ts';
import { Command } from '@cliffy/command';
import { DEFAULT_CONFIG_FILE_PATH } from '../constants.ts';
import { NoDaemonError, send } from './socket.ts';
import selfUpdate from './self-update.ts';
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
    .command('self-update', 'Replace the installed binary with the newest release.')
    .action(async ({ configFile }) => {
      try {
        const { ok, message } = await send(configFile, 'self-update');
        console.log(message);

        if (!ok) Deno.exit(1);

        return;
      } catch (error) {
        // Only the daemon can update a binary it is running from, so it does the work when there is
        // one. With nothing running there is nothing to co-ordinate with, and no restart to arrange.
        if (!(error instanceof NoDaemonError)) {
          console.error(describeError(error));
          Deno.exit(1);
        }
      }

      try {
        const { updated, message } = await selfUpdate();
        console.log(message);

        if (updated) {
          console.log('Nothing was running to restart, so it takes effect the next time checker starts.');
        }
      } catch (error) {
        console.error(describeError(error));
        Deno.exit(1);
      }
    })
    .parse();
}
