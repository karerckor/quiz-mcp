import type { Answer, Quiz, QuizDefinition } from "@quiz-mcp/core";

export class QuizNotFoundError extends Error {
  readonly quizId: string;
  constructor(quizId: string) {
    super(`Quiz not found: ${quizId}`);
    this.name = "QuizNotFoundError";
    this.quizId = quizId;
  }
}

export type QuizState = {
  finished: boolean;
  answers: Record<string, Answer>;
};

export interface QuizService {
  /**
   * Registers a new quiz from a definition (no id). The service assigns a
   * fresh id and returns the persisted quiz.
   */
  registerQuiz(definition: QuizDefinition): Promise<Quiz>;
  quizExists(quizId: string): Promise<boolean>;
  getQuiz(quizId: string): Promise<Quiz>;
  saveAnswer(quizId: string, answer: Answer): Promise<void>;
  finishQuiz(quizId: string, answers: Record<string, Answer>): Promise<void>;
  getState(quizId: string): Promise<QuizState>;
}
