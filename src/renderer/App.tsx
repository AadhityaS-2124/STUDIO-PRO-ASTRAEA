import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTimelineStore, Clip, TransitionType } from './stores/timelineStore';
import { useThemeStore } from './stores/themeStore';
import Timeline, { TimelineHandle } from './components/Timeline';
import VideoPlayer, { VideoPlayerHandle } from './components/VideoPlayer';
import Toolbar from './components/Toolbar';
import ControlBar from './components/ControlBar';
import { parseSRT } from './utils/srtParser';
import './App.css';

interface ElectronAPI {
  receive: (channel: string, func: (...args: unknown[]) => void) => (() => void) | undefined;
  invoke: (channel: string, data?: unknown) => Promise<unknown>;
}

declare global { interface Window { api?: ElectronAPI } }

const fileUrl = (path: string) => path.startsWith('file:') || path.startsWith('http')
  ? path
  : `file:///${encodeURI(path.replace(/\\/g, '/'))}`;

const getMediaDuration = (url: string, audio: boolean): Promise<number> => new Promise((resolve, reject) => {
  const media = document.createElement(audio ? 'audio' : 'video');
  media.preload = 'metadata';
  media.onloadedmetadata = () => resolve(media.duration);
  media.onerror = () => reject(new Error('Unable to read media metadata'));
  media.src = url;
});

