import type { Answer, Quiz, QuizDefinition } from "@quiz-mcp/core";
import type { QuizService, QuizState } from "@quiz-mcp/runner-api";
import type { RunnerHost } from "./runner-host.js";

export class HostedService implements QuizService {
  constructor(
    private readonly inner: QuizService,
    private readonly host: RunnerHost,
  ) {}

  async registerQuiz(definition: QuizDefinition): Promise<Quiz> {
    await this.host.ensureStarted();
    const quiz = await this.inner.registerQuiz(definition);
    this.host.trackActive(quiz.id);
    return quiz;
  }

  async quizExists(quizId: string): Promise<boolean> {
    return this.inner.quizExists(quizId);
  }

  async getQuiz(quizId: string): Promise<Quiz> {
    return this.inner.getQuiz(quizId);
  }

  async saveAnswer(quizId: string, answer: Answer): Promise<void> {
    return this.inner.saveAnswer(quizId, answer);
  }

  async finishQuiz(
    quizId: string,
    answers: Record<string, Answer>,
  ): Promise<void> {
    return this.inner.finishQuiz(quizId, answers);
  }

  async getState(quizId: string): Promise<QuizState> {
    const state = await this.inner.getState(quizId);
    if (state.finished) {
      this.host.markRead(quizId);
      if (this.host.shouldAutoStop()) {
        void this.host.stop();
      }
    }
    return state;
  }
}
