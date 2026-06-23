const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');
const { fileURLToPath } = require('url');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');

type BrowserWindowType = import('electron').BrowserWindow;
type IpcMainInvokeEvent = import('electron').IpcMainInvokeEvent;

const isDev = process.env.NODE_ENV === 'development';
let mainWindow: BrowserWindowType | null = null;

const cleanPath = (value: string) => value.startsWith('file:') ? fileURLToPath(value) : value;
const filterText = (value: string) => value.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'").replace(/\n/g, '\\n');

function createWindow() {
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); return; }
  const win: BrowserWindowType = new BrowserWindow({
    width: 1440, height: 920, minWidth: 1000, minHeight: 700, show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  mainWindow = win;
  win.once('ready-to-show', () => win.show());
  const target = isDev ? 'http://localhost:5173' : `file://${path.join(__dirname, '../renderer/index.html')}`;
  void win.loadURL(target);
  if (isDev) win.webContents.openDevTools();
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });

  const template: import('electron').MenuItemConstructorOptions[] = [
    { label: 'File', submenu: [
      { label: 'Open Media', accelerator: 'CmdOrCtrl+O', click: async () => { const file = await openMediaDialog(); if (file) mainWindow?.webContents.send('open-media', file); } },
      { label: 'New Project', accelerator: 'CmdOrCtrl+N', click: () => mainWindow?.webContents.send('new-project') },
      { type: 'separator' },
      { label: 'Export Video', accelerator: 'CmdOrCtrl+E', click: () => mainWindow?.webContents.send('export-video') },
      { type: 'separator' }, { role: 'quit' }
    ] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'delete' }] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
    { label: 'Help', submenu: [{ label: 'About Video Editor', click: () => void dialog.showMessageBox({ title: 'About', message: 'Video Editor 1.0', detail: 'Local multi-track editor powered by Electron and FFmpeg.' }) }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function openMediaDialog(): Promise<string | null> {
  const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Media', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'mp3', 'wav', 'aac', 'm4a', 'flac', 'jpg', 'jpeg', 'png', 'webp', 'gif'] }] });
  return result.canceled ? null : result.filePaths[0];
}

const availableEncoder = () => {
  const probe = spawnSync(ffmpegInstaller.path, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  const list = `${probe.stdout || ''}${probe.stderr || ''}`;
  for (const encoder of ['h264_nvenc', 'h264_qsv', 'h264_amf']) {
    if (!list.includes(encoder)) continue;
    const test = spawnSync(ffmpegInstaller.path, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=s=16x16:d=0.05', '-frames:v', '1', '-c:v', encoder, '-f', 'null', '-'], { timeout: 5000 });
    if (test.status === 0) return encoder;
  }
  return 'libx264';
};

const hasAudio = (input: string) => {
  const probePath = require('@ffprobe-installer/ffprobe').path;
  const result = spawnSync(probePath, ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=index', '-of', 'csv=p=0', cleanPath(input)], { encoding: 'utf8' });
  return result.status === 0 && Boolean(result.stdout.trim());
};

interface ExportClip {
  id: string; type: 'video' | 'audio' | 'text' | 'image'; path: string; start: number; duration: number; offset: number;
  properties?: { text?: string; fontSize?: number; color?: string; x?: number; y?: number; opacity?: number; brightness?: number; contrast?: number; saturation?: number; transition?: string; transitionDuration?: number };
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const process = spawn(ffmpegInstaller.path, args, { windowsHide: true });
    let error = '';
    process.stderr.on('data', (chunk: Buffer) => { error = `${error}${chunk.toString()}`.slice(-12000); });
    process.once('error', reject);
    process.once('close', (code: number) => code === 0 ? resolve() : reject(new Error(error || `FFmpeg exited with code ${code}`)));
  });
}

function buildExportArgs(clips: ExportClip[], duration: number, width: number, height: number, fps: number, output: string) {
  const media = clips.filter(c => c.type === 'video' || c.type === 'audio' || c.type === 'image');
  const args: string[] = ['-y'];
  media.forEach(c => {
    if (c.type === 'image') {
      args.push('-stream_loop', '-1', '-t', String(c.duration), '-i', cleanPath(c.path));
    } else {
      args.push('-ss', String(Math.max(0, c.offset)), '-t', String(c.duration), '-i', cleanPath(c.path));
    }
  });
  const filters: string[] = [`color=c=black:s=${width}x${height}:r=${fps}:d=${duration}[base]`];
  let videoBase = 'base'; let videoCount = 0;
  media.forEach((clip, input) => {
    if (clip.type !== 'video' && clip.type !== 'image') return;
    const p = clip.properties ?? {};
    const transition = p.transition && p.transition !== 'none' ? Math.min(p.transitionDuration ?? 0.5, clip.duration / 2) : 0;
    const end = clip.start + clip.duration;
    const fade = transition ? `,fade=t=in:st=${clip.start}:d=${transition}:alpha=1,fade=t=out:st=${Math.max(clip.start, end - transition)}:d=${transition}:alpha=1` : '';
    filters.push(`[${input}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,eq=brightness=${p.brightness ?? 0}:contrast=${p.contrast ?? 1}:saturation=${p.saturation ?? 1},format=rgba,setpts=PTS-STARTPTS+${clip.start}/TB${fade}[v${videoCount}]`);
    filters.push(`[${videoBase}][v${videoCount}]overlay=eof_action=pass:enable='between(t,${clip.start},${end})'[mix${videoCount}]`);
    videoBase = `mix${videoCount++}`;
  });
  clips.filter(c => c.type === 'text').forEach((clip, index) => {
    const p = clip.properties ?? {}; const out = `text${index}`;
    filters.push(`[${videoBase}]drawtext=text='${filterText(p.text || clip.path)}':fontcolor=${p.color || 'white'}:fontsize=${p.fontSize || 40}:x=${p.x ?? '(w-text_w)/2'}:y=${p.y ?? 'h-text_h-50'}:enable='between(t,${clip.start},${clip.start + clip.duration})'[${out}]`);
    videoBase = out;
  });
  const audioLabels: string[] = [];
  media.forEach((clip, input) => {
    if (clip.type !== 'audio' && (clip.type !== 'video' || !hasAudio(clip.path))) return;
    const label = `a${audioLabels.length}`; const delay = Math.round(clip.start * 1000);
    filters.push(`[${input}:a]atrim=0:${clip.duration},asetpts=PTS-STARTPTS,adelay=${delay}|${delay}[${label}]`);
    audioLabels.push(`[${label}]`);
  });
  let audioMap: string;
  if (audioLabels.length) { filters.push(`${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=longest[aout]`); audioMap = '[aout]'; }
  else { filters.push(`anullsrc=channel_layout=stereo:sample_rate=48000,atrim=0:${duration}[aout]`); audioMap = '[aout]'; }
  const encoder = availableEncoder();
  args.push('-filter_complex', filters.join(';'), '-map', `[${videoBase}]`, '-map', audioMap, '-c:v', encoder);
  if (encoder === 'libx264') args.push('-preset', 'veryfast', '-crf', '21');
  else if (encoder === 'h264_nvenc') args.push('-preset', 'p4', '-cq', '23');
  else args.push('-global_quality', '23');
  args.push('-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-t', String(duration), '-movflags', '+faststart', output);
  return args;
}

app.whenReady().then(() => {
  fs.mkdirSync(path.join(app.getPath('userData'), 'output'), { recursive: true });
  fs.mkdirSync(path.join(app.getPath('userData'), 'proxies'), { recursive: true });
  createWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!mainWindow) createWindow(); });

ipcMain.handle('open-file-dialog', openMediaDialog);
ipcMain.handle('show-save-dialog', async (_event: IpcMainInvokeEvent, options: import('electron').SaveDialogOptions) => dialog.showSaveDialog(mainWindow!, options));
ipcMain.handle('export-project', async (_event: IpcMainInvokeEvent, project: { clips: ExportClip[]; duration: number; width: number; height: number; fps: number }) => {
  if (!mainWindow) return { canceled: true };
  const save = await dialog.showSaveDialog(mainWindow, { title: 'Export MP4', defaultPath: 'video-export.mp4', filters: [{ name: 'MP4 Video', extensions: ['mp4'] }] });
  if (save.canceled || !save.filePath) return { canceled: true };
  await runFfmpeg(buildExportArgs(project.clips, project.duration, project.width, project.height, project.fps, save.filePath));
  return { canceled: false, filePath: save.filePath, encoder: availableEncoder() };
});
ipcMain.handle('create-proxy', async (_event: IpcMainInvokeEvent, data: { path: string; clipId: string }) => {
  const output = path.join(app.getPath('userData'), 'proxies', `${data.clipId}.mp4`);
  await runFfmpeg(['-y', '-i', cleanPath(data.path), '-vf', 'scale=-2:720', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-c:a', 'aac', '-b:a', '128k', output]);
  return { path: output };
});

ipcMain.handle('save-project', async (_event: IpcMainInvokeEvent, stateStr: string) => {
  if (!mainWindow) return { canceled: true };
  const save = await dialog.showSaveDialog(mainWindow, { title: 'Save Project', defaultPath: 'my-project.json', filters: [{ name: 'JSON File', extensions: ['json'] }] });
  if (save.canceled || !save.filePath) return { canceled: true };
  try {
    fs.writeFileSync(save.filePath, stateStr, 'utf-8');
    return { canceled: false, filePath: save.filePath };
  } catch (error) {
    return { canceled: false, error: String(error) };
  }
});

ipcMain.handle('load-project', async () => {
  if (!mainWindow) return { canceled: true };
  const result = await dialog.showOpenDialog(mainWindow, { title: 'Open Project', properties: ['openFile'], filters: [{ name: 'JSON File', extensions: ['json'] }] });
  if (result.canceled || !result.filePaths.length) return { canceled: true };
  try {
    const data = fs.readFileSync(result.filePaths[0], 'utf-8');
    return { canceled: false, data };
  } catch (error) {
    return { canceled: false, error: String(error) };
  }
});
