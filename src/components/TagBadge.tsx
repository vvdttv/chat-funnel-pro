import React from 'react';
import { cn } from '@/lib/utils';

interface TagBadgeProps {
  name: string;
  color: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function TagBadge({ name, color, size = 'sm', className }: TagBadgeProps) {
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1';
  return (
    <span
      className={cn('inline-flex items-center rounded-full font-medium', sizeClass, className)}
      style={{ backgroundColor: `${color}20`, color }}
    >
      {name}
    </span>
  );
}
