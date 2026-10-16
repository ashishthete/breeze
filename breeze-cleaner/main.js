'use strict';
const { app, BrowserWindow, ipcMain, shell, nativeImage, Tray, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const scanner = require('./lib/scanner');
const stats = require('./lib/stats');
const { assertCleanable, assertUninstallable, assertPhotoRemovable } = require('./lib/safety');

let win;
function createWindow() {
  if (win && !win.isDestroyed()) { win.show(); win.focus(); return; }
  win = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 720,
    minHeight: 520,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#14161b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

// ---- Menu-bar widget (Tray + popover) ----
let tray, popover;
function createPopover() {
  popover = new BrowserWindow({
    width: 340,
    height: 532,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  popover.loadFile(path.join(__dirname, 'renderer', 'tray.html'));
  popover.on('blur', () => { if (popover && !popover.webContents.isDevToolsOpened()) popover.hide(); });
}

function togglePopover() {
  if (!popover || popover.isDestroyed()) createPopover();
  if (popover.isVisible()) { popover.hide(); return; }
  const tb = tray.getBounds();
  const { width: pw } = popover.getBounds();
  const disp = screen.getDisplayNearestPoint({ x: tb.x, y: tb.y });
  let x = Math.round(tb.x + tb.width / 2 - pw / 2);
  x = Math.max(disp.workArea.x + 6, Math.min(x, disp.workArea.x + disp.workArea.width - pw - 6));
  const y = Math.round(tb.y + tb.height + 4);
  popover.setPosition(x, y, false);
  popover.show();
  popover.focus();
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'build', 'trayTemplate.png'));
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('Breeze Cleaner');
  tray.on('click', togglePopover);
  tray.on('right-click', togglePopover);
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
// Keep running in the menu bar after the main window is closed (macOS).
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ---- IPC: scanning ----
ipcMain.handle('breeze:scan', async (_e, category, opts) => {
  switch (category) {
    case 'junk': return scanner.scanJunk();
    case 'large': return scanner.scanLarge();
    case 'dupes': return scanner.scanDuplicates();
    case 'privacy': return scanner.scanPrivacy();
    case 'apps': return scanner.scanApps();
    case 'photos': return scanner.scanPhotos(opts || {});
    default: throw new Error('Unknown category: ' + category);
  }
});

// Thumbnail for a scanned image item. Only resolves ids from this session's
// scans, and only reads image files — never arbitrary paths.
const IMG_RE = /\.(jpe?g|png|heic|heif|gif|tiff?|bmp|webp)$/i;
ipcMain.handle('breeze:thumb', async (_e, id) => {
  const p = scanner.resolveId(id);
  if (!p || !IMG_RE.test(p)) return null;
  try {
    const img = await nativeImage.createThumbnailFromPath(p, { width: 160, height: 160 });
    return img.isEmpty() ? null : img.toDataURL();
  } catch { return null; }
});

ipcMain.handle('breeze:disk', () => scanner.diskUsage());
ipcMain.handle('breeze:memory', () => scanner.memoryInfo());
ipcMain.handle('breeze:loginItems', () => scanner.loginItems());
ipcMain.handle('breeze:stats', () => stats.liveStats());
ipcMain.handle('breeze:openMain', (e) => {
  createWindow();
  if (popover && !popover.isDestroyed()) popover.hide();
});

// ---- IPC: cleaning (the only destructive path) ----
ipcMain.handle('breeze:clean', async (_e, { ids, opts }) => {
  const dryRun = !!(opts && opts.dryRun);
  const gate = opts && opts.mode === 'apps' ? assertUninstallable
    : opts && opts.mode === 'photos' ? assertPhotoRemovable
    : assertCleanable;
  const result = { trashed: [], freed: 0, errors: [], dryRun };
  for (const id of ids || []) {
    const resolved = scanner.resolveId(id);
    if (!resolved) { result.errors.push({ id, error: 'Unknown item (not from a scan)' }); continue; }
    let safePath;
    try {
      safePath = gate(resolved); // throws unless inside the matching allowlist
    } catch (err) {
      result.errors.push({ path: resolved, error: err.message });
      continue;
    }
    let size = 0;
    try { size = dirSize(safePath); } catch {}
    if (dryRun) {
      result.trashed.push({ id, path: safePath, size });
      result.freed += size;
      continue;
    }
    try {
      await shell.trashItem(safePath); // reversible: moves to macOS Trash
      result.trashed.push({ id, path: safePath, size });
      result.freed += size;
    } catch (err) {
      result.errors.push({ id, path: safePath, error: err.message });
    }
  }
  return result;
});

function dirSize(p) {
  const st = fs.lstatSync(p);
  if (!st.isDirectory()) return st.size;
  let total = 0;
  const stack = [p];
  while (stack.length) {
    const d = stack.pop();
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      let s;
      try { s = fs.lstatSync(full); } catch { continue; }
      if (s.isSymbolicLink()) continue;
      if (s.isDirectory()) stack.push(full);
      else total += s.size;
    }
  }
  return total;
}
