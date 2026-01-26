/**
 * AnnotationPopover - Styled popover showing annotation details on hover
 */

import { useState, useEffect, useRef } from 'react';
import { InlineAnnotation } from '../../types';

interface AnnotationPopoverProps {
  annotation: InlineAnnotation;
  children: React.ReactNode;
}

export function AnnotationPopover({ annotation, children }: AnnotationPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<'top' | 'bottom'>('bottom');
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<number | null>(null);

  // Calculate position to avoid going off screen
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setPosition(spaceBelow < 200 ? 'top' : 'bottom');
    }
  }, [isOpen]);

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = window.setTimeout(() => {
      setIsOpen(true);
    }, 200);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = window.setTimeout(() => {
      setIsOpen(false);
    }, 100);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div
      ref={triggerRef}
      className="relative inline-flex"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}

      {isOpen && (
        <div
          ref={popoverRef}
          className={`absolute z-50 w-72 bg-inspector-surface border border-inspector-border rounded-lg shadow-xl ${
            position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
          } left-0`}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* Arrow */}
          <div
            className={`absolute left-4 w-3 h-3 bg-inspector-surface border-inspector-border transform rotate-45 ${
              position === 'top'
                ? 'bottom-[-6px] border-r border-b'
                : 'top-[-6px] border-l border-t'
            }`}
          />

          <div className="relative p-3 space-y-2">
            {/* Title */}
            {annotation.title && (
              <div className="font-medium text-inspector-text">
                {annotation.title}
              </div>
            )}

            {/* Body */}
            {annotation.body && (
              <div className="text-sm text-inspector-muted whitespace-pre-wrap max-h-32 overflow-y-auto">
                {annotation.body}
              </div>
            )}

            {/* Tags */}
            {annotation.tags && annotation.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {annotation.tags.map((tag, i) => (
                  <span
                    key={i}
                    className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Timestamps */}
            <div className="pt-2 border-t border-inspector-border text-xs text-inspector-muted space-y-0.5">
              <div>Created: {formatDate(annotation.created_at)}</div>
              {annotation.updated_at !== annotation.created_at && (
                <div>Updated: {formatDate(annotation.updated_at)}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
