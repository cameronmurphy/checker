/**
 * Parsers bundled for plugin authors.
 *
 * A compiled binary cannot fetch modules at runtime, so a plugin can only import what was built
 * in. These re-exports are that set, reachable as `checker/parse`.
 *
 * @module
 */

/** Parses HTML into a queryable document, for scraping pages that render server-side. */
export { DOMParser, type Element, type HTMLDocument } from '@b-fuze/deno-dom';
/** Parses XML — including RSS and Atom feeds — into a plain object tree. */
export { parse as parseXml } from '@libs/xml';
/** Parses CSV text into rows. */
export { parse as parseCsv } from '@std/csv';
/** Parses JSON with comments. */
export { parse as parseJsonc } from '@std/jsonc';
/** Parses TOML text into an object. */
export { parse as parseToml } from '@std/toml';
/** Parses YAML text into an object. */
export { parse as parseYaml } from '@std/yaml';
/** Decodes HTML entities in a string. */
export { unescape as unescapeHtml } from '@std/html';
