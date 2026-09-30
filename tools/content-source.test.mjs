import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifySource, validLanguageTag } from './content-source.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
test('language tags support Polish, regional locales, and RTL languages', () => {
    for (const tag of ['pl', 'pt-BR', 'zh-Hant', 'ar']) assert.equal(validLanguageTag(tag), true);
    for (const tag of ['en/../../file', '', 'und', 'en--US']) assert.equal(validLanguageTag(tag), false);
});

test('a third-language fixture is accepted only with matching approval, bytes, and provenance', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'bookweave-content-test-'));
    try {
        for (const name of ['books', 'source', 'provenance', 'catalog-source.json', 'languages.json']) {
            cpSync(join(root, name), join(scratch, name), { recursive: true });
        }
        const catalog = JSON.parse(readFileSync(join(scratch, 'catalog-source.json')));
        const languages = JSON.parse(readFileSync(join(scratch, 'languages.json')));
        const book = catalog.books[0];
        const english = book.editions.find(item => item.languageTag === 'en');
        // Structural QA fixture only: this never creates or publishes a real Polish translation.
        const html = readFileSync(join(scratch, english.file), 'utf8').replaceAll('lang="en"', 'lang="pl"');
        const id = 'pl-qa-fixture';
        const file = `books/${book.id}/pl/${id}/book.html`;
        mkdirSync(dirname(join(scratch, file)), { recursive: true });
        writeFileSync(join(scratch, file), html);
        const sha256 = createHash('sha256').update(html).digest('hex');
        const polish = { ...english, id, languageTag: 'pl', file, sha256, approvalStatus: 'owner-approved', approvedAt: '2026-09-30' };
        book.editions.push(polish);
        languages.languages.push({ tag: 'pl', status: 'available' });
        const provenancePath = join(scratch, `provenance/${book.id}-pl.json`);
        const provenance = { schemaVersion: 1, bookId: book.id, editionId: id, sourceSha256: sha256,
            sourceEditionSha256: polish.sourceEditionSha256, sectionCount: polish.chapters.length, reviewStatus: polish.approvalStatus };
        const save = () => {
            writeFileSync(join(scratch, 'catalog-source.json'), JSON.stringify(catalog));
            writeFileSync(join(scratch, 'languages.json'), JSON.stringify(languages));
            writeFileSync(provenancePath, JSON.stringify(provenance));
        };
        save();
        assert.equal(verifySource(scratch).catalog.books[0].editions.length, 3);
        polish.approvalStatus = 'owner-supplied-for-review';
        save();
        assert.throws(() => verifySource(scratch), /Unexpected translation/);
        polish.approvalStatus = 'owner-approved';
        provenance.sourceSha256 = '0'.repeat(64);
        save();
        assert.throws(() => verifySource(scratch), /Translation failed verification/);
        provenance.sourceSha256 = sha256;
        languages.languages.push({ tag: 'PL', status: 'available' });
        save();
        assert.throws(() => verifySource(scratch), /Unexpected catalog/);
    } finally { rmSync(scratch, { recursive: true, force: true }); }
});
