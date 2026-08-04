# mcp-poetrydb

PoetryDB MCP.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `search_poems` | Search PoetryDB for poems by title or partial title (e.g., "The Road Not Taken"). Returns matching poems with full text, author, and line count. Note: searches titles only, not poem body text. |
| `get_poem_lines` | Full-text search within poem lines on PoetryDB — finds any poem containing the given phrase in one of its lines. Returns full poem text (capped). Keyless. |
| `random_poems` | Fetch one or more random public-domain poems from PoetryDB. Returns full poem text (capped). Keyless. |
| `list_authors` | List all authors available in PoetryDB. Keyless. |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "poetrydb": {
      "url": "https://gateway.pipeworx.io/poetrydb/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Poetrydb data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
