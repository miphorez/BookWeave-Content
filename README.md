# BookWeave content

This public repository stores the two owner-approved Russian editions for BookWeave, their source text, provenance, language status, and release tooling. The Android application is maintained separately in `miphorez/BridgeToKnowledge`.

| Book | Edition | SHA-256 of `book.html` |
| --- | --- | --- |
| Bridge to Knowledge | `ru-legacy-1.9` | `d4a406bec45fbc112c693d594f5f2980f6f12e88df4652c17c6bbde40a173f75` |
| Knowledge of Life | `ru-site-2026-09-22` | `6b3b2f6e62b9b43a2b2c597a9a556462b2f1a682ecada3866695bc4ed3735efd` |

`languages.json` records Russian as available and English as planned. `catalog-source.json` is the editable source of the signed application catalog. The release builder verifies the approved hashes and source records, then produces a detached publisher signature and versioned HTML assets. The private signing key is never stored in this repository.

The application downloads `catalog.json` and `catalog.sig` from the latest published release. It verifies the signature with its built-in public key before using any catalog data. Each HTML asset is fetched from the signed release tag and checked against its signed size and SHA-256 before it can enter the app's private cache. The bundled Russian editions remain available offline.

To build a release locally, set `BOOKWEAVE_CONTENT_SIGNING_KEY` to the private PEM path outside all repositories, run `node tools/build-release.mjs`, then `node tools/verify-release.mjs`. Publish all files from `dist/` together as assets of the tag named in `catalog-source.json`. Enable immutable releases before publishing. See [content rights](RIGHTS.md) for the current permissions.
