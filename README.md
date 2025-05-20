# Accessing Pharos Data with Your AI Assistant

## License and Citation

This project is available under the MIT License with an Academic Citation Requirement. This means you can freely use, modify, and distribute the code, but any academic or scientific publication that uses this software must provide appropriate attribution.

### For academic/research use:
If you use this software in a research project that leads to a publication, presentation, or report, you **must** cite this work according to the format provided in [CITATION.md](CITATION.md).

### For commercial/non-academic use:
Commercial and non-academic use follows the standard MIT License terms without the citation requirement.

By using this software, you agree to these terms. See [LICENSE.md](LICENSE.md) for the complete license text.This guide explains how to connect your AI assistant (like Claude) to the Pharos database, a rich resource for information on proteins (targets), diseases, and chemical compounds (ligands). This connection lets your AI directly query Pharos to answer your research questions.

## What is Pharos?

Pharos is a comprehensive knowledge base developed by the National Institutes of Health (NIH). It's designed to help researchers explore and understand the "druggable genome" – the parts of our genetic makeup that could potentially be targeted by medicines. You can find information like:
*   Details about specific proteins (e.g., their function, associated diseases).
*   Information on diseases and which proteins are linked to them.
*   Data on chemical compounds, including whether they are approved drugs and their known biological activities.

## What is this "MCP Server"?

Think of this MCP (Model Context Protocol) Server as a special translator. Your AI assistant speaks a general language, and Pharos has its own specific way of understanding requests (called GraphQL). This server sits in between, translating your AI's requests into a format Pharos understands, fetching the data, and then giving it back to your AI in a useful way.

This particular server is set up to run on Cloudflare Workers, a platform that lets it be accessible online.

## How to Use This with Your AI Assistant (e.g., Claude Desktop)

If you have an AI assistant that supports the Model Context Protocol (like Claude Desktop), you can configure it to use this Pharos MCP Server. This will give your AI a new "tool" or "skill" – the ability to look up information in Pharos.

**Connecting to the Pharos MCP Server:**

The person who set up this server will provide you with a specific URL. It will likely look something like this: `https://pharos-mcp-server.your-account-name.workers.dev/sse`

1.  **If you're using Claude Desktop:**
    *   Go to `Settings > Developer > Edit Config`.
    *   You'll see a JSON configuration file. You need to add an entry for the Pharos server. It will look like this (your AI assistant's administrator or a technical colleague can help you with the exact placement if you're unsure):

        ```json
        {
          "mcpServers": {
            // ... any other servers you might have ...

            "pharos": {
              "command": "npx",
              "args": [
                "mcp-remote",
                "YOUR_PHAROS_MCP_SERVER_URL_HERE" // <-- Replace this with the actual URL
              ]
            }

            // ...
          }
        }
        ```
    *   **Important:** Replace `"YOUR_PHAROS_MCP_SERVER_URL_HERE"` with the actual URL provided to you (e.g., `https://pharos-mcp-server.your-name.workers.dev/sse`).
    *   Save the configuration file.
    *   Restart Claude Desktop.

2.  **Using the Pharos Tool in Chat:**
    *   Once connected, you can ask your AI assistant questions that require information from Pharos. For example:
        *   "Pharos, tell me about the protein with UniProt ID P05067."
        *   "Using Pharos, what are the known targets for Alzheimer's Disease?"
        *   "Can you use Pharos to find information on the ligand CHEMBL12?"
    *   Your AI assistant will use the Pharos MCP server to fetch this information and present it to you.

## For Developers/Administrators:

This MCP server is built using TypeScript and is designed for deployment on Cloudflare Workers.

*   **Deployment:** The original `README.md` (before this version) contained instructions on deploying to Cloudflare Workers using `npm create cloudflare@latest`. The server listens for Server-Sent Events (SSE) on the `/sse` path.
*   **Tool Definition:** The core logic for the Pharos tool is in `src/index.ts`. It defines a tool named `pharos_graphql_query` which accepts a GraphQL query and optional variables, executes it against the Pharos API endpoint (`https://pharos-api.ncats.io/graphql`), and returns the results.
*   **Customization:** If you need to modify the GraphQL queries or the server behavior, you would edit `src/index.ts`.

## Key Pharos API Information:

*   **GraphQL Endpoint:** `https://pharos-api.ncats.io/graphql`
*   **Capabilities:** The server allows your AI to:
    *   Query for targets (proteins) using identifiers like UniProt ID.
    *   Query for diseases by name.
    *   Query for ligands (compounds/drugs) by identifiers like ChEMBL ID.
    *   Perform GraphQL introspection to understand the Pharos API schema (i.e., what data is available and how to ask for it).
*   **Example Queries (as understood by the server, which your AI will formulate):**
    *   Target: `{ target(q: { uniprot: "P05067" }) { name tdl description pathways { name type } } }`
    *   Disease: `{ disease(name: "Alzheimer Disease") { name description targets(top: 3) { name preferredSymbol tdl } } }`
    *   Ligand: `{ ligand(ligid: "CHEMBL12") { name smiles isdrug activities(all: true, top: 2) { type value target { name } } } }`

By using this server, scientists and researchers can more easily leverage the power of the Pharos database directly through their AI assistants, streamlining data access and discovery.
