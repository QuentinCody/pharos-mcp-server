/**
 * PharosDataDO — Durable Object for staging large Pharos GraphQL responses.
 *
 * Extends RestStagingDO with Pharos-specific schema hints for targets,
 * diseases, and ligands.
 */

import { RestStagingDO } from "@bio-mcp/shared/staging/rest-staging-do";
import type { SchemaHints } from "@bio-mcp/shared/staging/schema-inference";

export class PharosDataDO extends RestStagingDO {
	protected getSchemaHints(data: unknown): SchemaHints | undefined {
		if (!data || typeof data !== "object") return undefined;
		const obj = data as Record<string, unknown>;

		// Pharos GraphQL responses are wrapped in { data: { ... } }
		if (obj.data && typeof obj.data === "object") {
			const d = obj.data as Record<string, unknown>;

			// Target responses: { data: { targets: {...} } } or { data: { target: {...} } }
			if (d.targets || d.target) {
				return { tableName: "targets", indexes: ["name", "tdl", "fam"] };
			}

			// Disease responses: { data: { diseases: {...} } } or { data: { disease: {...} } }
			if (d.diseases || d.disease) {
				return { tableName: "diseases", indexes: ["name"] };
			}

			// Ligand responses: { data: { ligands: {...} } } or { data: { ligand: {...} } }
			if (d.ligands || d.ligand) {
				return { tableName: "ligands", indexes: ["name", "isdrug"] };
			}
		}

		return undefined;
	}
}
