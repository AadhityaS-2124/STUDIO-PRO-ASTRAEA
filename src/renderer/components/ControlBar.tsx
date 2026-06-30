import React from 'react';
import './ControlBar.css';

interface ControlBarProps {
    isPlaying: boolean;
    onPlayPause: () => void;
    onStop: () => void;
    onSkipBackward?: () => void;
    onSkipForward?: () => void;
    currentTime: number;
    totalDuration: number;
    volume: number;
    onVolumeChange: (volume: number) => void;
    onFullscreen: () => void;
}

const ControlBar = React.memo(function ControlBar({
    isPlaying,
    onPlayPause,
    onStop,
    onSkipBackward,
    onSkipForward,
    currentTime,
    totalDuration,
    volume,
    onVolumeChange,
    onFullscreen
}: ControlBarProps) {

    const formatTime = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 100);

        // Format: HH:MM:SS.ms
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    };

    return (
        <div className="h-10 bg-surface-container-lowest flex items-center px-4 justify-between border-t border-outline-variant text-ui-label-md font-ui-label-md select-none shrink-0 w-full">
            {/* Time display */}
            <div className="font-mono-code text-mono-code text-primary text-[11px] min-w-[150px]">
                <span id="current-time-display-node">{formatTime(currentTime)}</span> <span className="text-on-secondary-container">/</span> {formatTime(totalDuration)}
            </div>

            {/* Playback Controls */}
            <div className="flex items-center justify-center gap-2">
                <button
                    onClick={onStop}
                    title="Stop"
                    className="w-7 h-7 rounded flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-surface-container transition-colors mr-2"
                >
                    <span className="material-symbols-outlined text-[18px]">stop</span>
                </button>
                <button
                    onClick={onSkipBackward}
                    title="Skip Backward"
                    className="w-7 h-7 rounded flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors"
                >
                    <span className="material-symbols-outlined text-[18px]">replay_10</span>
                </button>
                <button
                    onClick={onPlayPause}
                    title={isPlaying ? "Pause" : "Play"}
                    className="w-8 h-8 mx-1 rounded-full bg-primary text-on-primary flex items-center justify-center hover:opacity-90 active:scale-95 shadow-[0_0_10px_rgba(192,193,255,0.3)] transition-all"
                >
                    <span className="material-symbols-outlined text-[20px] font-bold">
                        {isPlaying ? 'pause' : 'play_arrow'}
                    </span>
                </button>
                <button
                    onClick={onSkipForward}
                    title="Skip Forward"
                    className="w-7 h-7 rounded flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors"
                >
                    <span className="material-symbols-outlined text-[18px]">forward_10</span>
                </button>
            </div>

            {/* Volume and Fullscreen */}
            <div className="flex items-center gap-4 min-w-[150px] justify-end">
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
                        {volume === 0 ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up'}
                    </span>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={volume}
                        onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                        className="w-16 h-1 bg-surface-container-highest rounded-full appearance-none cursor-pointer accent-primary"
                    />
                </div>
                <button
                    onClick={onFullscreen}
                    title="Fullscreen"
                    className="w-7 h-7 rounded flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
                >
                    <span className="material-symbols-outlined text-[18px]">fullscreen</span>
                </button>
            </div>
        </div>
    );
});

export default ControlBar;
