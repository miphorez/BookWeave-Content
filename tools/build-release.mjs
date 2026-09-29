import { createHash, createPrivateKey, sign, verify } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const source = JSON.parse(read('catalog-source.json'));
const languages = JSON.parse(read('languages.json'));
const keyPath = process.env.BOOKWEAVE_CONTENT_SIGNING_KEY;
if (!keyPath) throw new Error('Set BOOKWEAVE_CONTENT_SIGNING_KEY to a private key outside the repository');
if (source.schemaVersion !== 1 || source.catalogVersion !== 1 || source.releaseTag !== 'content-v1' ||
    source.keyId !== 'publisher-v1') throw new Error('Unexpected catalog release metadata');
if (languages.schemaVersion !== 1 || JSON.stringify(languages.languages.map(item => [item.tag, item.status])) !==
    JSON.stringify([['ru', 'available'], ['en', 'planned']])) throw new Error('Unexpected language list');
if (source.books.length !== 2 || new Set(source.books.map(book => book.id)).size !== 2) {
    throw new Error('Expected exactly two books');
}
for (const fragment of JSON.parse(read('provenance/bridge-to-knowledge.json')).fragments) {
    if (sha256(read(`source/bridge-to-knowledge/ru/${fragment.id}.txt`)) !== fragment.sha256) {
        throw new Error(`Source fragment changed: ${fragment.id}`);
    }
}
for (const page of JSON.parse(read('provenance/knowledge-of-life.json')).pages) {
    if (sha256(read(`source/knowledge-of-life/ru/${page.id}.txt`)) !== page.textSha256) {
        throw new Error(`Extracted source text changed: ${page.id}`);
    }
}
const privateKey = createPrivateKey(readFileSync(keyPath));
const publicKey = read('keys/publisher-v1-public.pem');
const dist = resolve(root, 'dist');
mkdirSync(dist, { recursive: true });
const books = source.books.map(book => {
    if (!['bridge-to-knowledge', 'knowledge-of-life'].includes(book.id) ||
        book.originalLanguage !== 'ru' || book.author !== 'Соловьёв Дмитрий' ||
        book.editions.length !== 1) throw new Error(`Unexpected book metadata: ${book.id}`);
    const provenance = JSON.parse(read(`provenance/${book.id}.json`));
    const publication = provenance.priorPublication;
    if (!publication?.url?.startsWith('https://proza.ru/') || !/^\d{12}$/.test(publication.certificateNumber)) {
        throw new Error(`Missing publication evidence: ${book.id}`);
    }
    const editions = book.editions.map(edition => {
        if (edition.languageTag !== 'ru' || edition.approvalStatus !== 'owner-approved' ||
            edition.approvedAt !== '2026-09-29' || !/^[a-z0-9.-]+$/.test(edition.id) ||
            edition.file !== `books/${book.id}/ru/${edition.id}/book.html` ||
            !/^[a-f0-9]{64}$/.test(edition.sha256)) throw new Error(`Unexpected edition: ${book.id}`);
        const html = read(edition.file);
        if (sha256(html) !== edition.sha256 || /<script\b|\son\w+=|<iframe\b|<object\b|<embed\b|<link\b/i.test(html.toString('utf8'))) {
            throw new Error(`Invalid approved content: ${edition.id}`);
        }
        const assetName = `${book.id}-${edition.id}.html`;
        writeFileSync(resolve(dist, assetName), html);
        return {
            id: edition.id, languageTag: edition.languageTag, title: edition.title,
            assetName, sizeBytes: html.length, sha256: edition.sha256,
            chapters: edition.chapters,
        };
    });
    return {
        id: book.id, originalLanguage: book.originalLanguage, author: book.author,
        publicationEvidence: { url: publication.url, certificateNumber: publication.certificateNumber },
        editions,
    };
});
const catalog = {
    schemaVersion: 1, catalogVersion: source.catalogVersion, releaseTag: source.releaseTag,
    keyId: source.keyId, languages: ['ru'], rights: 'all-rights-reserved', books,
};
const catalogBytes = Buffer.from(JSON.stringify(catalog, null, 2) + '\n', 'utf8');
const signature = sign('sha256', catalogBytes, privateKey);
if (!verify('sha256', catalogBytes, publicKey, signature)) throw new Error('Signing key does not match public key');
writeFileSync(resolve(dist, 'catalog.json'), catalogBytes);
writeFileSync(resolve(dist, 'catalog.sig'), signature.toString('base64') + '\n');
console.log(`Built ${source.releaseTag} with ${books.length} approved books.`);
