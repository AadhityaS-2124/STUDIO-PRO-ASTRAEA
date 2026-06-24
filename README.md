# STUDIO PRO — ASTRAEA

![Electron](https://img.shields.io/badge/Electron-✔️-2b2b2b) ![React](https://img.shields.io/badge/React-✔️-61DAFB) ![TypeScript](https://img.shields.io/badge/TypeScript-✔️-3178C6) ![FFmpeg](https://img.shields.io/badge/FFmpeg-required-orange)

A local-first, desktop video editor built with Electron, React, and TypeScript. STUDIO PRO — ASTRAEA provides a lightweight, practical editing workflow for simple-to-intermediate projects with a focus on performance and local, privacy-friendly processing.

> Built with Electron, React, TypeScript, Konva, Zustand, and FFmpeg.

---

## Table of contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Quick start](#quick-start)
- [Development](#development)
- [Build & Release](#build--release)
- [Architecture & design](#architecture--design)
- [Limitations and scope](#limitations-and-scope)
- [Contributing](#contributing)
- [License](#license)
- [Contact & acknowledgements](#contact--acknowledgements)

---

## Features

- Multitrack timeline (video, audio, text)
- Import common media formats and SRT subtitles
- Clip editing: drag, split, trim, ripple-trim, duplicate, delete
- Selection-aware editing and keyboard shortcuts for faster workflows
- Text overlays, fades/dissolves, color adjustments and opacity keyframes
- Motion keyframes reflected in the real-time preview
- Automatic project duration calculation and timeline zooming
- MP4 export with mixed audio, subtitles, color filters and transitions
- Automatic hardware H.264 encoder detection with CPU fallback
- 720p proxy generation for smoother editing on lower-powered machines
- Light and dark themes


## Screenshots

Add screenshots or short demo GIFs to `assets/` and reference them here for better project discoverability. Example:

```markdown
![Editor overview](assets/screenshot-overview.png)
![Timeline detail](assets/screenshot-timeline.png)
```

Tip: include a short 5–10s GIF showing cut/trim + export to increase engagement.

---

## Quick start

Prerequisites

- Node.js 18+ (or the version recommended in the project)
- npm or pnpm
- FFmpeg available on PATH (required for exports and encoding)

Install dependencies and run the Electron development build:

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

- Exports and proxy generation run locally via FFmpeg through the Electron runtime. The browser-only Vite view supports editing and preview, but filesystem export requires Electron.

---

## Development

- Follow the TypeScript and repository coding conventions.
- Use feature branches and open pull requests for substantial changes.
- Add unit or integration tests for new logic where appropriate.

Useful scripts

- `npm run dev:electron` — Electron-based dev build
- `npm run dev:vite` — Browser-only Vite view (preview & editing without exports)
- `npm run build` — Create a production build
- `npm start` — Start the packaged application

---

## Build & Release

- Build artifacts are produced by the `build` script; packaging targets are configured in package.json.
- Test exports and hardware-accelerated encoders on low- and high-end machines to ensure fallbacks and proxies behave as expected.

---

## Architecture & design

- Frontend: React + Konva for canvas-based timeline and preview rendering
- State: Zustand for lightweight, type-safe state management
- Background processing: Electron main process coordinates FFmpeg calls for encoding and proxy generation
- Media pipeline: Local FFmpeg instances perform encoding, muxing and proxy generation — no cloud processing by default

---

## Limitations and scope

This project targets practical, simple-to-intermediate editing workflows. The following advanced features are intentionally out of scope:

- Model-backed AI effects (generative/enhancement)
- Automatic object motion tracking
- Large-scale collaborative editing or cloud rendering

If you'd like any of these features, please open an issue describing your use case.

---

## Contributing

Contributions are welcome. Suggested workflow:

1. Fork the repository and create a feature branch
2. Run tests and linters locally
3. Open a pull request with a clear description and screenshots where applicable

Please follow the repository's code style and add tests for new functionality. For larger proposals, open an issue first to discuss the approach.

---

## License

This repository does not include a license file. If you intend to reuse or redistribute this project, please add a LICENSE file or contact the maintainer for clarification.

---

## Contact & acknowledgements

Maintainer: AadhityaS-2124

Thanks to the upstream projects used in this app: Electron, React, Konva, Zustand and FFmpeg.
