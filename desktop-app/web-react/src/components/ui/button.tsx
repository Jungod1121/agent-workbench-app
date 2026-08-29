import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'glass';
  size?: 'default' | 'icon';
}

/** 按钮：primary 实心蓝（唯一交互色）/ secondary 描边 / ghost 幽灵 / glass 深色玻璃拟态 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'secondary', size = 'default', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg text-[13px] font-medium',
        'transition-all duration-150 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none',
        size === 'icon' ? 'h-9 w-9 p-0' : 'min-h-9 px-3.5 py-2',
        variant === 'primary' &&
          'bg-primary text-primary-foreground border border-primary hover:bg-primary/90',
        variant === 'secondary' &&
          'bg-card text-foreground border border-border hover:bg-muted/50',
        variant === 'ghost' && 'bg-transparent border-0 text-muted-foreground hover:bg-muted hover:text-foreground',
        variant === 'glass' &&
          'border border-white/14 bg-white/7 text-foreground backdrop-blur-[40px] backdrop-saturate-150 hover:bg-white/12 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-1px_0_rgba(0,0,0,0.28),0_8px_24px_rgba(0,0,0,0.35)]',
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
