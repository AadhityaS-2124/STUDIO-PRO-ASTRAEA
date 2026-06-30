import React, { useRef, useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Stage, Layer, Rect, Line, Group, Text, Circle } from 'react-konva';
import { useTimelineStore, Clip, Track } from '../stores/timelineStore';
import { useThemeStore } from '../stores/themeStore';
import ContextMenu from './ContextMenu';
import './Timeline.css';

const HEADER_WIDTH = 100;
const TRACK_HEIGHT = 50;
const RULER_HEIGHT = 30;

export interface TimelineHandle {
  updatePlayhead: (time: number) => void;
}

interface TimelineProps {
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  onTimeScrub: (time: number) => void;
}

const Timeline = forwardRef<TimelineHandle, TimelineProps>(({ currentTime, onTimeUpdate, onTimeScrub }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const playheadLineRef = useRef<any>(null);
  const playheadCircleRef = useRef<any>(null);

  const [stageWidth, setStageWidth] = useState(800);
  const [isDragging, setIsDragging] = useState(false);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; clipId: string } | null>(null);

  const {
    clips, tracks, updateClipPosition, updateClip, duration: maxDuration,
    rippleTrimClip, loopRegion, setLoopRegion,
    splitClip, duplicateClip, trimStartToPlayhead, trimEndToPlayhead,
    selectedClip, setSelectedClip, zoom, startTransaction, endTransaction,
    cutClip, copyClip, pasteClip
  } = useTimelineStore((state) => ({
    clips: state.clips,
    tracks: state.tracks,
    updateClipPosition: state.updateClipPosition,
    updateClip: state.updateClip,
    duration: state.duration,
    rippleTrimClip: state.rippleTrimClip,
    loopRegion: state.loopRegion,
    setLoopRegion: state.setLoopRegion,
    splitClip: state.splitClip,
    duplicateClip: state.duplicateClip,
    trimStartToPlayhead: state.trimStartToPlayhead,
    trimEndToPlayhead: state.trimEndToPlayhead,
    selectedClip: state.selectedClipId,
    setSelectedClip: state.setSelectedClip,
    zoom: state.zoom,
    cutClip: state.cutClip,
    copyClip: state.copyClip,
    pasteClip: state.pasteClip,
    startTransaction: state.startTransaction,
    endTransaction: state.endTransaction
  }));

  const { canvasTheme } = useThemeStore();

  // const TRACK_HEIGHT = 80; // Old value
  // const HEADER_WIDTH = 150; // Old value
  // const RULER_HEIGHT = 30; // Old value

  // const timelineHeight = tracks.length * TRACK_HEIGHT + RULER_HEIGHT + 20; // Old calculation
  const pixelsPerSecond = 20 * zoom;
  const visibleDuration = (stageWidth - HEADER_WIDTH) / pixelsPerSecond;
  const timelineHeight = RULER_HEIGHT + (tracks.length * TRACK_HEIGHT) + 50;

  // Support up to 2 hours
  // const maxDuration = 7200; // Old value

  // Calculate total duration
  // const totalDuration = Math.max( // Old calculation
  //   clips.reduce((max, clip) => Math.max(max, clip.start + clip.duration), 0),
  //   300
  // );

  // const visibleDuration = Math.min(maxDuration, totalDuration * (1 / zoom)); // Old calculation
  // const pixelsPerSecond = (stageWidth - HEADER_WIDTH) / visibleDuration; // Old calculation

  const getClipColor = (type: Clip['type']) => {
    switch (type) {
      case 'video': return '#3498db';
      case 'audio': return '#2ecc71';
      case 'text': return '#e67e22';
      case 'image': return '#9b59b6';
      default: return '#95a5a6';
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Expose imperative methods to parent
  useImperativeHandle(ref, () => ({
    updatePlayhead: (time: number) => {
      const x = HEADER_WIDTH + (time * pixelsPerSecond);

      if (playheadLineRef.current) {
        playheadLineRef.current.points([x, 0, x, timelineHeight]);
      }

      if (playheadCircleRef.current) {
        playheadCircleRef.current.x(x);
      }

      if (layerRef.current) {
        layerRef.current.batchDraw();
      }
    }
  }));

  useEffect(() => {
    // Dynamic resizing with ResizeObserver
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect) {
          setStageWidth(entry.contentRect.width);
        }
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const handleTimelineClick = (e: any) => {
    if (isDragging || isDraggingPlayhead) return;
    setContextMenu(null); // Close context menu on general timeline click

    const stage = stageRef.current;
    if (stage) {
      const pointerPosition = stage.getPointerPosition();
      const x = pointerPosition.x;

      if (x > HEADER_WIDTH) {
        const clickTime = (x - HEADER_WIDTH) / pixelsPerSecond;
        onTimeUpdate(Math.max(0, Math.min(clickTime, maxDuration)));
      }
    }
  };

  const snapToFrame = (time: number, fps: number = 30) => {
    return Math.round(time * fps) / fps;
  };

  const snapTime = (time: number, clipId: string, duration: number) => {
    const threshold = 10 / pixelsPerSecond;
    let bestTime = time;
    let minDiff = threshold;

    const targets: number[] = [0, currentTime];
    if (loopRegion && loopRegion.active) {
      targets.push(loopRegion.start, loopRegion.end);
    }

    clips.forEach(c => {
      if (c.id !== clipId) {
        targets.push(c.start);
        targets.push(c.start + c.duration);
      }
    });

    for (const target of targets) {
      const diff = Math.abs(time - target);
      if (diff < minDiff) {
        minDiff = diff;
        bestTime = target;
      }
    }

    for (const target of targets) {
      const diff = Math.abs((time + duration) - target);
      if (diff < minDiff) {
        minDiff = diff;
        bestTime = target - duration;
      }
    }

    return bestTime;
  };

  const playheadX = HEADER_WIDTH + (currentTime * pixelsPerSecond);

  const handlePlayheadDragMove = (e: any) => {
    const x = Math.max(HEADER_WIDTH, Math.min(e.target.x(), stageWidth));
    let newTime = (x - HEADER_WIDTH) / pixelsPerSecond;
    newTime = snapToFrame(newTime, 30);
    const snappedX = HEADER_WIDTH + (newTime * pixelsPerSecond);

    if (playheadLineRef.current) {
      playheadLineRef.current.points([snappedX, 0, snappedX, timelineHeight]);
    }

    onTimeScrub(Math.max(0, Math.min(newTime, maxDuration)));

    e.target.x(snappedX);
    e.target.y(RULER_HEIGHT);
  };

  const handleDragEnd = (e: any, clip: Clip) => {
    const x = e.target.x();
    const y = e.target.y();

    let newStart = Math.max(0, (x - HEADER_WIDTH) / pixelsPerSecond);
    newStart = snapToFrame(newStart, 30);

    const trackIndex = Math.floor((y - RULER_HEIGHT) / TRACK_HEIGHT);
    const targetTrack = tracks[Math.max(0, Math.min(trackIndex, tracks.length - 1))];

    if (targetTrack) {
      // Re-validate overlap before saving
      const otherClips = clips.filter(c => c.trackId === targetTrack.id && c.id !== clip.id);
      let prevEnd = 0;
      let nextStart = Infinity;
      otherClips.forEach(c => {
        if (c.start + c.duration <= newStart + 0.001) {
          prevEnd = Math.max(prevEnd, c.start + c.duration);
        } else if (c.start >= newStart + clip.duration - 0.001) {
          nextStart = Math.min(nextStart, c.start);
        }
      });
      if (newStart < prevEnd) newStart = prevEnd;
      if (newStart + clip.duration > nextStart) newStart = nextStart - clip.duration;
      newStart = Math.max(0, snapToFrame(newStart, 30));

      updateClipPosition(clip.id, newStart, targetTrack.id);
    } else {
      updateClipPosition(clip.id, newStart);
    }

    setIsDragging(false);
  };

  const onTrimRight = (e: any, clip: Clip) => {
    const changeX = e.target.x();
    let newDuration = Math.max(0.1, changeX / pixelsPerSecond);

    const snapThreshold = 10 / pixelsPerSecond;
    const targets = [currentTime];
    clips.forEach(c => {
      if (c.id !== clip.id) {
        targets.push(c.start, c.start + c.duration);
      }
    });

    for (const target of targets) {
      const endTime = clip.start + newDuration;
      if (Math.abs(endTime - target) < snapThreshold) {
        newDuration = target - clip.start;
        break;
      }
    }

    const otherClips = clips.filter(c => c.trackId === clip.trackId && c.id !== clip.id);
    const nextClips = otherClips.filter(c => c.start >= clip.start + clip.duration - 0.001);
    const minNextStart = nextClips.length ? Math.min(...nextClips.map(c => c.start)) : Infinity;
    if (clip.start + newDuration > minNextStart) {
      newDuration = minNextStart - clip.start;
    }

    newDuration = Math.max(0.1, snapToFrame(newDuration, 30));
    rippleTrimClip(clip.id, newDuration);
    e.target.x(newDuration * pixelsPerSecond);
  };

  const onTrimLeft = (e: any, clip: Clip) => {
    const changeX = e.target.x();
    const changeTime = changeX / pixelsPerSecond;

    if (changeTime !== 0) {
      let newStart = clip.start + changeTime;
      let newDuration = clip.duration - changeTime;
      let newOffset = (clip.offset || 0) + changeTime;

      const snapThreshold = 10 / pixelsPerSecond;
      const targets = [0, currentTime];
      clips.forEach(c => {
        if (c.id !== clip.id) {
          targets.push(c.start, c.start + c.duration);
        }
      });

      for (const target of targets) {
        if (Math.abs(newStart - target) < snapThreshold) {
          const diff = target - newStart;
          newStart = target;
          newDuration -= diff;
          newOffset += diff;
          break;
        }
      }

      const otherClips = clips.filter(c => c.trackId === clip.trackId && c.id !== clip.id);
      const prevClips = otherClips.filter(c => c.start + c.duration <= clip.start + 0.001);
      const maxPrevEnd = prevClips.length ? Math.max(...prevClips.map(c => c.start + c.duration)) : 0;
      if (newStart < maxPrevEnd) {
        const diff = maxPrevEnd - newStart;
        newStart = maxPrevEnd;
        newDuration -= diff;
        newOffset += diff;
      }

      newStart = snapToFrame(newStart, 30);
      newDuration = snapToFrame(newDuration, 30);
      newOffset = snapToFrame(newOffset, 30);

      if (newDuration > 0.1) {
        updateClip(clip.id, {
          start: newStart,
          duration: newDuration,
          offset: newOffset
        });
      }
    }

    e.target.x(0);
  };

  const getFileName = (path: string) => {
    if (path.startsWith('file://')) {
      return decodeURIComponent(path.replace('file://', '')).split(/[/\\]/).pop() || path;
    }
    try {
      return new URL(path).pathname.split('/').pop() || path;
    } catch (e) {
      return path;
    }
  };

  const handleContextMenu = (e: any, clipId: string) => {
    e.evt.preventDefault(); // Block browser context menu
    const stage = e.target.getStage();
    const pointerPosition = stage.getPointerPosition();

    setContextMenu({
      x: pointerPosition.x + containerRef.current!.getBoundingClientRect().left, // Adjust for absolute position
      y: pointerPosition.y + containerRef.current!.getBoundingClientRect().top,
      clipId
    });
  };

  const handleMenuAction = (action: string, clipId: string) => {
    switch (action) {
      case 'split':
        splitClip(clipId, currentTime);
        break;
      case 'trimStart':
        trimStartToPlayhead(clipId, currentTime);
        break;
      case 'trimEnd':
        trimEndToPlayhead(clipId, currentTime);
        break;
      case 'loop': {
        const clip = clips.find(c => c.id === clipId);
        if (clip) setLoopRegion({ start: clip.start, end: clip.start + clip.duration, active: true });
        break;
      }
      case 'duplicate':
        duplicateClip(clipId);
        break;
      case 'cut':
        cutClip(clipId);
        break;
      case 'copy':
        copyClip(clipId);
        break;
      case 'paste':
        pasteClip(currentTime);
        break;
    }
    setContextMenu(null);
  };

  return (
    <div className="timeline" ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <Stage
        ref={stageRef}
        width={stageWidth}
        height={timelineHeight}
        onClick={handleTimelineClick}
        onContextMenu={(e) => e.evt.preventDefault()}
      >
        <Layer ref={layerRef}>
          {/* Background */}
          <Rect x={0} y={0} width={stageWidth} height={timelineHeight} fill={canvasTheme.timelineBg} />

          {/* Ruler Background */}
          <Rect x={HEADER_WIDTH} y={0} width={stageWidth - HEADER_WIDTH} height={RULER_HEIGHT} fill={canvasTheme.rulerBg} />

          {/* Loop Region (Yellow Bar) */}
          {loopRegion.active && (
            <Rect
              x={HEADER_WIDTH + (loopRegion.start * pixelsPerSecond)}
              y={0}
              width={(loopRegion.end - loopRegion.start) * pixelsPerSecond}
              height={RULER_HEIGHT}
              fill="rgba(255, 255, 0, 0.3)"
              draggable
              dragBoundFunc={(pos) => ({
                x: Math.max(HEADER_WIDTH, pos.x),
                y: 0
              })}
              onDragEnd={(e) => {
                const x = e.target.x();
                const newStart = (x - HEADER_WIDTH) / pixelsPerSecond;
                const duration = loopRegion.end - loopRegion.start;
                setLoopRegion({ start: newStart, end: newStart + duration });
              }}
            />
          )}

          {/* Time Markers */}
          {(() => {
            const interval = visibleDuration > 600 ? 60 : visibleDuration > 60 ? 10 : 1;
            const markerCount = Math.ceil(visibleDuration / interval);

            return Array.from({ length: markerCount }).map((_, i) => {
              const time = i * interval;
              const x = HEADER_WIDTH + (time * pixelsPerSecond);
              if (x > stageWidth) return null;

              return (
                <Group key={`marker-${i}`}>
                  <Line points={[x, 0, x, timelineHeight]} stroke={canvasTheme.gridLine} strokeWidth={1} dash={[2, 2]} />
                  <Text text={formatTime(time)} x={x + 2} y={5} fontSize={10} fill={canvasTheme.rulerText} />
                </Group>
              );
            });
          })()}

          {/* Tracks */}
          {tracks.map((track, index) => {
            const y = RULER_HEIGHT + (index * TRACK_HEIGHT);

            return (
              <Group key={track.id}>
                {/* Track Header */}
                <Rect x={0} y={y} width={HEADER_WIDTH} height={TRACK_HEIGHT} fill={canvasTheme.trackHeaderBg} stroke={canvasTheme.gridLine} strokeWidth={1} />
                <Text text={track.name} x={10} y={y + 10} fontSize={12} fill={canvasTheme.trackHeaderText} fontStyle="bold" />
                <Text text={track.type.toUpperCase()} x={10} y={y + 28} fontSize={10} fill={canvasTheme.rulerText} />

                {/* Track Lane */}
                <Rect x={HEADER_WIDTH} y={y} width={stageWidth - HEADER_WIDTH} height={TRACK_HEIGHT} fill={canvasTheme.trackBg} stroke={canvasTheme.gridLine} strokeWidth={1} />
              </Group>
            );
          })}

          {/* Clips */}
          {clips.map((clip) => {
            const trackIndex = tracks.findIndex(t => t.id === clip.trackId);
            if (trackIndex === -1) return null;

            const y = RULER_HEIGHT + (trackIndex * TRACK_HEIGHT) + 10;
            const x = HEADER_WIDTH + (clip.start * pixelsPerSecond);
            const width = clip.duration * pixelsPerSecond;
            const isSelected = selectedClip === clip.id;

            return (
              <Group
                key={clip.id}
                x={x}
                y={y}
                draggable
                dragBoundFunc={(pos) => {
                  if (!stageRef.current) return pos;
                  const stageAbsPos = stageRef.current.getAbsolutePosition();
                  
                  // Calculate time relative to timeline start
                  const relativeX = pos.x - stageAbsPos.x - HEADER_WIDTH;
                  const rawTime = relativeX / pixelsPerSecond;
                  
                  // Snap time
                  let snappedTime = snapTime(rawTime, clip.id, clip.duration);
                  snappedTime = snapToFrame(snappedTime, 30);
                  
                  // Track lane snapping (Y coordinate)
                  const relativeY = pos.y - stageAbsPos.y - RULER_HEIGHT;
                  const trackIndex = Math.round(relativeY / TRACK_HEIGHT);
                  const clampedTrackIndex = Math.max(0, Math.min(trackIndex, tracks.length - 1));
                  
                  // Overlap prevention on target track
                  const targetTrack = tracks[clampedTrackIndex];
                  const otherClips = clips.filter(c => c.trackId === targetTrack.id && c.id !== clip.id);
                  
                  let prevEnd = 0;
                  let nextStart = Infinity;
                  
                  otherClips.forEach(c => {
                    if (c.start + c.duration <= snappedTime + 0.001) {
                      prevEnd = Math.max(prevEnd, c.start + c.duration);
                    } else if (c.start >= snappedTime + clip.duration - 0.001) {
                      nextStart = Math.min(nextStart, c.start);
                    } else {
                      // We are overlapping. Find closer edge to clamp to
                      const toLeft = Math.abs(snappedTime - (c.start + c.duration));
                      const toRight = Math.abs((snappedTime + clip.duration) - c.start);
                      if (toLeft < toRight) {
                        prevEnd = Math.max(prevEnd, c.start + c.duration);
                      } else {
                        nextStart = Math.min(nextStart, c.start);
                      }
                    }
                  });
                  
                  // Clamp to prevent overlap
                  let clampedTime = snappedTime;
                  if (clampedTime < prevEnd) clampedTime = prevEnd;
                  if (clampedTime + clip.duration > nextStart) clampedTime = nextStart - clip.duration;
                  
                  clampedTime = Math.max(0, snapToFrame(clampedTime, 30));
                  
                  const finalAbsX = stageAbsPos.x + HEADER_WIDTH + (clampedTime * pixelsPerSecond);
                  const finalAbsY = stageAbsPos.y + RULER_HEIGHT + (clampedTrackIndex * TRACK_HEIGHT) + 10;
                  
                  return {
                    x: finalAbsX,
                    y: finalAbsY
                  };
                }}
                onDragStart={() => {
                  startTransaction();
                  setIsDragging(true);
                  setSelectedClip(clip.id);
                  setContextMenu(null); // Close context menu on drag start
                }}
                onDragEnd={(e) => {
                  handleDragEnd(e, clip);
                  endTransaction();
                }}
                onClick={(e) => {
                  e.cancelBubble = true;
                  setSelectedClip(clip.id);
                  setContextMenu(null); // Close context menu on click
                }}
                onContextMenu={(e) => handleContextMenu(e, clip.id)}
              >
                <Rect
                  width={width}
                  height={TRACK_HEIGHT - 20}
                  fill={getClipColor(clip.type)}
                  cornerRadius={2}
                  stroke={isSelected ? '#c0c1ff' : clip.type === 'video' ? 'rgba(139, 92, 246, 0.4)' : clip.type === 'audio' ? 'rgba(192, 196, 234, 0.3)' : 'rgba(139, 92, 246, 0.5)'}
                  strokeWidth={isSelected ? 1.5 : 1}
                  shadowColor={isSelected ? '#c0c1ff' : 'black'}
                  shadowBlur={isSelected ? 6 : 2}
                  shadowOpacity={isSelected ? 0.35 : 0.2}
                />
                <Text
                  text={clip.name || getFileName(clip.path)}
                  x={8}
                  y={6}
                  width={width - 16}
                  fontSize={10}
                  fontFamily="Inter"
                  fontStyle="600"
                  fill={clip.type === 'audio' ? '#c0c4ea' : '#dfe2f0'}
                  ellipsis={true}
                />
                <Text
                  text={`${clip.duration.toFixed(1)}s`}
                  x={5}
                  y={25}
                  fontSize={10}
                  fill="rgba(255,255,255,0.7)"
                />

                {/* Trim Handles (Only if selected) */}
                {isSelected && (
                  <>
                    {/* Left Handle */}
                    <Rect
                      x={0}
                      y={0}
                      width={10}
                      height={TRACK_HEIGHT - 20}
                      fill="rgba(255,255,255,0.5)"
                      draggable
                      dragBoundFunc={(pos) => {
                        if (!stageRef.current) return pos;
                        const stageAbsPos = stageRef.current.getAbsolutePosition();
                        return {
                          x: pos.x,
                          y: stageAbsPos.y + y
                        };
                      }}
                      onDragStart={() => startTransaction()}
                      onDragEnd={(e) => {
                        onTrimLeft(e, clip);
                        endTransaction();
                      }}
                      onMouseEnter={(e) => {
                        const container = e.target.getStage()?.container();
                        if (!container) return;
                        container.style.cursor = "ew-resize";
                      }}
                      onMouseLeave={(e) => {
                        const container = e.target.getStage()?.container();
                        if (!container) return;
                        container.style.cursor = "default";
                      }}
                    />
                    {/* Right Handle */}
                    <Rect
                      x={width - 10}
                      y={0}
                      width={10}
                      height={TRACK_HEIGHT - 20}
                      fill="rgba(255,255,255,0.5)"
                      draggable
                      dragBoundFunc={(pos) => {
                        if (!stageRef.current) return pos;
                        const stageAbsPos = stageRef.current.getAbsolutePosition();
                        return {
                          x: pos.x,
                          y: stageAbsPos.y + y
                        };
                      }}
                      onDragStart={() => startTransaction()}
                      onDragEnd={(e) => {
                        onTrimRight(e, clip);
                        endTransaction();
                      }}
                      onMouseEnter={(e) => {
                        const container = e.target.getStage()?.container();
                        if (!container) return;
                        container.style.cursor = "ew-resize";
                      }}
                      onMouseLeave={(e) => {
                        const container = e.target.getStage()?.container();
                        if (!container) return;
                        container.style.cursor = "default";
                      }}
                    />
                  </>
                )}
              </Group>
            );
          })}

          {/* Playhead */}
          <Line
            ref={playheadLineRef}
            points={[playheadX, 0, playheadX, timelineHeight]}
            stroke={canvasTheme.playheadColor}
            strokeWidth={2}
            listening={false} // Don't catch events on the line
          />
          <Circle
            ref={playheadCircleRef}
            x={playheadX}
            y={RULER_HEIGHT}
            radius={6}
            fill={canvasTheme.playheadColor}
            draggable
            dragBoundFunc={(pos) => ({
              x: Math.max(HEADER_WIDTH, Math.min(pos.x, stageWidth)),
              y: RULER_HEIGHT
            })}
            onDragStart={() => setIsDraggingPlayhead(true)}
            onDragEnd={() => {
              setIsDraggingPlayhead(false);
              const x = playheadCircleRef.current ? playheadCircleRef.current.x() : playheadX;
              const newTime = snapToFrame((x - HEADER_WIDTH) / pixelsPerSecond, 30);
              onTimeUpdate(Math.max(0, Math.min(newTime, maxDuration)));
            }}
            onDragMove={handlePlayheadDragMove}
          />
        </Layer>
      </Stage>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          clipId={contextMenu.clipId}
          onClose={() => setContextMenu(null)}
          onAction={handleMenuAction}
        />
      )}
    </div>
  );
});

export default Timeline;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getClipColor(type: string): string {
  switch (type) {
    case 'video': return '#1a1f3c';
    case 'audio': return '#0f131d';
    case 'text': return '#261b47';
    case 'image': return '#32235e';
    default: return '#1a1f3c';
  }
}
