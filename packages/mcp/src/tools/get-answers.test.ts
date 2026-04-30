import { describe, expect, it } from "vitest";
import type { Answer, Quiz } from "@quiz-mcp/core";
import { QuizNotFoundError, type QuizService, type QuizState } from "@quiz-mcp/runner-api";
import { makeGetAnswersHandler } from "./get-answers.js";

const EMPTY_QUIZ: Quiz = {
  id: "q1",
  title: "T",
  questions: [],
};

const SHORT_TEXT_QUIZ: Quiz = {
  id: "q2",
  title: "Short text",
  questions: [
    { _kind: "short_text", id: "s1", text: "Name?", required: false },
  ],
};

const THREE_Q_QUIZ: Quiz = {
  id: "q3",
  title: "Mixed",
  questions: [
    { _kind: "short_text", id: "a", text: "A?", required: false },
    { _kind: "short_text", id: "b", text: "B?", required: false },
    { _kind: "short_text", id: "c", text: "C?", required: false },
  ],
};

const PER_TYPE_QUIZ: Quiz = {
  id: "q4",
  title: "Per-type",
  questions: [
    {
      _kind: "single_choice",
      id: "sc",
      title: "Pick one",
      text: "Pick:",
      required: true,
      score: 1,
      mode: "list",
      options: [
        { id: "opt-a", label: "A" },
        { id: "opt-b", label: "B" },
      ],
    },
    {
      _kind: "short_text",
      id: "st",
      text: "Type:",
      required: false,
      placeholder: "here",
      maxLength: 40,
    },
    {
      _kind: "multiple_choice",
      id: "mc",
      title: "Pick many",
      text: "Pick:",
      required: false,
      mode: "list",
      minSelections: 1,
      maxSelections: 2,
      options: [
        { id: "m-a", label: "A" },
        { id: "m-b", label: "B" },
      ],
    },
  ],
};

function fakeService(seed: { quiz?: Quiz; state?: QuizState } = {}): QuizService {
  const quizzes = new Map<string, Quiz>();
  const states = new Map<string, QuizState>();
  if (seed.quiz) quizzes.set(seed.quiz.id, seed.quiz);
  if (seed.quiz && seed.state) states.set(seed.quiz.id, seed.state);
  return {
    async registerQuiz(definition) {
      const quiz: Quiz = { ...definition, id: "generated" };
      quizzes.set(quiz.id, quiz);
      return quiz;
    },
    async quizExists(id) { return quizzes.has(id); },
    async getQuiz(id) {
      const q = quizzes.get(id);
      if (!q) throw new QuizNotFoundError(id);
      return q;
    },
    async saveAnswer() {},
    async finishQuiz() {},
    async getState(id) {
      if (!quizzes.has(id)) throw new QuizNotFoundError(id);
      return states.get(id) ?? { finished: false, answers: {} as Record<string, Answer> };
    },
  };
}

describe("get_answers handler", () => {
  it("returns empty items for a fresh quiz with no questions", async () => {
    const handler = makeGetAnswersHandler(fakeService({ quiz: EMPTY_QUIZ }));
    const result = await handler({ quizId: "q1" });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      quizId: "q1",
      title: "T",
      finished: false,
      items: [],
    });
  });

  it("returns full state for a finished quiz with one short_text answer", async () => {
    const answers: Record<string, Answer> = {
      s1: { _kind: "short_text", questionId: "s1", text: "Ada" },
    };
    const handler = makeGetAnswersHandler(
      fakeService({ quiz: SHORT_TEXT_QUIZ, state: { finished: true, answers } }),
    );
    const result = await handler({ quizId: "q2" });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      quizId: "q2",
      title: "Short text",
      finished: true,
    });

    const sc = result.structuredContent as {
      items: Array<{ question: { _kind: string; id: string; text: string }; answer: Answer | null }>;
    };
    expect(sc.items).toHaveLength(1);
    expect(sc.items[0]!.question).toEqual({
      _kind: "short_text",
      id: "s1",
      text: "Name?",
    });
    expect(sc.items[0]!.answer).toEqual(answers.s1);

    // content[0].text: summary line + blank line + JSON body matching structuredContent.
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toMatch(/^Quiz q2: finished=true, answered 1\/1\n\n/);
    const jsonBody = text.split("\n\n").slice(1).join("\n\n");
    expect(JSON.parse(jsonBody)).toEqual(result.structuredContent);
  });

  it("returns isError with the id in text for an unknown quiz", async () => {
    const handler = makeGetAnswersHandler(fakeService());
    const result = await handler({ quizId: "missing" });

    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("missing");
  });

  it("includes unanswered questions with answer:null in a partially-answered quiz", async () => {
    const answers: Record<string, Answer> = {
      a: { _kind: "short_text", questionId: "a", text: "first" },
    };
    const handler = makeGetAnswersHandler(
      fakeService({ quiz: THREE_Q_QUIZ, state: { finished: false, answers } }),
    );
    const result = await handler({ quizId: "q3" });

    const sc = result.structuredContent as {
      finished: boolean;
      items: Array<{ question: { id: string }; answer: Answer | null }>;
    };
    expect(sc.finished).toBe(false);
    expect(sc.items).toHaveLength(3);
    expect(sc.items[0]!.question.id).toBe("a");
    expect(sc.items[0]!.answer).toEqual(answers.a);
    expect(sc.items[1]!.question.id).toBe("b");
    expect(sc.items[1]!.answer).toBeNull();
    expect(sc.items[2]!.question.id).toBe("c");
    expect(sc.items[2]!.answer).toBeNull();
  });

  it("projects each question type to its compact form dropping UI-only fields", async () => {
    const handler = makeGetAnswersHandler(fakeService({ quiz: PER_TYPE_QUIZ }));
    const result = await handler({ quizId: "q4" });

    const sc = result.structuredContent as {
      items: Array<{ question: Record<string, unknown> }>;
    };
    expect(sc.items).toHaveLength(3);

    const [scq, stq, mcq] = sc.items.map((i) => i.question);

    expect(scq).toEqual({
      _kind: "single_choice",
      id: "sc",
      title: "Pick one",
      text: "Pick:",
      options: [
        { id: "opt-a", label: "A" },
        { id: "opt-b", label: "B" },
      ],
    });
    expect(scq).not.toHaveProperty("mode");
    expect(scq).not.toHaveProperty("required");
    expect(scq).not.toHaveProperty("score");
    expect(scq).not.toHaveProperty("attachments");

    expect(stq).toEqual({
      _kind: "short_text",
      id: "st",
      text: "Type:",
    });
    expect(stq).not.toHaveProperty("placeholder");
    expect(stq).not.toHaveProperty("maxLength");
    expect(stq).not.toHaveProperty("required");

    expect(mcq).toEqual({
      _kind: "multiple_choice",
      id: "mc",
      title: "Pick many",
      text: "Pick:",
      options: [
        { id: "m-a", label: "A" },
        { id: "m-b", label: "B" },
      ],
    });
    expect(mcq).not.toHaveProperty("mode");
    expect(mcq).not.toHaveProperty("minSelections");
    expect(mcq).not.toHaveProperty("maxSelections");
  });
});
