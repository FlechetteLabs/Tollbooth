/**
 * Reusable Modal component with accessibility features
 * - Focus trap (Tab key stays within modal)
 * - ARIA attributes for screen readers
 * - Escape key to close
 * - Click outside to close (optional)
 * - data-testid support for automation
 */

import { useEffect, useRef, ReactNode } from 'react';
import { clsx } from 'clsx';

export interface ModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Called when the modal should close */
  onClose: () => void;
  /** Modal title displayed in header */
  title: string;
  /** Modal content */
  children: ReactNode;
  /** Footer content (typically action buttons) */
  footer?: ReactNode;
  /** data-testid prefix for automation (e.g., "create-entry" -> "create-entry-modal") */
  testId?: string;
  /** Maximum width class (default: max-w-2xl) */
  maxWidth?: string;
  /** Whether clicking backdrop closes modal (default: true) */
  closeOnBackdropClick?: boolean;
  /** Whether pressing Escape closes modal (default: true) */
  closeOnEscape?: boolean;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  testId = 'modal',
  maxWidth = 'max-w-2xl',
  closeOnBackdropClick = true,
  closeOnEscape = true,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Store the previously focused element and restore on close
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [isOpen]);

  // Focus trap and keyboard handling
  useEffect(() => {
    if (!isOpen || !modalRef.current) return;

    const modal = modalRef.current;

    // Focus the first focusable element
    const focusableElements = modal.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    // Focus first element on open
    setTimeout(() => firstElement?.focus(), 0);

    const handleKeyDown = (e: KeyboardEvent) => {
      // Close on Escape
      if (e.key === 'Escape' && closeOnEscape) {
        e.preventDefault();
        onClose();
        return;
      }

      // Focus trap on Tab
      if (e.key === 'Tab') {
        if (focusableElements.length === 0) {
          e.preventDefault();
          return;
        }

        if (e.shiftKey) {
          // Shift+Tab: if on first element, wrap to last
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement?.focus();
          }
        } else {
          // Tab: if on last element, wrap to first
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement?.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, closeOnEscape]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (closeOnBackdropClick && e.target === e.currentTarget) {
      onClose();
    }
  };

  const titleId = `${testId}-title`;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid={`${testId}-modal`}
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className={clsx(
          'bg-inspector-surface border border-inspector-border rounded-lg shadow-xl w-full',
          maxWidth,
          'max-h-[90vh] overflow-hidden flex flex-col'
        )}
        data-testid={`${testId}-modal-content`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-inspector-border">
          <h2
            id={titleId}
            className="text-lg font-medium text-inspector-text"
            data-testid={`${testId}-modal-title`}
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-inspector-muted hover:text-inspector-text p-1 rounded hover:bg-inspector-border/50 transition-colors"
            aria-label="Close modal"
            data-testid={`${testId}-modal-close-btn`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div
          className="flex-1 overflow-y-auto p-6"
          data-testid={`${testId}-modal-body`}
        >
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div
            className="flex items-center justify-end gap-3 px-6 py-4 border-t border-inspector-border bg-inspector-bg"
            data-testid={`${testId}-modal-footer`}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Reusable Confirm Dialog component
 * Simplified modal for yes/no confirmations
 */
export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string | ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  testId?: string;
  loading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'primary',
  testId = 'confirm',
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      testId={testId}
      maxWidth="max-w-md"
      footer={
        <>
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm text-inspector-muted hover:text-inspector-text disabled:opacity-50"
            data-testid={`${testId}-cancel-btn`}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={clsx(
              'px-4 py-2 text-sm font-medium rounded',
              loading && 'opacity-50 cursor-not-allowed',
              confirmVariant === 'danger'
                ? 'bg-inspector-error text-white hover:bg-inspector-error/80'
                : 'bg-inspector-accent text-white hover:bg-inspector-accent/80'
            )}
            data-testid={`${testId}-confirm-btn`}
          >
            {loading ? 'Loading...' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-inspector-text" data-testid={`${testId}-message`}>
        {message}
      </div>
    </Modal>
  );
}

export default Modal;
