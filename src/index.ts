interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * PoetryDB MCP.
 *
 * Keyless database of public-domain English poetry (poetrydb.org). Search by
 * author/title, full-text search within poem lines, fetch random poems, and
 * list available authors. No API key required.
 */


const BASE = 'https://poetrydb.org';
const UA = 'pipeworx/1.0 (+https://pipeworx.io)';

const MAX_LINES = 40;

const tools: McpToolExport['tools'] = [
  {
    name: 'search_poems',
    description:
      'Search public-domain poems on PoetryDB by author and/or title (partial matches allowed). At least one of author or title is required. Returns full poem text (capped). Keyless.',
    inputSchema: {
      type: 'object',
      properties: {
        author: {
          type: 'string',
          description: 'Author name or fragment, e.g. "Dickinson", "Shakespeare". Optional if title given.',
        },
        title: {
          type: 'string',
          description: 'Poem title or fragment, e.g. "Hope", "Sonnet". Optional if author given.',
        },
        limit: {
          type: 'number',
          description: 'Max poems to return (default 10, max 20).',
        },
      },
    },
  },
  {
    name: 'get_poem_lines',
    description:
      'Full-text search within poem lines on PoetryDB — finds any poem containing the given phrase in one of its lines. Returns full poem text (capped). Keyless.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Phrase to find inside any line of a poem, e.g. "Nature", "the road not taken".',
        },
        limit: {
          type: 'number',
          description: 'Max poems to return (default 10, max 20).',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'random_poems',
    description:
      'Fetch one or more random public-domain poems from PoetryDB. Returns full poem text (capped). Keyless.',
    inputSchema: {
      type: 'object',
      properties: {
        count: {
          type: 'number',
          description: 'Number of random poems to return (default 1, max 10).',
        },
      },
    },
  },
  {
    name: 'list_authors',
    description:
      'List all authors available in PoetryDB. Keyless.',
    inputSchema: { type: 'object', properties: {} },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    switch (name) {
      case 'search_poems':
        return searchPoems(args);
      case 'get_poem_lines':
        return getPoemLines(args);
      case 'random_poems':
        return randomPoems(args);
      case 'list_authors':
        return listAuthors();
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

interface RawPoem {
  title?: unknown;
  author?: unknown;
  lines?: unknown;
  linecount?: unknown;
}

function mapPoem(raw: RawPoem, opts: { maxLines: number }) {
  const allLines = Array.isArray(raw.lines) ? (raw.lines as unknown[]).map((l) => String(l)) : [];
  const lines = allLines.slice(0, opts.maxLines);
  const linecount =
    raw.linecount != null && !Number.isNaN(Number(raw.linecount)) ? Number(raw.linecount) : allLines.length;
  return {
    title: raw.title,
    author: raw.author,
    linecount,
    lines,
    ...(allLines.length > opts.maxLines ? { lines_truncated: true } : {}),
  };
}

/**
 * Fetch poems from a PoetryDB path. PoetryDB returns a JSON array of poems on a
 * hit, but an OBJECT `{ status: 404, reason: "Not found" }` on no match. Detect
 * that and return [] so callers yield an empty result instead of erroring.
 */
async function fetchPoems(path: string): Promise<RawPoem[]> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
  });
  if (!res.ok) {
    throw new Error(`PoetryDB: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as unknown;
  if (Array.isArray(data)) return data as RawPoem[];
  if (data && typeof data === 'object' && (data as { status?: unknown }).status === 404) return [];
  // Unexpected non-array, non-404 object — treat as empty rather than crash.
  return [];
}

function clampLimit(value: unknown, def: number, max: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : def;
  if (n < 1) return def;
  return Math.min(n, max);
}

async function searchPoems(args: Record<string, unknown>): Promise<unknown> {
  const author = typeof args.author === 'string' ? args.author.trim() : '';
  const title = typeof args.title === 'string' ? args.title.trim() : '';
  if (!author && !title) return { error: 'provide at least one of author or title' };
  const limit = clampLimit(args.limit, 10, 20);

  let path: string;
  if (author && title) {
    path = `/author,title/${encodeURIComponent(author)};${encodeURIComponent(title)}`;
  } else if (author) {
    path = `/author/${encodeURIComponent(author)}`;
  } else {
    path = `/title/${encodeURIComponent(title)}`;
  }

  const poems = await fetchPoems(path);
  const capped = poems.slice(0, limit).map((p) => mapPoem(p, { maxLines: MAX_LINES }));
  return { count: capped.length, poems: capped };
}

async function getPoemLines(args: Record<string, unknown>): Promise<unknown> {
  const text = typeof args.text === 'string' ? args.text.trim() : '';
  if (!text) return { error: 'provide text to search for within poem lines' };
  const limit = clampLimit(args.limit, 10, 20);

  const poems = await fetchPoems(`/lines/${encodeURIComponent(text)}`);
  const capped = poems.slice(0, limit).map((p) => mapPoem(p, { maxLines: MAX_LINES }));
  return { count: capped.length, poems: capped };
}

async function randomPoems(args: Record<string, unknown>): Promise<unknown> {
  const count = clampLimit(args.count, 1, 10);
  const path = count > 1 ? `/random/${count}` : '/random';

  const poems = await fetchPoems(path);
  const capped = poems.map((p) => mapPoem(p, { maxLines: MAX_LINES }));
  return { count: capped.length, poems: capped };
}

async function listAuthors(): Promise<unknown> {
  const res = await fetch(`${BASE}/author`, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
  });
  if (!res.ok) {
    return { error: `PoetryDB: ${res.status} ${(await res.text()).slice(0, 200)}` };
  }
  const data = (await res.json()) as { authors?: unknown };
  const authors = Array.isArray(data.authors) ? (data.authors as unknown[]).map((a) => String(a)) : [];
  return { count: authors.length, authors };
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
