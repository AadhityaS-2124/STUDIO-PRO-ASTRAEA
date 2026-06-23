import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Clip, Keyframe, Track } from '../stores/timelineStore';

export interface VideoPlayerHandle {
  getCurrentTime: () => number;
  seekTo: (time: number) => void;
  play: () => Promise<void>;
  pause: () => void;
  requestFullscreen: () => void;
}

interface Props { clips: Clip[]; tracks: Track[]; currentTime: number; playing: boolean; volume?: number }

const keyframedValue = (frames: Keyframe[] | undefined, property: Keyframe['property'], time: number, fallback: number) => {
  const points = (frames ?? []).filter(k => k.property === property).sort((a, b) => a.time - b.time);
  if (!points.length) return fallback;
  if (time <= points[0].time) return points[0].value;
  if (time >= points[points.length - 1].time) return points[points.length - 1].value;
  const right = points.findIndex(k => k.time >= time);
  const a = points[right - 1], b = points[right];
  return a.value + (b.value - a.value) * ((time - a.time) / (b.time - a.time));
};

const VideoPlayer = forwardRef<VideoPlayerHandle, Props>(({ clips, tracks, currentTime, playing, volume = 1 }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mediaRefs = useRef<Record<string, HTMLMediaElement>>({});
  const active = clips.filter(c => currentTime >= c.start && currentTime < c.start + c.duration);

  const sync = (time: number) => {
    clips.filter(c => time >= c.start && time < c.start + c.duration).forEach(clip => {
      const media = mediaRefs.current[clip.id];
      if (media) media.currentTime = Math.max(0, time - clip.start + clip.offset);
    });
  };

  useImperativeHandle(ref, () => ({
    getCurrentTime: () => currentTime,
    seekTo: sync,
    play: async () => { await Promise.all(active.map(c => mediaRefs.current[c.id]?.play()).filter(Boolean)); },
    pause: () => Object.values(mediaRefs.current).forEach(m => m.pause()),
    requestFullscreen: () => containerRef.current?.requestFullscreen() ?? Promise.resolve()
  }));

  useEffect(() => {
    const activeIds = new Set(active.map(c => c.id));
    for (const [id, media] of Object.entries(mediaRefs.current)) {
      const clip = active.find(c => c.id === id);
      if (!clip || !activeIds.has(id)) { media.pause(); continue; }
      const expected = currentTime - clip.start + clip.offset;
      if (Math.abs(media.currentTime - expected) > 0.35) media.currentTime = Math.max(0, expected);
      const track = tracks.find(t => t.id === clip.trackId);
      media.volume = track?.isMuted ? 0 : volume;
      if (playing && media.paused) void media.play().catch(() => undefined);
      if (!playing && !media.paused) media.pause();
    }
  }, [active, currentTime, playing, volume, tracks]);

  return <div className="video-player">
    <div ref={containerRef} className="preview-container">
      {active.filter(c => c.type === 'video').map(clip => {
        const local = currentTime - clip.start;
        const transition = clip.properties?.transition ?? 'none';
        const transitionDuration = Math.min(clip.properties?.transitionDuration ?? 0.5, clip.duration / 2);
        const edgeOpacity = transition === 'none' ? 1 : Math.min(1, local / transitionDuration, (clip.duration - local) / transitionDuration);
        const opacity = edgeOpacity * keyframedValue(clip.properties?.keyframes, 'opacity', local, clip.properties?.opacity ?? 1);
        const scale = keyframedValue(clip.properties?.keyframes, 'scale', local, 1);
        const x = keyframedValue(clip.properties?.keyframes, 'x', local, clip.properties?.x ?? 0);
        const y = keyframedValue(clip.properties?.keyframes, 'y', local, clip.properties?.y ?? 0);
        const trackIndex = tracks.findIndex(t => t.id === clip.trackId);
        return <video key={clip.id} ref={el => { if (el) mediaRefs.current[clip.id] = el; else delete mediaRefs.current[clip.id]; }}
          src={clip.properties?.proxyPath || clip.path} preload="auto" muted={tracks.find(t => t.id === clip.trackId)?.isMuted}
          style={{ zIndex: trackIndex + 1, opacity, transform: `translate(${x}px, ${y}px) scale(${scale})`, filter: `brightness(${1 + (clip.properties?.brightness ?? 0)}) contrast(${clip.properties?.contrast ?? 1}) saturate(${clip.properties?.saturation ?? 1})` }} />;
      })}
      {active.filter(c => c.type === 'image').map(clip => {
        const local = currentTime - clip.start;
        const transition = clip.properties?.transition ?? 'none';
        const transitionDuration = Math.min(clip.properties?.transitionDuration ?? 0.5, clip.duration / 2);
        const edgeOpacity = transition === 'none' ? 1 : Math.min(1, local / transitionDuration, (clip.duration - local) / transitionDuration);
        const opacity = edgeOpacity * keyframedValue(clip.properties?.keyframes, 'opacity', local, clip.properties?.opacity ?? 1);
        const scale = keyframedValue(clip.properties?.keyframes, 'scale', local, 1);
        const x = keyframedValue(clip.properties?.keyframes, 'x', local, clip.properties?.x ?? 0);
        const y = keyframedValue(clip.properties?.keyframes, 'y', local, clip.properties?.y ?? 0);
        const trackIndex = tracks.findIndex(t => t.id === clip.trackId);
        return <img key={clip.id} src={clip.path} draggable={false}
          style={{ position: 'absolute', zIndex: trackIndex + 1, opacity, transform: `translate(${x}px, ${y}px) scale(${scale})`, filter: `brightness(${1 + (clip.properties?.brightness ?? 0)}) contrast(${clip.properties?.contrast ?? 1}) saturate(${clip.properties?.saturation ?? 1})`, objectFit: 'contain', width: '100%', height: '100%' }} />;
      })}
      {active.filter(c => c.type === 'audio').map(clip => <audio key={clip.id} ref={el => { if (el) mediaRefs.current[clip.id] = el; else delete mediaRefs.current[clip.id]; }} src={clip.properties?.proxyPath || clip.path} preload="auto" />)}
      {active.filter(c => c.type === 'text').map(clip => {
        const local = currentTime - clip.start;
        const opacity = keyframedValue(clip.properties?.keyframes, 'opacity', local, clip.properties?.opacity ?? 1);
        return <div key={clip.id} className="text-overlay" style={{ left: clip.properties?.x ?? 50, top: clip.properties?.y ?? 50, color: clip.properties?.color ?? '#fff', fontSize: clip.properties?.fontSize ?? 40, opacity }}>{clip.properties?.text ?? clip.path}</div>;
      })}
      {!active.some(c => c.type === 'video' || c.type === 'image') && <div className="no-media">No video at {currentTime.toFixed(1)}s</div>}
    </div>
  </div>;
});

export default VideoPlayer;
