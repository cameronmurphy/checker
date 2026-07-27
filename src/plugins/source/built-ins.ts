import { GithubSource } from './github.ts';
import { NpmSource } from './npm.ts';

export default [
  new GithubSource(),
  new NpmSource(),
];
