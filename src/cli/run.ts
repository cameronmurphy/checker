import { Command } from '../../deps.ts';
import app from './app.ts';

export default function run() {
  return new Command()
    .name('checker')
    .description('Check the stuff')
    .version('v0.0.1')
    .action(app)
    .parse();
}
