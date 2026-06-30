const { app, BrowserWindow, ipcMain, dialog, Menu, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');
const { fileURLToPath, pathToFileURL } = require('url');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const { Readable } = require('stream');

protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { secure: true, supportFetchAPI: true, bypassCSP: true, corsEnabled: true, stream: true } }
]);

type BrowserWindowType = import('electron').BrowserWindow;
type IpcMainInvokeEvent = import('electron').IpcMainInvokeEvent;

const isDev = process.env.NODE_ENV === 'development';
let mainWindow: BrowserWindowType | null = null;

const cleanPath = (value: string) => {
  if (value.startsWith('media:')) {
    const p = value.replace(/^media:\/+/i, '');
    if (/^[a-zA-Z]:/.test(p)) return decodeURIComponent(p);
    return decodeURIComponent(p.startsWith('/') ? p : '/' + p);
  }
  if (value.startsWith('file:')) return fileURLToPath(value);
  return value;
};

const filterText = (value: string) => value.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "'\\''").replace(/%/g, '%%').replace(/\n/g, '\\n');

function createWindow() {
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); return; }
  const win: BrowserWindowType = new BrowserWindow({
    width: 1440, height: 920, minWidth: 1000, minHeight: 700, show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true, // Enabled webSecurity for security best practices!
      preload: path.join(__dirname, 'preload.js')
    }
  });
  mainWindow = win;
  win.once('ready-to-show', () => {
    console.log('[Electron] ready-to-show event fired');
    win.show();
  });
  
  win.webContents.on('did-start-navigation', (event: any, url: string) => {
    console.log('[Electron] did-start-navigation:', url);
  });
  win.webContents.on('did-finish-load', () => {
    console.log('[Electron] did-finish-load');
  });
  win.webContents.on('did-fail-load', (event: any, errorCode: number, errorDescription: string, validatedURL: string) => {
    console.error('[Electron] did-fail-load:', errorCode, errorDescription, validatedURL);
  });

  const target = pathToFileURL(path.join(__dirname, '../renderer/index.html')).toString();
  const loadTarget = () => {
    if (win.isDestroyed()) return;
    win.loadURL(target).catch((err) => {
      console.error('[Electron] loadURL catch error:', err);
      if (isDev && !win.isDestroyed()) {
        setTimeout(loadTarget, 500);
      }
    });
  };
  loadTarget();
  if (isDev) win.webContents.openDevTools();

  if (isDev) {
    let reloadTimeout: NodeJS.Timeout | null = null;
    const watcher = fs.watch(path.join(__dirname, '../renderer'), { recursive: true }, (eventType: string, filename: string | null) => {
      if (filename && (filename.endsWith('.js') || filename.endsWith('.css') || filename.endsWith('.html'))) {
        if (reloadTimeout) clearTimeout(reloadTimeout);
        reloadTimeout = setTimeout(() => {
          if (win.isDestroyed()) return;
          const htmlPath = path.join(__dirname, '../renderer/index.html');
          if (fs.existsSync(htmlPath) && fs.statSync(htmlPath).size > 0) {
            win.webContents.reloadIgnoringCache();
          }
        }, 200);
      }
    });
    win.on('closed', () => {
      if (reloadTimeout) clearTimeout(reloadTimeout);
      watcher.close();
    });
  }

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

