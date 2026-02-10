import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SearchBar from './SearchBar';

describe('SearchBar', () => {
  const mockOnSelectNode = vi.fn();
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders search input with placeholder', () => {
    render(<SearchBar onSelectNode={mockOnSelectNode} />);
    
    const input = screen.getByPlaceholderText(/Search nodes/i);
    expect(input).toBeInTheDocument();
  });

  it('shows clear button when query is entered', async () => {
    const user = userEvent.setup();
    render(<SearchBar onSelectNode={mockOnSelectNode} />);
    
    const input = screen.getByPlaceholderText(/Search nodes/i);
    await user.type(input, 'test');
    
    // Clear button should appear
    expect(screen.getByText('✕')).toBeInTheDocument();
  });

  it('performs search after debounce delay', async () => {
    const user = userEvent.setup();
    
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { id: 'subreddit_1', name: 'askreddit', type: 'subreddit', val: '100' },
        ],
      }),
    } as Response);

    render(<SearchBar onSelectNode={mockOnSelectNode} />);
    
    const input = screen.getByPlaceholderText(/Search nodes/i);
    await user.type(input, 'ask');

    // Wait for debounce (150ms)
    await waitFor(
      () => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/search?node=ask'),
          expect.any(Object)
        );
      },
      { timeout: 300 }
    );
  });

  it('displays search results in dropdown', async () => {
    const user = userEvent.setup();
    
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { id: 'subreddit_1', name: 'askreddit', type: 'subreddit', val: '100' },
          { id: 'user_1', name: 'testuser', type: 'user', val: '50' },
        ],
      }),
    } as Response);

    render(<SearchBar onSelectNode={mockOnSelectNode} />);
    
    const input = screen.getByPlaceholderText(/Search nodes/i);
    await user.type(input, 'test');

    // Wait for results
    await waitFor(() => {
      expect(screen.getByText('askreddit')).toBeInTheDocument();
      expect(screen.getByText('testuser')).toBeInTheDocument();
    }, { timeout: 300 });
  });

  it('calls onSelectNode when result is clicked', async () => {
    const user = userEvent.setup();
    
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { id: 'subreddit_1', name: 'askreddit', type: 'subreddit', val: '100' },
        ],
      }),
    } as Response);

    render(<SearchBar onSelectNode={mockOnSelectNode} />);
    
    const input = screen.getByPlaceholderText(/Search nodes/i);
    await user.type(input, 'ask');

    // Wait for result
    await waitFor(() => {
      expect(screen.getByText('askreddit')).toBeInTheDocument();
    }, { timeout: 300 });

    // Click the result
    const result = screen.getByText('askreddit');
    await user.click(result);

    expect(mockOnSelectNode).toHaveBeenCalledWith('subreddit_1');
  });

  it('allows keyboard navigation with arrow keys', async () => {
    const user = userEvent.setup();
    
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { id: 'subreddit_1', name: 'askreddit', type: 'subreddit', val: '100' },
          { id: 'user_1', name: 'testuser', type: 'user', val: '50' },
        ],
      }),
    } as Response);

    render(<SearchBar onSelectNode={mockOnSelectNode} />);
    
    const input = screen.getByPlaceholderText(/Search nodes/i);
    await user.type(input, 'test');

    // Wait for results
    await waitFor(() => {
      expect(screen.getByText('askreddit')).toBeInTheDocument();
    }, { timeout: 300 });

    // Press arrow down
    await user.keyboard('{ArrowDown}');
    
    // Press Enter to select
    await user.keyboard('{Enter}');

    expect(mockOnSelectNode).toHaveBeenCalledWith('user_1');
  });

  it('closes dropdown on Escape key', async () => {
    const user = userEvent.setup();
    
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { id: 'subreddit_1', name: 'askreddit', type: 'subreddit', val: '100' },
        ],
      }),
    } as Response);

    render(<SearchBar onSelectNode={mockOnSelectNode} />);
    
    const input = screen.getByPlaceholderText(/Search nodes/i);
    await user.type(input, 'ask');

    // Wait for results
    await waitFor(() => {
      expect(screen.getByText('askreddit')).toBeInTheDocument();
    }, { timeout: 300 });

    // Press Escape
    await user.keyboard('{Escape}');

    // Dropdown should be closed
    await waitFor(() => {
      expect(screen.queryByText('askreddit')).not.toBeInTheDocument();
    });
  });

  it('shows "no results" message when search returns empty', async () => {
    const user = userEvent.setup();
    
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [],
      }),
    } as Response);

    render(<SearchBar onSelectNode={mockOnSelectNode} />);
    
    const input = screen.getByPlaceholderText(/Search nodes/i);
    await user.type(input, 'nonexistent');

    // Wait for no results message
    await waitFor(() => {
      expect(screen.getByText(/No results found/i)).toBeInTheDocument();
    }, { timeout: 300 });
  });

  it('shows loading indicator while searching', async () => {
    const user = userEvent.setup();
    
    // Create a promise that we can control
    let resolveSearch: (value: any) => void;
    const searchPromise = new Promise((resolve) => {
      resolveSearch = resolve;
    });

    fetchMock.mockReturnValueOnce(searchPromise as Promise<Response>);

    render(<SearchBar onSelectNode={mockOnSelectNode} />);
    
    const input = screen.getByPlaceholderText(/Search nodes/i);
    await user.type(input, 'test');

    // Wait for debounce, then check for loading state
    await waitFor(() => {
      const spinner = input.parentElement?.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    }, { timeout: 300 });

    // Resolve the search
    resolveSearch!({
      ok: true,
      json: async () => ({ results: [] }),
    } as Response);
  });
});
