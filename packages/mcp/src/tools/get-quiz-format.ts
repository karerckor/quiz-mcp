import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { QuizDefinitionSchema } from "@quiz-mcp/core";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const outputSchema = z.object({
  schema: z.record(z.unknown()),
});

export const getQuizFormatConfig = {
  title: "Get Quiz Format",
  description:
    "Returns the JSON Schema for a Quiz definition. MUST be called first " +
    "before building a quiz via start_quiz — the schema describes all " +
    "supported question types and their required fields. Note: the runner " +
    "assigns the quiz id, so the definition itself does not include one.",
  inputSchema: z.object({}),
  outputSchema,
  annotations: { readOnlyHint: true, idempotentHint: true },
} as const;

export const getQuizFormatHandler = async (): Promise<CallToolResult> => {
  const schema = zodToJsonSchema(QuizDefinitionSchema) as Record<string, unknown>;
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(schema, null, 2) },
    ],
    structuredContent: { schema },
  };
};

export function registerGetQuizFormat(server: McpServer): void {
  server.registerTool(
    "get_quiz_format",
    getQuizFormatConfig,
    getQuizFormatHandler,
  );
}
