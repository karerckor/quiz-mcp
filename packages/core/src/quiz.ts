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

export const QuizSchema = z.object({
  ...QuizBodyShape,
  id: IdSchema,
});
export type Quiz = z.infer<typeof QuizSchema>;
