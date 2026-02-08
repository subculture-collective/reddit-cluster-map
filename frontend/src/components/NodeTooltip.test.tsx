import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import NodeTooltip from './NodeTooltip';

describe('NodeTooltip', () => {
  it('should not render when nodeId is null', () => {
    const { container } = render(
      <NodeTooltip nodeId={null} mouseX={100} mouseY={100} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('should render node name when hovered', () => {
    render(
      <NodeTooltip
        nodeId="node1"
        nodeName="Test Node"
        mouseX={100}
        mouseY={100}
      />
    );
    expect(screen.getByText('Test Node')).toBeInTheDocument();
  });

  it('should render nodeId when name is not provided', () => {
    render(
      <NodeTooltip
        nodeId="node1"
        mouseX={100}
        mouseY={100}
      />
    );
    expect(screen.getByText('node1')).toBeInTheDocument();
  });

  it('should render node type when provided', () => {
    render(
      <NodeTooltip
        nodeId="node1"
        nodeName="Test Node"
        nodeType="subreddit"
        mouseX={100}
        mouseY={100}
      />
    );
    expect(screen.getByText('Type: subreddit')).toBeInTheDocument();
  });

  it('should position tooltip near cursor', () => {
    const { container } = render(
      <NodeTooltip
        nodeId="node1"
        nodeName="Test Node"
        mouseX={100}
        mouseY={200}
      />
    );
    const tooltip = container.firstChild as HTMLElement;
    expect(tooltip.style.left).toBe('115px'); // 100 + 15 offset
    expect(tooltip.style.top).toBe('215px'); // 200 + 15 offset
  });
});
