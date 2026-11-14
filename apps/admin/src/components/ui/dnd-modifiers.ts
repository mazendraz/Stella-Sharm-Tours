import type { Modifier } from '@dnd-kit/core';

/** Lock dragging to the vertical axis (avoids @dnd-kit/modifiers dependency). */
export const restrictToVerticalAxis: Modifier = ({ transform }) => ({
  ...transform,
  x: 0,
});
