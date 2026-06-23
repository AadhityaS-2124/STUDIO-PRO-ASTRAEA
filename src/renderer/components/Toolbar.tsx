
import React from 'react';

interface ToolbarProps {
  onSplit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onImportSRT: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onExport: () => void;
}

export default function Toolbar({ onSplit, onDelete, onDuplicate, onImportSRT, onZoomIn, onZoomOut, onExport }: ToolbarProps) {
  return (
    <div className="h-9 bg-surface-container-lowest px-4 flex items-center justify-between border-b border-outline-variant text-ui-label-md font-ui-label-md shrink-0">
      <div className="flex items-center gap-4">
        <span className="font-label-caps text-primary uppercase tracking-widest text-[11px]">MASTER SEQUENCE</span>
        
        {/* Edit controls */}
        <div className="flex items-center gap-1 border-l border-outline-variant pl-4 ml-2">
          <button 
            onClick={onSplit} 
            title="Split Clip (S)" 
            className="h-6 px-2 hover:bg-surface-container-highest text-on-surface-variant hover:text-primary rounded transition-colors flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[16px]">content_cut</span>
            <span>Split</span>
          </button>
          <button 
            onClick={onDelete} 
            title="Delete Selected (Del)" 
            className="h-6 px-2 hover:bg-error-container text-on-surface-variant hover:text-error rounded transition-colors flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[16px]">delete</span>
            <span>Delete</span>
          </button>
          <button 
            onClick={onDuplicate} 
            title="Duplicate (Ctrl+D)" 
            className="h-6 px-2 hover:bg-surface-container-highest text-on-surface-variant hover:text-primary rounded transition-colors flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[16px]">content_copy</span>
            <span>Duplicate</span>
          </button>
        </div>

        {/* SRT Import */}
        <div className="flex items-center gap-1 border-l border-outline-variant pl-4 ml-2">
          <button 
            onClick={onImportSRT} 
            title="Import Subtitles (SRT)" 
            className="h-6 px-2 hover:bg-surface-container-highest text-on-surface-variant hover:text-primary rounded transition-colors flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[16px]">subtitles</span>
            <span>Import SRT</span>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Zoom Controls */}
        <div className="flex items-center gap-2">
          <button 
            onClick={onZoomOut} 
            title="Zoom Out" 
            className="w-6 h-6 hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface rounded flex items-center justify-center transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">zoom_out</span>
          </button>
          <div className="w-20 h-1 bg-surface-container-highest rounded-full relative">
            <div className="absolute top-0 left-0 h-full w-1/3 bg-primary rounded-full"></div>
          </div>
          <button 
            onClick={onZoomIn} 
            title="Zoom In" 
            className="w-6 h-6 hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface rounded flex items-center justify-center transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">zoom_in</span>
          </button>
        </div>

        {/* Export Shortcut (Secondary Trigger) */}
        <button 
          onClick={onExport} 
          className="h-6 px-2.5 bg-primary/20 border border-primary/45 text-primary hover:bg-primary/30 rounded text-[10px] uppercase font-ui-label-bold tracking-wider transition-all"
        >
          Export
        </button>
      </div>
    </div>
  );
}