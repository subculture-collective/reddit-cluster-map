// Soak Test: Find memory leaks and degradation over time
// Load: 10 VUs for 30 minutes
// Purpose: Test stability under sustained load

import http from 'k6/http';
import { check, sleep } from 'k6';
import { 
    API_BASE_URL, 
    commonParams,
    checkStatus200,
    checkValidJSON,
    getAllThresholds,
    randomChoice,
    randomSleep,
    SAMPLE_SEARCH_QUERIES
} from './common.js';

// Test configuration
export const options = {
    stages: [
        { duration: '2m', target: 10 },   // Ramp up to 10 VUs
        { duration: '26m', target: 10 },  // Hold at 10 VUs for 26 minutes
        { duration: '2m', target: 0 },    // Ramp down
    ],
    thresholds: {
        ...getAllThresholds(),
        // Additional threshold to detect performance degradation over time
        // We track that the average response time doesn't increase significantly
        'http_req_duration': [
            'p(95)<1000',
            'avg<500', // Average should stay below 500ms throughout the test
        ],
    },
};

// Set test name for results export
__ENV.TEST_NAME = 'soak';

// Realistic user behavior over extended period
export default function () {
    // Simulate typical user session patterns
    
    // Session start: View graph
    testGraphEndpoint();
    sleep(randomSleep(1, 3));
    
    // Browse communities
    if (Math.random() < 0.7) {
        testCommunitiesEndpoint();
        sleep(randomSleep(1, 2));
    }
    
    // Search for something
    if (Math.random() < 0.5) {
        testSearchEndpoint();
        sleep(randomSleep(0.5, 1.5));
    }
    
    // View graph again (potentially with different filters)
    if (Math.random() < 0.6) {
        testGraphEndpoint();
        sleep(randomSleep(1, 3));
    }
    
    // Check crawl status occasionally
    if (Math.random() < 0.2) {
        testCrawlStatusEndpoint();
        sleep(randomSleep(0.5, 1));
    }
    
    // Longer pause between sessions (simulate reading/analyzing data)
    sleep(randomSleep(5, 15));
}

function testGraphEndpoint() {
    // Vary graph size to test different cache entries
    const scenarios = [
        '?max_nodes=5000&max_links=10000',
        '?max_nodes=2000&max_links=5000',
        '?max_nodes=1000&max_links=2000',
    ];
    
    const params = randomChoice(scenarios);
    const response = http.get(`${API_BASE_URL}/api/graph${params}`, {
        ...commonParams,
        tags: { endpoint: 'graph' },
    });
    
    check(response, {
        'graph: status is 200': (r) => checkStatus200(r),
        'graph: valid JSON': (r) => checkValidJSON(r),
        'graph: has nodes': (r) => {
            try {
                const data = JSON.parse(r.body);
                return data.nodes && data.nodes.length > 0;
            } catch (e) {
                return false;
            }
        },
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
    const response = http.get(`${API_BASE_URL}/api/communities`, {
        ...commonParams,
        tags: { endpoint: 'communities' },
    });
    
    check(response, {
        'communities: status is 200': (r) => checkStatus200(r),
        'communities: valid JSON': (r) => checkValidJSON(r),
    });
    
    // Sometimes drill down into a specific community
    if (Math.random() < 0.3) {
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

// Custom summary handler with additional info for soak test
export function handleSummary(data) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const testName = __ENV.TEST_NAME || 'test';
    
    console.log(`\n=== ${testName.toUpperCase()} TEST SUMMARY ===\n`);
    
    // Print key metrics
    if (data.metrics.http_req_duration) {
        const duration = data.metrics.http_req_duration.values;
        console.log('Request Duration:');
        console.log(`  avg: ${duration.avg.toFixed(2)}ms`);
        console.log(`  p50: ${duration['p(50)'].toFixed(2)}ms`);
        console.log(`  p95: ${duration['p(95)'].toFixed(2)}ms`);
        console.log(`  p99: ${duration['p(99)'].toFixed(2)}ms`);
        console.log(`  max: ${duration.max.toFixed(2)}ms`);
    }
    
    if (data.metrics.http_reqs) {
        console.log(`\nTotal Requests: ${data.metrics.http_reqs.values.count}`);
        console.log(`Request Rate: ${data.metrics.http_reqs.values.rate.toFixed(2)}/s`);
    }
    
    if (data.metrics.http_req_failed) {
        const failRate = data.metrics.http_req_failed.values.rate * 100;
        console.log(`\nError Rate: ${failRate.toFixed(2)}%`);
    }
    
    if (data.metrics.data_received) {
        const dataGB = data.metrics.data_received.values.count / (1024 * 1024 * 1024);
        console.log(`Data Received: ${dataGB.toFixed(2)}GB`);
    }
    
    console.log('\n================================\n');
    console.log('Note: For soak tests, monitor for:');
    console.log('  - Increasing response times over time (memory leak indicator)');
    console.log('  - Growing error rates (resource exhaustion)');
    console.log('  - Check Prometheus/Grafana for memory usage trends');
    console.log('================================\n');
    
    // Return results to be written to file
    return {
        [`/results/${testName}-${timestamp}.json`]: JSON.stringify(data, null, 2),
        stdout: '',
    };
}
