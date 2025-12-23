/**
 * Tests for ConfirmDialog component and Force Push/Pull dialog functionality
 * @module __tests__/confirm-dialog.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { useRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// Extract ConfirmDialog component for testing
// This is a copy of the component from Popup.jsx for isolated testing
function ConfirmDialog({ dialogRef, title, message, confirmText, cancelText, onConfirm, onCancel, variant = 'warning' }) {
  const variantStyles = {
    warning: {
      icon: 'text-orange-500',
      confirmBtn: 'bg-orange-600 hover:bg-orange-700',
      iconBg: 'bg-orange-100',
    },
    danger: {
      icon: 'text-red-500',
      confirmBtn: 'bg-red-600 hover:bg-red-700',
      iconBg: 'bg-red-100',
    },
    info: {
      icon: 'text-blue-500',
      confirmBtn: 'bg-blue-600 hover:bg-blue-700',
      iconBg: 'bg-blue-100',
    },
  };

  const styles = variantStyles[variant] || variantStyles.warning;

  const handleCancel = () => {
    dialogRef.current?.close();
    onCancel?.();
  };

  const handleConfirm = () => {
    dialogRef.current?.close();
    onConfirm?.();
  };

  return (
    <dialog
      ref={dialogRef}
      className="w-full max-w-sm rounded-lg bg-white p-0 shadow-xl backdrop:bg-black/50"
      onClose={onCancel}
      data-testid="confirm-dialog"
    >
      <div className="p-4">
        <div className="flex items-start space-x-3">
          <div className={`flex-shrink-0 rounded-full p-2 ${styles.iconBg}`} data-testid="icon-container">
            <svg className={`h-5 w-5 ${styles.icon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-slate-900" data-testid="dialog-title">{title}</h3>
            <p className="mt-1 text-sm text-slate-600" data-testid="dialog-message">{message}</p>
          </div>
        </div>
      </div>
      <div className="flex justify-end space-x-2 border-t border-slate-200 bg-slate-50 px-4 py-3 rounded-b-lg">
        <button
          type="button"
          onClick={handleCancel}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          data-testid="cancel-button"
        >
          {cancelText || 'Cancel'}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium text-white ${styles.confirmBtn}`}
          data-testid="confirm-button"
        >
          {confirmText || 'Confirm'}
        </button>
      </div>
    </dialog>
  );
}

// Wrapper component that provides a real ref
function TestWrapper({ onConfirm, onCancel, title, message, confirmText, cancelText, variant }) {
  const dialogRef = useRef(null);
  
  return (
    <div>
      <button 
        data-testid="open-dialog" 
        onClick={() => dialogRef.current?.showModal()}
      >
        Open
      </button>
      <ConfirmDialog
        dialogRef={dialogRef}
        title={title !== undefined ? title : 'Test Title'}
        message={message !== undefined ? message : 'Test message'}
        confirmText={confirmText}
        cancelText={cancelText}
        onConfirm={onConfirm}
        onCancel={onCancel}
        variant={variant}
      />
    </div>
  );
}

describe('ConfirmDialog Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('should render dialog with title and message', () => {
      render(
        <TestWrapper
          title="Test Title"
          message="Test message content"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.getByTestId('dialog-title')).toHaveTextContent('Test Title');
      expect(screen.getByTestId('dialog-message')).toHaveTextContent('Test message content');
    });

    it('should render with custom confirm and cancel text', () => {
      render(
        <TestWrapper
          title="Test"
          message="Test"
          confirmText="Yes, do it"
          cancelText="No, go back"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.getByTestId('confirm-button')).toHaveTextContent('Yes, do it');
      expect(screen.getByTestId('cancel-button')).toHaveTextContent('No, go back');
    });

    it('should render with default button text when not provided', () => {
      render(
        <TestWrapper
          title="Test"
          message="Test"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.getByTestId('confirm-button')).toHaveTextContent('Confirm');
      expect(screen.getByTestId('cancel-button')).toHaveTextContent('Cancel');
    });

    it('should render dialog element with correct attributes', () => {
      render(
        <TestWrapper
          title="Test"
          message="Test"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      const dialog = screen.getByTestId('confirm-dialog');
      expect(dialog.tagName).toBe('DIALOG');
    });
  });

  describe('Variant Styles', () => {
    it('should apply warning variant styles by default', () => {
      render(
        <TestWrapper
          title="Test"
          message="Test"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      const iconContainer = screen.getByTestId('icon-container');
      expect(iconContainer.className).toContain('bg-orange-100');
    });

    it('should apply warning variant styles when variant is "warning"', () => {
      render(
        <TestWrapper
          title="Test"
          message="Test"
          variant="warning"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      const iconContainer = screen.getByTestId('icon-container');
      expect(iconContainer.className).toContain('bg-orange-100');
    });

    it('should apply danger variant styles when variant is "danger"', () => {
      render(
        <TestWrapper
          title="Test"
          message="Test"
          variant="danger"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      const iconContainer = screen.getByTestId('icon-container');
      expect(iconContainer.className).toContain('bg-red-100');
    });

    it('should apply info variant styles when variant is "info"', () => {
      render(
        <TestWrapper
          title="Test"
          message="Test"
          variant="info"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      const iconContainer = screen.getByTestId('icon-container');
      expect(iconContainer.className).toContain('bg-blue-100');
    });

    it('should fall back to warning styles for unknown variant', () => {
      render(
        <TestWrapper
          title="Test"
          message="Test"
          variant="unknown"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      const iconContainer = screen.getByTestId('icon-container');
      expect(iconContainer.className).toContain('bg-orange-100');
    });
  });

  describe('Button Interactions', () => {
    it('should call onConfirm when confirm button is clicked', () => {
      const onConfirm = vi.fn();
      
      render(
        <TestWrapper
          title="Test"
          message="Test"
          onConfirm={onConfirm}
          onCancel={vi.fn()}
        />
      );

      fireEvent.click(screen.getByTestId('confirm-button'));

      expect(onConfirm).toHaveBeenCalled();
    });

    it('should call onCancel when cancel button is clicked', () => {
      const onCancel = vi.fn();
      
      render(
        <TestWrapper
          title="Test"
          message="Test"
          onConfirm={vi.fn()}
          onCancel={onCancel}
        />
      );

      fireEvent.click(screen.getByTestId('cancel-button'));

      expect(onCancel).toHaveBeenCalled();
    });

    it('should not throw when onConfirm is not provided', () => {
      render(
        <TestWrapper
          title="Test"
          message="Test"
          onCancel={vi.fn()}
        />
      );

      expect(() => {
        fireEvent.click(screen.getByTestId('confirm-button'));
      }).not.toThrow();
    });

    it('should not throw when onCancel is not provided', () => {
      render(
        <TestWrapper
          title="Test"
          message="Test"
          onConfirm={vi.fn()}
        />
      );

      expect(() => {
        fireEvent.click(screen.getByTestId('cancel-button'));
      }).not.toThrow();
    });
  });

  describe('Dialog Close Event', () => {
    it('should call onCancel when dialog is closed via native close event', () => {
      const onCancel = vi.fn();
      
      render(
        <TestWrapper
          title="Test"
          message="Test"
          onConfirm={vi.fn()}
          onCancel={onCancel}
        />
      );

      const dialog = screen.getByTestId('confirm-dialog');
      // Dispatch native close event
      dialog.dispatchEvent(new Event('close'));

      expect(onCancel).toHaveBeenCalled();
    });
  });
});

describe('Force Push Dialog', () => {
  it('should render with Force Push specific content', () => {
    render(
      <TestWrapper
        title="Force Push Bookmarks"
        message="This will overwrite ALL cloud bookmarks with your local bookmarks. This action cannot be undone."
        confirmText="Force Push"
        cancelText="Cancel"
        onConfirm={vi.fn()}
        variant="warning"
      />
    );

    expect(screen.getByTestId('dialog-title')).toHaveTextContent('Force Push Bookmarks');
    expect(screen.getByTestId('dialog-message')).toHaveTextContent('overwrite ALL cloud bookmarks');
    expect(screen.getByTestId('confirm-button')).toHaveTextContent('Force Push');
  });

  it('should use warning variant for Force Push', () => {
    render(
      <TestWrapper
        title="Force Push Bookmarks"
        message="This will overwrite ALL cloud bookmarks"
        confirmText="Force Push"
        onConfirm={vi.fn()}
        variant="warning"
      />
    );

    const iconContainer = screen.getByTestId('icon-container');
    expect(iconContainer.className).toContain('bg-orange-100');
  });

  it('should execute force push callback when confirmed', () => {
    const executeForcePush = vi.fn();

    render(
      <TestWrapper
        title="Force Push Bookmarks"
        message="This will overwrite ALL cloud bookmarks"
        confirmText="Force Push"
        onConfirm={executeForcePush}
        variant="warning"
      />
    );

    fireEvent.click(screen.getByTestId('confirm-button'));

    expect(executeForcePush).toHaveBeenCalled();
  });
});

describe('Force Pull Dialog', () => {
  it('should render with Force Pull specific content', () => {
    render(
      <TestWrapper
        title="Force Pull Bookmarks"
        message="This will overwrite ALL local bookmarks with cloud bookmarks. This action cannot be undone."
        confirmText="Force Pull"
        cancelText="Cancel"
        onConfirm={vi.fn()}
        variant="info"
      />
    );

    expect(screen.getByTestId('dialog-title')).toHaveTextContent('Force Pull Bookmarks');
    expect(screen.getByTestId('dialog-message')).toHaveTextContent('overwrite ALL local bookmarks');
    expect(screen.getByTestId('confirm-button')).toHaveTextContent('Force Pull');
  });

  it('should use info variant for Force Pull', () => {
    render(
      <TestWrapper
        title="Force Pull Bookmarks"
        message="This will overwrite ALL local bookmarks"
        confirmText="Force Pull"
        onConfirm={vi.fn()}
        variant="info"
      />
    );

    const iconContainer = screen.getByTestId('icon-container');
    expect(iconContainer.className).toContain('bg-blue-100');
  });

  it('should execute force pull callback when confirmed', () => {
    const executeForcePull = vi.fn();

    render(
      <TestWrapper
        title="Force Pull Bookmarks"
        message="This will overwrite ALL local bookmarks"
        confirmText="Force Pull"
        onConfirm={executeForcePull}
        variant="info"
      />
    );

    fireEvent.click(screen.getByTestId('confirm-button'));

    expect(executeForcePull).toHaveBeenCalled();
  });
});

describe('Dialog Show/Hide Flow', () => {
  it('should have dialog element in the DOM', () => {
    render(
      <TestWrapper
        title="Test"
        message="Test"
        onConfirm={vi.fn()}
      />
    );

    const dialog = screen.getByTestId('confirm-dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog.tagName).toBe('DIALOG');
  });

  it('should call onConfirm callback when confirm is clicked', () => {
    const onConfirm = vi.fn();

    render(
      <TestWrapper
        title="Test"
        message="Test"
        onConfirm={onConfirm}
      />
    );

    fireEvent.click(screen.getByTestId('confirm-button'));

    expect(onConfirm).toHaveBeenCalled();
  });

  it('should call onCancel callback when cancel is clicked', () => {
    const onCancel = vi.fn();

    render(
      <TestWrapper
        title="Test"
        message="Test"
        onCancel={onCancel}
      />
    );

    fireEvent.click(screen.getByTestId('cancel-button'));

    expect(onCancel).toHaveBeenCalled();
  });
});

describe('Edge Cases', () => {
  it('should handle empty title and message', () => {
    render(
      <TestWrapper
        title=""
        message=""
        onConfirm={vi.fn()}
      />
    );

    // Empty strings should render as empty elements
    const titleEl = screen.getByTestId('dialog-title');
    const messageEl = screen.getByTestId('dialog-message');
    expect(titleEl.textContent).toBe('');
    expect(messageEl.textContent).toBe('');
  });

  it('should handle very long title and message', () => {
    const longTitle = 'A'.repeat(200);
    const longMessage = 'B'.repeat(1000);

    render(
      <TestWrapper
        title={longTitle}
        message={longMessage}
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByTestId('dialog-title')).toHaveTextContent(longTitle);
    expect(screen.getByTestId('dialog-message')).toHaveTextContent(longMessage);
  });

  it('should handle special characters in title and message', () => {
    const specialTitle = '<script>alert("xss")</script>';
    const specialMessage = '& < > " \' / \\';

    render(
      <TestWrapper
        title={specialTitle}
        message={specialMessage}
        onConfirm={vi.fn()}
      />
    );

    // React automatically escapes these, so they should be rendered as text
    expect(screen.getByTestId('dialog-title')).toHaveTextContent(specialTitle);
    expect(screen.getByTestId('dialog-message')).toHaveTextContent(specialMessage);
  });

  it('should handle multiple confirm clicks', () => {
    const onConfirm = vi.fn();

    render(
      <TestWrapper
        title="Test"
        message="Test"
        onConfirm={onConfirm}
      />
    );

    const confirmButton = screen.getByTestId('confirm-button');
    
    // Multiple clicks
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    // Each click should trigger the callback
    expect(onConfirm).toHaveBeenCalledTimes(3);
  });
});

describe('Accessibility', () => {
  it('should have accessible button labels via data-testid', () => {
    render(
      <TestWrapper
        title="Test"
        message="Test"
        confirmText="Confirm Action"
        cancelText="Cancel Action"
        onConfirm={vi.fn()}
      />
    );

    // Use data-testid since dialog content is not accessible when closed
    expect(screen.getByTestId('confirm-button')).toHaveTextContent('Confirm Action');
    expect(screen.getByTestId('cancel-button')).toHaveTextContent('Cancel Action');
  });

  it('should have dialog element', () => {
    render(
      <TestWrapper
        title="Test"
        message="Test"
        onConfirm={vi.fn()}
      />
    );

    // Dialog element exists but may not be accessible when closed
    const dialog = screen.getByTestId('confirm-dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog.tagName).toBe('DIALOG');
  });
});
