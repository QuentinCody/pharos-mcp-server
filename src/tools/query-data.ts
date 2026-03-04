import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createQueryDataHandler } from "@bio-mcp/shared/staging/utils";

interface PharosEnv {
	PHAROS_DATA_DO?: unknown;
}

export function registerQueryData(server: McpServer, env?: PharosEnv) {
	const handler = createQueryDataHandler("PHAROS_DATA_DO", "pharos");

	server.registerTool(
		"pharos_query_data",
		{
			title: "Query Staged Pharos Data",
			description:
				"Run SQL queries against previously staged Pharos data. Requires a data_access_id " +
				"from a prior pharos_graphql_query that was auto-staged.",
			inputSchema: {
				data_access_id: z
					.string()
					.min(1)
					.describe("Data access ID from a staged response"),
				sql: z
					.string()
					.min(1)
					.describe("SQL SELECT query to run against the staged data"),
				limit: z
					.number()
					.int()
					.positive()
					.max(10000)
					.default(100)
					.optional()
					.describe("Maximum number of rows to return (default 100)"),
			},
		},
		async (args, extra) => {
			const runtimeEnv =
				env || (extra as { env?: PharosEnv })?.env || {};
			return handler(
				args as Record<string, unknown>,
				runtimeEnv as Record<string, unknown>,
			);
		},
	);
}
