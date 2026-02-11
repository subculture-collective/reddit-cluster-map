// Smoke Test: Verify all endpoints work correctly
// Load: 1 VU for 30 seconds
// Purpose: Quick sanity check before running heavier tests

import http from 'k6/http';
import { check, sleep } from 'k6';
import { 
    API_BASE_URL, 
    commonParams,
    checkStatus200,
    checkValidJSON,
    getAllThresholds,
    handleSummary,
    SAMPLE_SEARCH_QUERIES,
    randomChoice
} from './common.js';

// Test configuration
export const options = {
    stages: [
        { duration: '30s', target: 1 }, // 1 VU for 30 seconds
    ],
    thresholds: getAllThresholds(),
};

// Set test name for results export
__ENV.TEST_NAME = 'smoke';

export default function () {
    // Test 1: Health check
    let response = http.get(`${API_BASE_URL}/health`, {
        ...commonParams,
        tags: { endpoint: 'health' },
    });
    
    check(response, {
        'health: status is 200': (r) => checkStatus200(r, 'health'),
        'health: valid JSON': (r) => checkValidJSON(r),
        'health: response time < 100ms': (r) => r.timings.duration < 100,
    });
    
    sleep(1);
    
    // Test 2: Graph endpoint
    response = http.get(`${API_BASE_URL}/api/graph`, {
        ...commonParams,
        tags: { endpoint: 'graph' },
    });
    
    check(response, {
        'graph: status is 200': (r) => checkStatus200(r, 'graph'),
        'graph: valid JSON': (r) => checkValidJSON(r),
        'graph: has nodes': (r) => {
            try {
                const data = JSON.parse(r.body);
                return data.nodes && data.nodes.length > 0;
            } catch (e) {
                return false;
            }
        },
        'graph: has links': (r) => {
            try {
                const data = JSON.parse(r.body);
                return data.links && data.links.length > 0;
            } catch (e) {
                return false;
            }
        },
        'graph: response time < 1000ms': (r) => r.timings.duration < 1000,
    });
    
    sleep(1);
    
    // Test 3: Graph with limit parameters
    response = http.get(`${API_BASE_URL}/api/graph?max_nodes=1000&max_links=2000`, {
        ...commonParams,
        tags: { endpoint: 'graph' },
    });
    
    check(response, {
        'graph (limited): status is 200': (r) => checkStatus200(r, 'graph'),
        'graph (limited): respects limits': (r) => {
            try {
                const data = JSON.parse(r.body);
                return data.nodes.length <= 1000 && data.links.length <= 2000;
            } catch (e) {
                return false;
            }
        },
    });
    
    sleep(1);
    
    // Test 4: Communities endpoint
    response = http.get(`${API_BASE_URL}/api/communities`, {
        ...commonParams,
        tags: { endpoint: 'communities' },
    });
    
    check(response, {
        'communities: status is 200': (r) => checkStatus200(r, 'communities'),
        'communities: valid JSON': (r) => checkValidJSON(r),
        'communities: response time < 500ms': (r) => r.timings.duration < 500,
    });
    
    sleep(1);
    
    // Test 5: Search endpoint
    const query = randomChoice(SAMPLE_SEARCH_QUERIES);
    response = http.get(`${API_BASE_URL}/api/search?node=${query}`, {
        ...commonParams,
        tags: { endpoint: 'search' },
    });
    
    check(response, {
        'search: status is 200': (r) => checkStatus200(r, 'search'),
        'search: valid JSON': (r) => checkValidJSON(r),
        'search: response time < 200ms': (r) => r.timings.duration < 200,
    });
    
    sleep(1);
    
    // Test 6: Crawl status endpoint
    response = http.get(`${API_BASE_URL}/api/crawl/status`, {
        ...commonParams,
        tags: { endpoint: 'crawl_status' },
    });
    
    check(response, {
        'crawl status: status is 200': (r) => checkStatus200(r, 'crawl_status'),
        'crawl status: valid JSON': (r) => checkValidJSON(r),
        'crawl status: response time < 100ms': (r) => r.timings.duration < 100,
    });
    
    sleep(1);
    
    // Test 7: Export endpoint (with format parameter)
    response = http.get(`${API_BASE_URL}/api/export?format=json&max_nodes=100`, {
        ...commonParams,
        tags: { endpoint: 'export' },
    });
    
    check(response, {
        'export: status is 200': (r) => checkStatus200(r, 'export'),
        'export: valid JSON': (r) => checkValidJSON(r),
    });
    
    sleep(2);
}

// Custom summary handler
export { handleSummary };
