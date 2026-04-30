import { describe, expect, it, vi } from "vitest";
import type { Answer, Quiz, QuizDefinition } from "@quiz-mcp/core";
import type { QuizService, QuizState } from "@quiz-mcp/runner-api";
import { HostedService } from "./hosted-service.js";

const QUIZ: Quiz = { id: "q1", title: "T", questions: [] };
const DEFINITION: QuizDefinition = { title: "T", questions: [] };

function fakeInner(seed: { state?: QuizState } = {}): QuizService & { calls: string[] } {
  const calls: string[] = [];
  const quizzes = new Map<string, Quiz>([[QUIZ.id, QUIZ]]);
  const states = new Map<string, QuizState>();
  if (seed.state) states.set(QUIZ.id, seed.state);
  return {
    calls,
    async registerQuiz(definition) {
      const quiz: Quiz = { ...definition, id: "q1" };
      calls.push(`registerQuiz:${quiz.id}`);
      quizzes.set(quiz.id, quiz);
      return quiz;
    },
    async quizExists(id) { calls.push(`quizExists:${id}`); return quizzes.has(id); },
    async getQuiz(id) { calls.push(`getQuiz:${id}`); return quizzes.get(id)!; },
    async saveAnswer(id, a) { calls.push(`saveAnswer:${id}`); },
    async finishQuiz(id, answers) { calls.push(`finishQuiz:${id}`); states.set(id, { finished: true, answers }); },
    async getState(id) {
      calls.push(`getState:${id}`);
      return states.get(id) ?? { finished: false, answers: {} as Record<string, Answer> };
    },
  };
}

function fakeHost() {
  return {
    ensureStarted: vi.fn().mockResolvedValue(undefined),
    trackActive: vi.fn(),
    markRead: vi.fn(),
    shouldAutoStop: vi.fn().mockReturnValue(false),
    stop: vi.fn().mockResolvedValue(true),
  };
}

describe("HostedService", () => {
  it("registerQuiz order: ensureStarted → inner.registerQuiz → trackActive, returns assigned quiz", async () => {
    const inner = fakeInner();
    const host = fakeHost();
    const hosted = new HostedService(inner, host as any);

    const quiz = await hosted.registerQuiz(DEFINITION);

    expect(quiz).toEqual({ ...DEFINITION, id: "q1" });
    expect(host.ensureStarted).toHaveBeenCalledTimes(1);
    expect(inner.calls).toContain("registerQuiz:q1");
    expect(host.trackActive).toHaveBeenCalledWith("q1");
    const ensureIdx = host.ensureStarted.mock.invocationCallOrder[0];
    const trackIdx = host.trackActive.mock.invocationCallOrder[0];
    expect(ensureIdx).toBeLessThan(trackIdx);
  });

  it("getState with finished:false does not markRead or stop", async () => {
    const inner = fakeInner();
    const host = fakeHost();
    const hosted = new HostedService(inner, host as any);

    const state = await hosted.getState("q1");

    expect(state.finished).toBe(false);
    expect(host.markRead).not.toHaveBeenCalled();
    expect(host.stop).not.toHaveBeenCalled();
  });

  it("getState with finished:true and shouldAutoStop=false: markRead only", async () => {
    const inner = fakeInner({ state: { finished: true, answers: {} } });
    const host = fakeHost();
    host.shouldAutoStop.mockReturnValue(false);
    const hosted = new HostedService(inner, host as any);

    await hosted.getState("q1");

    expect(host.markRead).toHaveBeenCalledWith("q1");
    expect(host.stop).not.toHaveBeenCalled();
  });

  it("getState with finished:true and shouldAutoStop=true: markRead + stop (fire-and-forget)", async () => {
    const inner = fakeInner({ state: { finished: true, answers: {} } });
    const host = fakeHost();
    host.shouldAutoStop.mockReturnValue(true);
    const hosted = new HostedService(inner, host as any);

    const state = await hosted.getState("q1");

    expect(state.finished).toBe(true);
    expect(host.markRead).toHaveBeenCalledWith("q1");
    expect(host.stop).toHaveBeenCalledTimes(1);
  });

  it("quizExists / getQuiz / saveAnswer / finishQuiz pass through", async () => {
    const inner = fakeInner();
    const host = fakeHost();
    const hosted = new HostedService(inner, host as any);

    await hosted.quizExists("q1");
    await hosted.getQuiz("q1");
    await hosted.saveAnswer("q1", { questionId: "x", _kind: "short_text", text: "hi" } as Answer);
    await hosted.finishQuiz("q1", {});

    expect(inner.calls).toEqual(
      expect.arrayContaining([
        "quizExists:q1",
        "getQuiz:q1",
        "saveAnswer:q1",
        "finishQuiz:q1",
      ]),
    );
    expect(host.ensureStarted).not.toHaveBeenCalled();
    expect(host.markRead).not.toHaveBeenCalled();
    expect(host.stop).not.toHaveBeenCalled();
  });
});
