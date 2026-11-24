/**
 * 44 px touch-target minimum, allowing for layout-unit rounding: browsers
 * report a box laid out at exactly 44 px as 43.9999… (audit 2026-11-24 BUG-07).
 */
export const minTarget = 44 - 0.01;
