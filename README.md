# Zernio_Hackathon

## Table of contents

Documentation for the Zernio Hackathon project is provided in the following files:

- [/docs](/docs)
  - [prd.md](docs/prd.md) -> Contains the product requirements document, outlining the project's goals, features, and specifications.
  - [software_architecture_description.md](docs/software_architecture_description.md) -> Contains the software architecture description, including a flowchart illustrating the system's components and interactions.

## Resources

- Zernio Documentation:
  - MCP Server (for Coding Agents): [https://docs.zernio.com/api/mcp](https://docs.zernio.com/api/mcp)
  - Documentation Index (for Coding Agents): [https://docs.zernio.com/llms.txt](https://docs.zernio.com/llms.txt)
  - Developer Docs (for human developer): [https://docs.zernio.com](https://docs.zernio.com)
- Cloudflare Documentation:
  - MCP Server: [https://docs.mcp.cloudflare.com/mcp](https://docs.mcp.cloudflare.com/mcp)
  - Developer Docs: [https://developers.cloudflare.com](https://developers.cloudflare.com)
- FastAPI Documentation:
  - Developer Docs: [https://fastapi.tiangolo.com](https://fastapi.tiangolo.com)

## Quickstart

To start the full stack, use two terminals:

1. In backend/, run `uv run uvicorn app.main:app --reload`.
2. In the repository root, run `pnpm install` (first time only), then `pnpm dev:frontend`, then open `http://localhost:5173`.
