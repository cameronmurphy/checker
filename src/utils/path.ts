export function expand(path: string): string {
  return path.replace(/^~\//, `${Deno.env.get('HOME')}/`);
}
