import { firstPassParse } from '../config/parser.ts';

export default async function app({ configFile }: { configFile: string }) {
  await firstPassParse(configFile);
  console.log('Checker WIP');
}
