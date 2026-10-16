'use strict';
// Safety layer: defines which filesystem roots Breeze is ever allowed to touch,
// and guarantees that cleaning only ever happens inside them.
const os = require('os');
const path = require('path');
const fs = require('fs');

const HOME = os.homedir();
const h = (...p) => path.join(HOME, ...p);

// Roots that may be scanned and cleaned. A path is cleanable only if it lives
// strictly INSIDE one of these (deeper than the root itself), never equal to it.
// Everything here is cache / log / derived / downloaded data that macOS or apps
// regenerate, plus user download folders where the user hand-picks files.
const CLEANABLE_ROOTS = [
  h('Library', 'Caches'),
  h('Library', 'Logs'),
  h('Library', 'Developer', 'Xcode', 'DerivedData'),
  h('Library', 'Developer', 'Xcode', 'iOS DeviceSupport'),
  h('Library', 'Developer', 'CoreSimulator', 'Caches'),
  h('.npm', '_cacache'),
  h('.cache'),
  h('Library', 'pnpm', 'store'),
  h('Downloads'),
  h('Desktop'),
  h('Movies'),
];

// Paths that must NEVER be trashed even if they sit under a cleanable root.
const PROTECTED_EXACT = new Set(CLEANABLE_ROOTS.map(p => path.resolve(p)));

// Never descend into or trash anything matching these segment names.
const PROTECTED_NAMES = new Set(['.git', '.ssh', '.gnupg', 'Keychains']);

function norm(p) {
  return path.resolve(p);
}

function isInsideRoot(target) {
  const t = norm(target);
  return CLEANABLE_ROOTS.some(root => {
    const r = norm(root);
    return t === r ? false : t.startsWith(r + path.sep);
  });
}

// The single gate every deletion must pass.
function assertCleanable(target) {
  const t = norm(target);
  if (PROTECTED_EXACT.has(t)) throw new Error('Refusing to remove a protected root: ' + t);
  if (t === norm(HOME) || t === '/' || t.split(path.sep).length < 3) {
    throw new Error('Refusing to remove a top-level path: ' + t);
  }
  for (const seg of t.split(path.sep)) {
    if (PROTECTED_NAMES.has(seg)) throw new Error('Refusing to touch protected data: ' + t);
  }
  if (!isInsideRoot(t)) throw new Error('Path is outside the cleanable allowlist: ' + t);
  if (!fs.existsSync(t)) throw new Error('Path no longer exists: ' + t);
  // Never follow a symlink out of the sandbox.
  const lst = fs.lstatSync(t);
  if (lst.isSymbolicLink()) throw new Error('Refusing to remove a symlink: ' + t);
  return t;
}

// --- App uninstall gate (separate, equally strict) ---
// A real uninstaller must move the .app bundle and its user-library leftovers
// to the Trash. These paths live OUTSIDE the cleanable roots above, so they get
// their own explicit allowlist rather than widening the cache allowlist.

// Directories a .app bundle may sit directly inside (the bundle itself, nothing
// nested deeper, is removable).
const APP_DIRS = [path.resolve('/Applications'), h('Applications')].map(norm0);

// User-library folders where an app's leftover support files live. Only paths
// strictly inside one of these qualify.
const LEFTOVER_ROOTS = [
  h('Library', 'Application Support'),
  h('Library', 'Caches'),
  h('Library', 'Preferences'),
  h('Library', 'Logs'),
  h('Library', 'Saved Application State'),
  h('Library', 'Containers'),
  h('Library', 'HTTPStorages'),
  h('Library', 'Group Containers'),
  h('Library', 'WebKit'),
].map(norm0);

