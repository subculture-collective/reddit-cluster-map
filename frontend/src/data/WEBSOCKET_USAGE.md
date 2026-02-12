# WebSocket Integration Example

This document demonstrates how to integrate the WebSocket client for incremental graph updates.

## Basic Usage

```typescript
import { GraphWebSocket, GraphDiffMessage } from '../data/GraphWebSocket';
import type { GraphData } from '../types/graph';

// Initialize WebSocket connection
const ws = new GraphWebSocket({
  onDiff: (diff: GraphDiffMessage) => {
    console.log('Received graph update:', diff);
    
    // Apply diff to your existing graph data
    const updatedGraphData = GraphWebSocket.applyDiff(currentGraphData, diff);
    
    // Update your component state
    setGraphData(updatedGraphData);
  },
  
  onVersion: (version) => {
    console.log('Graph version:', version);
  },
  
  onError: (error) => {
    console.error('WebSocket error:', error);
  },
  
  onConnectionChange: (connected) => {
    console.log('WebSocket connection status:', connected);
    setIsConnected(connected);
  },
  
  // Optional: configure reconnection behavior
  reconnect: true,
  maxReconnectAttempts: 10,
  reconnectInterval: 1000,
  reconnectMultiplier: 2,
  maxReconnectInterval: 60000,
});

// Connect to WebSocket
ws.connect();

// Later: tell the server what version you have
ws.setCurrentVersion(currentVersion);

// Cleanup on unmount
useEffect(() => {
  return () => {
    ws.disconnect();
  };
}, []);
```

## Integration with Graph3D Component

```typescript
import React, { useEffect, useState, useRef } from 'react';
import { GraphWebSocket } from '../data/GraphWebSocket';
import type { GraphData } from '../types/graph';

function Graph3DWithLiveUpdates() {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<GraphWebSocket | null>(null);
  
  useEffect(() => {
    // Initial data fetch
    fetch('/api/graph?max_nodes=50000&max_links=100000')
      .then(res => res.json())
      .then((data: GraphData) => {
        setGraphData(data);
        
        // Initialize WebSocket after initial data is loaded
        wsRef.current = new GraphWebSocket({
          onDiff: (diff) => {
            console.log('Applying incremental update:', diff.action);
            setGraphData(prev => GraphWebSocket.applyDiff(prev, diff));
          },
          
          onConnectionChange: setIsConnected,
          
          onError: (error) => {
            console.error('WebSocket error, falling back to polling:', error);
            // Fallback to periodic polling
            startPolling();
          },
        });
        
        wsRef.current.connect();
      });
    
    // Cleanup
    return () => {
      if (wsRef.current) {
        wsRef.current.disconnect();
      }
    };
  }, []);
  
  return (
    <div>
      <div className="connection-status">
        {isConnected ? '🟢 Live' : '🔴 Offline'}
      </div>
      <Graph3D data={graphData} />
    </div>
  );
}

function startPolling() {
  // Fallback polling implementation
  const interval = setInterval(async () => {
    try {
      const response = await fetch('/api/graph/version');
      const version = await response.json();
      
      // Check if version changed and refetch if needed
      // ... implementation
    } catch (error) {
      console.error('Polling error:', error);
    }
  }, 10000); // Poll every 10 seconds
  
  return () => clearInterval(interval);
}
```

## Message Format

### Version Message (Server → Client)
```json
{
  "type": "version",
  "payload": {
    "version_id": 42,
    "node_count": 1000,
    "link_count": 5000
  }
}
```

### Diff Message (Server → Client)
```json
{
  "type": "diff",
  "payload": {
    "action": "add",
    "nodes": [
      {
        "id": "user_123",
        "name": "newuser",
        "val": 10,
        "type": "user"
      }
    ],
    "links": [
      {
        "source": "user_123",
        "target": "subreddit_456"
      }
    ],
    "version_id": 43
  }
}
```

### Version Update (Client → Server)
```json
{
  "type": "version",
  "version_id": 42
}
```

## API Endpoints

- **WebSocket:** `ws://localhost:8000/api/graph/ws` (or `wss://` for HTTPS)
- **HTTP Fallback:** 
  - `GET /api/graph/version` - Get current version
  - `GET /api/graph/diff?since=N` - Get diff since version N

## Configuration

The WebSocket URL is automatically determined from:
1. `VITE_API_URL` environment variable
2. Current window location (fallback)

Example `.env`:
```
VITE_API_URL=/api
```

For production with nginx reverse proxy:
```
VITE_API_URL=https://your-domain.com/api
```

## Performance Considerations

1. **Diff Application:** The `applyDiff` method is optimized for O(n) complexity
2. **Connection Management:** Automatic reconnection with exponential backoff prevents server overload
3. **Message Buffering:** Client buffers up to 256 messages before dropping (oldest first)
4. **Heartbeat:** 30-second ping/pong keeps connection alive through proxies

## Nginx Configuration

For WebSocket support through nginx reverse proxy:

```nginx
location /api/graph/ws {
    proxy_pass http://backend:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # Increase timeout for long-lived connections
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}
```
