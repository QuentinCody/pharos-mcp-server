import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
	shouldStage,
	stageToDoAndRespond,
} from "@bio-mcp/shared/staging/utils";
import { registerQueryData } from "./tools/query-data";
import { registerGetSchema } from "./tools/get-schema";
import { PharosDataDO } from "./do";

// Export Durable Object classes
export { PharosDataDO };

interface PharosMcpEnv {
	PHAROS_DATA_DO?: {
		idFromName(name: string): unknown;
		get(id: unknown): { fetch(req: Request): Promise<Response> };
	};
}

// Pharos API Configuration
const PHAROS_GRAPHQL_ENDPOINT = "https://pharos-api.ncats.io/graphql";

// Helper function to execute Pharos GraphQL queries
async function executePharosGraphQLQuery(
	query: string,
	variables?: Record<string, unknown>,
): Promise<unknown> {
	try {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			"User-Agent":
				"MCPPharosServer/1.0.0 (ModelContextProtocol; +https://modelcontextprotocol.io)",
		};

		const bodyData: Record<string, unknown> = { query };
		if (variables) {
			bodyData.variables = variables;
		}

		console.error(`Making GraphQL request to: ${PHAROS_GRAPHQL_ENDPOINT}`);

		const response = await fetch(PHAROS_GRAPHQL_ENDPOINT, {
			method: "POST",
			headers,
			body: JSON.stringify(bodyData),
		});

		console.error(`Pharos API response status: ${response.status}`);

		let responseBody: unknown;
		try {
			responseBody = await response.json();
		} catch (_e) {
			const errorText = await response.text();
			console.error(
				`Pharos API response is not JSON. Status: ${response.status}, Body: ${errorText.slice(0, 500)}`,
			);
			return {
				errors: [
					{
						message: `Pharos API Error ${response.status}: Non-JSON response.`,
						extensions: {
							statusCode: response.status,
							responseText: errorText.slice(0, 1000),
						},
					},
				],
			};
		}

		if (!response.ok) {
			console.error(
				`Pharos API HTTP Error ${response.status}: ${JSON.stringify(responseBody)}`,
			);
			return {
				errors: [
					{
						message: `Pharos API HTTP Error ${response.status}`,
						extensions: {
							statusCode: response.status,
							responseBody: responseBody,
						},
					},
				],
			};
		}

		return responseBody;
	} catch (error) {
		console.error(
			`Client-side error during Pharos GraphQL request: ${error instanceof Error ? error.message : String(error)}`,
		);
		const errorMessage =
			error instanceof Error ? error.message : String(error);
		return {
			errors: [
				{
					message: errorMessage,
					extensions: {
						clientError: true,
					},
				},
			],
		};
	}
}

