import type { GraphNode, GraphLink, GraphData } from '../types/graph';

export interface WebSocketMessage {
    type: 'diff' | 'version' | 'error' | 'ping';
    payload: any;
}

export interface GraphDiffMessage {
    action: 'add' | 'remove' | 'update';
    nodes?: GraphNode[];
    links?: GraphLink[];
    version_id: number;
}

export interface GraphVersionMessage {
    version_id: number;
    node_count: number;
    link_count: number;
}

export type DiffHandler = (diff: GraphDiffMessage) => void;
export type VersionHandler = (version: GraphVersionMessage) => void;
export type ErrorHandler = (error: Error) => void;
export type ConnectionStateHandler = (connected: boolean) => void;

export interface GraphWebSocketOptions {
    url?: string;
    onDiff?: DiffHandler;
    onVersion?: VersionHandler;
    onError?: ErrorHandler;
    onConnectionChange?: ConnectionStateHandler;
    reconnect?: boolean;
    maxReconnectAttempts?: number;
    reconnectInterval?: number;
    reconnectMultiplier?: number;
    maxReconnectInterval?: number;
}

/**
 * GraphWebSocket manages a WebSocket connection to receive incremental graph updates.
 * 
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Heartbeat/ping handling
 * - Diff application to existing graph data
 * - Graceful degradation (caller handles fallback to polling)
 */
export class GraphWebSocket {
    private ws: WebSocket | null = null;
    private url: string;
    private reconnect: boolean;
    private maxReconnectAttempts: number;
    private reconnectInterval: number;
    private reconnectMultiplier: number;
    private maxReconnectInterval: number;
    private reconnectAttempts: number = 0;
    private reconnectTimer: number | null = null;
    private connected: boolean = false;
    private currentVersion: number = 0;
    
    private onDiffHandler?: DiffHandler;
    private onVersionHandler?: VersionHandler;
    private onErrorHandler?: ErrorHandler;
    private onConnectionChangeHandler?: ConnectionStateHandler;
    
    constructor(options: GraphWebSocketOptions = {}) {
        // Default to /api/graph/ws or use VITE_API_URL if set
        const apiUrl = import.meta.env.VITE_API_URL || '/api';
        this.url = options.url || `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}${apiUrl}/graph/ws`;
        
        this.reconnect = options.reconnect !== false;
        this.maxReconnectAttempts = options.maxReconnectAttempts || 10;
        this.reconnectInterval = options.reconnectInterval || 1000;
        this.reconnectMultiplier = options.reconnectMultiplier || 2;
        this.maxReconnectInterval = options.maxReconnectInterval || 60000;
        
        this.onDiffHandler = options.onDiff;
        this.onVersionHandler = options.onVersion;
        this.onErrorHandler = options.onError;
        this.onConnectionChangeHandler = options.onConnectionChange;
    }
    
    /**
     * Connect to the WebSocket server
     */
    public connect(): void {
        if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
            return; // Already connected or connecting
        }
        
