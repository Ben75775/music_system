import { useRef } from 'react';
import type { Clip, Project } from 'shared/types';

interface CropRectangleProps {
  clip: Clip;
  project: Project;
  onCropChange: (crop: Clip['crop']) => void;
  onCropCommit: (crop: Clip['crop']) => void;
}

export default function CropRectangle({
  clip,
  project,
  onCropChange,
  onCropCommit,
}: CropRectangleProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  if (project.mode !== 'video' || !project.aspect || project.aspect === 'original' || !clip.crop) return null;

  const crop = clip.crop;

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const start = { ...crop };
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    let latestCrop: Clip['crop'] = start;

    const onMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / rect.width;
      const dy = (ev.clientY - startY) / rect.height;
      const next = {
        x: Math.max(0, Math.min(1 - start.width, start.x + dx)),
        y: Math.max(0, Math.min(1 - start.height, start.y + dy)),
        width: start.width,
        height: start.height,
      };
      latestCrop = next;
      onCropChange(next);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      onCropCommit(latestCrop);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none"
    >
      <div
        onMouseDown={startDrag}
        className="absolute border-2 border-primary-400 cursor-move pointer-events-auto"
        style={{
          left: `${crop.x * 100}%`,
          top: `${crop.y * 100}%`,
          width: `${crop.width * 100}%`,
          height: `${crop.height * 100}%`,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)',
        }}
      />
    </div>
  );
}
