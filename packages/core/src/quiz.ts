import { z } from 'zod';
import { IdSchema } from './shared/primitives.js';
import { QuestionSchema } from './questions/index.js';

const QuizBodyShape = {
  $schema: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  questions: z.array(QuestionSchema),
} as const;

export const QuizDefinitionSchema = z.object(QuizBodyShape);
export type QuizDefinition = z.infer<typeof QuizDefinitionSchema>;

// Property order is preserved verbatim because the published JSON Schema at
// schema/quiz.schema.json factors `id` out as the first $ref target; reordering
// would produce a noisy diff in the public artifact.
export const QuizSchema = z.object({
  $schema: QuizBodyShape.$schema,
  id: IdSchema,
  title: QuizBodyShape.title,
  description: QuizBodyShape.description,
  questions: QuizBodyShape.questions,
});
export type Quiz = z.infer<typeof QuizSchema>;
