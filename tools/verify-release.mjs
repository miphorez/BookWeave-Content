import { createHash, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path));
const bytes = read('dist/catalog.json');
const signature = Buffer.from(read('dist/catalog.sig').toString('ascii').trim(), 'base64');
if (!verify('sha256', bytes, read('keys/publisher-v1-public.pem'), signature)) {
    throw new Error('Catalog signature is invalid');
}
const catalog = JSON.parse(bytes);
if (catalog.schemaVersion !== 1 || catalog.catalogVersion !== 1 || catalog.releaseTag !== 'content-v1' ||
    catalog.keyId !== 'publisher-v1' || catalog.books.length !== 2) throw new Error('Unexpected catalog');
for (const book of catalog.books) {
    for (const edition of book.editions) {
        if (!/^[a-z0-9.-]+\.html$/.test(edition.assetName)) throw new Error('Unsafe asset name');
        const html = read(`dist/${edition.assetName}`);
        const hash = createHash('sha256').update(html).digest('hex');
        if (html.length !== edition.sizeBytes || hash !== edition.sha256) {
            throw new Error(`Invalid asset: ${edition.assetName}`);
        }
    }
}
console.log('PASS: publisher signature, both asset sizes and SHA-256 checks.');