export default function App() {
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [exportStatus, setExportStatus] = useState('');
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const currentTimeRef = useRef(0);
  const lastFrameRef = useRef(performance.now());
  const rafRef = useRef<number | undefined>(undefined);
  const appRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<TimelineHandle>(null);
  const playerRef = useRef<VideoPlayerHandle>(null);

  const state = useTimelineStore();
  const { mode, toggleTheme } = useThemeStore();
  const selectedClip = state.clips.find(c => c.id === state.selectedClipId) ?? null;

  useLayoutEffect(() => document.body.setAttribute('data-theme', mode), [mode]);

  const seek = (time: number) => {
    const bounded = Math.max(0, Math.min(time, state.duration));
    currentTimeRef.current = bounded;
    setCurrentTime(bounded);
    timelineRef.current?.updatePlayhead(bounded);
    playerRef.current?.seekTo(bounded);
  };

  useEffect(() => {
    if (!state.isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    lastFrameRef.current = performance.now();
    const frame = (now: number) => {
      const delta = Math.min(0.1, (now - lastFrameRef.current) / 1000);
      lastFrameRef.current = now;
      let next = currentTimeRef.current + delta;
      if (state.loopRegion.active && next >= state.loopRegion.end) next = state.loopRegion.start;
      else if (next >= state.duration) {
        if (state.isLooping) next = 0;
        else { next = state.duration; state.setIsPlaying(false); }
      }
      currentTimeRef.current = next;
      setCurrentTime(next);
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [state.isPlaying, state.isLooping, state.duration, state.loopRegion.active, state.loopRegion.start, state.loopRegion.end]);

  const importPath = async (path: string) => {
    const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(path);
    const audio = /\.(mp3|wav|aac|m4a|flac|ogg)$/i.test(path);
    const type = isImage ? 'image' : (audio ? 'audio' : 'video');
    const track = state.tracks.find(t => t.type === type);
    if (!track) return;
    const url = fileUrl(path);
    const id = state.addClip({
      trackId: track.id, type, start: currentTimeRef.current, duration: isImage ? 5 : 10, offset: 0,
      path: url, name: decodeURIComponent(path.split(/[/\\]/).pop() || 'Media'),
      properties: { brightness: 0, contrast: 1, saturation: 1, opacity: 1, transition: 'none', transitionDuration: 0.5, keyframes: [] }
    });
    state.setSelectedClip(id);
    if (!isImage) {
      try { state.updateClip(id, { duration: await getMediaDuration(url, audio) }); } catch (error) { console.error(error); }
    }
  };

  const addMedia = async (providedPath?: string) => {
    if (providedPath) return importPath(providedPath);
    if (window.api) {
      const path = await window.api.invoke('open-file-dialog');
      if (typeof path === 'string') await importPath(path);
      return;
    }
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'video/*,audio/*,image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const isImage = file.type.startsWith('image');
      const audio = file.type.startsWith('audio');
      const type = isImage ? 'image' : (audio ? 'audio' : 'video');
      const track = state.tracks.find(t => t.type === type);
      if (!track) return;
      const url = URL.createObjectURL(file);
      const id = state.addClip({ trackId: track.id, type, start: currentTimeRef.current, duration: isImage ? 5 : 10, offset: 0, path: url, name: file.name });
      state.setSelectedClip(id);
      if (!isImage) {
        try { state.updateClip(id, { duration: await getMediaDuration(url, audio) }); } catch { /* retain default */ }
      }
    };
    input.click();
  };

  const addText = () => {
    const track = state.tracks.find(t => t.type === 'text');
    if (!track) return;
    const id = state.addClip({ trackId: track.id, type: 'text', start: currentTimeRef.current, duration: 5, offset: 0, path: 'New Text', name: 'Text Overlay', properties: { text: 'New Text', fontSize: 40, color: '#ffffff', x: 50, y: 50, opacity: 1, transition: 'fade', transitionDuration: 0.4, keyframes: [] } });
    state.setSelectedClip(id);
  };

  const selectedOrUnderPlayhead = () => selectedClip ?? state.clips.find(c => currentTimeRef.current >= c.start && currentTimeRef.current < c.start + c.duration) ?? null;
  const split = () => { const clip = selectedOrUnderPlayhead(); if (clip) state.splitClip(clip.id, currentTimeRef.current); };
  const remove = () => { const clip = selectedOrUnderPlayhead(); if (clip) state.removeClip(clip.id); };
  const duplicate = () => { const clip = selectedOrUnderPlayhead(); if (clip) state.duplicateClip(clip.id); };
  const skipForward = () => seek(currentTimeRef.current + state.skipDuration);
  const skipBackward = () => seek(currentTimeRef.current - state.skipDuration);

  const importSrt = () => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.srt';
    input.onchange = async () => {
      const file = input.files?.[0]; const track = state.tracks.find(t => t.type === 'text');
      if (file && track) parseSRT(await file.text(), track.id).forEach(state.addClip);
    };
    input.click();
  };

  const exportProject = async () => {
    if (!window.api) { setExportStatus('MP4 export is available in the Electron app.'); return; }
    const latest = useTimelineStore.getState();
    setExportStatus('Preparing export…');
    try {
      const result = await window.api.invoke('export-project', { clips: latest.clips, duration: latest.duration, width: 1280, height: 720, fps: 30 });
      if (result && typeof result === 'object' && 'canceled' in result && (result as { canceled: boolean }).canceled) setExportStatus('Export canceled.');
      else setExportStatus(`Export complete: ${(result as { filePath?: string }).filePath ?? ''}`);
    } catch (error) { setExportStatus(`Export failed: ${error instanceof Error ? error.message : String(error)}`); }
  };

  const saveProject = async () => {
    if (!window.api) { setExportStatus('Project saving requires the Electron app.'); return; }
    const latest = useTimelineStore.getState();
    try {
      const stateStr = JSON.stringify({ clips: latest.clips, tracks: latest.tracks, duration: latest.duration }, null, 2);
      const result = await window.api.invoke('save-project', stateStr) as { canceled: boolean, filePath?: string, error?: string };
      if (!result.canceled && result.filePath) setExportStatus(`Project saved to ${result.filePath}`);
      else if (result.error) setExportStatus(`Save failed: ${result.error}`);
    } catch (err) { setExportStatus(`Save failed: ${String(err)}`); }
  };

  const loadProject = async () => {
    if (!window.api) { setExportStatus('Project loading requires the Electron app.'); return; }
    try {
      const result = await window.api.invoke('load-project') as { canceled: boolean, data?: string, error?: string };
      if (result.canceled) return;
      if (result.error) { setExportStatus(`Load failed: ${result.error}`); return; }
      if (result.data) {
        const loadedState = JSON.parse(result.data);
        state.loadProject(loadedState);
        setExportStatus('Project loaded successfully.');
        seek(0);
      }
    } catch (err) { setExportStatus(`Load failed: ${String(err)}`); }
  };

  const createProxy = async () => {
    if (!selectedClip || !window.api || !['video', 'audio'].includes(selectedClip.type)) return;
    setExportStatus('Creating lightweight proxy…');
    try {
      const result = await window.api.invoke('create-proxy', { path: selectedClip.path, clipId: selectedClip.id }) as { path: string };
      state.updateClip(selectedClip.id, { properties: { ...selectedClip.properties, proxyPath: fileUrl(result.path) } });
      setExportStatus('Proxy ready. Preview will use it automatically.');
    } catch (error) { setExportStatus(`Proxy failed: ${error instanceof Error ? error.message : String(error)}`); }
  };

  useEffect(() => {
    if (!window.api) return;
    const cleanups = [
      window.api.receive('open-media', path => { if (typeof path === 'string') void addMedia(path); }),
      window.api.receive('new-project', () => { state.resetProject(); seek(0); }),
      window.api.receive('export-video', () => void exportProject())
    ];
    return () => cleanups.forEach(cleanup => cleanup?.());
  }, []);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.matches('input,textarea,select') || document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      if (event.code === 'Space') { event.preventDefault(); state.setIsPlaying(!state.isPlaying); }
      if (event.key === 'Delete') remove();
      if (event.key.toLowerCase() === 's') split();
      if (event.ctrlKey && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicate(); }
      if (event.ctrlKey && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) state.redo(); else state.undo();
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'y') { event.preventDefault(); state.redo(); }
      if (event.ctrlKey && event.key.toLowerCase() === 'c') { event.preventDefault(); if (selectedClip) state.copyClip(selectedClip.id); }
      if (event.ctrlKey && event.key.toLowerCase() === 'x') { event.preventDefault(); if (selectedClip) state.cutClip(selectedClip.id); }
      if (event.ctrlKey && event.key.toLowerCase() === 'v') { event.preventDefault(); state.pasteClip(currentTimeRef.current); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  });

  const updateProperties = (updates: NonNullable<Clip['properties']>) => {
    if (selectedClip) state.updateClip(selectedClip.id, { properties: { ...selectedClip.properties, ...updates } });
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-background text-on-surface overflow-hidden font-ui-label-md select-none app" ref={appRef} tabIndex={0}>
      {/* TOP NAVBAR */}
      <header className="bg-surface-container-lowest border-b border-outline-variant flex items-center w-full px-panel-padding h-toolbar-height gap-element-gap z-50">
        <div className="font-label-caps text-primary uppercase tracking-widest mr-6 pl-2 text-[12px] font-bold">
          StudioPro Astraea
        </div>
        <nav className="flex items-center gap-2 text-ui-label-md relative">
          <div className="relative h-full flex items-center">
            <div className={`px-2 py-1 rounded cursor-pointer transition-colors select-none ${activeMenu === 'file' ? 'bg-surface-container-highest text-primary' : 'text-on-surface hover:bg-surface-container-highest'}`} onClick={() => setActiveMenu(activeMenu === 'file' ? null : 'file')}>File</div>
            {activeMenu === 'file' && (
              <div className="absolute top-[100%] left-0 mt-1 w-48 bg-surface-container border border-outline-variant rounded-md shadow-lg z-50 py-1" onClick={() => setActiveMenu(null)}>
                <div className="px-3 py-1.5 hover:bg-surface-container-highest cursor-pointer transition-colors" onClick={() => void addMedia()}>Import Media...</div>
                <div className="px-3 py-1.5 hover:bg-surface-container-highest cursor-pointer transition-colors" onClick={importSrt}>Import Subtitles (SRT)...</div>
                <div className="h-px bg-outline-variant/30 my-1"></div>
                <div className="px-3 py-1.5 hover:bg-surface-container-highest cursor-pointer transition-colors" onClick={() => void saveProject()}>Save Project...</div>
                <div className="px-3 py-1.5 hover:bg-surface-container-highest cursor-pointer transition-colors" onClick={() => void loadProject()}>Open Project...</div>
                <div className="h-px bg-outline-variant/30 my-1"></div>
                <div className="px-3 py-1.5 hover:bg-surface-container-highest cursor-pointer transition-colors" onClick={() => void exportProject()}>Export Video...</div>
              </div>
            )}
          </div>
          <div className="relative h-full flex items-center">
            <div className={`px-2 py-1 rounded cursor-pointer transition-colors select-none ${activeMenu === 'edit' ? 'bg-surface-container-highest text-primary' : 'text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface'}`} onClick={() => setActiveMenu(activeMenu === 'edit' ? null : 'edit')}>Edit</div>
            {activeMenu === 'edit' && (
              <div className="absolute top-[100%] left-0 mt-1 w-48 bg-surface-container border border-outline-variant rounded-md shadow-lg z-50 py-1" onClick={() => setActiveMenu(null)}>
                <div className={`px-3 py-1.5 transition-colors ${state.past.length > 0 ? 'hover:bg-surface-container-highest cursor-pointer' : 'opacity-50 cursor-not-allowed'}`} onClick={() => state.past.length > 0 && state.undo()}>Undo (Ctrl+Z)</div>
                <div className={`px-3 py-1.5 transition-colors ${state.future.length > 0 ? 'hover:bg-surface-container-highest cursor-pointer' : 'opacity-50 cursor-not-allowed'}`} onClick={() => state.future.length > 0 && state.redo()}>Redo (Ctrl+Y)</div>
                <div className="h-px bg-outline-variant/30 my-1"></div>
                <div className="px-3 py-1.5 hover:bg-surface-container-highest cursor-pointer transition-colors" onClick={() => { if (selectedClip) state.cutClip(selectedClip.id); }}>Cut (Ctrl+X)</div>
                <div className="px-3 py-1.5 hover:bg-surface-container-highest cursor-pointer transition-colors" onClick={() => { if (selectedClip) state.copyClip(selectedClip.id); }}>Copy (Ctrl+C)</div>
                <div className="px-3 py-1.5 hover:bg-surface-container-highest cursor-pointer transition-colors" onClick={() => state.pasteClip(currentTimeRef.current)}>Paste (Ctrl+V)</div>
                <div className="px-3 py-1.5 hover:bg-surface-container-highest cursor-pointer transition-colors text-error" onClick={remove}>Delete (Del)</div>
                <div className="h-px bg-outline-variant/30 my-1"></div>
                <div className="px-3 py-1.5 hover:bg-surface-container-highest cursor-pointer transition-colors" onClick={() => {
                  const val = prompt('Enter skip duration in seconds:', state.skipDuration.toString());
                  if (val && !isNaN(+val)) state.setSkipDuration(+val);
                }}>Preferences...</div>
              </div>
            )}
          </div>
          <div className="relative h-full flex items-center">
            <div className={`px-2 py-1 rounded cursor-pointer transition-colors select-none ${activeMenu === 'clip' ? 'bg-surface-container-highest text-primary' : 'text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface'}`} onClick={() => setActiveMenu(activeMenu === 'clip' ? null : 'clip')}>Clip</div>
            {activeMenu === 'clip' && (
              <div className="absolute top-[100%] left-0 mt-1 w-48 bg-surface-container border border-outline-variant rounded-md shadow-lg z-50 py-1" onClick={() => setActiveMenu(null)}>
                <div className="px-3 py-1.5 hover:bg-surface-container-highest cursor-pointer transition-colors" onClick={split}>Split at Playhead (S)</div>
                <div className="px-3 py-1.5 hover:bg-surface-container-highest cursor-pointer transition-colors" onClick={duplicate}>Duplicate (Ctrl+D)</div>
                <div className="h-px bg-outline-variant/30 my-1"></div>
                <div className="px-3 py-1.5 hover:bg-surface-container-highest cursor-pointer transition-colors" onClick={() => void createProxy()}>Create Proxy</div>
              </div>
            )}
          </div>
          <div className="relative h-full flex items-center">
            <div className={`px-2 py-1 rounded cursor-pointer transition-colors select-none text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface`}>Sequence</div>
          </div>
          <div className="relative h-full flex items-center">
            <div className={`px-2 py-1 rounded cursor-pointer transition-colors select-none ${activeMenu === 'view' ? 'bg-surface-container-highest text-primary' : 'text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface'}`} onClick={() => setActiveMenu(activeMenu === 'view' ? null : 'view')}>View</div>
            {activeMenu === 'view' && (
              <div className="absolute top-[100%] left-0 mt-1 w-48 bg-surface-container border border-outline-variant rounded-md shadow-lg z-50 py-1" onClick={() => setActiveMenu(null)}>
                <div className="px-3 py-1.5 hover:bg-surface-container-highest cursor-pointer transition-colors" onClick={toggleTheme}>Toggle Theme</div>
                <div className="px-3 py-1.5 hover:bg-surface-container-highest cursor-pointer transition-colors" onClick={() => state.setZoom(state.zoom * 1.5)}>Zoom In</div>
                <div className="px-3 py-1.5 hover:bg-surface-container-highest cursor-pointer transition-colors" onClick={() => state.setZoom(state.zoom / 1.5)}>Zoom Out</div>
                <div className="h-px bg-outline-variant/30 my-1"></div>
                <div className="px-3 py-1.5 hover:bg-surface-container-highest cursor-pointer transition-colors" onClick={() => appRef.current?.requestFullscreen()}>Fullscreen</div>
              </div>
            )}
          </div>
        </nav>
        
        <div className="ml-auto flex items-center gap-3 pr-2">
          {/* Quick Actions */}
          <button 
            onClick={() => void addMedia()}
            className="px-3 h-7 bg-surface-container-high text-on-surface border border-outline-variant hover:bg-surface-variant transition-colors rounded-sm text-ui-label-bold font-bold text-[11px]"
          >
            Import Media
          </button>
          <button 
            onClick={addText}
            className="px-3 h-7 bg-surface-container-high text-on-surface border border-outline-variant hover:bg-surface-variant transition-colors rounded-sm text-ui-label-bold font-bold text-[11px]"
          >
            Add Text
          </button>
          <button 
            onClick={() => state.setIsLooping(!state.isLooping)}
            className={`px-3 h-7 border rounded-sm text-ui-label-bold font-bold text-[11px] transition-all ${
              state.isLooping 
                ? 'bg-primary/20 border-primary text-primary shadow-[0_0_10px_rgba(192,193,255,0.2)]' 
                : 'bg-surface-container-high text-on-surface border-outline-variant hover:bg-surface-variant'
            }`}
          >
            Loop
          </button>
          <button 
            onClick={() => void exportProject()}
            className="px-3 h-7 bg-primary text-on-primary font-ui-label-bold hover:opacity-90 transition-opacity shadow-[0_0_15px_rgba(192,193,255,0.3)] rounded-sm text-[11px] font-bold"
          >
            Export Video
          </button>

          <div className="flex items-center gap-2 text-on-surface-variant border-l border-outline-variant pl-4 ml-2">
            <button 
              onClick={() => state.past.length > 0 && state.undo()}
              className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${state.past.length > 0 ? 'hover:bg-surface-variant hover:text-on-surface cursor-pointer' : 'opacity-30 cursor-not-allowed'}`}
              title="Undo (Ctrl+Z)"
            >
              <span className="material-symbols-outlined text-[18px]">undo</span>
            </button>
            <button 
              onClick={() => state.future.length > 0 && state.redo()}
              className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${state.future.length > 0 ? 'hover:bg-surface-variant hover:text-on-surface cursor-pointer' : 'opacity-30 cursor-not-allowed'}`}
              title="Redo (Ctrl+Y)"
            >
              <span className="material-symbols-outlined text-[18px]">redo</span>
            </button>
            <span 
              onClick={toggleTheme} 
              className="material-symbols-outlined cursor-pointer hover:text-on-surface select-none ml-2"
              title={mode === 'light' ? 'Switch to Dark' : 'Switch to Light'}
            >
              {mode === 'light' ? 'dark_mode' : 'light_mode'}
            </span>
          </div>
        </div>
      </header>

      {/* WORKSPACE AREA */}
      <main className="flex flex-row h-[calc(100vh-40px-240px)] w-full overflow-hidden">
        {/* SIDE TOOLBAR */}
        <aside className="w-10 bg-background border-r border-outline-variant flex flex-col items-center py-panel-padding gap-2 shrink-0">
          <button className="w-8 h-8 flex items-center justify-center active-tool rounded-sm" title="Select Tool">
            <span className="material-symbols-outlined">near_me</span>
          </button>
          <button 
            onClick={() => { if (selectedClip) state.cutClip(selectedClip.id); }}
            className={`w-8 h-8 flex items-center justify-center rounded-sm transition-colors ${selectedClip ? 'text-on-surface-variant hover:bg-surface-container hover:text-primary' : 'text-on-surface-variant/30 cursor-not-allowed'}`}
            title="Cut (Ctrl+X)"
          >
            <span className="material-symbols-outlined">content_cut</span>
          </button>
          <button 
            onClick={() => { if (selectedClip) state.copyClip(selectedClip.id); }}
            className={`w-8 h-8 flex items-center justify-center rounded-sm transition-colors ${selectedClip ? 'text-on-surface-variant hover:bg-surface-container hover:text-primary' : 'text-on-surface-variant/30 cursor-not-allowed'}`}
            title="Copy (Ctrl+C)"
          >
            <span className="material-symbols-outlined">content_copy</span>
          </button>
          <button 
            onClick={() => state.pasteClip(currentTimeRef.current)}
            className={`w-8 h-8 flex items-center justify-center rounded-sm transition-colors ${state.clipboardClip ? 'text-on-surface-variant hover:bg-surface-container hover:text-primary' : 'text-on-surface-variant/30 cursor-not-allowed'}`}
            title="Paste (Ctrl+V)"
          >
            <span className="material-symbols-outlined">content_paste</span>
          </button>
          <button 
            onClick={split}
            className="w-8 h-8 flex items-center justify-center text-on-surface-variant hover:bg-surface-container hover:text-primary rounded-sm transition-colors" 
            title="Split at Playhead (S)"
          >
            <span className="material-symbols-outlined">splitscreen</span>
          </button>
          <button 
            onClick={remove}
            className={`w-8 h-8 flex items-center justify-center rounded-sm transition-colors ${selectedClip ? 'text-on-surface-variant hover:bg-surface-container hover:text-error' : 'text-on-surface-variant/30 cursor-not-allowed'}`}
            title="Delete (Del)"
          >
            <span className="material-symbols-outlined">delete</span>
          </button>
          
          <div className="mt-auto flex flex-col gap-2">
            <button 
              onClick={toggleTheme}
              className="w-8 h-8 flex items-center justify-center text-on-surface-variant hover:bg-surface-container hover:text-on-surface rounded-sm"
              title="Toggle Theme"
            >
              <span className="material-symbols-outlined">settings</span>
            </button>
          </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <div className="flex-1 flex overflow-hidden">
          {/* COLUMN 1: PROJECT PANEL / MEDIA POOL */}
          <section className="w-72 nebula-panel flex flex-col border-r border-outline-variant overflow-hidden shrink-0">
            <div className="h-8 bg-surface-container-lowest px-3 flex items-center justify-between border-b border-outline-variant shrink-0">
              <span className="font-panel-header text-panel-header text-primary tracking-tight font-bold">PROJECT: MEDIA_POOL</span>
              <span className="material-symbols-outlined text-on-surface-variant cursor-pointer hover:text-on-surface" onClick={() => void addMedia()}>add</span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2 bg-background/50 flex flex-col gap-1.5">
              {/* Media clips rendering */}
              <div className="absolute top-2 left-2 text-[8px] opacity-30 pointer-events-none">
                API Status: {window.api ? 'Loaded' : 'Missing (Check Terminal)'} | Agent: Electron
              </div>
              {state.clips.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-4 text-on-surface-variant/60 gap-2">
                  <span className="material-symbols-outlined text-[32px]">video_library</span>
                  <p className="text-[11px]">No media loaded</p>
                  <button 
                    onClick={() => void addMedia()}
                    className="mt-1 px-3 py-1 bg-surface-container hover:bg-surface-container-highest border border-outline-variant text-[10px] rounded transition-all"
                  >
                    Import File
                  </button>
                </div>
              ) : (
                state.clips.map((clip) => {
                  const isClipSelected = clip.id === state.selectedClipId;
                  return (
                    <div 
                      key={clip.id}
                      onClick={() => state.setSelectedClip(clip.id)}
                      onDoubleClick={() => seek(clip.start)}
                      className={`flex items-center gap-2 p-1.5 rounded border cursor-pointer transition-all group ${
                        isClipSelected 
                          ? 'bg-surface-container border-nebula-purple/50 shadow-[0_0_10px_rgba(139,92,246,0.15)] text-on-surface' 
                          : 'bg-background/30 border-outline-variant/20 text-on-surface-variant hover:bg-surface-container/60 hover:text-on-surface'
                      }`}
                    >
                      {/* Media Type Icon / Indicator */}
                      <div className="w-10 h-7 bg-black shrink-0 overflow-hidden relative border border-outline-variant/40 rounded flex items-center justify-center">
                        {clip.type === 'video' ? (
                          <span className="material-symbols-outlined text-[16px] text-primary">movie</span>
                        ) : clip.type === 'audio' ? (
                          <span className="material-symbols-outlined text-[16px] text-tertiary">audiotrack</span>
                        ) : (
                          <span className="material-symbols-outlined text-[16px] text-secondary">title</span>
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <p className="truncate font-ui-label-sm text-[11px] font-semibold">{clip.name}</p>
                        <p className="text-[9px] opacity-75 font-mono-code">{clip.duration.toFixed(1)}s (at {clip.start.toFixed(1)}s)</p>
                      </div>
                      
                      {/* Small inline actions */}
                      <button 
                        onClick={(e) => { e.stopPropagation(); state.removeClip(clip.id); }}
                        className="opacity-0 group-hover:opacity-100 hover:text-error w-5 h-5 flex items-center justify-center rounded hover:bg-surface-container-highest transition-all"
                        title="Delete Asset"
                      >
                        <span className="material-symbols-outlined text-[14px]">close</span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            
            <div className="h-6 bg-surface-container-lowest px-2 border-t border-outline-variant flex items-center gap-2 text-[10px] text-on-surface-variant select-none">
              <span className="material-symbols-outlined text-[14px]">grid_view</span>
              <span className="material-symbols-outlined text-[14px] text-primary font-bold">list</span>
              <div className="flex-1"></div>
              <span>{state.clips.length} Item(s)</span>
            </div>
          </section>

          {/* COLUMN 2: CENTER SINGLE MONITOR SETUP (Program Monitor centered) */}
          <section className="flex-1 flex flex-col bg-background overflow-hidden star-field border-r border-outline-variant relative">
            <div className="absolute top-2 left-3 z-10 px-1.5 py-0.5 bg-background/80 rounded-sm border border-primary/40 flex items-center gap-2 shadow-[0_0_10px_rgba(192,193,255,0.2)]">
              <span className="text-[9px] font-label-caps text-primary tracking-widest font-bold">PROGRAM</span>
              <span className="text-[9px] text-on-surface-variant font-mono-code">Master_Sequence</span>
            </div>

            <div className="flex-1 flex items-center justify-center overflow-hidden p-4">
              <div className="w-full h-full max-w-[960px] max-h-[540px] aspect-video flex items-center justify-center bg-black border border-outline-variant/40 rounded-lg overflow-hidden shadow-2xl relative">
                <VideoPlayer ref={playerRef} clips={state.clips} tracks={state.tracks} currentTime={currentTime} playing={state.isPlaying} volume={volume} />
              </div>
            </div>

            {/* Centered Transport Controls Bar */}
            <ControlBar isPlaying={state.isPlaying} onPlayPause={() => state.setIsPlaying(!state.isPlaying)} onStop={() => { state.setIsPlaying(false); seek(0); }} onSkipBackward={skipBackward} onSkipForward={skipForward} currentTime={currentTime} totalDuration={state.duration} volume={volume} onVolumeChange={setVolume} onFullscreen={() => appRef.current?.requestFullscreen()} />
          </section>

          {/* COLUMN 3: INSPECTOR PANEL */}
          <section className="w-64 nebula-panel border-l border-outline-variant flex flex-col shrink-0 overflow-hidden">
            <div className="h-8 bg-surface-container-lowest px-3 flex items-center border-b border-outline-variant shrink-0">
              <span className="font-panel-header text-panel-header text-primary tracking-tight font-bold">INSPECTOR</span>
            </div>
            
            <div className="flex-1 overflow-y-auto bg-background/30 text-ui-label-md p-3 flex flex-col gap-4">
              {!selectedClip ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-4 text-on-surface-variant/50 gap-2">
                  <span className="material-symbols-outlined text-[24px]">info</span>
                  <p className="text-[11px]">Select a clip in the timeline or media pool to adjust properties.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {/* Clip General Info */}
                  <div className="border-b border-outline-variant/30 pb-3">
                    <p className="text-[10px] text-primary uppercase font-bold tracking-widest mb-1">Selected Asset</p>
                    <p className="font-bold text-on-surface text-[12px] truncate mb-1">{selectedClip.name}</p>
                    <p className="text-[9px] text-on-surface-variant/80 font-mono-code uppercase">Type: {selectedClip.type} | Duration: {selectedClip.duration.toFixed(2)}s</p>
                  </div>

                  {/* Effects Controls */}
                  <div className="flex flex-col gap-3">
                    <p className="text-[10px] text-primary uppercase font-bold tracking-widest">Adjustments</p>

                    {selectedClip.type === 'text' && (
                      <div className="flex flex-col gap-2">
                        <label className="flex flex-col gap-1 text-on-surface-variant text-[10px] font-bold uppercase">
                          Text Value
                          <input 
                            value={selectedClip.properties?.text ?? ''} 
                            onChange={e => updateProperties({ text: e.target.value })} 
                            className="bg-surface-container-high border border-outline-variant text-on-surface px-2 py-1 rounded text-[11px] focus:outline-none focus:border-primary"
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-on-surface-variant text-[10px] font-bold uppercase">
                          Text Color
                          <input 
                            type="color"
                            value={selectedClip.properties?.color ?? '#ffffff'} 
                            onChange={e => updateProperties({ color: e.target.value })} 
                            className="bg-surface-container-high border border-outline-variant h-8 w-full p-0.5 rounded cursor-pointer"
                          />
                        </label>
                        <div className="flex flex-col gap-1.5">
                          <div className="flex justify-between text-[10px] text-on-surface-variant font-bold uppercase">
                            <span>Font Size</span>
                            <span className="text-primary font-mono-code">{selectedClip.properties?.fontSize ?? 40}px</span>
                          </div>
                          <input 
                            type="range" 
                            min="10" 
                            max="120" 
                            value={selectedClip.properties?.fontSize ?? 40} 
                            onChange={e => updateProperties({ fontSize: +e.target.value })} 
                            className="w-full accent-primary bg-surface-container-highest rounded-full h-1 appearance-none cursor-pointer"
                          />
                        </div>
                      </div>
                    )}

                    {selectedClip.type === 'video' && (
                      <div className="flex flex-col gap-3.5">
                        {/* Brightness */}
                        <div className="flex flex-col gap-1.5">
                          <div className="flex justify-between text-[10px] text-on-surface-variant font-bold uppercase">
                            <span>Brightness</span>
                            <span className="text-primary font-mono-code">{((selectedClip.properties?.brightness ?? 0) * 100).toFixed(0)}%</span>
                          </div>
                          <input 
                            type="range" 
                            min="-1" 
                            max="1" 
                            step="0.05" 
                            value={selectedClip.properties?.brightness ?? 0} 
                            onChange={e => updateProperties({ brightness: +e.target.value })} 
                            className="w-full accent-primary bg-surface-container-highest rounded-full h-1 appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Contrast */}
                        <div className="flex flex-col gap-1.5">
                          <div className="flex justify-between text-[10px] text-on-surface-variant font-bold uppercase">
                            <span>Contrast</span>
                            <span className="text-primary font-mono-code">{((selectedClip.properties?.contrast ?? 1) * 100).toFixed(0)}%</span>
                          </div>
                          <input 
                            type="range" 
                            min="0" 
                            max="2" 
                            step="0.05" 
                            value={selectedClip.properties?.contrast ?? 1} 
                            onChange={e => updateProperties({ contrast: +e.target.value })} 
                            className="w-full accent-primary bg-surface-container-highest rounded-full h-1 appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Saturation */}
                        <div className="flex flex-col gap-1.5">
                          <div className="flex justify-between text-[10px] text-on-surface-variant font-bold uppercase">
                            <span>Saturation</span>
                            <span className="text-primary font-mono-code">{((selectedClip.properties?.saturation ?? 1) * 100).toFixed(0)}%</span>
                          </div>
                          <input 
                            type="range" 
                            min="0" 
                            max="2" 
                            step="0.05" 
                            value={selectedClip.properties?.saturation ?? 1} 
                            onChange={e => updateProperties({ saturation: +e.target.value })} 
                            className="w-full accent-primary bg-surface-container-highest rounded-full h-1 appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Position X */}
                        <div className="flex flex-col gap-1.5">
                          <div className="flex justify-between text-[10px] text-on-surface-variant font-bold uppercase">
                            <span>Position X</span>
                            <span className="text-primary font-mono-code">{selectedClip.properties?.x ?? 0}px</span>
                          </div>
                          <input 
                            type="range" 
                            min="-500" 
                            max="500" 
                            value={selectedClip.properties?.x ?? 0} 
                            onChange={e => updateProperties({ x: +e.target.value })} 
                            className="w-full accent-primary bg-surface-container-highest rounded-full h-1 appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Position Y */}
                        <div className="flex flex-col gap-1.5">
                          <div className="flex justify-between text-[10px] text-on-surface-variant font-bold uppercase">
                            <span>Position Y</span>
                            <span className="text-primary font-mono-code">{selectedClip.properties?.y ?? 0}px</span>
                          </div>
                          <input 
                            type="range" 
                            min="-300" 
                            max="300" 
                            value={selectedClip.properties?.y ?? 0} 
                            onChange={e => updateProperties({ y: +e.target.value })} 
                            className="w-full accent-primary bg-surface-container-highest rounded-full h-1 appearance-none cursor-pointer"
                          />
                        </div>

                        <button 
                          onClick={() => updateProperties({ brightness: 0.06, contrast: 1.08, saturation: 1.12 })}
                          className="w-full h-7 bg-surface-container-high border border-outline-variant hover:bg-surface-variant text-[10px] uppercase font-bold tracking-wider rounded transition-all"
                        >
                          ✨ Auto Enhance
                        </button>
                      </div>
                    )}

                    {/* Common Properties: Opacity */}
                    <div className="flex flex-col gap-1.5 mt-2">
                      <div className="flex justify-between text-[10px] text-on-surface-variant font-bold uppercase">
                        <span>Opacity</span>
                        <span className="text-primary font-mono-code">{((selectedClip.properties?.opacity ?? 1) * 100).toFixed(0)}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="1" 
                        step="0.05" 
                        value={selectedClip.properties?.opacity ?? 1} 
                        onChange={e => updateProperties({ opacity: +e.target.value })} 
                        className="w-full accent-primary bg-surface-container-highest rounded-full h-1 appearance-none cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Transitions section */}
                  <div className="border-t border-outline-variant/30 pt-3 flex flex-col gap-3">
                    <p className="text-[10px] text-primary uppercase font-bold tracking-widest">Transitions</p>
                    
                    <label className="flex flex-col gap-1 text-on-surface-variant text-[10px] font-bold uppercase">
                      Transition Type
                      <select 
                        value={selectedClip.properties?.transition ?? 'none'} 
                        onChange={e => updateProperties({ transition: e.target.value as TransitionType })}
                        className="bg-surface-container-high border border-outline-variant text-on-surface px-2 py-1 rounded text-[11px] focus:outline-none"
                      >
                        <option value="none">None</option>
                        <option value="fade">Fade</option>
                        <option value="dissolve">Dissolve</option>
                      </select>
                    </label>

                    <label className="flex flex-col gap-1 text-on-surface-variant text-[10px] font-bold uppercase">
                      Duration (s)
                      <input 
                        type="number" 
                        min="0.1" 
                        max="3" 
                        step="0.1" 
                        value={selectedClip.properties?.transitionDuration ?? 0.5} 
                        onChange={e => updateProperties({ transitionDuration: +e.target.value })}
                        className="bg-surface-container-high border border-outline-variant text-on-surface px-2 py-1 rounded text-[11px] focus:outline-none"
                      />
                    </label>
                  </div>

                  {/* Keyframes actions */}
                  <div className="border-t border-outline-variant/30 pt-3 flex flex-col gap-2">
                    <p className="text-[10px] text-primary uppercase font-bold tracking-widest mb-1">Keyframes ({selectedClip.properties?.keyframes?.length ?? 0})</p>
                    <button 
                      onClick={() => state.addKeyframe(selectedClip.id, { time: Math.max(0, currentTimeRef.current - selectedClip.start), property: 'opacity', value: selectedClip.properties?.opacity ?? 1 })}
                      className="w-full h-7 bg-surface-container-high border border-outline-variant hover:bg-surface-variant text-[10px] rounded transition-all text-left px-2 flex items-center justify-between"
                    >
                      <span>Add Opacity Keyframe</span>
                      <span className="material-symbols-outlined text-[14px]">add</span>
                    </button>
                    {selectedClip.type === 'video' && (
                      <button 
                        onClick={() => {
                          const time = Math.max(0, currentTimeRef.current - selectedClip.start);
                          state.addKeyframe(selectedClip.id, { time, property: 'x', value: selectedClip.properties?.x ?? 0 });
                          state.addKeyframe(selectedClip.id, { time, property: 'y', value: selectedClip.properties?.y ?? 0 });
                        }}
                        className="w-full h-7 bg-surface-container-high border border-outline-variant hover:bg-surface-variant text-[10px] rounded transition-all text-left px-2 flex items-center justify-between"
                      >
                        <span>Add Motion Keyframe</span>
                        <span className="material-symbols-outlined text-[14px]">add</span>
                      </button>
                    )}
                  </div>

                  {/* Render Proxies */}
                  <div className="border-t border-outline-variant/30 pt-3 flex flex-col gap-2">
                    <button 
                      onClick={() => void createProxy()} 
                      disabled={!window.api || selectedClip.type === 'text'}
                      className="w-full h-8 bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary disabled:opacity-50 disabled:pointer-events-none rounded text-[10px] font-bold uppercase transition-all"
                    >
                      Create 720p Proxy
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      {/* BOTTOM TIMELINE AREA */}
      <footer className="h-[timeline-height] bg-background flex flex-col border-t border-outline-variant w-full overflow-hidden star-field shrink-0">
        <Toolbar onSplit={split} onDelete={remove} onDuplicate={duplicate} onImportSRT={importSrt} onZoomIn={() => state.setZoom(state.zoom * 1.5)} onZoomOut={() => state.setZoom(state.zoom / 1.5)} onExport={() => void exportProject()} />
        <div className="flex-1 flex overflow-hidden relative">
          <Timeline ref={timelineRef} currentTime={currentTime} onTimeUpdate={seek} />
        </div>
      </footer>

      {exportStatus && (
        <div className="fixed bottom-4 right-4 bg-surface-container-high border border-outline-variant text-on-surface p-4 rounded-md shadow-lg z-[9999] flex items-center gap-3">
          <span className="material-symbols-outlined text-primary">info</span>
          <span className="text-[12px] font-medium">{exportStatus}</span>
          <button className="text-on-surface-variant hover:text-on-surface" onClick={() => setExportStatus('')}>
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      )}
    </div>
  );
}
