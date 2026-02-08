import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Inspector from './Inspector';

describe('Inspector', () => {
  it('renders nothing when no selection', () => {
    const { container } = render(
      <Inspector selected={undefined} onClear={vi.fn()} onFocus={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when selection has no connections', () => {
    const { container } = render(
      <Inspector
        selected={{ id: 'test-1', degree: 0 }}
        onClear={vi.fn()}
        onFocus={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders selected node with degree', () => {
    render(
      <Inspector
        selected={{ id: 'test-1', name: 'Test Node', type: 'subreddit', degree: 5 }}
        onClear={vi.fn()}
        onFocus={vi.fn()}
      />
    );

    expect(screen.getByText('Selection')).toBeInTheDocument();
    expect(screen.getByText('test-1')).toBeInTheDocument();
    expect(screen.getByText('Test Node')).toBeInTheDocument();
    expect(screen.getByText('subreddit')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders neighbors list', () => {
    const neighbors = [
      { id: 'neighbor-1', name: 'Neighbor 1', type: 'user' },
      { id: 'neighbor-2', name: 'Neighbor 2', type: 'post' },
    ];

    render(
      <Inspector
        selected={{ id: 'test-1', degree: 2, neighbors }}
        onClear={vi.fn()}
        onFocus={vi.fn()}
      />
    );

    expect(screen.getByText(/Neighbors \(2\)/)).toBeInTheDocument();
    expect(screen.getByText(/Neighbor 1/)).toBeInTheDocument();
    expect(screen.getByText(/Neighbor 2/)).toBeInTheDocument();
  });

  it('calls onClear when clear button clicked', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();

    render(
      <Inspector
        selected={{ id: 'test-1', degree: 1 }}
        onClear={onClear}
        onFocus={vi.fn()}
      />
    );

    const clearButton = screen.getByText('Clear');
    await user.click(clearButton);

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('calls onFocus when neighbor clicked', async () => {
    const user = userEvent.setup();
    const onFocus = vi.fn();
    const neighbors = [{ id: 'neighbor-1', name: 'Neighbor 1', type: 'user' }];

    render(
      <Inspector
        selected={{ id: 'test-1', degree: 1, neighbors }}
        onClear={vi.fn()}
        onFocus={onFocus}
      />
    );

    const neighborButton = screen.getByText(/Neighbor 1/);
    await user.click(neighborButton);

    expect(onFocus).toHaveBeenCalledWith('neighbor-1');
  });

  it('renders without name or type', () => {
    render(
      <Inspector
        selected={{ id: 'test-1', degree: 3 }}
        onClear={vi.fn()}
        onFocus={vi.fn()}
      />
    );

    expect(screen.getByText('test-1')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.queryByText('Name:')).not.toBeInTheDocument();
    expect(screen.queryByText('Type:')).not.toBeInTheDocument();
  });
});
