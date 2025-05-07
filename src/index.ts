import { McpAgent } from "agents/mcp"; // Assuming McpAgent is available via this path as per the example.
                                        // This might be a project-local base class or an alias to an SDK import.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Define our Pharos MCP agent
export class PharosMCP extends McpAgent {
	server = new McpServer({
		name: "PharosExplorer",
		version: "0.1.0",
		description: "MCP Server for querying the Pharos GraphQL API. Pharos is an integrated knowledge base for illumination of the Druggable Genome, providing information on targets (proteins), diseases, and ligands (small molecules/drugs)."
	});

	// Pharos API Configuration
	private readonly PHAROS_GRAPHQL_ENDPOINT = 'https://pharos-api.ncats.io/graphql';

	async init() {
		console.error("Pharos MCP Server initialized.");

		// Register the GraphQL execution tool
		this.server.tool(
			"pharos_graphql_query",
			"Executes a GraphQL query against the Pharos API (https://pharos-api.ncats.io/graphql). " +
			"Pharos provides comprehensive information on biological targets (proteins), diseases, and ligands (small molecules/drugs). " +
			"Query for specific entities and their relationships. " +
			"For example, to find information about a target by UniProt ID: " +
			"'{ target(q: { uniprot: \"P05067\" }) { name tdl description pathways { name type } } }'. " +
			"To find information about a disease: " +
			"'{ disease(name: \"Alzheimer Disease\") { name description targets(top: 3) { name preferredSymbol tdl } } }'. " +
			"To find information about a ligand (e.g., by ChEMBL ID, which can be used as ligid): " +
			"'{ ligand(ligid: \"CHEMBL12\") { name smiles isdrug activities(all: true, top: 2) { type value target { name } } } }'. " +
			"Use GraphQL introspection for schema discovery: '{ __schema { queryType { name } types { name kind description fields { name args { name type { name ofType { name } } } } } } }'. " +
			"Refer to the Pharos GraphQL API documentation (schema provided) for more examples and details. If a query fails, check the syntax and retry with introspection.",
			{
				query: z.string().describe(
					"The GraphQL query string to execute against the Pharos GraphQL API. " +
					"Example: '{ target(q: { uniprot: \"P05067\" }) { name tdl } }'. " +
					"Use introspection queries like '{ __schema { queryType { name } types { name kind } } }' to discover the schema. "
				),
				variables: z.record(z.any()).optional().describe(
					"Optional dictionary of variables for the GraphQL query. Example: { \"uniprotId\": \"P05067\" }"
				),
			},
			async ({ query, variables }: { query: string; variables?: Record<string, any> }) => {
				console.error(`Executing pharos_graphql_query with query: ${query.slice(0, 200)}...`);
				if (variables) {
					console.error(`With variables: ${JSON.stringify(variables).slice(0,150)}...`);
				}
				
				const result = await this.executePharosGraphQLQuery(query, variables);
				
				return { 
					content: [{ 
						type: "text", 
						// Pretty print JSON for easier reading by humans, and parsable by LLMs.
						text: JSON.stringify(result, null, 2) 
					}]
				};
			}
		);
	}

	// Helper function to execute Pharos GraphQL queries
	private async executePharosGraphQLQuery(query: string, variables?: Record<string, any>): Promise<any> {
		try {
			const headers: Record<string, string> = {
				"Content-Type": "application/json",
				"User-Agent": "MCPPharosServer/1.0.0 (ModelContextProtocol; +https://modelcontextprotocol.io)"
			};
			
			const bodyData: Record<string, any> = { query };
			if (variables) {
				bodyData.variables = variables;
			}
			
			console.error(`Making GraphQL request to: ${this.PHAROS_GRAPHQL_ENDPOINT}`);
			// console.error(`Request body: ${JSON.stringify(bodyData)}`); // Potentially too verbose for production logs

			const response = await fetch(this.PHAROS_GRAPHQL_ENDPOINT, {
				method: 'POST',
				headers,
				body: JSON.stringify(bodyData),
			});
			
			console.error(`Pharos API response status: ${response.status}`);
			
			let responseBody;
			try {
				responseBody = await response.json();
			} catch (e) {
				// If JSON parsing fails, try to get text for error reporting
				const errorText = await response.text();
				console.error(`Pharos API response is not JSON. Status: ${response.status}, Body: ${errorText.slice(0,500)}`);
				return {
					errors: [{
						message: `Pharos API Error ${response.status}: Non-JSON response.`,
						extensions: {
							statusCode: response.status,
							responseText: errorText.slice(0, 1000) // Truncate long non-JSON responses
						}
					}]
				};
			}

			if (!response.ok) {
				console.error(`Pharos API HTTP Error ${response.status}: ${JSON.stringify(responseBody)}`);
				// Structure this similar to a GraphQL error response
				return {
					errors: [{ 
						message: `Pharos API HTTP Error ${response.status}`,
						extensions: {
							statusCode: response.status,
							responseBody: responseBody 
						}
					}]
				};
			}
			
			// If response.ok, responseBody contains the GraphQL result (which might include a `data` and/or `errors` field)
			return responseBody;

		} catch (error) {
			// This catch block handles network errors or other issues with the fetch call itself
			console.error(`Client-side error during Pharos GraphQL request: ${error instanceof Error ? error.message : String(error)}`);
			let errorMessage = "An unexpected client-side error occurred while attempting to query the Pharos GraphQL API.";
			if (error instanceof Error) {
					errorMessage = error.message;
			} else {
					errorMessage = String(error);
			}
			return { 
				errors: [{ 
					message: errorMessage,
                    extensions: {
                        clientError: true // Custom extension to indicate client-side nature of the error
                    }
				}]
			};
		}
	}}

// Define the Env interface for environment variables, if any.
// For this server, no specific environment variables are strictly needed for Pharos API access.
interface Env {
	MCP_HOST?: string;
	MCP_PORT?: string;
}

// Dummy ExecutionContext for type compatibility, usually provided by the runtime environment.
interface ExecutionContext {
	waitUntil(promise: Promise<any>): void;
	passThroughOnException(): void;
}

// Export the fetch handler, standard for environments like Cloudflare Workers or Deno Deploy.
export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// SSE transport is primary as requested
		if (url.pathname === "/sse" || url.pathname.startsWith("/sse/")) {
			// @ts-ignore - This is used in the example, presumably to handle potential slight
            // mismatches between the generic `fetch` signature expected by some runtimes
            // and the specific signature of the `fetch` method returned by `serveSSE`.
			return PharosMCP.serveSSE("/sse").fetch(request, env, ctx);
		}
		
		// Fallback for unhandled paths
		console.error(`Pharos MCP Server. Requested path ${url.pathname} not found. Listening for SSE on /sse.`);
		
		return new Response(
			`Pharos MCP Server - Path not found.\nAvailable MCP paths:\n- /sse (for Server-Sent Events transport)`, 
			{ 
				status: 404,
				headers: { "Content-Type": "text/plain" }
			}
		);
	},
};

// Export the Durable Object class (or main class for other environments)
// This follows the pattern in the DataCite example (e.g., for Cloudflare Workers Durable Objects).
export { PharosMCP as MyMCP };