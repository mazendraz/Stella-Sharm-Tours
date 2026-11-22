import { savedTripsSchema } from '@stella/shared/public-contract';
import type { z } from 'zod';
export { savedTripsSchema };

export type SavedTrip = z.infer<typeof savedTripsSchema>[number];