// Core Apple apps that ship with macOS and must never be trashed.
const PROTECTED_APPS = new Set([
  'Safari', 'Mail', 'Messages', 'FaceTime', 'Photos', 'Music', 'Podcasts', 'TV',
  'Maps', 'Calendar', 'Contacts', 'Reminders', 'Notes', 'News', 'Stocks', 'Home',
  'FindMy', 'Find My', 'App Store', 'System Settings', 'System Preferences',
  'Preview', 'QuickTime Player', 'TextEdit', 'Calculator', 'Dictionary',
  'Photo Booth', 'Automator', 'Font Book', 'Image Capture', 'Launchpad',
  'Mission Control', 'Siri', 'Books', 'Freeform', 'Shortcuts', 'Time Machine',
  'VoiceMemos', 'Voice Memos', 'Utilities', 'Finder',
]);

function norm0(p) { return path.resolve(p); }

function assertUninstallable(target) {
  const t = norm(target);
  if (t === norm(HOME) || t === '/' || t.split(path.sep).length < 3) {
    throw new Error('Refusing to remove a top-level path: ' + t);
  }
  for (const seg of t.split(path.sep)) {
    if (PROTECTED_NAMES.has(seg)) throw new Error('Refusing to touch protected data: ' + t);
  }
  const parent = path.dirname(t);
  const isApp = t.endsWith('.app') && APP_DIRS.includes(parent);
  if (isApp) {
    const appName = path.basename(t).replace(/\.app$/, '');
    if (PROTECTED_APPS.has(appName)) throw new Error('Refusing to remove a core system app: ' + appName);
  } else {
    const insideLeftover = LEFTOVER_ROOTS.some(r => t.startsWith(r + path.sep) && t !== r);
    if (!insideLeftover) throw new Error('Path is outside the uninstall allowlist: ' + t);
  }
  if (!fs.existsSync(t)) throw new Error('Path no longer exists: ' + t);
  const lst = fs.lstatSync(t);
  if (lst.isSymbolicLink()) throw new Error('Refusing to remove a symlink: ' + t);
  return t;
}

// --- Photo removal gate (separate, equally strict) ---
// Photos live in ~/Pictures, ~/Desktop, ~/Downloads, ~/Documents — outside the
// cache allowlist — so removing a similar/duplicate photo or a screenshot gets
// its own gate. Only loose image FILES qualify; the managed Photos library
// package is never touched.
const PHOTO_ROOTS = [
  h('Pictures'), h('Desktop'), h('Downloads'), h('Documents'), h('Movies'),
].map(norm0);

const IMAGE_EXT = new Set([
  '.jpg', '.jpeg', '.png', '.heic', '.heif', '.gif', '.tiff', '.tif', '.bmp', '.webp',
]);

function assertPhotoRemovable(target) {
  const t = norm(target);
  if (t.split(path.sep).length < 3) throw new Error('Refusing to remove a top-level path: ' + t);
  for (const seg of t.split(path.sep)) {
    if (PROTECTED_NAMES.has(seg)) throw new Error('Refusing to touch protected data: ' + t);
    // Never reach inside a managed library package (Photos, Photo Booth, etc.).
    if (seg.endsWith('.photoslibrary') || seg.endsWith('.photolibrary') || seg.endsWith('.migratedphotolibrary')) {
      throw new Error('Refusing to touch the managed Photos library: ' + t);
    }
  }
  const ext = path.extname(t).toLowerCase();
  if (!IMAGE_EXT.has(ext)) throw new Error('Not an image file: ' + t);
  const insidePhotoRoot = PHOTO_ROOTS.some(r => t.startsWith(r + path.sep) && t !== r);
  if (!insidePhotoRoot) throw new Error('Path is outside the photo allowlist: ' + t);
  if (!fs.existsSync(t)) throw new Error('Path no longer exists: ' + t);
  const lst = fs.lstatSync(t);
  if (lst.isSymbolicLink()) throw new Error('Refusing to remove a symlink: ' + t);
  if (lst.isDirectory()) throw new Error('Refusing to remove a directory as a photo: ' + t);
  return t;
}

module.exports = {
  HOME, CLEANABLE_ROOTS, isInsideRoot,
  assertCleanable, assertUninstallable, assertPhotoRemovable,
  PHOTO_ROOTS, IMAGE_EXT,
};
