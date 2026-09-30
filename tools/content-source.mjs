import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const section = /(<section id="([^"]+)" lang="[a-zA-Z0-9-]+" dir="auto"><div class="text">)([\s\S]*?)(<\/div><\/section>)/g;
const sectionIds = html => [...html.matchAll(section)].map(match => match[2]);
const skeleton = html => html.replace(section, (_, start, id, body, end) => `${start}__TEXT__${end}`)
    .replace(/<title>.*?<\/title>/, '<title>__TITLE__</title>')
    .replace(/lang="[a-zA-Z0-9-]+"/g, 'lang="xx"');

export function validLanguageTag(tag) {
    try {
        return typeof tag === 'string' && tag.length <= 63 && /^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/.test(tag) &&
            tag.toLowerCase() !== 'und' && Intl.getCanonicalLocales(tag)[0] === tag;
    } catch { return false; }
}

export function verifySource(sourceRoot = root) {
    const read = path => readFileSync(resolve(sourceRoot, path));
    const catalog = JSON.parse(read('catalog-source.json'));
    const languages = JSON.parse(read('languages.json'));
    if (catalog.schemaVersion !== 1 || !Number.isSafeInteger(catalog.catalogVersion) ||
        catalog.catalogVersion < 2 || catalog.releaseTag !== `content-v${catalog.catalogVersion}` ||
        catalog.keyId !== 'publisher-v1' || catalog.books.length !== 2 ||
        new Set(catalog.books.map(book => book.id)).size !== 2 ||
        languages.schemaVersion !== 1 || !Array.isArray(languages.languages) ||
        !languages.languages.every(item => validLanguageTag(item.tag)) ||
        new Set(languages.languages.map(item => item.tag.toLowerCase())).size !== languages.languages.length) {
        throw new Error('Unexpected catalog version, books, or language status');
    }
    const availableTags = languages.languages.filter(item => item.status === 'available').map(item => item.tag);
    const actualTags = new Set();
    for (const book of catalog.books) {
        if (!['bridge-to-knowledge', 'knowledge-of-life'].includes(book.id) ||
            book.originalLanguage !== 'ru' || book.author !== 'Соловьёв Дмитрий' ||
            book.editions.length < 1 || new Set(book.editions.map(item => item.languageTag)).size !== book.editions.length ||
            new Set(book.editions.map(item => item.id)).size !== book.editions.length ||
            !book.editions.every(item => availableTags.includes(item.languageTag) && /^[a-z0-9.-]{1,80}$/.test(item.id))) {
            throw new Error(`Unexpected book editions: ${book.id}`);
        }
        book.editions.forEach(item => actualTags.add(item.languageTag));
        for (const edition of book.editions) {
            if (typeof edition.title !== 'string' || !edition.title.trim() || edition.title.length > 200 ||
                !Array.isArray(edition.chapters) || edition.chapters.length < 1 || edition.chapters.length > 1000 ||
                new Set(edition.chapters.map(item => item.id)).size !== edition.chapters.length ||
                !edition.chapters.every(item => /^[a-z][a-z0-9-]{0,95}$/.test(item.id))) {
                throw new Error(`Invalid edition metadata: ${book.id}/${edition.id}`);
            }
        }
        const original = book.editions.find(item => item.languageTag === 'ru');
        if (!original) throw new Error(`Missing original: ${book.id}`);
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
        for (const translation of book.editions.filter(item => item.languageTag !== 'ru')) {
            const legacyReview = translation.languageTag === 'en' && translation.id === 'en-proofreading-2026-09-29' &&
                translation.approvalStatus === 'owner-supplied-for-review';
            if (translation.file !== `books/${book.id}/${translation.languageTag}/${translation.id}/book.html` ||
                (!legacyReview && (translation.approvalStatus !== 'owner-approved' || !translation.approvedAt)) ||
                translation.sourceEditionSha256 !== original.sha256 || !/^[a-f0-9]{64}$/.test(translation.sha256)) {
                throw new Error(`Unexpected translation: ${book.id}/${translation.languageTag}`);
            }
            const translatedBytes = read(translation.file);
            const translated = translatedBytes.toString('utf8');
            const originalHtml = read(original.file).toString('utf8');
            const provenance = JSON.parse(read(`provenance/${book.id}-${translation.languageTag}.json`));
            if (sha256(translatedBytes) !== translation.sha256 ||
                provenance.bookId !== book.id || provenance.editionId !== translation.id ||
                provenance.sourceSha256 !== translation.sha256 || provenance.sourceEditionSha256 !== original.sha256 ||
                provenance.reviewStatus !== translation.approvalStatus || provenance.sectionCount !== translation.chapters.length ||
                !translated.includes(`<html lang="${translation.languageTag}"`) ||
                !translated.includes(`<title>${translation.title}</title>`) || !translated.includes("default-src 'none'") ||
                /<script\b|\son\w+\s*=|<iframe\b|<object\b|<embed\b|<link\b/i.test(translated) ||
                JSON.stringify(sectionIds(translated)) !== JSON.stringify(original.chapters.map(item => item.id)) ||
                JSON.stringify(translation.chapters.map(item => item.id)) !== JSON.stringify(original.chapters.map(item => item.id)) ||
                skeleton(translated) !== skeleton(originalHtml)) {
                throw new Error(`Translation failed verification: ${book.id}/${translation.languageTag}`);
            }
        }
    }
    if (JSON.stringify([...actualTags].sort()) !== JSON.stringify([...availableTags].sort())) {
        throw new Error('Available languages must match published editions');
    }
    return { catalog, languages };
}