        try {
            this.ws = new WebSocket(this.url);
            
            this.ws.onopen = () => {
                console.log('[GraphWebSocket] Connected');
                this.connected = true;
                this.reconnectAttempts = 0;
                this.notifyConnectionChange(true);
                
                // Send current version to server if we have one
                if (this.currentVersion > 0) {
                    this.sendVersion(this.currentVersion);
                }
            };
            
            this.ws.onmessage = (event) => {
                try {
                    const message: WebSocketMessage = JSON.parse(event.data);
                    this.handleMessage(message);
                } catch (error) {
                    console.error('[GraphWebSocket] Failed to parse message:', error);
                    this.notifyError(new Error('Failed to parse WebSocket message'));
                }
            };
            
            this.ws.onerror = (error) => {
                console.error('[GraphWebSocket] WebSocket error:', error);
                this.notifyError(new Error('WebSocket connection error'));
            };
            
            this.ws.onclose = (event) => {
                console.log('[GraphWebSocket] Disconnected', event.code, event.reason);
                this.connected = false;
                this.notifyConnectionChange(false);
                
                // Attempt reconnection if enabled and not a normal closure
                if (this.reconnect && event.code !== 1000) {
                    this.scheduleReconnect();
                }
            };
        } catch (error) {
            console.error('[GraphWebSocket] Failed to create WebSocket:', error);
            this.notifyError(error as Error);
            if (this.reconnect) {
                this.scheduleReconnect();
            }
        }
    }
    
    /**
     * Disconnect from the WebSocket server
     */
    public disconnect(): void {
        this.reconnect = false;
        
        if (this.reconnectTimer !== null) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        if (this.ws) {
            this.ws.close(1000, 'Client disconnect');
            this.ws = null;
        }
        
        this.connected = false;
        this.notifyConnectionChange(false);
    }
    
    /**
     * Check if currently connected
     */
    public isConnected(): boolean {
        return this.connected && this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }
    
    /**
     * Get current graph version
     */
    public getCurrentVersion(): number {
        return this.currentVersion;
    }
    
    /**
     * Set current graph version (tells server what version client has)
     */
    public setCurrentVersion(version: number): void {
        this.currentVersion = version;
        if (this.isConnected()) {
            this.sendVersion(version);
        }
    }
    
    /**
     * Apply diff to existing graph data
     */
    public static applyDiff(graphData: GraphData, diff: GraphDiffMessage): GraphData {
        const nodes = new Map(graphData.nodes.map(n => [n.id, n]));
        const links = [...graphData.links];
        
        if (diff.action === 'add') {
            // Add new nodes
            if (diff.nodes) {
                for (const node of diff.nodes) {
                    nodes.set(node.id, node);
                }
            }
            
            // Add new links
            if (diff.links) {
                for (const link of diff.links) {
                    // Check if link already exists
                    const exists = links.some(l => l.source === link.source && l.target === link.target);
                    if (!exists) {
                        links.push(link);
                    }
                }
            }
        } else if (diff.action === 'remove') {
            // Remove nodes
            if (diff.nodes) {
                for (const node of diff.nodes) {
                    nodes.delete(node.id);
                }
                
                // Remove links connected to removed nodes
                const removedIds = new Set(diff.nodes.map(n => n.id));
                const filteredLinks = links.filter(l => 
                    !removedIds.has(l.source) && !removedIds.has(l.target)
                );
                links.length = 0;
                links.push(...filteredLinks);
            }
            
            // Remove specific links
            if (diff.links) {
                for (const link of diff.links) {
                    const index = links.findIndex(l => l.source === link.source && l.target === link.target);
                    if (index !== -1) {
                        links.splice(index, 1);
                    }
                }
            }
        } else if (diff.action === 'update') {
            // Update existing nodes
            if (diff.nodes) {
                for (const node of diff.nodes) {
                    const existing = nodes.get(node.id);
                    if (existing) {
                        // Merge updated properties
                        nodes.set(node.id, { ...existing, ...node });
                    }
                }
            }
        }
        
        return {
            nodes: Array.from(nodes.values()),
            links
        };
    }
    
    private handleMessage(message: WebSocketMessage): void {
        switch (message.type) {
            case 'version':
                this.handleVersion(message.payload as GraphVersionMessage);
                break;
            case 'diff':
                this.handleDiff(message.payload as GraphDiffMessage);
                break;
            case 'error':
                this.notifyError(new Error(message.payload.message || 'Unknown error'));
                break;
            case 'ping':
                // Respond to ping with pong (WebSocket handles this automatically)
                break;
            default:
                console.warn('[GraphWebSocket] Unknown message type:', message.type);
        }
    }
    
    private handleVersion(version: GraphVersionMessage): void {
        console.log('[GraphWebSocket] Received version:', version);
        this.currentVersion = version.version_id;
        if (this.onVersionHandler) {
            this.onVersionHandler(version);
        }
    }
    
    private handleDiff(diff: GraphDiffMessage): void {
        console.log('[GraphWebSocket] Received diff:', diff);
        this.currentVersion = diff.version_id;
        if (this.onDiffHandler) {
            this.onDiffHandler(diff);
        }
    }
    
    private sendVersion(version: number): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'version',
                version_id: version
            }));
        }
    }
    
    private scheduleReconnect(): void {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('[GraphWebSocket] Max reconnect attempts reached');
            this.notifyError(new Error('Max reconnection attempts reached'));
            return;
        }
        
        const delay = Math.min(
            this.reconnectInterval * Math.pow(this.reconnectMultiplier, this.reconnectAttempts),
            this.maxReconnectInterval
        );
        
        console.log(`[GraphWebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
        
        this.reconnectTimer = window.setTimeout(() => {
            this.reconnectAttempts++;
            this.connect();
        }, delay);
    }
    
    private notifyConnectionChange(connected: boolean): void {
        if (this.onConnectionChangeHandler) {
            this.onConnectionChangeHandler(connected);
        }
    }
    
    private notifyError(error: Error): void {
        if (this.onErrorHandler) {
            this.onErrorHandler(error);
        }
    }
}
