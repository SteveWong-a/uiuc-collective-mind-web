import fs from 'fs';
import { JSDOM } from 'jsdom';

const lessonsHtml = fs.readFileSync('test/fixtures/cs128-lessons.html', 'utf8');
const gradebookHtml = fs.readFileSync('test/fixtures/cs128-gradebook.html', 'utf8');

const doc = new JSDOM(lessonsHtml).window.document;
// In lessons, the user said it's a "week by week table format"
const tables = doc.querySelectorAll('table');
console.log(`Lessons has ${tables.length} tables.`);
if (tables.length > 0) {
    const rows = tables[0].querySelectorAll('tr');
    console.log(`First table has ${rows.length} rows.`);
    for (let i = 0; i < Math.min(10, rows.length); i++) {
        const tds = rows[i].querySelectorAll('td');
        if (tds.length === 0) {
            console.log(`Row ${i}: Header row`);
            continue;
        }
        console.log(`Row ${i}:`);
        tds.forEach((td, j) => {
            console.log(`  TD ${j}: ${td.textContent.trim().replace(/\s+/g, ' ')}`);
            const a = td.querySelector('a');
            if (a) console.log(`    Link: ${a.href}`);
        });
    }
}

const gDoc = new JSDOM(gradebookHtml).window.document;
const gTables = gDoc.querySelectorAll('table');
console.log(`\nGradebook has ${gTables.length} tables.`);
if (gTables.length > 0) {
    const rows = gTables[0].querySelectorAll('tr');
    console.log(`First table has ${rows.length} rows.`);
    for (let i = 0; i < Math.min(10, rows.length); i++) {
        const tds = rows[i].querySelectorAll('td');
        if (tds.length === 0) continue;
        console.log(`Row ${i}:`);
        tds.forEach((td, j) => {
            console.log(`  TD ${j}: ${td.textContent.trim().replace(/\s+/g, ' ')}`);
        });
    }
}
