const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { version } = require('../package.json');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'src-tauri', 'target', 'release', 'SIPTrace.exe');
const output = path.join(root, 'release');
fs.mkdirSync(output, { recursive: true });
const fontLicenseOutput = path.join(output, 'licenses');
fs.mkdirSync(fontLicenseOutput, { recursive: true });
for (const filename of ['Inter-LICENSE.txt', 'OpenGost-LICENSE.txt']) {
  fs.copyFileSync(path.join(root, 'src', 'ui', 'theme', 'fonts', filename), path.join(fontLicenseOutput, filename));
}
fs.copyFileSync(path.join(root, 'src', 'ui', 'modules', 'schematic', 'SVG-SPINNERS-LICENSE.txt'), path.join(fontLicenseOutput, 'SVG-SPINNERS-LICENSE.txt'));
fs.copyFileSync(path.join(root, 'node_modules', '@tabler', 'icons-react', 'LICENSE'), path.join(fontLicenseOutput, 'TABLER-ICONS-LICENSE.txt'));
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

