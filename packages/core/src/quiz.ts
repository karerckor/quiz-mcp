import { z } from 'zod';
import { IdSchema } from './shared/primitives.js';
import { QuestionSchema } from './questions/index.js';

export const QuizDefinitionSchema = z.object({
  $schema: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  questions: z.array(QuestionSchema),
});
export type QuizDefinition = z.infer<typeof QuizDefinitionSchema>;

export const QuizSchema = QuizDefinitionSchema.extend({
  id: IdSchema,
});
export type Quiz = z.infer<typeof QuizSchema>;
