import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Modal from '@/components/ui/Modal';

describe('Modal', () => {
  it('renders when isOpen is true', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Test Modal">
        <p>Modal content</p>
      </Modal>
    );
    expect(screen.getByText('Test Modal')).toBeInTheDocument();
    expect(screen.getByText('Modal content')).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(
      <Modal isOpen={false} onClose={() => {}} title="Hidden">
        <p>Should not show</p>
      </Modal>
    );
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });

  it('calls onClose when close button clicked', async () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="Closable">
        <p>Content</p>
      </Modal>
    );
    const closeButton = screen.getByRole('button');
    closeButton.click();
    expect(onClose).toHaveBeenCalled();
  });
});
