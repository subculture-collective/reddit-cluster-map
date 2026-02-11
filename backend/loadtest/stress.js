// Stress Test: Find breaking points
// Load: Ramp up to 200 VUs over 2 minutes
// Purpose: Identify maximum capacity and bottlenecks

import http from 'k6/http';
import { check, sleep } from 'k6';
import { 
    API_BASE_URL, 
    commonParams,
    checkValidJSON,
    handleSummary,
    randomChoice,
    randomSleep,
    SAMPLE_SEARCH_QUERIES
} from './common.js';

// Test configuration - stress test has relaxed thresholds
export const options = {
    stages: [
        { duration: '30s', target: 50 },   // Ramp to 50 VUs
        { duration: '30s', target: 100 },  // Ramp to 100 VUs
        { duration: '30s', target: 150 },  // Ramp to 150 VUs
        { duration: '30s', target: 200 },  // Ramp to 200 VUs (peak load)
        { duration: '1m', target: 200 },   // Hold at 200 VUs
        { duration: '30s', target: 0 },    // Ramp down to 0
    ],
    thresholds: {
        // Relaxed thresholds for stress test - we expect some degradation
        'http_req_failed': ['rate<0.05'], // Allow up to 5% errors
        'http_req_duration': ['p(95)<2000'], // Allow up to 2s at P95
        'http_req_duration{endpoint:graph}': ['p(95)<1500', 'p(50)<800'],
        'http_req_duration{endpoint:search}': ['p(95)<300', 'p(50)<150'],
        'http_req_duration{endpoint:communities}': ['p(95)<800', 'p(50)<400'],
    },
};

// Set test name for results export
__ENV.TEST_NAME = 'stress';

// Aggressive load pattern - higher request rate
export default function () {
    // Test multiple endpoints in rapid succession
    
    // Primary: Graph endpoint (most resource intensive)
    if (Math.random() < 0.6) {
        testGraphEndpoint();
    }
    
    // Secondary: Communities
    if (Math.random() < 0.2) {
        testCommunitiesEndpoint();
    }
    
    // Tertiary: Search
    if (Math.random() < 0.15) {
        testSearchEndpoint();
    }
    
    // Occasional: Other endpoints
    if (Math.random() < 0.05) {
        testOtherEndpoints();
    }
    
    // Shorter sleep times to increase pressure
    sleep(randomSleep(0.1, 0.5));
}

function testGraphEndpoint() {
    // Mix of different graph sizes to stress different code paths
    const scenarios = [
        '',  // Full graph (most expensive)
        '?max_nodes=10000&max_links=25000',
        '?max_nodes=5000&max_links=10000',
        '?max_nodes=1000&max_links=2000',
    ];
    
    const params = randomChoice(scenarios);
    const response = http.get(`${API_BASE_URL}/api/graph${params}`, {
        ...commonParams,
        tags: { endpoint: 'graph' },
    });
    
    check(response, {
        'graph: successful': (r) => r.status >= 200 && r.status < 500,
        'graph: valid JSON on success': (r) => r.status !== 200 || checkValidJSON(r),
    });
}

function testSearchEndpoint() {
    const query = randomChoice(SAMPLE_SEARCH_QUERIES);
    const response = http.get(`${API_BASE_URL}/api/search?node=${query}`, {
        ...commonParams,
        tags: { endpoint: 'search' },
    });
    
    check(response, {
        'search: successful': (r) => r.status >= 200 && r.status < 500,
    });
}

function testCommunitiesEndpoint() {
    const params = Math.random() < 0.7 
        ? ''  // Full communities list
        : '/0';  // Specific community
    
    const response = http.get(`${API_BASE_URL}/api/communities${params}`, {
        ...commonParams,
        tags: { endpoint: 'communities' },
    });
    
    check(response, {
        'communities: successful': (r) => r.status >= 200 && r.status < 500,
    });
}

function testOtherEndpoints() {
    // Test various other endpoints
    const endpoints = [
        { url: '/health', tag: 'health' },
        { url: '/api/crawl/status', tag: 'crawl_status' },
        { url: '/api/export?format=json&max_nodes=100', tag: 'export' },
    ];
    
    const endpoint = randomChoice(endpoints);
    const response = http.get(`${API_BASE_URL}${endpoint.url}`, {
        ...commonParams,
        tags: { endpoint: endpoint.tag },
    });
    
    check(response, {
        'other endpoints: successful': (r) => r.status >= 200 && r.status < 500,
    });
}

// Custom summary handler
export { handleSummary };
