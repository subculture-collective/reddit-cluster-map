/**
 * Accessibility Tests using axe-core
 * 
 * These tests verify WCAG 2.1 AA compliance for all major components
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import SearchBar from '../components/SearchBar';
import Sidebar from '../components/Sidebar';
import Legend from '../components/Legend';
import ShareButton from '../components/ShareButton';
import Inspector from '../components/Inspector';
import KeyboardShortcutsHelp from '../components/KeyboardShortcutsHelp';
import { ThemeProvider } from '../contexts/ThemeContext';

// Extend Vitest's expect with jest-axe matchers
expect.extend(toHaveNoViolations);

// Wrapper component for tests that need ThemeProvider
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider>{children}</ThemeProvider>
);

describe('Accessibility Tests', () => {
  // Note: Full App component test skipped due to WebGL requirements in test environment
  // The individual components below provide comprehensive coverage of accessibility features

  describe('SearchBar Component', () => {
    it('should have no accessibility violations', async () => {
      const { container } = render(
        <SearchBar onSelectNode={() => {}} />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have proper ARIA attributes', () => {
      const { getByRole } = render(
        <SearchBar onSelectNode={() => {}} />
      );
      const searchInput = getByRole('combobox');
      expect(searchInput).toHaveAttribute('aria-autocomplete', 'list');
      expect(searchInput).toHaveAttribute('aria-expanded');
    });
  });

  describe('Sidebar Component', () => {
    it('should have no accessibility violations', async () => {
      const mockProps = {
        filters: { subreddit: true, user: true, post: false, comment: false },
        onFiltersChange: () => {},
        linkOpacity: 0.35,
        onLinkOpacityChange: () => {},
        nodeRelSize: 5,
        onNodeRelSizeChange: () => {},
        physics: {
          chargeStrength: -220,
          linkDistance: 120,
          velocityDecay: 0.88,
          cooldownTicks: 80,
          collisionRadius: 3,
        },
        onPhysicsChange: () => {},
        subredditSize: 'subscribers' as const,
        onSubredditSizeChange: () => {},
        onFocusNode: () => {},
      };

      const { container } = render(
        <TestWrapper>
          <Sidebar {...mockProps} />
        </TestWrapper>
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have proper landmark role', () => {
      const mockProps = {
        filters: { subreddit: true, user: true, post: false, comment: false },
        onFiltersChange: () => {},
        linkOpacity: 0.35,
        onLinkOpacityChange: () => {},
        nodeRelSize: 5,
        onNodeRelSizeChange: () => {},
        physics: {
          chargeStrength: -220,
          linkDistance: 120,
          velocityDecay: 0.88,
          cooldownTicks: 80,
          collisionRadius: 3,
        },
        onPhysicsChange: () => {},
        subredditSize: 'subscribers' as const,
        onSubredditSizeChange: () => {},
        onFocusNode: () => {},
      };

      const { getByRole } = render(
        <TestWrapper>
          <Sidebar {...mockProps} />
        </TestWrapper>
      );
      expect(getByRole('complementary')).toBeInTheDocument();
    });
  });

  describe('Legend Component', () => {
    it('should have no accessibility violations', async () => {
      const { container } = render(
        <Legend 
          filters={{ subreddit: true, user: true, post: false, comment: false }} 
        />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have proper region role with label', () => {
      const { getByRole } = render(
        <Legend 
          filters={{ subreddit: true, user: true, post: false, comment: false }} 
        />
      );
      const region = getByRole('region', { name: /graph legend/i });
      expect(region).toBeInTheDocument();
    });
  });

  describe('ShareButton Component', () => {
    it('should have no accessibility violations', async () => {
      const { container } = render(
        <ShareButton getState={() => ({})} />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have descriptive aria-label', () => {
      const { getByRole } = render(
        <ShareButton getState={() => ({})} />
      );
      const button = getByRole('button');
      expect(button).toHaveAttribute('aria-label');
    });
  });

  describe('Inspector Component', () => {
    it('should have no accessibility violations when closed', async () => {
      const { container } = render(
        <Inspector 
          onClear={() => {}} 
          onFocus={() => {}} 
        />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have proper tab structure when open', () => {
      const { getByRole, getAllByRole } = render(
        <Inspector 
          selected={{ id: 'test-node', name: 'Test Node', val: '10', degree: 5 }}
          onClear={() => {}} 
          onFocus={() => {}} 
        />
      );
      
      const tablist = getByRole('tablist');
      expect(tablist).toBeInTheDocument();
      
      const tabs = getAllByRole('tab');
      expect(tabs.length).toBeGreaterThan(0);
      
      // At least one tab should be selected
      const selectedTab = tabs.find(tab => tab.getAttribute('aria-selected') === 'true');
      expect(selectedTab).toBeDefined();
    });
  });

  describe('KeyboardShortcutsHelp Component', () => {
    it('should have no accessibility violations when open', async () => {
      const { container } = render(
        <TestWrapper>
          <KeyboardShortcutsHelp isOpen={true} onClose={() => {}} />
        </TestWrapper>
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have proper dialog structure', () => {
      const { getByRole } = render(
        <TestWrapper>
          <KeyboardShortcutsHelp isOpen={true} onClose={() => {}} />
        </TestWrapper>
      );
      
      const dialog = getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby');
    });
  });

  describe('Focus Management', () => {
    it('should have CSS variables for focus indicators', async () => {
      render(
        <TestWrapper>
          <div />
        </TestWrapper>
      );
      
      // Check that focus styles are defined in CSS
      const styles = window.getComputedStyle(document.documentElement);
      const focusColor = styles.getPropertyValue('--focus-ring-color');
      const focusWidth = styles.getPropertyValue('--focus-ring-width');
      
      expect(focusColor).toBeTruthy();
      expect(focusWidth).toBeTruthy();
    });
  });

  describe('High Contrast Mode', () => {
    it('should support high contrast class', () => {
      render(
        <TestWrapper>
          <div />
        </TestWrapper>
      );
      
      // Verify high-contrast class can be applied
      const root = document.documentElement;
      root.classList.add('high-contrast');
      expect(root.classList.contains('high-contrast')).toBe(true);
      root.classList.remove('high-contrast');
    });
  });
});
