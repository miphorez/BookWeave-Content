import { verifySource } from './content-source.mjs';

const { catalog } = verifySource();
console.log(`PASS: ${catalog.books.flatMap(book => book.editions).length} edition hashes, original source texts, translation structure, and language status.`);
