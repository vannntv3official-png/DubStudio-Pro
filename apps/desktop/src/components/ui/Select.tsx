import React from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: SelectOption[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1 w-full min-w-0">
        {label && (
          <label className="text-[11px] font-semibold text-studio-muted tracking-tight truncate">
            {label}
          </label>
        )}
        <div className="relative w-full min-w-0">
          <select
            ref={ref}
            className={`w-full h-9 pl-3 pr-8 rounded-lg bg-studio-subbg border border-studio-border text-xs text-studio-text appearance-none cursor-pointer focus:outline-none focus:border-studio-accent focus:ring-1 focus:ring-studio-accent transition-colors truncate ${className}`}
            {...props}
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-studio-panel text-studio-text py-1 text-xs">
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-studio-muted pointer-events-none shrink-0" />
        </div>
      </div>
    );
  }
);

Select.displayName = 'Select';
