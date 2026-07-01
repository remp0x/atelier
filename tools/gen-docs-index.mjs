// Builds public/docs-search-index.json for the /docs Cmd+K search palette.
//
// Scans src/app/docs/**/page.mdx for metadata + headings + a short excerpt, then
// merges each page against src/app/docs/nav.ts (group + keywords). Nav items with
// no matching .mdx file (e.g. the REST API reference, which is a .tsx page) still
// get an entry sourced entirely from nav.ts, so every nav href resolves to a
// search entry.
//
// nav.ts is TypeScript and this script runs under plain Node (no ts-node), so
// DOCS_NAV_ITEMS is parsed out of the source text with a small bracket-depth
// scanner instead of being imported. Keep nav.ts string values single-quoted
// and free of apostrophes/brackets so the scanner stays reliable.

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(REPO_ROOT, 'src', 'app', 'docs');
const NAV_FILE = path.join(DOCS_DIR, 'nav.ts');
const OUTPUT_FILE = path.join(REPO_ROOT, 'public', 'docs-search-index.json');

/**
 * Parses the DOCS_NAV_ITEMS array out of nav.ts using bracket-depth counting
 * rather than a full TS parse (this script has no TS toolchain available).
 */
export function parseNavItems(navSource) {
  const marker = 'export const DOCS_NAV_ITEMS';
  const markerIndex = navSource.indexOf(marker);
  if (markerIndex === -1) return [];

  // Skip past the `: DocNavItem[]` type annotation to the `= [` assignment,
  // since the annotation's own `[]` would otherwise be mistaken for the
  // start of the array literal.
  const equalsIndex = navSource.indexOf('=', markerIndex);
  if (equalsIndex === -1) return [];

  const arrayStart = navSource.indexOf('[', equalsIndex);
  if (arrayStart === -1) return [];

  let depth = 0;
  let itemStart = -1;
  const blocks = [];

  for (let i = arrayStart; i < navSource.length; i++) {
    const ch = navSource[i];
    if (ch === '[') {
      depth++;
    } else if (ch === ']') {
      depth--;
      if (depth === 0) break;
    } else if (ch === '{' && depth === 1 && itemStart === -1) {
      itemStart = i;
    } else if (ch === '}' && depth === 1 && itemStart !== -1) {
      blocks.push(navSource.slice(itemStart, i + 1));
      itemStart = -1;
    }
  }

  return blocks.map(parseItemBlock);
}

function parseItemBlock(block) {
  const getString = (key) => {
    const match = new RegExp(`${key}:\\s*'([^']*)'`).exec(block);
    return match ? match[1] : undefined;
  };

  const keywordsMatch = /keywords:\s*\[([^\]]*)\]/.exec(block);
  const keywords = keywordsMatch
    ? keywordsMatch[1]
        .split(',')
        .map((s) => s.trim().replace(/^'|'$/g, ''))
        .filter(Boolean)
    : [];

  return {
    title: getString('title'),
    href: getString('href'),
    group: getString('group'),
    subgroup: getString('subgroup'),
    description: getString('description'),
    keywords,
  };
}

function walkMdxFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkMdxFiles(fullPath));
    } else if (entry.isFile() && entry.name === 'page.mdx') {
      results.push(fullPath);
    }
  }
  return results;
}

function hrefFromFilePath(filePath) {
  const relative = path.relative(DOCS_DIR, path.dirname(filePath));
  if (!relative || relative === '.') return '/docs';
  return `/docs/${relative.split(path.sep).join('/')}`;
}

function extractMetadataField(source, field) {
  const metadataMatch = /export const metadata\s*=\s*\{([\s\S]*?)\n\};/.exec(source);
  if (!metadataMatch) return undefined;
  const block = metadataMatch[1];
  const fieldMatch = new RegExp(`${field}:\\s*'([^']*)'`).exec(block);
  return fieldMatch ? fieldMatch[1] : undefined;
}

function extractHeadings(source) {
  const withoutMetadata = source.replace(/export const metadata\s*=\s*\{[\s\S]*?\n\};/, '');
  const headings = [];
  const headingPattern = /^(#{2,3})\s+(.+)$/gm;
  let match;
  while ((match = headingPattern.exec(withoutMetadata)) !== null) {
    headings.push(match[2].trim());
  }
  return headings;
}

function extractExcerpt(source) {
  const withoutMetadata = source.replace(/export const metadata\s*=\s*\{[\s\S]*?\n\};/, '');
  const withoutImports = withoutMetadata.replace(/^import .*$/gm, '');

  const paragraphs = withoutImports
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0 && !block.startsWith('#'));

  const excerpt = paragraphs
    .slice(0, 2)
    .join(' ')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  return excerpt.length > 280 ? `${excerpt.slice(0, 277)}...` : excerpt;
}

function buildGroupLabel(navItem) {
  if (!navItem) return 'Docs';
  return navItem.subgroup ? `${navItem.group} -- ${navItem.subgroup}` : navItem.group;
}

function main() {
  const navSource = readFileSync(NAV_FILE, 'utf8');
  const navItems = parseNavItems(navSource);
  const navByHref = new Map(navItems.map((item) => [item.href, item]));

  const mdxFiles = walkMdxFiles(DOCS_DIR);
  const mdxByHref = new Map();

  for (const filePath of mdxFiles) {
    const href = hrefFromFilePath(filePath);
    const source = readFileSync(filePath, 'utf8');
    mdxByHref.set(href, {
      title: extractMetadataField(source, 'title'),
      description: extractMetadataField(source, 'description'),
      headings: extractHeadings(source),
      excerpt: extractExcerpt(source),
    });
  }

  const seen = new Set();
  const entries = [];

  for (const navItem of navItems) {
    const mdx = mdxByHref.get(navItem.href);
    entries.push({
      title: mdx?.title ?? navItem.title,
      href: navItem.href,
      group: buildGroupLabel(navItem),
      description: mdx?.description ?? navItem.description,
      headings: mdx?.headings ?? [],
      excerpt: mdx?.excerpt ?? '',
      keywords: navItem.keywords,
    });
    seen.add(navItem.href);
  }

  for (const [href, mdx] of mdxByHref) {
    if (seen.has(href)) continue;
    entries.push({
      title: mdx.title ?? href,
      href,
      group: buildGroupLabel(navByHref.get(href)),
      description: mdx.description ?? '',
      headings: mdx.headings,
      excerpt: mdx.excerpt,
      keywords: [],
    });
  }

  writeFileSync(OUTPUT_FILE, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');

  const stat = statSync(OUTPUT_FILE);
  console.log(`Wrote ${entries.length} entries to public/docs-search-index.json (${stat.size} bytes)`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
