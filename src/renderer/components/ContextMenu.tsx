import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface ContextMenuProps {
    x: number;
    y: number;
    clipId: string;
    onClose: () => void;
    onAction: (action: string, clipId: string) => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, clipId, onClose, onAction }) => {
    const menuRef = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [onClose]);

    const menuContent = (
        <div
            ref={menuRef}
            className="context-menu fixed z-[2147483646] bg-surface-container border border-outline-variant rounded-lg shadow-xl min-w-[160px] py-1 text-ui-label-md font-ui-label-md"
            style={{
                left: `${x}px`,
                top: `${y}px`,
            }}
        >
            <MenuItem onClick={() => onAction('cut', clipId)}>
                Cut
            </MenuItem>
            <MenuItem onClick={() => onAction('copy', clipId)}>
                Copy
            </MenuItem>
            <MenuItem onClick={() => onAction('paste', clipId)}>
                Paste at Playhead
            </MenuItem>
            <MenuDivider />
            <MenuItem onClick={() => onAction('split', clipId)}>
                Split at Playhead
            </MenuItem>
            <MenuItem onClick={() => onAction('trimStart', clipId)}>
                Trim Start to Playhead
            </MenuItem>
            <MenuItem onClick={() => onAction('trimEnd', clipId)}>
                Trim End to Playhead
            </MenuItem>
            <MenuDivider />
            <MenuItem onClick={() => onAction('loop', clipId)}>
                Toggle Loop
            </MenuItem>
            <MenuItem onClick={() => onAction('duplicate', clipId)}>
                Duplicate Clip
            </MenuItem>
        </div>
    );

    return createPortal(menuContent, document.body);
};

const MenuItem: React.FC<{ children: React.ReactNode; onClick: () => void }> = ({ children, onClick }) => (
    <div
        onClick={onClick}
        className="px-4 py-2 cursor-pointer text-on-surface hover:bg-surface-container-highest hover:text-primary transition-colors font-ui-label-md"
    >
        {children}
    </div>
);

const MenuDivider = () => (
    <div className="h-[1px] bg-outline-variant/30 my-1" />
);

export default ContextMenu;
