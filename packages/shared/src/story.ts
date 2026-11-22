import { z } from 'zod';
import { localizedSchema, slugSchema } from './admin';
import { mediaSchema, textSchema } from './public-contract';

export const storyGeometry = z
  .array(z.tuple([z.number().min(-180).max(180), z.number().min(-85).max(85)]))
  .min(1)
  .max(1500);
const sceneBase = z.object({
  id: slugSchema,
  route: storyGeometry,
  frame: z.enum(['cover', 'contain']),
  focalX: z.number().min(0).max(100).optional(),
  focalY: z.number().min(0).max(100).optional(),
  kind: z.enum(['included', 'passage', 'illustrative', 'optional']),
  transport: z.enum(['road', 'ferry', 'flight', 'walk', 'arrival']),
});
export const storySceneSchema = sceneBase.extend({
  title: localizedSchema,
  caption: localizedSchema,
  mediaId: z.uuid().nullable(),
  credit: z.string().trim().max(2000),
});
export const storySchema = z
  .object({
    scenes: z.array(storySceneSchema).min(1).max(40),
  })
  .refine((s) => new Set(s.scenes.map((v) => v.id)).size === s.scenes.length);
export type Story = z.infer<typeof storySchema>;
export const storyPatch = z.strictObject({ story: storySchema.nullable() });
export const publicStorySchema = z.object({
  scenes: z
    .array(
      sceneBase.extend({
        title: textSchema,
        caption: textSchema,
        media: mediaSchema,
        credit: z.string(),
      }),
    )
    .min(1),
});
export type PublicStory = z.infer<typeof publicStorySchema>;
