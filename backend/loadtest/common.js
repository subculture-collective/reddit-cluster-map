// Common utilities and configuration for k6 load tests

// Get API base URL from environment or default to localhost
export const API_BASE_URL = __ENV.API_BASE_URL || 'http://localhost:8000';

// Admin token for protected endpoints (optional)
export const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || '';

// Generate timestamp for result file names
export function getTimestamp() {
    const now = new Date();
    return now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
}

// Common HTTP parameters
export const commonParams = {
    headers: {
        'Content-Type': 'application/json',
    },
    timeout: '60s',
};

// Admin-authenticated HTTP parameters
export function adminParams() {
    return {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ADMIN_TOKEN}`,
        },
        timeout: '60s',
    };
}

// Random sample from array
export function randomChoice(array) {
    return array[Math.floor(Math.random() * array.length)];
}

// Sleep for random duration between min and max seconds
export function randomSleep(min, max) {
    const sleep_time = Math.random() * (max - min) + min;
    return sleep_time;
}

// Common check functions
export function checkStatus200(response, endpoint) {
    return response.status === 200;
}

export function checkResponseTime(response, maxMs) {
    return response.timings.duration < maxMs;
}

export function checkValidJSON(response) {
    try {
        JSON.parse(response.body);
        return true;
    } catch (e) {
        return false;
    }
}

// Sample search queries for testing
export const SAMPLE_SEARCH_QUERIES = [
    'AskReddit',
    'programming',
    'python',
    'javascript',
    'technology',
    'gaming',
    'news',
    'worldnews',
    'science',
    'pics',
];

// Sample subreddits for crawl testing
export const SAMPLE_SUBREDDITS = [
    'AskReddit',
    'programming',
    'learnprogramming',
    'technology',
    'science',
];

// Common thresholds for all tests
export const commonThresholds = {
    // Error rate should be less than 1%
    'http_req_failed': ['rate<0.01'],
    // 95% of requests should complete within their endpoint-specific thresholds (defined per test)
    'http_req_duration': ['p(95)<1000'], // Default fallback threshold
};

// Endpoint-specific thresholds
export const endpointThresholds = {
    graph: {
        'http_req_duration{endpoint:graph}': ['p(95)<500', 'p(50)<250'],
        'http_req_failed{endpoint:graph}': ['rate<0.01'],
    },
    search: {
        'http_req_duration{endpoint:search}': ['p(95)<100', 'p(50)<50'],
        'http_req_failed{endpoint:search}': ['rate<0.01'],
    },
    communities: {
        'http_req_duration{endpoint:communities}': ['p(95)<300', 'p(50)<150'],
        'http_req_failed{endpoint:communities}': ['rate<0.01'],
    },
    crawlStatus: {
        'http_req_duration{endpoint:crawl_status}': ['p(95)<50', 'p(50)<25'],
        'http_req_failed{endpoint:crawl_status}': ['rate<0.01'],
    },
    health: {
        'http_req_duration{endpoint:health}': ['p(95)<50', 'p(50)<25'],
        'http_req_failed{endpoint:health}': ['rate<0.01'],
    },
};

// Combine all endpoint thresholds
export function getAllThresholds() {
    return {
        ...commonThresholds,
        ...endpointThresholds.graph,
        ...endpointThresholds.search,
        ...endpointThresholds.communities,
        ...endpointThresholds.crawlStatus,
        ...endpointThresholds.health,
    };
}

// Summary handler to print key metrics
export function handleSummary(data) {
    const timestamp = getTimestamp();
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
    
    // Return results to be written to file
    return {
        [`results/${testName}-${timestamp}.json`]: JSON.stringify(data, null, 2),
        stdout: '', // Suppress default stdout to avoid duplication
    };
}
