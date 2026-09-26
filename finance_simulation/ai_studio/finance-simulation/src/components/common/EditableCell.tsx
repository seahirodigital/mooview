import React, { useState, useRef, useEffect } from 'react';

interface EditableCellProps {
  value: string | number;
  type?: 'text' | 'number' | 'select';
  options?: { value: string; label: string }[];
  step?: string;
  min?: number;
  max?: number;
  suffix?: string;
  prefix?: string;
  onSave: (newValue: any) => void;
  className?: string;
  textClassName?: string;
  align?: 'left' | 'right' | 'center';
  placeholder?: string;
  /** 編集時の実値は保持したまま、通常表示だけを伏せ字にする。 */
  masked?: boolean;
}

export const EditableCell: React.FC<EditableCellProps> = ({
  value,
  type = 'text',
  options,
  step,
  min,
  max,
  suffix = '',
  prefix = '',
  onSave,
  className = '',
  textClassName = '',
  align = 'left',
  placeholder = '-',
  masked = false,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState<string | number>(value ?? '');
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  useEffect(() => {
    setTempValue(value ?? '');
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      if ('select' in inputRef.current && typeof inputRef.current.select === 'function') {
        inputRef.current.select();
      }
    }
  }, [isEditing]);

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  };

  const handleBlur = () => {
    finishEdit();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      finishEdit();
    } else if (e.key === 'Escape') {
      setTempValue(value ?? '');
      setIsEditing(false);
    }
  };

  const finishEdit = () => {
    setIsEditing(false);
    let finalVal: any = tempValue;
    if (type === 'number') {
      finalVal = tempValue === '' ? 0 : Number(tempValue);
    }
    if (finalVal !== value) {
      onSave(finalVal);
    }
  };

  const alignClass = align === 'right' ? 'text-right justify-end' : align === 'center' ? 'text-center justify-center' : 'text-left justify-start';

  if (isEditing) {
    if (type === 'select' && options) {
      return (
        <select
          ref={inputRef as React.RefObject<HTMLSelectElement>}
          value={String(tempValue)}
          onChange={(e) => setTempValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="bg-white dark:bg-[#2c2c2e] text-[#1d1d1f] dark:text-[#f5f5f7] text-xs border border-[#0071e3] rounded-lg px-2 py-1 outline-none font-medium shadow-xs"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    }

    return (
      <div className={`flex items-center gap-1 ${alignClass}`}>
        {prefix && <span className="text-[11px] text-[#1d1d1f]/50 dark:text-[#f5f5f7]/50 select-none">{prefix}</span>}
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type={type === 'number' ? 'number' : 'text'}
          step={step}
          min={min}
          max={max}
          value={tempValue}
          onChange={(e) => setTempValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className={`bg-white dark:bg-[#2c2c2e] text-[#1d1d1f] dark:text-[#f5f5f7] text-xs border border-[#0071e3] rounded-lg px-2 py-0.5 outline-none font-mono font-bold w-full min-w-[60px] shadow-xs ${alignClass}`}
        />
        {suffix && <span className="text-[11px] text-[#1d1d1f]/50 dark:text-[#f5f5f7]/50 select-none">{suffix}</span>}
      </div>
    );
  }

  const displayVal = masked
    ? '***'
    : value !== undefined && value !== null && value !== ''
    ? (type === 'number' && typeof value === 'number' ? value.toLocaleString() : String(value))
    : placeholder;

  return (
    <div
      onDoubleClick={handleDoubleClick}
      title="ダブルクリックで直接編集"
      className={`group cursor-pointer hover:bg-[#0071e3]/10 hover:ring-1 hover:ring-[#0071e3]/30 rounded-lg px-1.5 py-0.5 -mx-1 transition-all flex items-center ${alignClass} ${className}`}
    >
      <span className={`tabular-nums ${textClassName}`}>
        {prefix}
        {displayVal}
        {suffix}
      </span>
      <span className="opacity-0 group-hover:opacity-70 text-[10px] text-[#0071e3] ml-1 select-none shrink-0 font-sans">
        ✎
      </span>
    </div>
  );
};
