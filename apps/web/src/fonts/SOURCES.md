# Font sources and licenses

Manrope, Marcellus and Forum are complete fonts from the Google Fonts repository,
retrieved 2026-11-11. WOFF2 compression uses Google's lossless encoder through
wawoff2@2.0.1; glyphs and names are unchanged. Licenses accompany the files and
are also shipped under /fonts/licenses/.

- manrope — https://github.com/google/fonts/tree/main/ofl/manrope — WOFF2 SHA256 4FD316D47CEAB59B4186CFFB92FCB98B15B7808BE525ADE8AB3B835F2994E18A
- marcellus — https://github.com/google/fonts/tree/main/ofl/marcellus — WOFF2 SHA256 1AD14645CCBFF9BF42485300408613E84EF4DCF8734141FBE6639193268C65EE
- forum — https://github.com/google/fonts/tree/main/ofl/forum — WOFF2 SHA256 C52650494E3E5D8095825FC9EFC4016DBD255C939BD122B385B67B2E4561BB3B
- @fontsource-variable/noto-sans-arabic@5.3.0 — https://fontsource.org/fonts/noto-sans-arabic — unmodified WOFF2 distribution
- @fontsource-variable/noto-sans-sc@5.3.1 — https://fontsource.org/fonts/noto-sans-sc — unmodified WOFF2 distribution

## Script subsets (2026-11-14)

The site now serves Manrope and Marcellus as per-script subsets with
`unicode-range`, so Latin pages no longer download Cyrillic/Greek/Vietnamese
glyphs. Files are copied unmodified from Fontsource (Google Fonts subsets, OFL),
same families and licenses as above:

- `@fontsource-variable/manrope@5.3.0` — `manrope-{latin,latin-ext,cyrillic,cyrillic-ext,greek,vietnamese}.woff2` (from `files/manrope-*-wght-normal.woff2`)
- `@fontsource/marcellus@5.3.0` — `marcellus-{latin,latin-ext}.woff2` (from `files/marcellus-*-400-normal.woff2`)

`manrope-full.woff2` and `marcellus-full.woff2` are no longer loaded by the site.
