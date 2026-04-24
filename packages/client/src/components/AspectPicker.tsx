import { useTranslation } from 'react-i18next';
import type { Aspect } from 'shared/types';

interface AspectPickerProps {
  value: Aspect | undefined;
  locked: boolean;
  onChange: (aspect: Aspect) => void;
  onRequestChangeWhileLocked: () => void;
}

const OPTIONS: Array<{
  aspect: Aspect;
  nameKey: string;
  w: number; // px for the mini shape
  h: number;
}> = [
  { aspect: '16:9', nameKey: 'aspect.youtube', w: 32, h: 18 },
  { aspect: '9:16', nameKey: 'aspect.tiktok', w: 18, h: 32 },
  { aspect: '1:1', nameKey: 'aspect.square', w: 26, h: 26 },
  { aspect: '4:3', nameKey: 'aspect.classic', w: 32, h: 24 },
  { aspect: '3:4', nameKey: 'aspect.portrait', w: 24, h: 32 },
];

export default function AspectPicker({
  value,
  locked,
  onChange,
  onRequestChangeWhileLocked,
}: AspectPickerProps) {
  const { t } = useTranslation();

  const pick = (a: Aspect) => {
    if (locked && value !== a) {
      onRequestChangeWhileLocked();
      return;
    }
    onChange(a);
  };

  return (
    <div className="flex flex-wrap gap-2">
      {OPTIONS.map(({ aspect, nameKey, w, h }) => {
        const isSelected = value === aspect;
        return (
          <button
            key={aspect}
            type="button"
            onClick={() => pick(aspect)}
            className={`
              flex items-center gap-2 px-3 py-2 rounded-lg border text-sm
              ${isSelected
                ? 'border-primary-500 bg-primary-50 text-primary-700'
                : 'border-gray-200 hover:border-primary-300 text-gray-700'}
            `}
          >
            <span
              className="bg-gray-700 rounded-sm inline-block"
              style={{ width: `${w}px`, height: `${h}px` }}
              aria-hidden
            />
            <span className="flex flex-col items-start">
              <span className="font-medium leading-none">{t(nameKey)}</span>
              <span className="text-xs text-gray-400 leading-none mt-1">{aspect}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
