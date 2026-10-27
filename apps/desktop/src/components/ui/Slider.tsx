import React from 'react';

export interface SliderProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  valueDisplay?: string | number;
}

export const Slider: React.FC<SliderProps> = ({ label, valueDisplay, className = '', ...props }) => {
  return (
    <div className="flex flex-col gap-1 w-full">
      <div className="flex justify-between items-center text-xs">
        {label && <span className="text-studio-muted">{label}</span>}
        {valueDisplay !== undefined && <span className="text-studio-text font-mono">{valueDisplay}</span>}
      </div>
      <input
        type="range"
        className={`w-full accent-studio-accent h-1.5 bg-studio-surface rounded-lg appearance-none cursor-pointer ${className}`}
        {...props}
      />
    </div>
  );
};
