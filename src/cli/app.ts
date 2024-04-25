import { firstPassParse } from '../config/parser.ts';

export default async function app() {
  await firstPassParse();
  console.log('Checker WIP');
}