export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "PharosExplorer",
		version: "0.2.0",
		description:
			"MCP Server for querying the Pharos GraphQL API. Pharos is an integrated knowledge base for illumination of the Druggable Genome, providing information on targets (proteins), diseases, and ligands (small molecules/drugs).",
	});

	async init() {
		console.error("Pharos MCP Server initialized.");

		const env = this.env as unknown as PharosMcpEnv;

		// Register the GraphQL execution tool
		this.server.tool(
			"pharos_graphql_query",
			"Executes a GraphQL query against the Pharos API (https://pharos-api.ncats.io/graphql). " +
				"Pharos provides information on biological targets (proteins), diseases, and ligands. " +
				"Target lookup: { target(q: { sym: \"EGFR\" }) { name tdl fam description } } or by UniProt: { target(q: { uniprot: \"P05067\" }) { ... } }. " +
				"Target count fields (scalars): publicationCount, generifCount, mimCount, tinxCount. " +
				"Target count fields (lists of {name,value}): ppiCounts, diseaseCounts, ligandCounts, pathwayCounts, expressionCounts. " +
				"NOTE: jensenScore, antibodyCount, ppiCount (singular) do NOT exist — use the fields above. " +
				"Disease: { disease(name: \"Alzheimer Disease\") { name description targets(top: 3) { name preferredSymbol tdl } } }. " +
				"Ligand: { ligand(ligid: \"CHEMBL12\") { name smiles isdrug activities(all: true, top: 2) { type value target { name } } } }. " +
				"Use introspection { __type(name: \"Target\") { fields { name type { name } } } } to discover additional fields. " +
				"Large responses are auto-staged — use pharos_query_data with the returned data_access_id to explore staged data via SQL.",
			{
				query: z
					.string()
					.describe(
						"The GraphQL query string to execute against the Pharos GraphQL API. " +
							"Example: '{ target(q: { uniprot: \"P05067\" }) { name tdl } }'. " +
							"Use introspection queries like '{ __schema { queryType { name } types { name kind } } }' to discover the schema.",
					),
				variables: z
					.record(z.any())
					.optional()
					.describe(
						'Optional dictionary of variables for the GraphQL query. Example: { "uniprotId": "P05067" }',
					),
			},
			async ({
				query,
				variables,
			}: { query: string; variables?: Record<string, unknown> }) => {
				console.error(
					`Executing pharos_graphql_query with query: ${query.slice(0, 200)}...`,
				);
				if (variables) {
					console.error(
						`With variables: ${JSON.stringify(variables).slice(0, 150)}...`,
					);
				}

				const result = await executePharosGraphQLQuery(query, variables);

				// Check if the response should be auto-staged
				const responseStr = JSON.stringify(result);
				const responseBytes = responseStr.length;

				if (shouldStage(responseBytes) && env.PHAROS_DATA_DO) {
					try {
						const staged = await stageToDoAndRespond(
							result,
							env.PHAROS_DATA_DO as any,
							"pharos",
							undefined,
							undefined,
							"pharos",
						);

						return {
							content: [
								{
									type: "text" as const,
									text: `Response auto-staged (${(responseBytes / 1024).toFixed(1)}KB). Use pharos_query_data with data_access_id="${staged.dataAccessId}" to explore the data via SQL.`,
								},
							],
							structuredContent: {
								staged: true,
								data_access_id: staged.dataAccessId,
								schema: staged.schema,
								tables_created: staged.tablesCreated,
								total_rows: staged.totalRows,
								_staging: staged._staging,
							},
						};
					} catch (_e) {
						// Fall through to inline response if staging fails
						console.error(
							`Auto-staging failed, returning inline: ${_e instanceof Error ? _e.message : String(_e)}`,
						);
					}
				}

				return {
					content: [
						{
							type: "text" as const,
							text: JSON.stringify(result),
						},
					],
					structuredContent: {
						success: true,
						data: result,
						_meta: {
							fetched_at: new Date().toISOString(),
							response_bytes: responseBytes,
						},
					},
				};
			},
		);

		// Register staging tools
		registerQueryData(this.server, env as any);
		registerGetSchema(this.server, env as any);
	}
}

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		const url = new URL(request.url);

		// Health check
		if (url.pathname === "/health") {
			return new Response("ok", {
				status: 200,
				headers: { "content-type": "text/plain" },
			});
		}

		// Streamable HTTP transport (MCP 2025-11-25 spec)
		if (url.pathname.startsWith("/mcp")) {
			return MyMCP.serve("/mcp", { binding: "MCP_OBJECT" }).fetch(
				request,
				env,
				ctx,
			);
		}

		// SSE transport (legacy, kept for backward compatibility)
		if (url.pathname === "/sse" || url.pathname.startsWith("/sse/")) {
			// @ts-ignore
			return MyMCP.serveSSE("/sse", { binding: "MCP_OBJECT" }).fetch(
				request,
				env,
				ctx,
			);
		}

		// Fallback for unhandled paths
		return new Response(
			`Pharos MCP Server - Path not found.\nAvailable MCP paths:\n- /mcp (Streamable HTTP)\n- /sse (Server-Sent Events)`,
			{
				status: 404,
				headers: { "Content-Type": "text/plain" },
			},
		);
	},
};
