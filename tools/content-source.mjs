import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const section = /(<section id="([^"]+)" lang="(?:ru|en)" dir="auto"><div class="text">)([\s\S]*?)(<\/div><\/section>)/g;
const sectionIds = html => [...html.matchAll(section)].map(match => match[2]);
const skeleton = html => html.replace(section, (_, start, id, body, end) => `${start}__TEXT__${end}`)
    .replace(/<title>.*?<\/title>/, '<title>__TITLE__</title>')
    .replaceAll('lang="ru"', 'lang="xx"').replaceAll('lang="en"', 'lang="xx"');

export function verifySource() {
    const catalog = JSON.parse(read('catalog-source.json'));
    const languages = JSON.parse(read('languages.json'));
    if (catalog.schemaVersion !== 1 || !Number.isSafeInteger(catalog.catalogVersion) ||
        catalog.catalogVersion < 2 || catalog.releaseTag !== `content-v${catalog.catalogVersion}` ||
        catalog.keyId !== 'publisher-v1' || catalog.books.length !== 2 ||
        new Set(catalog.books.map(book => book.id)).size !== 2 ||
        languages.schemaVersion !== 1 ||
        JSON.stringify(languages.languages.map(item => [item.tag, item.status])) !==
            JSON.stringify([['ru', 'available'], ['en', 'available']])) {
        throw new Error('Unexpected catalog version, books, or language status');
    }
    for (const book of catalog.books) {
        if (!['bridge-to-knowledge', 'knowledge-of-life'].includes(book.id) ||
            book.originalLanguage !== 'ru' || book.author !== 'Соловьёв Дмитрий' ||
            book.editions.length !== 2 ||
            book.editions[0].languageTag !== 'ru' || book.editions[1].languageTag !== 'en') {
            throw new Error(`Unexpected book editions: ${book.id}`);
        }
        const [original, translation] = book.editions;
        if (original.approvalStatus !== 'owner-approved' || original.approvedAt !== '2026-09-29' ||
            original.file !== `books/${book.id}/ru/${original.id}/book.html` ||
            !/^[a-f0-9]{64}$/.test(original.sha256) || sha256(read(original.file)) !== original.sha256) {
            throw new Error(`Original edition changed: ${book.id}`);
        }
        const provenance = JSON.parse(read(`provenance/${book.id}.json`));
        const entries = book.id === 'bridge-to-knowledge' ? provenance.fragments : provenance.pages;
        if (entries.length !== original.chapters.length) throw new Error(`Chapter count changed: ${book.id}`);
        for (const [index, entry] of entries.entries()) {
            if (entry.id !== original.chapters[index].id) throw new Error(`Chapter order changed: ${entry.id}`);
            const path = `source/${book.id}/ru/${entry.id}.txt`;
            if (sha256(read(path)) !== (entry.sha256 ?? entry.textSha256)) {
                throw new Error(`Source text changed: ${path}`);
            }
        }
        if (translation.id !== 'en-proofreading-2026-09-29' ||
            translation.file !== `books/${book.id}/en/${translation.id}/book.html` ||
            translation.approvalStatus !== 'owner-supplied-for-review' ||
            translation.sourceEditionSha256 !== original.sha256 ||
            !/^[a-f0-9]{64}$/.test(translation.sha256)) {
            throw new Error(`Unexpected English edition: ${book.id}`);
        }
        const translatedBytes = read(translation.file);
        const translated = translatedBytes.toString('utf8');
        const originalHtml = read(original.file).toString('utf8');
        const englishProvenance = JSON.parse(read(`provenance/${book.id}-en.json`));
        if (sha256(translatedBytes) !== translation.sha256 ||
            englishProvenance.sourceSha256 !== translation.sha256 ||
            englishProvenance.sourceEditionSha256 !== original.sha256 ||
            englishProvenance.reviewStatus !== translation.approvalStatus ||
            englishProvenance.sectionCount !== translation.chapters.length ||
            !translated.includes('<html lang="en"') ||
            !translated.includes(`<title>${translation.title}</title>`) ||
            !translated.includes("default-src 'none'") ||
            /<script\b|\son\w+=|<iframe\b|<object\b|<embed\b|<link\b/i.test(translated) ||
            JSON.stringify(sectionIds(translated)) !== JSON.stringify(original.chapters.map(item => item.id)) ||
            JSON.stringify(translation.chapters.map(item => item.id)) !==
                JSON.stringify(original.chapters.map(item => item.id)) ||
            skeleton(translated) !== skeleton(originalHtml)) {
            throw new Error(`English edition failed verification: ${book.id}`);
        }
    }
    return { catalog, languages };
}
