import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createGetSchemaHandler } from "@bio-mcp/shared/staging/utils";

interface PharosEnv {
	PHAROS_DATA_DO?: unknown;
}

export function registerGetSchema(server: McpServer, env?: PharosEnv) {
	const handler = createGetSchemaHandler("PHAROS_DATA_DO", "pharos");

	server.registerTool(
		"pharos_get_schema",
		{
			title: "Get Staged Pharos Data Schema",
			description:
				"Inspect the schema (tables, columns, types) of previously staged Pharos data. " +
				"Shows table structures and row counts.",
			inputSchema: {
				data_access_id: z
					.string()
					.min(1)
					.describe("Data access ID from a staged response"),
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
