import { create } from 'zustand';

export type ClipType = 'video' | 'audio' | 'text' | 'image';
export type TransitionType = 'none' | 'fade' | 'dissolve';

export interface Keyframe {
  id: string;
  time: number;
  property: 'opacity' | 'scale' | 'x' | 'y';
  value: number;
}

export interface ClipProperties {
  text?: string;
  fontSize?: number;
  color?: string;
  x?: number;
  y?: number;
  scale?: number;
  width?: number;
  height?: number;
  opacity?: number;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  transition?: TransitionType;
  transitionDuration?: number;
  keyframes?: Keyframe[];
  proxyPath?: string;
  codec?: string;
  audioCodec?: string;
}

export interface Clip {
  id: string;
  trackId: string;
  start: number;
  duration: number;
  offset: number;
  type: ClipType;
  path: string;
  name: string;
  properties?: ClipProperties;
}

export interface Track {
  id: string;
  type: 'video' | 'audio' | 'text' | 'image';
  name: string;
  isMuted?: boolean;
  isHidden?: boolean;
}

interface TimelineState {
  clips: Clip[];
  tracks: Track[];
  duration: number;
  selectedClipId: string | null;
  selectedClipIds: string[];
  zoom: number;
  isPlaying: boolean;
  isLooping: boolean;
  loopRegion: { start: number; end: number; active: boolean };
  addTrack: (type: Track['type']) => string;
  removeTrack: (id: string) => void;
  addClip: (clip: Omit<Clip, 'id'>) => string;
  updateClip: (id: string, updates: Partial<Clip>) => void;
  updateClipPosition: (id: string, newStart: number, newTrackId?: string) => void;
  removeClip: (id: string) => void;
  removeClips: (ids: string[]) => void;
  selectAllClips: () => void;
  splitClip: (id: string, splitPoint: number) => string | null;
  duplicateClip: (id: string) => string | null;
  rippleTrimClip: (id: string, newDuration: number) => void;
  trimStartToPlayhead: (id: string, playheadTime: number) => void;
  trimEndToPlayhead: (id: string, playheadTime: number) => void;
  addKeyframe: (clipId: string, keyframe: Omit<Keyframe, 'id'>) => void;
  setSelectedClip: (id: string | null) => void;
  setZoom: (zoom: number) => void;
  setDuration: (duration: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setIsLooping: (isLooping: boolean) => void;
  setLoopRegion: (region: Partial<TimelineState['loopRegion']>) => void;
  resetProject: () => void;
  skipDuration: number;
  clipboardClip: Omit<Clip, 'id'> | null;
  setSkipDuration: (seconds: number) => void;
  copyClip: (id: string) => void;
  cutClip: (id: string) => void;
  pasteClip: (playheadTime: number) => string | null;
  loadProject: (state: Pick<TimelineState, 'clips' | 'tracks' | 'duration'>) => void;
  past: Pick<TimelineState, 'clips' | 'tracks' | 'duration'>[];
  future: Pick<TimelineState, 'clips' | 'tracks' | 'duration'>[];
  undo: () => void;
  redo: () => void;
  saveHistory: () => void;
  isTransactionActive: boolean;
  startTransaction: () => void;
  endTransaction: () => void;
}

const initialTracks: Track[] = [
  { id: 'video-1', type: 'video', name: 'Video 1' },
  { id: 'image-1', type: 'image', name: 'Image Overlay' },
  { id: 'audio-1', type: 'audio', name: 'Audio 1' },
  { id: 'text-1', type: 'text', name: 'Text Overlay' }
];
const initialClips: Clip[] = [];

const nextId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const projectEnd = (clips: Clip[]) => Math.max(1, ...clips.map(c => c.start + c.duration));
const withDuration = (clips: Clip[]) => ({ clips, duration: projectEnd(clips) });

export const useTimelineStore = create<TimelineState>((set, get) => ({
  clips: initialClips,
  tracks: initialTracks,
  duration: projectEnd(initialClips),
  selectedClipId: null,
  selectedClipIds: [],
  zoom: 1,
  isPlaying: false,
  isLooping: false,
  loopRegion: { start: 0, end: 10, active: false },
  skipDuration: 5,
  clipboardClip: null,
  past: [],
  future: [],
  isTransactionActive: false,

  startTransaction: () => {
    const { clips, tracks, duration } = get();
    set(state => ({
      past: [...state.past, structuredClone({ clips, tracks, duration })].slice(-50),
      future: [],
      isTransactionActive: true
    }));
  },

  endTransaction: () => {
    set({ isTransactionActive: false });
  },

  saveHistory: () => {
    const { clips, tracks, duration, isTransactionActive } = get();
    if (isTransactionActive) return;
    set(state => ({
      past: [...state.past, structuredClone({ clips, tracks, duration })].slice(-50),
      future: []
    }));
  },
  undo: () => set(state => {
    if (state.past.length === 0) return state;
    const previous = state.past[state.past.length - 1];
    return {
      past: state.past.slice(0, -1),
      future: [structuredClone({ clips: state.clips, tracks: state.tracks, duration: state.duration }), ...state.future],
      clips: structuredClone(previous.clips),
      tracks: structuredClone(previous.tracks),
      duration: previous.duration,
      selectedClipId: null,
      selectedClipIds: []
    };
  }),
  redo: () => set(state => {
    if (state.future.length === 0) return state;
    const next = state.future[0];
    return {
      past: [...state.past, structuredClone({ clips: state.clips, tracks: state.tracks, duration: state.duration })],
      future: state.future.slice(1),
      clips: structuredClone(next.clips),
      tracks: structuredClone(next.tracks),
      duration: next.duration,
      selectedClipId: null,
      selectedClipIds: []
    };
  }),

  loadProject: (loadedState) => set({
    clips: loadedState.clips || [],
    tracks: loadedState.tracks || [],
    duration: loadedState.duration || 10,
    selectedClipId: null,
    selectedClipIds: [],
    clipboardClip: null,
    past: [],
    future: [],
    isTransactionActive: false
  }),

  addTrack: (type) => {
    get().saveHistory();
    const id = `${type}-${nextId()}`;
    set(state => ({ tracks: [...state.tracks, { id, type, name: `${type[0].toUpperCase()}${type.slice(1)} ${state.tracks.filter(t => t.type === type).length + 1}` }] }));
    return id;
  },
  removeTrack: (id) => {
    get().saveHistory();
    set(state => {
      const clips = state.clips.filter(c => c.trackId !== id);
      return { tracks: state.tracks.filter(t => t.id !== id), ...withDuration(clips), selectedClipId: null };
    });
  },
  addClip: (clip) => {
    get().saveHistory();
    const id = nextId();
    set(state => withDuration([...state.clips, { ...clip, id, offset: clip.offset ?? 0 }]));
    return id;
  },
  updateClip: (id, updates) => {
    get().saveHistory();
    set(state => withDuration(state.clips.map(c => c.id === id ? { ...c, ...updates } : c)));
  },
  updateClipPosition: (id, newStart, newTrackId) => {
    get().saveHistory();
    set(state => {
      const clip = state.clips.find(c => c.id === id);
      const target = state.tracks.find(t => t.id === newTrackId);
      const compatibleTrackId = target && clip && (target.type === clip.type) ? target.id : clip?.trackId;
      return withDuration(state.clips.map(c => c.id === id ? { ...c, start: Math.max(0, newStart), trackId: compatibleTrackId ?? c.trackId } : c));
    });
  },
  removeClip: (id) => {
    get().saveHistory();
    set(state => ({ ...withDuration(state.clips.filter(c => c.id !== id)), selectedClipId: state.selectedClipId === id ? null : state.selectedClipId, selectedClipIds: state.selectedClipIds.filter(cid => cid !== id) }));
  },
  removeClips: (ids) => {
    get().saveHistory();
    set(state => ({ ...withDuration(state.clips.filter(c => !ids.includes(c.id))), selectedClipId: null, selectedClipIds: [] }));
  },
  selectAllClips: () => {
    set(state => ({ selectedClipIds: state.clips.map(c => c.id), selectedClipId: state.clips[0]?.id || null }));
  },
  splitClip: (id, splitPoint) => {
    const clip = get().clips.find(c => c.id === id);
    if (!clip || splitPoint <= clip.start + 0.1 || splitPoint >= clip.start + clip.duration - 0.1) return null;
    const firstDuration = splitPoint - clip.start;
    const { id: _id, ...copy } = clip;
    get().updateClip(id, { duration: firstDuration });
    return get().addClip({ ...copy, start: splitPoint, offset: clip.offset + firstDuration, duration: clip.duration - firstDuration });
  },
  duplicateClip: (id) => {
    const clip = get().clips.find(c => c.id === id);
    if (!clip) return null;
    const { id: _id, ...copy } = clip;
    const newId = get().addClip({ ...copy, start: clip.start + clip.duration, properties: { ...clip.properties, keyframes: clip.properties?.keyframes?.map(k => ({ ...k, id: nextId() })) } });
    set({ selectedClipId: newId, selectedClipIds: [newId] });
    return newId;
  },
  rippleTrimClip: (id, newDuration) => {
    get().saveHistory();
    set(state => {
      const target = state.clips.find(c => c.id === id);
      if (!target) return state;
      const duration = Math.max(0.1, newDuration);
      const delta = duration - target.duration;
      return withDuration(state.clips.map(c => c.id === id ? { ...c, duration } : c.trackId === target.trackId && c.start >= target.start + target.duration ? { ...c, start: Math.max(0, c.start + delta) } : c));
    });
  },
  trimStartToPlayhead: (id, time) => {
    get().saveHistory();
    set(state => {
      const clip = state.clips.find(c => c.id === id);
      if (!clip || time <= clip.start || time >= clip.start + clip.duration) return state;
      const delta = time - clip.start;
      return withDuration(state.clips.map(c => c.id === id ? { ...c, start: time, offset: c.offset + delta, duration: c.duration - delta } : c));
    });
  },
  trimEndToPlayhead: (id, time) => {
    get().saveHistory();
    set(state => {
      const clip = state.clips.find(c => c.id === id);
      if (!clip || time <= clip.start || time >= clip.start + clip.duration) return state;
      return withDuration(state.clips.map(c => c.id === id ? { ...c, duration: time - clip.start } : c));
    });
  },
  addKeyframe: (clipId, keyframe) => {
    get().saveHistory();
    set(state => ({ clips: state.clips.map(c => c.id === clipId ? { ...c, properties: { ...c.properties, keyframes: [...(c.properties?.keyframes ?? []), { ...keyframe, id: nextId() }].sort((a, b) => a.time - b.time) } } : c) }));
  },
  setSelectedClip: (selectedClipId) => set({ selectedClipId, selectedClipIds: selectedClipId ? [selectedClipId] : [] }),
  setZoom: (zoom) => set({ zoom: Math.min(10, Math.max(0.25, zoom)) }),
  setDuration: (duration) => set({ duration: Math.max(1, duration) }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setIsLooping: (isLooping) => set({ isLooping }),
  setLoopRegion: (region) => set(state => ({ loopRegion: { ...state.loopRegion, ...region } })),
  resetProject: () => set({ clips: [], tracks: initialTracks, duration: 1, selectedClipId: null, selectedClipIds: [], isPlaying: false, loopRegion: { start: 0, end: 10, active: false } }),
  setSkipDuration: (seconds) => set({ skipDuration: Math.max(1, seconds) }),
  copyClip: (id) => set(state => {
    const clip = state.clips.find(c => c.id === id);
    if (!clip) return state;
    const { id: _id, ...copy } = clip;
    const properties = copy.properties ? JSON.parse(JSON.stringify(copy.properties)) : undefined;
    return { clipboardClip: { ...copy, properties } };
  }),
  cutClip: (id) => {
    get().copyClip(id);
    get().removeClip(id);
  },
  pasteClip: (playheadTime) => {
    const clipToPaste = get().clipboardClip;
    if (!clipToPaste) return null;
    const properties = clipToPaste.properties ? JSON.parse(JSON.stringify(clipToPaste.properties)) : undefined;
    if (properties?.keyframes) properties.keyframes = properties.keyframes.map((k: any) => ({ ...k, id: nextId() }));
    let targetTrackId = clipToPaste.trackId;
    if (!get().tracks.some(t => t.id === targetTrackId)) {
      const fallbackTrack = get().tracks.find(t => t.type === clipToPaste.type);
      if (fallbackTrack) targetTrackId = fallbackTrack.id;
    }
    const newId = get().addClip({ ...clipToPaste, trackId: targetTrackId, start: playheadTime, properties });
    set({ selectedClipId: newId, selectedClipIds: [newId] });
    return newId;
  }
}));
