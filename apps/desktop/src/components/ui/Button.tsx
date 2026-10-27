import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  className = '',
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled,
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center justify-center font-medium transition-colors rounded select-none disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus:ring-1 focus:ring-studio-accent';

  const variants = {
    primary: 'bg-studio-accent hover:bg-blue-600 text-white shadow-sm',
    secondary: 'bg-studio-surface hover:bg-studio-hover text-studio-text',
    danger: 'bg-studio-error hover:bg-red-600 text-white',
    ghost: 'hover:bg-studio-hover text-studio-muted hover:text-studio-text',
    outline: 'border border-studio-border hover:bg-studio-hover text-studio-text',
  };

  const sizes = {
    sm: 'text-xs px-2.5 py-1.5 h-7 gap-1.5',
    md: 'text-sm px-3.5 py-2 h-9 gap-2',
    lg: 'text-base px-5 py-2.5 h-11 gap-2.5',
    icon: 'h-8 w-8 p-0',
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
};
