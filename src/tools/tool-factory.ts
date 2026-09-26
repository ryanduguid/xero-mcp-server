import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

import { ToolDefinition } from "../types/tool-definition.js";
import { CreateTools } from "./create/index.js";
import { DeleteTools } from "./delete/index.js";
import { GetTools } from "./get/index.js";
import { ListTools } from "./list/index.js";
import { UpdateTools } from "./update/index.js";

// Annotations are hints to the MCP client. They do not stop a call: the client
// still decides what needs approval, and Xero enforces the token's scopes.
const READ: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};
const CREATE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};
const CHANGE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};

const CATEGORIES: [(() => ToolDefinition<ZodRawShapeCompat>)[], ToolAnnotations][] = [
  [DeleteTools, CHANGE],
  [GetTools, READ],
  [CreateTools, CREATE],
  [ListTools, READ],
  [UpdateTools, CHANGE],
];

// Recoding writes nothing when every line already has the requested tax type,
// so repeating the same call has no further effect.
const IDEMPOTENT_CHANGES = new Set(["recode-bank-transaction-tax-type"]);

// Unset or empty keeps every tool. Any other value except true or false,
// blank space included, stops the server, so a mistyped setting cannot
// quietly register the write tools.
function readOnlyMode(env: NodeJS.ProcessEnv): boolean {
  const raw = env.XERO_READ_ONLY;
  if (raw === undefined || raw === "") return false;
  const value = raw.trim().toLowerCase();
  if (value === "false") return false;
  if (value === "true") return true;
  throw new Error("XERO_READ_ONLY must be true or false.");
}

export function ToolFactory(
  server: McpServer,
  env: NodeJS.ProcessEnv = process.env,
) {
  const readOnly = readOnlyMode(env);
  for (const [tools, annotations] of CATEGORIES) {
    if (readOnly && !annotations.readOnlyHint) continue;
    tools
      .map((tool) => tool())
      .forEach((tool) =>
        server.tool(
          tool.name,
          tool.description,
          tool.schema,
          IDEMPOTENT_CHANGES.has(tool.name)
            ? { ...annotations, idempotentHint: true }
            : annotations,
          tool.handler,
        ),
      );
  }
}
