import fs from 'fs';
import { JSDOM } from 'jsdom';

const html = fs.readFileSync('test/fixtures/smartphysics-assignments.html', 'utf8');
const dom = new JSDOM(html);
const document = dom.window.document;

const assignments = [];
const units = document.querySelectorAll('.accordion-body.unit');
for (const unit of units) {
    const unitTitle = unit.querySelector('h3 button .UnitTitle')?.textContent?.trim();
    const items = unit.querySelectorAll('.unit-assignment');
    for (const item of items) {
        const id = item.id;
        const typeMatch = item.className.match(/(\w+)-Type/);
        const type = typeMatch ? typeMatch[1] : 'Unknown';
        
        const a = item.querySelector('.unit-assignment-title a');
        const title = a ? a.textContent.trim() : '';
        const href = a ? a.href : '';
        
        const duedateEl = item.querySelector('.duedate');
        let duedate = '';
        let dueStr = '';
        if (duedateEl) {
            dueStr = duedateEl.textContent.trim().replace(/\s+/g, ' ');
            const m = dueStr.match(/Due:\s*(.*?)(?:\s*for \d+% credit)?$/i);
            if (m) duedate = m[1].trim();
        }

        const bar = item.querySelector('.scorebars .bar');
        const score = bar ? bar.getAttribute('aria-valuenow') : null;

        assignments.push({ id, unitTitle, title, type, duedate, score, href });
    }
}

console.log(JSON.stringify(assignments.slice(0, 10), null, 2));
console.log(`Total assignments: ${assignments.length}`);
