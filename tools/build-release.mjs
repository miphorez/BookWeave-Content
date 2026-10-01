import { createHash, createPrivateKey, sign, verify } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifySource } from './content-source.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const { catalog: source, languages } = verifySource();
const keyPath = process.env.BOOKWEAVE_CONTENT_SIGNING_KEY;
if (!keyPath) throw new Error('Set BOOKWEAVE_CONTENT_SIGNING_KEY to a private key outside the repository');
const privateKey = createPrivateKey(readFileSync(keyPath));
const publicKey = read('keys/publisher-v1-public.pem');
const dist = resolve(root, 'dist');
mkdirSync(dist, { recursive: true });
const books = source.books.map(book => {
    const provenance = JSON.parse(read(`provenance/${book.id}.json`));
    const publication = provenance.priorPublication;
    if (!publication?.url?.startsWith('https://proza.ru/') || !/^\d{12}$/.test(publication.certificateNumber)) {
        throw new Error(`Missing publication evidence: ${book.id}`);
    }
    const editions = book.editions.map(edition => {
        const html = read(edition.file);
        if (html.length > 5 * 1024 * 1024 || sha256(html) !== edition.sha256 || /<script\b|\son\w+\s*=|<iframe\b|<object\b|<embed\b|<link\b/i.test(html.toString('utf8'))) {
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
    keyId: source.keyId, languages: languages.languages.filter(item => item.status === 'available').map(item => item.tag),
    rights: 'all-rights-reserved', books,
};
const catalogBytes = Buffer.from(JSON.stringify(catalog, null, 2) + '\n', 'utf8');
if (catalogBytes.length > 2 * 1024 * 1024) throw new Error('Catalog exceeds the application limit');
const signature = sign('sha256', catalogBytes, privateKey);
if (!verify('sha256', catalogBytes, publicKey, signature)) throw new Error('Signing key does not match public key');
writeFileSync(resolve(dist, 'catalog.json'), catalogBytes);
writeFileSync(resolve(dist, 'catalog.sig'), signature.toString('base64') + '\n');
console.log(`Built ${source.releaseTag} with ${books.length} books and ${books.flatMap(book => book.editions).length} editions.`);
