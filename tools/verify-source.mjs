import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const catalog = JSON.parse(read('catalog-source.json'));
const languages = JSON.parse(read('languages.json'));
if (catalog.schemaVersion !== 1 || catalog.catalogVersion !== 1 || catalog.releaseTag !== 'content-v1' ||
    catalog.keyId !== 'publisher-v1' || catalog.books.length !== 2 ||
    JSON.stringify(languages.languages.map(item => [item.tag, item.status])) !==
        JSON.stringify([['ru', 'available'], ['en', 'planned']])) throw new Error('Unexpected catalog or languages');
for (const book of catalog.books) {
    if (!['bridge-to-knowledge', 'knowledge-of-life'].includes(book.id) ||
        book.originalLanguage !== 'ru' || book.editions.length !== 1) throw new Error('Unexpected book');
    const edition = book.editions[0];
    if (edition.languageTag !== 'ru' || edition.approvalStatus !== 'owner-approved' ||
        edition.approvedAt !== '2026-09-29' ||
        edition.file !== `books/${book.id}/ru/${edition.id}/book.html` ||
        sha256(read(edition.file)) !== edition.sha256) throw new Error(`Edition changed: ${book.id}`);
    const provenance = JSON.parse(read(`provenance/${book.id}.json`));
    const entries = book.id === 'bridge-to-knowledge' ? provenance.fragments : provenance.pages;
    if (entries.length !== edition.chapters.length) throw new Error(`Chapter count changed: ${book.id}`);
    for (const [index, entry] of entries.entries()) {
        if (entry.id !== edition.chapters[index].id) throw new Error(`Chapter order changed: ${entry.id}`);
        const path = `source/${book.id}/ru/${entry.id}.txt`;
        if (sha256(read(path)) !== (entry.sha256 ?? entry.textSha256)) throw new Error(`Source changed: ${path}`);
    }
}
console.log('PASS: approved edition hashes, 156 source texts, chapters, and language status.');
