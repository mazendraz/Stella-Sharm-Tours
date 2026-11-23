# Trip stories

- [x] 0. Record the six route and media references in `data/journeys` and associate them with seven catalog entries. Cairo by air and Cairo with the old museum have separate itineraries.
- [x] 1. Implement the tap-driven viewer, route transition, inset relief map, video fallback and stop selector.
- [x] 2. Add the nullable story migration, signed draft previews, public read endpoint, media checks and localized copy. The translation worker uses stable scene IDs and source hashes.
- [x] 3. Add the Trip story editor inside each trip. Save writes a draft. Preview uses the existing signed trip preview. Publish and revision restore use the existing trip permissions and history.
- [x] 4. Connect the Petra entry to the trip detail and reuse the request form with the chosen group or private format.
- [x] 5. Import all seven program drafts in isolated PostgreSQL. Database checks passed for preview isolation, Petra publication in seven languages, and reversal.
- [ ] 6. Verify on staging and enable the approved programs individually. Production deployment follows the existing staging review and release process.

- [x] Add a homepage gallery after the private tours section. Each card opens the published story in the current locale. The two Cairo bus programs share one entry.

## Content decisions

- [x] Use a local crop of the 2016 Sentinel-2 cloudless mosaic for the northern Gulf of Aqaba close-ups. Source: EOX WMS layer `s2cloudless`, EPSG:4326, bounds 34.60–35.30°E / 29.20–29.82°N, 2048 × 1814. Cropped and converted to WebP. [EOX attribution and license](https://eox.at/2023/10/sentinel-2-cloudless-2022).

- Petra shows the ferry from Taba to Aqaba. Cairo follows the west coast of Sinai. Alexandria shares the Cairo road and shows the Mediterranean on arrival.
- The Jerusalem visual route follows the supplied sequence. The catalog lists the Jordan River earlier in the day. Confirm the sequence with operations before public activation.
- The Alexandria Library stop describes the exterior visit. The reading room and Luxor landmarks beyond the scheduled visits are illustrative scenes.
- The draft uses the catalog aerial film focused on the Giza pyramids, a licensed Dome of the Rock still and a photo of the tunnel's west portal. The two original clips with unresolved rights are excluded from the import. Asset hashes and source records are in `data/journeys/media.json`.
- The shared map animates each prototype road segment against NASA GIBS Blue Marble Shaded Relief and Bathymetry imagery (27–39°E, 24–34°N). The wider fallback is a shaded relief crop from [Natural Earth II](https://www.naturalearthdata.com/downloads/50m-raster-data/50m-natural-earth-2/). Natural Earth map data is [in the public domain](https://www.naturalearthdata.com/about/terms-of-use/).

## Staging and rollout

1. Run the normal staging backup and deployment flow. Apply migration `0010_trip_story` before starting the new API.
2. Run `pnpm db:seed-stories` against the staging database using the configured media paths. In the API container, run `node --import tsx scripts/seed-trip-stories.ts` from `/app` with the migration database URL and mounted media volumes. The importer creates drafts for programs without a story or story draft. It leaves existing editorial changes intact.
3. Open Petra in the dashboard. Save and preview each core language, test the tap controls, video, Back button and request form, then publish Petra. Check that saved trips, collection modals and direct trip links work.
4. Check iOS Safari and Android Chrome on staging, including reduced motion and slow media loading. Record the accessibility and Lighthouse mobile results before expanding the rollout. Review the other five journeys with the owner, including the Jerusalem sequence.
5. Publish the reviewed programs individually. Monitor `trip_story_open`, `trip_story_finish`, `trip_story_request` and the existing booking confirmation events. To hide one story, remove its stops in the editor, save and publish the trip. To roll back a publication, use the existing trip revision history.
