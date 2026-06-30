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
        <div className="control-bar">
            {/* Time display */}
            <div className="time-display">
                <span id="current-time-display-node">{formatTime(currentTime)}</span> <span className="lcd-divider">/</span> {formatTime(totalDuration)}
            </div>

            {/* Playback Controls */}
            <div className="video-controls">
                <button
                    onClick={onStop}
                    title="Stop"
                    className="control-button stop-btn"
                >
                    <span className="material-symbols-outlined text-[18px]">stop</span>
                </button>
                <button
                    onClick={onSkipBackward}
                    title="Skip Backward"
                    className="control-button"
                >
                    <span className="material-symbols-outlined text-[18px]">replay_10</span>
                </button>
                <button
                    onClick={onPlayPause}
                    title={isPlaying ? "Pause" : "Play"}
                    className={`control-button play-pause-btn ${isPlaying ? 'playing' : 'paused'}`}
                >
                    <span className="material-symbols-outlined text-[20px] font-bold">
                        {isPlaying ? 'pause' : 'play_arrow'}
                    </span>
                </button>
                <button
                    onClick={onSkipForward}
                    title="Skip Forward"
                    className="control-button"
                >
                    <span className="material-symbols-outlined text-[18px]">forward_10</span>
                </button>
            </div>

            {/* Volume and Fullscreen */}
            <div className="volume-fullscreen-container">
                <div className="volume-container">
                    <span className="material-symbols-outlined volume-icon">
                        {volume === 0 ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up'}
                    </span>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={volume}
                        onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                        className="volume-slider"
                    />
                </div>
                <button
                    onClick={onFullscreen}
                    title="Fullscreen"
                    className="control-button"
                >
                    <span className="material-symbols-outlined text-[18px]">fullscreen</span>
                </button>
            </div>
        </div>
    );
});

export default ControlBar;