// Cached encoder check to prevent slow process spawns
let cachedEncoder: string | null = null;
const availableEncoder = () => {
  if (cachedEncoder) return cachedEncoder;
  const probe = spawnSync(ffmpegInstaller.path, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  const list = `${probe.stdout || ''}${probe.stderr || ''}`;
  for (const encoder of ['h264_nvenc', 'h264_qsv', 'h264_amf']) {
    if (!list.includes(encoder)) continue;
    const test = spawnSync(ffmpegInstaller.path, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=s=16x16:d=0.05', '-frames:v', '1', '-c:v', encoder, '-f', 'null', '-'], { timeout: 5000 });
    if (test.status === 0) {
      cachedEncoder = encoder;
      return encoder;
    }
  }
  cachedEncoder = 'libx264';
  return 'libx264';
};

const hasAudio = (input: string) => {
  const probePath = require('@ffprobe-installer/ffprobe').path;
  const result = spawnSync(probePath, ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=index', '-of', 'csv=p=0', cleanPath(input)], { encoding: 'utf8' });
  return result.status === 0 && Boolean(result.stdout.trim());
};

interface ExportClip {
  id: string; type: 'video' | 'audio' | 'text' | 'image'; path: string; start: number; duration: number; offset: number;
  properties?: { text?: string; fontSize?: number; color?: string; x?: number; y?: number; scale?: number; opacity?: number; brightness?: number; contrast?: number; saturation?: number; transition?: string; transitionDuration?: number };
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

// Active export process tracking for cancellation
let activeExportProcess: any = null;

function runExportFfmpeg(args: string[], totalDuration: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const process = spawn(ffmpegInstaller.path, args, { windowsHide: true });
    activeExportProcess = process;
    let error = '';

    process.stderr.on('data', (chunk: Buffer) => {
      const output = chunk.toString();
      error = `${error}${output}`.slice(-12000);

      // Parse progress: e.g., time=00:00:07.80
      const timeMatch = output.match(/time=([0-9:.]+)/);
      if (timeMatch) {
        const timeStr = timeMatch[1];
        const parts = timeStr.split(':');
        let seconds = 0;
        if (parts.length === 3) {
          seconds = parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
        } else {
          seconds = parseFloat(timeStr);
        }
        const progress = Math.min(100, Math.round((seconds / totalDuration) * 100));
        mainWindow?.webContents.send('export-progress', { progress });
      }
    });

    process.once('error', (err: any) => {
      activeExportProcess = null;
      reject(err);
    });

    process.once('close', (code: number | null, signal: string | null) => {
      activeExportProcess = null;
      if (code === 0) {
        resolve();
      } else {
        const err: any = new Error(error || `FFmpeg exited with code ${code} (signal: ${signal})`);
        err.signal = signal;
        reject(err);
      }
    });
  });
}

function buildExportArgs(clips: ExportClip[], duration: number, width: number, height: number, fps: number, output: string) {
  const media = clips.filter(c => c.type === 'video' || c.type === 'audio' || c.type === 'image');
  const args: string[] = ['-y'];
  media.forEach(c => {
    if (c.type === 'image') {
      args.push('-stream_loop', '-1', '-i', cleanPath(c.path));
    } else {
      args.push('-ss', String(Math.max(0, c.offset)), '-t', String(c.duration), '-i', cleanPath(c.path));
    }
  });
  const filters: string[] = [`color=c=black:s=${width}x${height}:r=${fps}:d=${duration},setsar=1,format=rgba[base]`];
  let videoBase = 'base'; let videoCount = 0;
  media.forEach((clip, input) => {
    if (clip.type !== 'video' && clip.type !== 'image') return;
    const p = clip.properties ?? {};
    const transition = p.transition && p.transition !== 'none' ? Math.min(p.transitionDuration ?? 0.5, clip.duration / 2) : 0;
    const end = clip.start + clip.duration;
    const fade = transition ? `,fade=t=in:st=${clip.start}:d=${transition}:alpha=1,fade=t=out:st=${Math.max(clip.start, end - transition)}:d=${transition}:alpha=1` : '';
    const scale = p.scale ?? 1;
    const targetW = Math.max(2, Math.floor((width * scale) / 2) * 2);
    const targetH = Math.max(2, Math.floor((height * scale) / 2) * 2);
    const x = Math.round(p.x ?? 0);
    const y = Math.round(p.y ?? 0);
    const pts = clip.type === 'image' ? 'PTS-STARTPTS' : `PTS-STARTPTS+${clip.start}/TB`;
    filters.push(`[${input}:v]scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,setsar=1,eq=brightness=${p.brightness ?? 0}:contrast=${p.contrast ?? 1}:saturation=${p.saturation ?? 1},fps=${fps},format=rgba,setpts=${pts}${fade}[v${videoCount}]`);
    filters.push(`[${videoBase}][v${videoCount}]overlay=x='(main_w-overlay_w)/2+${x}':y='(main_h-overlay_h)/2+${y}':eof_action=pass:enable='between(t,${clip.start},${end})'[mix${videoCount}]`);
    videoBase = `mix${videoCount++}`;
  });
  clips.filter(c => c.type === 'text').forEach((clip, index) => {
    const p = clip.properties ?? {}; const out = `text${index}`;
    filters.push(`[${videoBase}]drawtext=text='${filterText(p.text || clip.path)}':fontcolor=${p.color || 'white'}:fontsize=${p.fontSize || 40}:x=${p.x ?? '(w-text_w)/2'}:y=${p.y ?? 'h-text_h-50'}:enable='between(t,${clip.start},${clip.start + clip.duration})'[${out}]`);
    videoBase = out;
  });
  filters.push(`[${videoBase}]format=yuv420p,setsar=1[vout]`);
  const audioLabels: string[] = [];
  media.forEach((clip, input) => {
    if (clip.type !== 'audio' && (clip.type !== 'video' || !hasAudio(clip.path))) return;
    const label = `a${audioLabels.length}`; const delay = Math.round(clip.start * 1000);
    const delays = Array(6).fill(delay).join('|');
    filters.push(`[${input}:a]atrim=0:${clip.duration},asetpts=PTS-STARTPTS,adelay=${delays}[${label}]`);
    audioLabels.push(`[${label}]`);
  });
  let audioMap: string;
  if (audioLabels.length) { filters.push(`${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=longest[aout]`); audioMap = '[aout]'; }
  else { filters.push(`anullsrc=channel_layout=stereo:sample_rate=48000,atrim=0:${duration}[aout]`); audioMap = '[aout]'; }
  const encoder = availableEncoder();
  args.push('-filter_complex', filters.join(';'), '-map', '[vout]', '-map', audioMap, '-c:v', encoder);
  if (encoder === 'libx264') args.push('-preset', 'veryfast', '-crf', '21');
  else if (encoder === 'h264_nvenc') args.push('-preset', 'p4', '-cq', '23');
  else args.push('-global_quality', '23');
  args.push('-pix_fmt', 'yuv420p', '-aspect', '16:9', '-c:a', 'aac', '-b:a', '192k', '-t', String(duration), '-movflags', '+faststart', output);
  return args;
}

const getMimeType = (filePath: string) => {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.mp4': return 'video/mp4';
    case '.webm': return 'video/webm';
    case '.ogg': return 'video/ogg';
    case '.mov': return 'video/quicktime';
    case '.mkv': return 'video/x-matroska';
    case '.avi': return 'video/x-msvideo';
    case '.mp3': return 'audio/mpeg';
    case '.wav': return 'audio/wav';
    case '.aac': return 'audio/aac';
    case '.m4a': return 'audio/x-m4a';
    case '.flac': return 'audio/flac';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.webp': return 'image/webp';
    default: return 'application/octet-stream';
  }
};

app.whenReady().then(async () => {

  // Use protocol.handle (modern Net-based protocol registration)
  protocol.handle('media', async (request: Request) => {
    let raw = request.url.slice('media://'.length);
    if (raw.startsWith('/')) {
      if (/^\/[a-zA-Z]:/.test(raw)) raw = raw.slice(1);
    }
    const filePath = decodeURIComponent(raw);
    console.log('[MediaProtocol] request.url:', request.url, '=> filePath:', filePath);

    try {
      const stats = await fs.promises.stat(filePath);
      const mimeType = getMimeType(filePath);
      const rangeHeader = request.headers.get('range');

      if (rangeHeader) {
        // Parse Range: bytes=start-end
        const parts = rangeHeader.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
        const chunkSize = (end - start) + 1;

        // Create stream for range
        const stream = fs.createReadStream(filePath, { start, end });
        return new Response(Readable.toWeb(stream) as any, {
          status: 206,
          statusText: 'Partial Content',
          headers: {
            'Content-Range': `bytes ${start}-${end}/${stats.size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(chunkSize),
            'Content-Type': mimeType,
          }
        });
      } else {
        const stream = fs.createReadStream(filePath);
        return new Response(Readable.toWeb(stream) as any, {
          status: 200,
          headers: {
            'Content-Length': String(stats.size),
            'Content-Type': mimeType,
          }
        });
      }
    } catch (err) {
      console.error('Custom protocol media error:', err);
      return new Response('File not found', { status: 404 });
    }
  });

  // Use async directory creation
  await fs.promises.mkdir(path.join(app.getPath('userData'), 'output'), { recursive: true });
  await fs.promises.mkdir(path.join(app.getPath('userData'), 'proxies'), { recursive: true });
  createWindow();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!mainWindow) createWindow(); });

ipcMain.handle('open-file-dialog', openMediaDialog);
ipcMain.handle('show-save-dialog', async (_event: IpcMainInvokeEvent, options: import('electron').SaveDialogOptions) => dialog.showSaveDialog(mainWindow!, options));
ipcMain.handle('cancel-export', () => {
  if (activeExportProcess) {
    try {
      activeExportProcess.kill('SIGKILL');
      activeExportProcess = null;
      return true;
    } catch (e) {
      console.error('Failed to cancel export:', e);
    }
  }
  return false;
});

ipcMain.handle('export-project', async (_event: IpcMainInvokeEvent, project: { clips: ExportClip[]; duration: number; width: number; height: number; fps: number }) => {
  if (!mainWindow) return { canceled: true };
  if (!project || !Array.isArray(project.clips) || typeof project.duration !== 'number') {
    throw new Error('Invalid export project data');
  }
  const save = await dialog.showSaveDialog(mainWindow, { title: 'Export MP4', defaultPath: 'video-export.mp4', filters: [{ name: 'MP4 Video', extensions: ['mp4'] }] });
  if (save.canceled || !save.filePath) return { canceled: true };
  try {
    await runExportFfmpeg(buildExportArgs(project.clips, project.duration, project.width, project.height, project.fps, save.filePath), project.duration);
    return { canceled: false, filePath: save.filePath, encoder: availableEncoder() };
  } catch (error: any) {
    if (error.message && error.message.includes('SIGKILL') || error.signal === 'SIGKILL' || (!activeExportProcess && error.message.includes('exited with code'))) {
      return { canceled: true };
    }
    throw error;
  }
});


ipcMain.handle('create-proxy', async (_event: IpcMainInvokeEvent, data: { path: string; clipId: string }) => {
  if (!data || typeof data.path !== 'string' || typeof data.clipId !== 'string') {
    throw new Error('Invalid create-proxy data');
  }
  const output = path.join(app.getPath('userData'), 'proxies', `${data.clipId}.mp4`);
  await runFfmpeg(['-y', '-i', cleanPath(data.path), '-vf', 'scale=-2:720', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-c:a', 'aac', '-b:a', '128k', output]);
  return { path: output };
});

ipcMain.handle('save-project', async (_event: IpcMainInvokeEvent, stateStr: string) => {
  if (!mainWindow) return { canceled: true };
  if (typeof stateStr !== 'string') {
    throw new Error('Invalid save-project data');
  }
  const save = await dialog.showSaveDialog(mainWindow, { title: 'Save Project', defaultPath: 'my-project.json', filters: [{ name: 'JSON File', extensions: ['json'] }] });
  if (save.canceled || !save.filePath) return { canceled: true };
  try {
    await fs.promises.writeFile(save.filePath, stateStr, 'utf-8');
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
    const data = await fs.promises.readFile(result.filePaths[0], 'utf-8');
    return { canceled: false, data };
  } catch (error) {
    return { canceled: false, error: String(error) };
  }
});

ipcMain.handle('get-metadata', async (_event: IpcMainInvokeEvent, filePath: string) => {
  if (typeof filePath !== 'string') {
    throw new Error('Invalid file path');
  }
  const probePath = require('@ffprobe-installer/ffprobe').path;
  const targetPath = cleanPath(filePath);
  return new Promise((resolve) => {
    const proc = spawn(probePath, [
      '-v', 'error',
      '-show_format', '-show_streams',
      '-of', 'json',
      targetPath
    ]);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk: any) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: any) => { stderr += chunk.toString(); });
    proc.once('close', (code: number | null) => {
      if (code === 0) {
        try {
          const data = JSON.parse(stdout);
          let duration = parseFloat(data.format?.duration);
          const videoStream = data.streams?.find((s: any) => s.codec_type === 'video');
          const audioStream = data.streams?.find((s: any) => s.codec_type === 'audio');
          if (isNaN(duration) || duration <= 0) {
            if (videoStream && videoStream.duration) duration = parseFloat(videoStream.duration);
            else if (audioStream && audioStream.duration) duration = parseFloat(audioStream.duration);
          }
          if (isNaN(duration) || duration <= 0) {
            const tagDur = data.format?.tags?.DURATION || data.format?.tags?.duration || videoStream?.tags?.DURATION || videoStream?.tags?.duration || audioStream?.tags?.DURATION || audioStream?.tags?.duration;
            if (tagDur) {
              const parts = String(tagDur).split(':');
              if (parts.length === 3) duration = parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
              else duration = parseFloat(tagDur);
            }
          }
          if (isNaN(duration) || duration <= 0) {
            const ffmpegRes = spawnSync(ffmpegInstaller.path, ['-i', targetPath], { encoding: 'utf8' });
            const m = `${ffmpegRes.stdout || ''}${ffmpegRes.stderr || ''}`.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
            if (m) duration = parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3]);
          }
          resolve({
            success: true,
            duration: (isNaN(duration) || duration <= 0) ? 10 : duration,
            width: videoStream?.width,
            height: videoStream?.height,
            codec: videoStream?.codec_name,
            audioCodec: audioStream?.codec_name
          });
        } catch (e) {
          resolve({ success: false, error: 'Failed to parse metadata: ' + String(e) });
        }
      } else {
        // Fallback using ffmpeg -i if ffprobe failed
        const ffmpegRes = spawnSync(ffmpegInstaller.path, ['-i', targetPath], { encoding: 'utf8' });
        const m = `${ffmpegRes.stdout || ''}${ffmpegRes.stderr || ''}`.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
        if (m) {
          const duration = parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3]);
          resolve({ success: true, duration });
        } else {
          resolve({ success: false, error: `FFprobe exited with code ${code}. Stderr: ${stderr}` });
        }
      }
    });
    proc.once('error', (err: Error) => {
      resolve({ success: false, error: err.message });
    });
  });
});

// Autosave IPC handlers
ipcMain.handle('save-autosave', async (_event: IpcMainInvokeEvent, stateStr: string) => {
  if (typeof stateStr !== 'string') {
    throw new Error('Invalid autosave payload');
  }
  const filePath = path.join(app.getPath('userData'), 'autosave.json');
  await fs.promises.writeFile(filePath, stateStr, 'utf-8');
  return { success: true };
});

ipcMain.handle('load-autosave', async () => {
  const filePath = path.join(app.getPath('userData'), 'autosave.json');
  try {
    const data = await fs.promises.readFile(filePath, 'utf-8');
    return { success: true, data };
  } catch (err) {
    return { success: false };
  }
});

ipcMain.handle('clear-autosave', async () => {
  const filePath = path.join(app.getPath('userData'), 'autosave.json');
  try {
    await fs.promises.unlink(filePath);
    return { success: true };
  } catch (err) {
    return { success: false };
  }
});
