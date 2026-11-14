# Self-hosted font sources

The approved families remain Manrope, Marcellus, Forum and script-specific Noto.
Google Fonts downloads failed with ETIMEDOUT during a production build.
Use vendored WOFF2 files through next/font/local so CI builds do not require
Google network access. This is an implementation adjustment to frontend §1.2,
preserving the design and visitor privacy requirements.

Manrope, Marcellus and Forum use complete upstream Google Fonts source snapshots,
losslessly compressed to WOFF2. Each family has one face, preserving extended
Latin accents and Manrope/Forum Cyrillic without competing subset faces.
Source URLs, hashes, Noto Fontsource versions and original licenses are recorded
in apps/web/src/fonts/SOURCES.md and LICENSE files. The public font directory also
includes license/source notices for deployed distributions.

Manrope and Marcellus use next/font's preload setting. Forum is selected for
Russian/Ukrainian headings and is not preloaded globally. Arabic selects Noto
Arabic. Chinese uses the vendored Fontsource stylesheet with unicode ranges,
linked only for the Chinese locale. No visitor request goes to Google. Additional
scripts must pass the language coverage/font gate before the backend enables them.
