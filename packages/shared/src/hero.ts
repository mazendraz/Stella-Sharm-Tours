import type { Slide } from './public-contract';
export function eligibleSlides(
  slides: Slide[],
  device?: 'mobile' | 'desktop',
  now = Date.now(),
) {
  return slides.filter(
    (slide) =>
      (!device || slide.device === 'all' || slide.device === device) &&
      (!slide.starts_at || Date.parse(slide.starts_at) <= now) &&
      (!slide.ends_at || Date.parse(slide.ends_at) > now),
  );
}
