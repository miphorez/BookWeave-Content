# BookWeave content

This public repository stores the two owner-approved Russian editions and two owner-provided English review copies for BookWeave, with source text, provenance, language status, and release tooling. The Android application is maintained separately in `miphorez/BridgeToKnowledge`.

| Book | Edition | SHA-256 of `book.html` |
| --- | --- | --- |
| Bridge to Knowledge | `ru-legacy-1.9` | `d4a406bec45fbc112c693d594f5f2980f6f12e88df4652c17c6bbde40a173f75` |
| Bridge to Knowledge (English review) | `en-proofreading-2026-09-29` | `8e99131c2e8c95461555a1d0497096a4a5a49737539ccebc6304030d767320da` |
| Knowledge of Life | `ru-site-2026-09-22` | `6b3b2f6e62b9b43a2b2c597a9a556462b2f1a682ecada3866695bc4ed3735efd` |
| Knowledge of Life (English review) | `en-proofreading-2026-09-29` | `e7a384f23ced175770e9f712526e2156ef7187d1b7f28af2118640a26e2c6d25` |

`languages.json` records Russian and English as available. The English editions are review copies supplied by the owner for manual device testing; their final editorial acceptance is pending. `catalog-source.json` is the editable source of the signed application catalog. The release builder verifies pinned hashes and source records, then produces a detached publisher signature and versioned HTML assets. The private signing key is never stored in this repository.

The application downloads `catalog.json` and `catalog.sig` from the latest published release. It verifies the signature with its built-in public key before using any catalog data. Each HTML asset is fetched from the signed release tag and checked against its signed size and SHA-256 before it can enter the app's private cache. The bundled English and Russian editions remain available offline.

To build a release locally, set `BOOKWEAVE_CONTENT_SIGNING_KEY` to the private PEM path outside all repositories, run `node tools/build-release.mjs`, then `node tools/verify-release.mjs`. Publish all files from `dist/` together as assets of the tag named in `catalog-source.json`. Enable immutable releases before publishing. See [content rights](RIGHTS.md) for the current permissions.

## Adding a language without rebuilding the application

Use the extensible translation-package app build; versions through 2.2.0 accept only Russian and English. Interface localization is separate and remains English/Russian.

1. Choose a canonical BCP 47 tag, for example `pl`, `pt-BR`, or `zh-Hant`. Add it as `available` in `languages.json` only when at least one actual edition is ready.
2. Save inert HTML at `books/<book-id>/<language-tag>/<edition-id>/book.html`. Keep the original section order, IDs, document structure, and CSP. Change only the translated title/text and language attributes.
3. Add the edition to that book in `catalog-source.json` with its localized title, chapters, exact SHA-256, source-edition hash, `owner-approved` status, and approval date. Language availability can differ between the two books.
4. Add `provenance/<book-id>-<language-tag>.json` recording book/edition IDs, received-text and source-edition hashes, section count, and matching review status. Include translator/editor information in the source record. The existing pinned English review editions are a historical exception; new translations require owner approval.
5. Increment `catalogVersion` and use a new matching immutable `content-vN` release tag. Run `node tools/verify-source.mjs` and `node --test tools/content-source.test.mjs`, then build, verify, and publish the signed release through the existing protected workflow.

The application fetches only the signed catalog during a manual check, announces new translations, and downloads a new language only when selected in Book settings. Revised already-installed languages are updated during that check. Signed size and SHA-256 are checked before activation. Catalogs can contain up to 2 MiB and individual texts up to 5 MiB. No runtime APK token or private key is needed.
