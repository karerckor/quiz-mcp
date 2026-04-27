import OAuthProvider from "@cloudflare/workers-oauth-provider";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createQuizMcpServer } from "@quiz-mcp/mcp";
import { McpAgent } from "agents/mcp";
import { z } from "zod";
import { AuthkitHandler } from "./authkit-handler";
import type { Props } from "./props";
import { QuizService } from "./quiz-service";

const noopOpenBrowser = async (): Promise<void> => {};

export class QuizMCP extends McpAgent<Env, unknown, Props> {
	server!: McpServer;

	async init() {
		const service = new QuizService(
			this.env.QUIZ_KV,
			this.props!.user.id,
			this.env.QUIZ_TTL_SECONDS,
		);
		const userId = this.props!.user.id;
		const baseUrl = this.env.QUIZ_RUNNER_URL.replace(/\/+$/, "");
		this.server = createQuizMcpServer(service, () => `${baseUrl}/${userId}`, {
			openBrowser: noopOpenBrowser,
		});

		this.server.registerTool(
			"cleanup_quiz",
			{
				title: "Cleanup Quiz",
				description:
					"Removes a quiz record from server storage. Call this after " +
					"get_answers to free the slot — subsequent reads of that quizId " +
					"will return 'quiz not found'. Idempotent: deleting a missing " +
					"quiz is a no-op.",
				inputSchema: z.object({ quizId: z.string() }),
				annotations: { destructiveHint: true, idempotentHint: true },
			},
			async ({ quizId }) => {
				await service.deleteQuiz(quizId);
				return {
					content: [{ type: "text", text: `Quiz ${quizId} removed.` }],
				};
			},
		);

		this.server.registerTool(
			"get_quizzes",
			{
				title: "Get Quizzes",
				description:
					"Returns the list of quizzes registered for the authenticated user, " +
					"with id, title and whether the quiz has been finished.",
				inputSchema: z.object({}),
				outputSchema: z.object({
					quizzes: z.array(
						z.object({
							id: z.string(),
							title: z.string(),
							finished: z.boolean(),
						}),
					),
				}),
				annotations: { readOnlyHint: true },
			},
			async () => {
				const quizzes = await service.listQuizzes();
				return {
					content: [{ type: "text", text: JSON.stringify(quizzes, null, 2) }],
					structuredContent: { quizzes },
				};
			},
		);
	}
}

export default new OAuthProvider({
	apiRoute: "/mcp",
	apiHandler: QuizMCP.serve("/mcp", { binding: "MCP_QUIZ_OBJECT" }) as any,
	defaultHandler: AuthkitHandler as any, // Use 'any' for maximum flexibility
	authorizeEndpoint: "/authorize",
	tokenEndpoint: "/token",
	clientRegistrationEndpoint: "/register",
});
