import { newId, type Answer, type Quiz } from "@quiz-mcp/core";
import { QuizNotFoundError, type QuizService, type QuizState } from "./service.js";

type QuizRuntime = { answers: Map<string, Answer>; finished: boolean };

export function createInMemoryQuizService(quizzes: Quiz[] = []): QuizService {
  const quizMap = new Map(quizzes.map((q) => [q.id, q]));
  const runtime = new Map<string, QuizRuntime>(
    quizzes.map((q) => [q.id, { answers: new Map(), finished: false }]),
  );
  const require_ = (quizId: string): QuizRuntime => {
    const r = runtime.get(quizId);
    if (!r) throw new QuizNotFoundError(quizId);
    return r;
  };

  return {
    async registerQuiz(definition) {
      const quiz: Quiz = { ...definition, id: newId() };
      quizMap.set(quiz.id, quiz);
      runtime.set(quiz.id, { answers: new Map(), finished: false });
      return quiz;
    },
    async quizExists(quizId) { return quizMap.has(quizId); },
    async getQuiz(quizId) {
      const q = quizMap.get(quizId);
      if (!q) throw new QuizNotFoundError(quizId);
      return q;
    },
    async saveAnswer(quizId, answer) {
      const r = require_(quizId);
      r.answers.set(answer.questionId, answer);
      r.finished = false;
    },
    async finishQuiz(quizId, answers) {
      const r = require_(quizId);
      r.answers.clear();
      for (const [qid, a] of Object.entries(answers)) r.answers.set(qid, a);
      r.finished = true;
    },
    async getState(quizId): Promise<QuizState> {
      const r = require_(quizId);
      return { finished: r.finished, answers: Object.fromEntries(r.answers) };
    },
  };
}
