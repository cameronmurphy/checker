import { DockerSource } from './docker.ts';
import { GithubSource } from './github.ts';
import { NpmSource } from './npm.ts';

export default [
  new DockerSource(),
  new GithubSource(),
  new NpmSource(),
];
