const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { version } = require('../package.json');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'src-tauri', 'target', 'release', 'SIPTrace.exe');
const output = path.join(root, 'release');
fs.mkdirSync(output, { recursive: true });
for (const filename of [`SIPTrace-${version}.exe`, 'SIPTrace.exe']) {
  const target = path.join(output, filename);
  try {
    fs.copyFileSync(source, target);
  } catch (error) {
    if (filename === 'SIPTrace.exe' && ['EBUSY', 'EPERM', 'EACCES'].includes(error.code)) {
      process.stdout.write(`Running SIPTrace.exe is locked; the new version is available as SIPTrace-${version}.exe.\n`);
      continue;
    }
    throw error;
  }
  const hash = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
  fs.writeFileSync(`${target}.sha256`, `${hash}  ${filename}\n`);
  process.stdout.write(`${target}\nSHA256 ${hash}\n`);
}
