import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useTimelineStore, Clip, Keyframe, Track } from '../stores/timelineStore';
import './VideoPlayer.css';

export interface VideoPlayerHandle {
  getCurrentTime: () => number;
  seekTo: (time: number) => void;
  play: () => Promise<void>;
  pause: () => void;
  requestFullscreen: () => void;
}

interface Props {
  clips: Clip[];
  tracks: Track[];
  currentTime: number;
  playing: boolean;
  volume?: number;
  selectedClipId?: string | null;
  onSelectClip?: (id: string | null) => void;
  onUpdateClipProperties?: (id: string, updates: Partial<Clip['properties']>) => void;
}

const keyframedValue = (frames: Keyframe[] | undefined, property: Keyframe['property'], time: number, fallback: number) => {
  const points = (frames ?? []).filter(k => k.property === property).sort((a, b) => a.time - b.time);
  if (!points.length) return fallback;
  if (time <= points[0].time) return points[0].value;
  if (time >= points[points.length - 1].time) return points[points.length - 1].value;
  const right = points.findIndex(k => k.time >= time);
  const a = points[right - 1], b = points[right];
  return a.value + (b.value - a.value) * ((time - a.time) / (b.time - a.time));
};

const VideoPlayer = forwardRef<VideoPlayerHandle, Props>(({
  clips, tracks, currentTime, playing, volume = 1,
  selectedClipId, onSelectClip, onUpdateClipProperties
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mediaRefs = useRef<Record<string, HTMLMediaElement>>({});
  const active = clips.filter(c => currentTime >= c.start && currentTime < c.start + c.duration);

  const [canvasScale, setCanvasScale] = useState(960 / 1280);
  const [dragging, setDragging] = useState<{
    clipId: string;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    mode: 'move' | 'resize';
    initialScale?: number;
    initialFontSize?: number;
  } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      for (const e of entries) {
        if (e.contentRect.width > 0) setCanvasScale(e.contentRect.width / 1280);
      }
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!dragging) return;
    let rafId: number | null = null;
    let pendingUpdates: Partial<Clip['properties']> | null = null;

    const onMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const scaleFactor = 1280 / container.clientWidth;
      const dx = (e.clientX - dragging.startX) * scaleFactor;
      const dy = (e.clientY - dragging.startY) * scaleFactor;

      let updates: Partial<Clip['properties']> = {};
      if (dragging.mode === 'move') {
        updates = {
          x: Math.round(dragging.initialX + dx),
          y: Math.round(dragging.initialY + dy),
        };
      } else if (dragging.mode === 'resize') {
        const delta = (dx - dy) / 200;
        if (dragging.initialFontSize !== undefined) {
          updates = {
            fontSize: Math.max(10, Math.round(dragging.initialFontSize + delta * 50)),
          };
        } else if (dragging.initialScale !== undefined) {
          updates = {
            scale: Math.max(0.1, Number((dragging.initialScale + delta).toFixed(2))),
          };
        }
      }

      pendingUpdates = updates;

      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          if (pendingUpdates) {
            onUpdateClipProperties?.(dragging.clipId, pendingUpdates);
            pendingUpdates = null;
          }
          rafId = null;
        });
      }
    };
    const onUp = () => {
      setDragging(null);
      useTimelineStore.getState().endTransaction();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, onUpdateClipProperties]);

  const handleMouseDown = (e: React.MouseEvent, clip: Clip, mode: 'move' | 'resize') => {
    e.stopPropagation();
    useTimelineStore.getState().startTransaction();
    setDragging({
      clipId: clip.id,
      startX: e.clientX,
      startY: e.clientY,
      initialX: clip.properties?.x ?? 0,
      initialY: clip.properties?.y ?? 0,
      mode,
      initialScale: clip.type === 'text' ? undefined : (clip.properties?.scale ?? 1),
      initialFontSize: clip.type === 'text' ? (clip.properties?.fontSize ?? 40) : undefined,
    });
  };

  const sync = (time: number) => {
    clips.filter(c => time >= c.start && time < c.start + c.duration).forEach(clip => {
      const media = mediaRefs.current[clip.id];
      if (media) {
        const expected = time - clip.start + clip.offset;
        const tolerance = playing ? 0.08 : 0.0;
        if (media.readyState >= 1) {
          if (Math.abs(media.currentTime - expected) > tolerance) {
            media.currentTime = Math.max(0, expected);
          }
        } else {
          const onLoaded = () => {
            media.currentTime = Math.max(0, expected);
            media.removeEventListener('loadedmetadata', onLoaded);
          };
          media.addEventListener('loadedmetadata', onLoaded);
        }
      }
    });
  };

  useImperativeHandle(ref, () => ({
    getCurrentTime: () => currentTime,
    seekTo: sync,
    play: async () => {
      await Promise.all(active.map(c => {
        const media = mediaRefs.current[c.id];
        if (media) {
          if (media.readyState >= 1) {
            return media.play().catch(() => undefined);
          } else {
            return new Promise<void>(resolve => {
              const onLoaded = () => {
                media.play().then(() => resolve()).catch(() => resolve());
                media.removeEventListener('loadedmetadata', onLoaded);
              };
              media.addEventListener('loadedmetadata', onLoaded);
            });
          }
        }
        return undefined;
      }).filter(Boolean));
    },
    pause: () => Object.values(mediaRefs.current).forEach(m => m.pause()),
    requestFullscreen: () => containerRef.current?.requestFullscreen() ?? Promise.resolve()
  }));

  useEffect(() => {
    const activeIds = new Set(active.map(c => c.id));
    const cleanups: Array<() => void> = [];

    for (const [id, media] of Object.entries(mediaRefs.current)) {
      const clip = active.find(c => c.id === id);
      if (!clip || !activeIds.has(id)) { media.pause(); continue; }
      const expected = currentTime - clip.start + clip.offset;
      const tolerance = playing ? 0.08 : 0.0;

      const applySync = () => {
        if (Math.abs(media.currentTime - expected) > tolerance) {
          media.currentTime = Math.max(0, expected);
        }
        const track = tracks.find(t => t.id === clip.trackId);
        media.volume = track?.isMuted ? 0 : volume;
        if (playing && media.paused) void media.play().catch(() => undefined);
        if (!playing && !media.paused) media.pause();
      };

      if (media.readyState >= 1) {
        applySync();
      } else {
        const handler = () => applySync();
        media.addEventListener('loadedmetadata', handler, { once: true });
        cleanups.push(() => media.removeEventListener('loadedmetadata', handler));
      }
    }

    return () => {
      cleanups.forEach(fn => fn());
    };
  }, [active, currentTime, playing, volume, tracks]);

  return (
    <div className="video-player">
      <div ref={containerRef} className="preview-container" onClick={() => onSelectClip?.(null)}>
        {active.filter(c => c.type === 'video' || c.type === 'image').map(clip => {
          const local = currentTime - clip.start;
          const transition = clip.properties?.transition ?? 'none';
          const transitionDuration = Math.min(clip.properties?.transitionDuration ?? 0.5, clip.duration / 2);
          const edgeOpacity = transition === 'none' ? 1 : Math.min(1, local / transitionDuration, (clip.duration - local) / transitionDuration);
          const opacity = edgeOpacity * keyframedValue(clip.properties?.keyframes, 'opacity', local, clip.properties?.opacity ?? 1);
          const scale = keyframedValue(clip.properties?.keyframes, 'scale', local, clip.properties?.scale ?? 1);
          const x = keyframedValue(clip.properties?.keyframes, 'x', local, clip.properties?.x ?? 0) * canvasScale;
          const y = keyframedValue(clip.properties?.keyframes, 'y', local, clip.properties?.y ?? 0) * canvasScale;
          const trackIndex = tracks.findIndex(t => t.id === clip.trackId);
          const isSelected = selectedClipId === clip.id;

          return (
            <div
              key={clip.id}
              style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: trackIndex + 1, opacity, pointerEvents: 'none'
              }}
            >
              <div
                style={{
                  position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transform: `translate(${x}px, ${y}px) scale(${scale})`, pointerEvents: 'auto',
                  outline: isSelected ? '2px solid #c0c1ff' : 'none',
                  boxShadow: isSelected ? '0 0 20px rgba(192,193,255,0.3)' : 'none',
                  cursor: isSelected ? 'move' : 'pointer',
                  transition: dragging ? 'none' : 'outline 0.1s'
                }}
                onMouseDown={(e) => isSelected ? handleMouseDown(e, clip, 'move') : undefined}
                onClick={(e) => { e.stopPropagation(); onSelectClip?.(clip.id); }}
              >
                {clip.type === 'video' ? (
                  <>
                    <video
                      ref={el => { if (el) mediaRefs.current[clip.id] = el; else delete mediaRefs.current[clip.id]; }}
                      src={clip.properties?.proxyPath || clip.path} preload="auto"
                      muted={tracks.find(t => t.id === clip.trackId)?.isMuted}
                      style={{
                        width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none',
                        filter: `brightness(${1 + (clip.properties?.brightness ?? 0)}) contrast(${clip.properties?.contrast ?? 1}) saturate(${clip.properties?.saturation ?? 1})`
                      }}
                    />
                    {!clip.properties?.proxyPath && clip.properties?.codec && !['h264', 'vp8', 'vp9', 'av1', 'theora'].includes(clip.properties.codec.toLowerCase()) && (
                      <div className="codec-warning-overlay">
                        <span className="material-symbols-outlined warning-icon">warning</span>
                        <div className="warning-text">Codec Not Supported Natively ({clip.properties.codec.toUpperCase()})</div>
                        <div className="warning-sub">Click "Create Proxy" in Properties to enable preview.</div>
                      </div>
                    )}
                  </>
                ) : (
                  <img
                    src={clip.path} draggable={false}
                    style={{
                      width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none',
                      filter: `brightness(${1 + (clip.properties?.brightness ?? 0)}) contrast(${clip.properties?.contrast ?? 1}) saturate(${clip.properties?.saturation ?? 1})`
                    }}
                  />
                )}
                {isSelected && (
                  <div
                    style={{
                      position: 'absolute', right: 12, bottom: 12, width: 16, height: 16,
                      backgroundColor: '#c0c1ff', borderRadius: '50%', border: '2px solid #000',
                      cursor: 'nwse-resize', zIndex: 10
                    }}
                    onMouseDown={(e) => handleMouseDown(e, clip, 'resize')}
                  />
                )}
              </div>
            </div>
          );
        })}

        {active.filter(c => c.type === 'audio').map(clip => (
          <audio key={clip.id} ref={el => { if (el) mediaRefs.current[clip.id] = el; else delete mediaRefs.current[clip.id]; }} src={clip.properties?.proxyPath || clip.path} preload="auto" />
        ))}

        {active.filter(c => c.type === 'text').map(clip => {
          const local = currentTime - clip.start;
          const opacity = keyframedValue(clip.properties?.keyframes, 'opacity', local, clip.properties?.opacity ?? 1);
          const x = (clip.properties?.x ?? 50) * canvasScale;
          const y = (clip.properties?.y ?? 50) * canvasScale;
          const fontSize = (clip.properties?.fontSize ?? 40) * canvasScale;
          const isSelected = selectedClipId === clip.id;

          return (
            <div
              key={clip.id}
              className="text-overlay"
              style={{
                position: 'absolute', left: x, top: y, color: clip.properties?.color ?? '#fff',
                fontSize, opacity, pointerEvents: 'auto',
                outline: isSelected ? '2px dashed #c0c1ff' : 'none',
                padding: '4px 8px', borderRadius: 4,
                cursor: isSelected ? 'move' : 'pointer',
                zIndex: 100
              }}
              onMouseDown={(e) => isSelected ? handleMouseDown(e, clip, 'move') : undefined}
              onClick={(e) => { e.stopPropagation(); onSelectClip?.(clip.id); }}
            >
              {clip.properties?.text ?? clip.path}
              {isSelected && (
                <div
                  style={{
                    position: 'absolute', right: -6, bottom: -6, width: 14, height: 14,
                    backgroundColor: '#c0c1ff', borderRadius: '50%', border: '2px solid #000',
                    cursor: 'nwse-resize', zIndex: 101
                  }}
                  onMouseDown={(e) => handleMouseDown(e, clip, 'resize')}
                />
              )}
            </div>
          );
        })}

        {!active.some(c => c.type === 'video' || c.type === 'image') && (
          <div className="no-media">No video at {currentTime.toFixed(1)}s</div>
        )}
      </div>
    </div>
  );
});

export default VideoPlayer;
