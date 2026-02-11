// Load Test: Test normal traffic patterns
// Load: 50 VU for 5 minutes
// Purpose: Establish performance baselines under typical load

import http from 'k6/http';
import { check, sleep } from 'k6';
import { 
    API_BASE_URL, 
    commonParams,
    checkStatus200,
    checkValidJSON,
    getAllThresholds,
    handleSummary,
    randomChoice,
    randomSleep,
    SAMPLE_SEARCH_QUERIES
} from './common.js';

// Test configuration
export const options = {
    stages: [
        { duration: '1m', target: 50 },  // Ramp up to 50 VUs over 1 minute
        { duration: '3m', target: 50 },  // Stay at 50 VUs for 3 minutes
        { duration: '1m', target: 0 },   // Ramp down to 0 VUs over 1 minute
    ],
    thresholds: getAllThresholds(),
};

// Set test name for results export
__ENV.TEST_NAME = 'load';

// Simulate realistic user behavior with weighted endpoint distribution
export default function () {
    // Most users will view the graph (70% of requests)
    if (Math.random() < 0.7) {
        testGraphEndpoint();
    }
    
    // Some users will search (15% of requests)
    if (Math.random() < 0.15) {
        testSearchEndpoint();
    }
    
    // Some users will view communities (10% of requests)
    if (Math.random() < 0.10) {
        testCommunitiesEndpoint();
    }
    
    // Occasional checks of crawl status (5% of requests)
    if (Math.random() < 0.05) {
        testCrawlStatusEndpoint();
    }
    
    // Random sleep between requests (0.5 - 2 seconds)
    sleep(randomSleep(0.5, 2));
}

function testGraphEndpoint() {
    // Mix of full graph and limited graph requests
    const params = Math.random() < 0.5 
        ? `?max_nodes=5000&max_links=10000`
        : `?max_nodes=1000&max_links=2000`;
    
    const response = http.get(`${API_BASE_URL}/api/graph${params}`, {
        ...commonParams,
        tags: { endpoint: 'graph' },
    });
    
    check(response, {
        'graph: status is 200': (r) => checkStatus200(r),
        'graph: valid JSON': (r) => checkValidJSON(r),
    });
}

function testSearchEndpoint() {
    const query = randomChoice(SAMPLE_SEARCH_QUERIES);
    const response = http.get(`${API_BASE_URL}/api/search?node=${query}`, {
        ...commonParams,
        tags: { endpoint: 'search' },
    });
    
    check(response, {
        'search: status is 200': (r) => checkStatus200(r),
        'search: valid JSON': (r) => checkValidJSON(r),
    });
}

function testCommunitiesEndpoint() {
    // Test both community list and individual community
    if (Math.random() < 0.7) {
        // Get community list
        const response = http.get(`${API_BASE_URL}/api/communities`, {
            ...commonParams,
            tags: { endpoint: 'communities' },
        });
        
        check(response, {
            'communities: status is 200': (r) => checkStatus200(r),
            'communities: valid JSON': (r) => checkValidJSON(r),
        });
        
        // Try to get a specific community if available
        try {
            const data = JSON.parse(response.body);
            if (data.nodes && data.nodes.length > 0) {
                const communityId = data.nodes[0].id;
                const detailResponse = http.get(
                    `${API_BASE_URL}/api/communities/${communityId}`,
                    {
                        ...commonParams,
                        tags: { endpoint: 'communities' },
                    }
                );
                
                check(detailResponse, {
                    'community detail: status is 200': (r) => checkStatus200(r),
                });
            }
        } catch (e) {
            // Ignore parse errors
        }
    } else {
        // Direct community detail request with a common ID
        const response = http.get(`${API_BASE_URL}/api/communities/0`, {
            ...commonParams,
            tags: { endpoint: 'communities' },
        });
        
        // Accept both 200 (found) and 404 (not found) as valid responses
        check(response, {
            'community detail: valid response': (r) => r.status === 200 || r.status === 404,
        });
    }
}

function testCrawlStatusEndpoint() {
    const response = http.get(`${API_BASE_URL}/api/crawl/status`, {
        ...commonParams,
        tags: { endpoint: 'crawl_status' },
    });
    
    check(response, {
        'crawl status: status is 200': (r) => checkStatus200(r),
        'crawl status: valid JSON': (r) => checkValidJSON(r),
    });
}

// Custom summary handler
export { handleSummary };
