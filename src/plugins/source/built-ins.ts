import { DockerSource } from './docker.ts';
import { DownloadsSource } from './downloads.ts';
import { GithubSource } from './github.ts';
import { JsonSource } from './json.ts';
import { NodejsSource } from './nodejs.ts';
import { NpmSource } from './npm.ts';
import { PageSource } from './page.ts';
import { TextSource } from './text.ts';
import { UbuntuSource } from './ubuntu.ts';

export default [
  DockerSource,
  DownloadsSource,
  GithubSource,
  JsonSource,
  NodejsSource,
  NpmSource,
  PageSource,
  TextSource,
  UbuntuSource,
];
