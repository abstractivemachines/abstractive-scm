const fs = require('node:fs');
const path = require('node:path');

const source = path.join(__dirname, '..', 'node_modules', 'monaco-editor', 'min', 'vs');
const target = path.join(__dirname, '..', 'media', 'monaco', 'vs');

if (!fs.existsSync(source)) {
  throw new Error(`Monaco assets not found at ${source}. Run npm install first.`);
}

fs.rmSync(target, { force: true, recursive: true });
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.cpSync(source, target, { recursive: true });
