'use strict';
// Ad-hoc code-sign the packaged app with a STABLE bundle identifier. Without
// this the app ships with Electron's generic linker signature (Identifier=
// Electron), and macOS keys folder/automation permissions to that unstable
// identity — which is what makes it re-prompt. A stable identity means the
// user grants access once and macOS remembers it across launches.
const path = require('path');
const { execFileSync } = require('child_process');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  execFileSync('codesign', [
    '--force', '--deep', '--sign', '-',
    '--identifier', 'com.breeze.cleaner',
    appPath,
  ], { stdio: 'inherit' });
  console.log(`  • ad-hoc signed ${appName}.app with stable identity com.breeze.cleaner`);
};
