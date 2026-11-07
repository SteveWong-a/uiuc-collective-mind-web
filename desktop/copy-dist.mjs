import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dist = path.join(__dirname, 'dist');

fs.mkdirSync(dist, { recursive: true });
fs.mkdirSync(path.join(dist, 'scripts'), { recursive: true });
fs.cpSync(path.join(root, 'lib'), path.join(dist, 'lib'), { recursive: true });
fs.cpSync(path.join(root, 'public'), path.join(dist, 'public'), { recursive: true });
fs.copyFileSync(path.join(root, 'server.mjs'), path.join(dist, 'server.mjs'));
fs.copyFileSync(path.join(root, 'scripts', 'mcp-server.mjs'), path.join(dist, 'scripts', 'mcp-server.mjs'));
console.log('Successfully copied assets to dist/');
