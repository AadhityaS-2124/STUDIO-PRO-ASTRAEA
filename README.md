# STUDIO PRO — ASTRAEA

A local-first, desktop video editor built with Electron, React, and TypeScript. STUDIO PRO — ASTRAEA provides a lightweight, practical editing workflow for simple-to-intermediate projects with a focus on performance, reliability, and an intuitive multitrack timeline.

> Built with Electron, React, TypeScript, Konva, Zustand, and FFmpeg.

Table of contents

- [Key features](#key-features)
- [Screenshots](#screenshots)
- [Quick start](#quick-start)
- [Development](#development)
- [Build & Release](#build--release)
- [Architecture & design](#architecture--design)
- [Limitations and scope](#limitations-and-scope)
- [Contributing](#contributing)
- [License](#license)


## Key features

- Multitrack timeline supporting video, audio and text tracks
- Import common video/audio formats and SRT subtitles
- Playback controls: preview, seek, play/pause, stop, volume and fullscreen
- Clip editing: drag, split, trim, ripple-trim, duplicate and delete
- Selection-aware editing, type-safe track movement and keyboard shortcuts
- Text overlays, fades/dissolves, color adjustments and opacity keyframes
- Motion keyframes visible in the real-time preview
- Automatic project duration calculation and timeline zooming
- MP4 export with mixed audio, subtitles, color filters and transitions
- Automatic hardware H.264 encoder detection with CPU fallback
- 720p proxy generation for smoother editing on lower-powered machines
- Light and dark themes


## Screenshots

Add screenshots or short demo GIFs to `assets/` and reference them here for better project discoverability.


## Quick start

Prerequisites

- Node.js 18+ (or the version recommended in the project)
- npm or pnpm
- FFmpeg available on PATH (for exports and encoding)

Install dependencies and run the development Electron build:

```bash
npm install
npm run dev:electron
```

For type-checking, production build and running the packaged app:

```bash
npx tsc --noEmit
npm run build
npm start
```

Notes

- Exports and proxy generation are processed locally through FFmpeg and the Electron runtime. The browser-only Vite view supports editing and preview, but filesystem export requires Electron.


## Development

- Follow the code style and TypeScript rules used across the repository.
- Use feature branches and open pull requests for non-trivial changes.
- Add unit or integration tests for new logic where appropriate.

Scripts

- `npm run dev:electron` — Run the Electron-based dev build
- `npm run dev:vite` — Run the browser-only Vite view (preview & editing without exports)
- `npm run build` — Create a production build
- `npm start` — Start the packaged application


## Build & Release

- Build artifacts are produced by the `build` script. Packaging is handled by the project build tooling (check package.json for target platforms and configurations).
- Test exports and hardware-accelerated encoders on both low- and high-end machines to ensure fallbacks and proxies work as expected.


## Architecture & design

- Frontend: React + Konva for canvas-based timeline and preview rendering
- State: Zustand for lightweight, type-safe state management
- Background processing: Electron main process coordinates FFmpeg calls for encoding and proxy generation
- Media pipeline: Local FFmpeg instances perform encoding, muxing and proxy generation—no cloud processing by default


## Limitations and scope

This project targets practical, simple-to-intermediate editing workflows. The following advanced features are intentionally out of scope for this repository:

- Model-backed AI effects (e.g., generative or enhancement models)
- Automatic object motion tracking
- Large-scale collaborative editing or cloud rendering

If you'd like any of these features, please open an issue describing your use case.


## Contributing

Contributions are welcome. To contribute:

1. Fork the repository and create a feature branch
2. Run tests and linters locally
3. Open a pull request with a clear description and screenshots if applicable

Please follow the repository's code style and add tests for new functionality. For larger proposals, open an issue first to discuss the approach.


## License

This repository does not include a license file. Add a LICENSE file (for example, MIT or Apache-2.0) to clarify permitted usage.


## Contact & acknowledgements

Maintainer: AadhityaS-2124

Thanks to the upstream projects used in this app: Electron, React, Konva, Zustand and FFmpeg.
