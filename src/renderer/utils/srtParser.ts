import { Clip } from '../stores/timelineStore';

export const parseSRT = (srtContent: string, trackId: string): Omit<Clip, 'id'>[] => {
    const clips: Omit<Clip, 'id'>[] = [];
    const blocks = srtContent.replace(/\r\n/g, '\n').trim().split(/\n\s*\n/);

    blocks.forEach(block => {
        const lines = block.split('\n');
        if (lines.length < 3) return;

        // Line 1: Index (ignored)
        // Line 2: Timecode (00:00:01,000 --> 00:00:04,000)
        const timecodeLine = lines[1];
        const [startStr, endStr] = timecodeLine.split(' --> ');

        if (!startStr || !endStr) return;

        const parseTime = (timeStr: string) => {
            const [h, m, s] = timeStr.replace(',', '.').split(':');
            return parseFloat(h) * 3600 + parseFloat(m) * 60 + parseFloat(s);
        };

        const start = parseTime(startStr);
        const end = parseTime(endStr);
        const duration = end - start;

        // Line 3+: Text
        const text = lines.slice(2).join('\n');

        clips.push({
            trackId,
            type: 'text',
            start,
            duration,
            offset: 0,
            path: text,
            name: 'Subtitle',
            properties: {
                text,
                fontSize: 24,
                color: '#ffffff',
                x: 50,
                y: 80, // Bottom area
                width: 800
            }
        });
    });

    return clips;
};
