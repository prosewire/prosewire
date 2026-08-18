import { isContractProcedure, type AnyContractRouter } from "@orpc/contract";

export type OperationRiskLevel = "safe" | "mutating" | "destructive";

export interface McpExposure {
  expose: true;
  description?: string;
  riskLevel: OperationRiskLevel;
  name?: string;
}

export interface ProcedureMeta {
  operation?: { riskLevel: OperationRiskLevel };
  mcp?: McpExposure;
}

interface ProcedureDefinitionMeta {
  meta?: ProcedureMeta;
  route?: { method?: string; summary?: string };
}

export function mcpMeta(meta: McpExposure): ProcedureMeta {
  return { operation: { riskLevel: meta.riskLevel }, mcp: meta };
}

export function resolveOperationRisk(def: ProcedureDefinitionMeta): OperationRiskLevel {
  const explicit = def.meta?.operation?.riskLevel ?? def.meta?.mcp?.riskLevel;
  if (explicit) return explicit;
  const method = def.route?.method?.toUpperCase();
  if (method === "GET") return "safe";
  if (method === "DELETE") return "destructive";
  return "mutating";
}

export function resolveContractOperationRisk(
  router: AnyContractRouter,
  path: readonly string[],
): OperationRiskLevel | undefined {
  let node: AnyContractRouter | undefined = router;
  for (const segment of path) {
    if (!node || typeof node !== "object" || isContractProcedure(node)) return undefined;
    node = (node as Record<string, AnyContractRouter>)[segment];
  }
  if (!node || !isContractProcedure(node)) return undefined;
  return resolveOperationRisk((node as { "~orpc": ProcedureDefinitionMeta })["~orpc"]);
}
