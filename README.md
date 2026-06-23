# Video Editor

A local-first desktop video editor built with Electron, React, TypeScript, Konva, Zustand and FFmpeg.

## Current capabilities

- Multi-track video, audio and text timeline
- Import common video/audio formats and SRT subtitles
- Preview, seek, play, stop, volume and fullscreen controls
- Drag, split, trim, ripple-trim, duplicate and delete clips
- Selection-aware editing and type-safe track movement
- Text overlays, fades/dissolves and color adjustments
- Opacity and motion keyframes in the real-time preview
- Automatic project duration and timeline zoom
- MP4 export with mixed audio, text, color filters and transitions
- Automatic hardware H.264 encoder detection with CPU fallback
- 720p proxy generation for smoother editing on modest laptops
- Light and dark themes

## Development

```bash
npm install
npm run dev:electron
```

Validation and production build:

```bash
npx tsc --noEmit
npm run build
npm start
```

Exports and proxies are processed locally. The browser-only Vite view supports editing and preview, but file-system export requires Electron.

## Scope

This version targets practical simple-to-intermediate editing. GPU encoding and proxy workflows are included. Model-backed AI effects and automatic object motion tracking are not bundled: those require dedicated models, tracking algorithms and hardware-specific integration. Motion can currently be animated manually with keyframes.
