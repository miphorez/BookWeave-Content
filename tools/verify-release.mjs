import { createHash, verify } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifySource } from './content-source.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path));
const { catalog: source, languages } = verifySource();
const bytes = read('dist/catalog.json');
const signature = Buffer.from(read('dist/catalog.sig').toString('ascii').trim(), 'base64');
const publicKey = read('keys/publisher-v1-public.pem');
if (!verify('sha256', bytes, publicKey, signature) ||
    verify('sha256', Buffer.concat([bytes, Buffer.from('tampered')]), publicKey, signature)) {
    throw new Error('Catalog signature is invalid');
}
const catalog = JSON.parse(bytes);
if (catalog.schemaVersion !== source.schemaVersion || catalog.catalogVersion !== source.catalogVersion ||
    catalog.releaseTag !== source.releaseTag || catalog.keyId !== source.keyId ||
    catalog.rights !== 'all-rights-reserved' ||
    JSON.stringify(catalog.languages) !== JSON.stringify(languages.languages.filter(item => item.status === 'available').map(item => item.tag)) ||
    catalog.books.length !== source.books.length) throw new Error('Unexpected catalog');
const assets = new Set(['catalog.json', 'catalog.sig']);
for (const [bookIndex, book] of catalog.books.entries()) {
    const expectedBook = source.books[bookIndex];
    if (book.id !== expectedBook.id || book.originalLanguage !== 'ru' ||
        book.author !== expectedBook.author || book.editions.length !== expectedBook.editions.length) {
        throw new Error(`Unexpected book: ${book.id}`);
    }
    for (const [editionIndex, edition] of book.editions.entries()) {
        const expected = expectedBook.editions[editionIndex];
        if (edition.id !== expected.id || edition.languageTag !== expected.languageTag ||
            edition.title !== expected.title || edition.sha256 !== expected.sha256 ||
            edition.assetName !== `${book.id}-${edition.id}.html` ||
            JSON.stringify(edition.chapters) !== JSON.stringify(expected.chapters)) {
            throw new Error(`Unexpected edition: ${book.id}/${edition.id}`);
        }
        assets.add(edition.assetName);
        const html = read(`dist/${edition.assetName}`);
        const hash = createHash('sha256').update(html).digest('hex');
        if (html.length !== edition.sizeBytes || hash !== edition.sha256) {
            throw new Error(`Invalid asset: ${edition.assetName}`);
        }
    }
}
if (JSON.stringify(readdirSync(resolve(root, 'dist')).sort()) !== JSON.stringify([...assets].sort())) {
    throw new Error('Unexpected release files');
}
console.log('PASS: publisher signature, all asset sizes and SHA-256 checks.');
