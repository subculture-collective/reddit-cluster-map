import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SidebarSection from './SidebarSection';

describe('SidebarSection', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders section title', () => {
    render(
      <SidebarSection title="Test Section">
        <div>Content</div>
      </SidebarSection>
    );
    
    expect(screen.getByText('Test Section')).toBeInTheDocument();
  });

  it('renders section icon when provided', () => {
    render(
      <SidebarSection title="Test Section" icon="🔍">
        <div>Content</div>
      </SidebarSection>
    );
    
    expect(screen.getByText('🔍')).toBeInTheDocument();
  });

  it('renders children content when expanded', () => {
    render(
      <SidebarSection title="Test Section" defaultExpanded={true}>
        <div>Test Content</div>
      </SidebarSection>
    );
    
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('collapses section when header clicked', async () => {
    const user = userEvent.setup();
    
    render(
      <SidebarSection title="Test Section" defaultExpanded={true}>
        <div>Test Content</div>
      </SidebarSection>
    );
    
    const header = screen.getByText('Test Section');
    await user.click(header);
    
    // Check wrapper div has grid-rows-[0fr] and opacity-0 classes
    await waitFor(() => {
      const content = screen.getByText('Test Content');
      const innerWrapper = content.parentElement?.parentElement; // min-h-0 div
      const gridWrapper = innerWrapper?.parentElement; // grid div
      expect(gridWrapper).toHaveClass('grid-rows-[0fr]');
      expect(gridWrapper).toHaveClass('opacity-0');
    });
  });

  it('expands section when header clicked again', async () => {
    const user = userEvent.setup();
    
    render(
      <SidebarSection title="Test Section" defaultExpanded={false}>
        <div>Test Content</div>
      </SidebarSection>
    );
    
    const header = screen.getByText('Test Section');
    await user.click(header);
    
    // Content should become visible
    await waitFor(() => {
      const content = screen.getByText('Test Content');
      const innerWrapper = content.parentElement?.parentElement; // min-h-0 div
      const gridWrapper = innerWrapper?.parentElement; // grid div
      expect(gridWrapper).toHaveClass('grid-rows-[1fr]');
      expect(gridWrapper).toHaveClass('opacity-100');
    });
  });

  it('persists state in localStorage when storageKey provided', async () => {
    const user = userEvent.setup();
    
    render(
      <SidebarSection title="Test Section" storageKey="test-section" defaultExpanded={true}>
        <div>Test Content</div>
      </SidebarSection>
    );
    
    const header = screen.getByText('Test Section');
    await user.click(header);
    
    await waitFor(() => {
      expect(localStorage.getItem('test-section')).toBe('false');
    });
  });

  it('loads state from localStorage when storageKey provided', () => {
    localStorage.setItem('test-section', 'false');
    
    render(
      <SidebarSection title="Test Section" storageKey="test-section" defaultExpanded={true}>
        <div>Test Content</div>
      </SidebarSection>
    );
    
    // Should be collapsed based on localStorage value
    const content = screen.getByText('Test Content');
    const innerWrapper = content.parentElement?.parentElement; // min-h-0 div
    const gridWrapper = innerWrapper?.parentElement; // grid div
    expect(gridWrapper).toHaveClass('grid-rows-[0fr]');
    expect(gridWrapper).toHaveClass('opacity-0');
  });

  it('rotates chevron icon when expanded/collapsed', async () => {
    const user = userEvent.setup();
    
    render(
      <SidebarSection title="Test Section" defaultExpanded={true}>
        <div>Test Content</div>
      </SidebarSection>
    );
    
    const button = screen.getByRole('button');
    const svg = button.querySelector('svg');
    
    expect(svg).toHaveClass('rotate-180');
    
    await user.click(button);
    
    await waitFor(() => {
      expect(svg).not.toHaveClass('rotate-180');
    });
  });

  it('sets aria-expanded attribute correctly', async () => {
    const user = userEvent.setup();
    
    render(
      <SidebarSection title="Test Section" defaultExpanded={true}>
        <div>Test Content</div>
      </SidebarSection>
    );
    
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    
    await user.click(button);
    
    await waitFor(() => {
      expect(button).toHaveAttribute('aria-expanded', 'false');
    });
  });
});
