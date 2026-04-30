import { newId, type Answer, type Quiz, type QuizDefinition } from "@quiz-mcp/core";
import {
	QuizNotFoundError,
	type QuizService as QuizServiceContract,
	type QuizState,
} from "@quiz-mcp/runner-api";

const DEFAULT_TTL_SECONDS = 60 * 60;

type StoredRecord = {
	quiz: Quiz;
	answers: Record<string, Answer>;
	finished: boolean;
	expiresAt: number;
};

export class QuizService implements QuizServiceContract {
	private readonly kv: KVNamespace;
	private readonly userId: string;
	private readonly ttlSeconds: number;

	constructor(kv: KVNamespace, userId: string, ttlSeconds?: number | string) {
		this.kv = kv;
		this.userId = userId;
		this.ttlSeconds = parseTtl(ttlSeconds) ?? DEFAULT_TTL_SECONDS;
	}

	async registerQuiz(definition: QuizDefinition): Promise<Quiz> {
		const quiz: Quiz = { ...definition, id: newId() };
		const expiresAt = nowSeconds() + this.ttlSeconds;
		const record: StoredRecord = {
			quiz,
			answers: {},
			finished: false,
			expiresAt,
		};
		await this.kv.put(this.key(quiz.id), JSON.stringify(record), {
			expirationTtl: this.ttlSeconds,
		});
		return quiz;
	}

	async quizExists(quizId: string): Promise<boolean> {
		const raw = await this.kv.get(this.key(quizId));
		return raw !== null;
	}

	async getQuiz(quizId: string): Promise<Quiz> {
		const record = await this.read(quizId);
		return record.quiz;
	}

	async saveAnswer(quizId: string, answer: Answer): Promise<void> {
		const record = await this.read(quizId);
		record.answers[answer.questionId] = answer;
		record.finished = false;
		await this.write(record);
	}

	async finishQuiz(quizId: string, answers: Record<string, Answer>): Promise<void> {
		const record = await this.read(quizId);
		record.answers = { ...answers };
		record.finished = true;
		await this.write(record);
	}

	async getState(quizId: string): Promise<QuizState> {
		const record = await this.read(quizId);
		return { finished: record.finished, answers: record.answers };
	}

	async deleteQuiz(quizId: string): Promise<void> {
		await this.kv.delete(this.key(quizId));
	}

	async listQuizzes(): Promise<Array<{ id: string; title: string; finished: boolean }>> {
		const prefix = `quiz:${this.userId}:`;
		const { keys } = await this.kv.list({ prefix });
		const records = await Promise.all(
			keys.map((k) => this.kv.get<StoredRecord>(k.name, "json")),
		);
		const summaries: Array<{ id: string; title: string; finished: boolean }> = [];
		for (const record of records) {
			if (!record) continue;
			summaries.push({
				id: record.quiz.id,
				title: record.quiz.title,
				finished: record.finished,
			});
		}
		return summaries;
	}

	private key(quizId: string): string {
		return `quiz:${this.userId}:${quizId}`;
	}

	private async read(quizId: string): Promise<StoredRecord> {
		const record = await this.kv.get<StoredRecord>(this.key(quizId), "json");
		if (!record) throw new QuizNotFoundError(quizId);
		return record;
	}

	private async write(record: StoredRecord): Promise<void> {
		await this.kv.put(this.key(record.quiz.id), JSON.stringify(record), {
			expiration: record.expiresAt,
		});
	}
}

function parseTtl(value: number | string | undefined): number | undefined {
	if (value === undefined || value === null || value === "") return undefined;
	const n = typeof value === "number" ? value : Number(value);
	return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

function nowSeconds(): number {
	return Math.floor(Date.now() / 1000);
}
