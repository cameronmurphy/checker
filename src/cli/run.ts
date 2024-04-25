import app from './app.ts';
import { Command } from '../../deps.ts';
import { DEFAULT_CONFIG_FILE_PATH } from '../constants.ts';

export default function run() {
  return new Command()
    .name('checker')
    .description('Check the stuff')
    .version('v0.0.1')
    .option('-c, --config-file <config-file>', 'Path to the config file.', {
      default: DEFAULT_CONFIG_FILE_PATH,
    })
    .action(app)
    .parse();
}
