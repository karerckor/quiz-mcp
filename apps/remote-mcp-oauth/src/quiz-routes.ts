import type { Answer } from "@quiz-mcp/core";
import { QuizNotFoundError } from "@quiz-mcp/runner-api";
import { Hono } from "hono";
import { QuizService } from "./quiz-service";
import { renderQuizDone, renderQuizShell } from "./quiz-shell";

const isAnswerLike = (x: unknown): x is Answer =>
	!!x &&
	typeof x === "object" &&
	typeof (x as { questionId?: unknown }).questionId === "string";

const serviceFor = (c: { env: Env }, userId: string): QuizService =>
	new QuizService(c.env.QUIZ_KV, userId, c.env.QUIZ_TTL_SECONDS);

export const quizRoutes = new Hono<{ Bindings: Env }>()
	.onError((err, c) => {
		if (err instanceof QuizNotFoundError) return c.notFound();
		throw err;
	})
	.get("/:userId/quizzes", async (c) => {
		const summaries = await serviceFor(c, c.req.param("userId")).listQuizzes();
		return c.json(summaries, 200, { "Cache-Control": "no-store" });
	})
	.get("/:userId/:quizId", async (c) => {
		const { userId, quizId } = c.req.param();
		const service = serviceFor(c, userId);
		if (!(await service.quizExists(quizId))) return c.notFound();
		const quiz = await service.getQuiz(quizId);
		const state = await service.getState(quizId);
		if (state.finished) return c.html(renderQuizDone(quiz), 410);
		return c.html(renderQuizShell(quiz, quizId));
	})
	.get("/:userId/:quizId/quiz.json", async (c) => {
		const { userId, quizId } = c.req.param();
		const quiz = await serviceFor(c, userId).getQuiz(quizId);
		return c.json(quiz);
	})
	.get("/:userId/:quizId/answer", async (c) => {
		const { userId, quizId } = c.req.param();
		const state = await serviceFor(c, userId).getState(quizId);
		return c.json(state, 200, { "Cache-Control": "no-store" });
	})
	.post("/:userId/:quizId/answer", async (c) => {
		const { userId, quizId } = c.req.param();
		let payload: unknown;
		try {
			payload = await c.req.json();
		} catch {
			return c.json({ error: "Invalid JSON" }, 400);
		}
		if (!isAnswerLike(payload)) {
			return c.json({ error: "answer.questionId required" }, 400);
		}
		await serviceFor(c, userId).saveAnswer(quizId, payload);
		return c.body(null, 204);
	})
	.post("/:userId/:quizId/finish", async (c) => {
		const { userId, quizId } = c.req.param();
		let payload: unknown;
		try {
			payload = await c.req.json();
		} catch {
			return c.json({ error: "Invalid JSON" }, 400);
		}
		const answers = (payload as { answers?: unknown })?.answers;
		if (!answers || typeof answers !== "object") {
			return c.json({ error: "answers record required" }, 400);
		}
		const cleaned: Record<string, Answer> = {};
		for (const [qid, a] of Object.entries(answers as Record<string, unknown>)) {
			if (isAnswerLike(a)) cleaned[qid] = a;
		}
		await serviceFor(c, userId).finishQuiz(quizId, cleaned);
		return c.body(null, 204);
	});
