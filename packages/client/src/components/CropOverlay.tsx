import { useTranslation } from 'react-i18next';
import type { Clip, Project } from 'shared/types';
import { cropPreset, cropToCss } from '../lib/crop';

interface CropOverlayProps {
  clip: Clip;
  project: Project;
  onCropChange: (crop: Clip['crop']) => void;
}

const PRESETS: Array<{
  key: 'center' | 'left' | 'right' | 'top' | 'bottom';
  iconW: number;
  iconH: number;
  iconX: number;
  iconY: number;
}> = [
  { key: 'center', iconW: 12, iconH: 12, iconX: 4, iconY: 4 },
  { key: 'left', iconW: 10, iconH: 20, iconX: 0, iconY: 0 },
  { key: 'right', iconW: 10, iconH: 20, iconX: 10, iconY: 0 },
  { key: 'top', iconW: 20, iconH: 10, iconX: 0, iconY: 0 },
  { key: 'bottom', iconW: 20, iconH: 10, iconX: 0, iconY: 10 },
];

export default function CropOverlay({ clip, project, onCropChange }: CropOverlayProps) {
  const { t } = useTranslation();
  if (
    project.mode !== 'video' ||
    !project.aspect ||
    !clip.sourceWidth ||
    !clip.sourceHeight
  ) {
    return null;
  }

  const source = { w: clip.sourceWidth, h: clip.sourceHeight };
  const aspect = project.aspect;
  const applyPreset = (p: typeof PRESETS[number]['key']) => {
    onCropChange(cropPreset(p, source, aspect));
  };

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      <span className="text-sm text-gray-600 self-center">{t('crop.presets')}:</span>
      {PRESETS.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => applyPreset(p.key)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-primary-400 text-sm"
        >
          <span
            className="relative inline-block bg-gray-300"
            style={{ width: '20px', height: '20px' }}
          >
            <span
              className="absolute bg-primary-500"
              style={{
                left: `${p.iconX}px`,
                top: `${p.iconY}px`,
                width: `${p.iconW}px`,
                height: `${p.iconH}px`,
              }}
            />
          </span>
          {t(`crop.${p.key}`)}
        </button>
      ))}
    </div>
  );
}

export function videoCropStyle(clip: Clip): React.CSSProperties {
  if (!clip.crop) return {};
  return cropToCss(clip.crop);
}
