// Simple test script to verify backend functionality
const apiBaseUrl = process.env.API_URL || 'http://localhost:3000';

async function testBackend() {
    console.log('Testing backend functionality...');

    // Test health endpoint
    try {
        console.log('\n1. Testing health endpoint...');
        const healthResponse = await fetch(`${apiBaseUrl}/health`);
        const healthData = await healthResponse.json();
        console.log('Health check:', healthData);
    } catch (error) {
        console.log('Health check failed (expected if backend not running):', error.message);
    }

    // Test OAuth status endpoint
    try {
        console.log('\n2. Testing OAuth status endpoint...');
        const oauthResponse = await fetch(`${apiBaseUrl}/oauth/status`);
        const oauthData = await oauthResponse.json();
        console.log('OAuth status:', oauthData);
    } catch (error) {
        console.log('OAuth status failed (expected if backend not running):', error.message);
    }

    // Test search endpoint
    try {
        console.log('\n3. Testing search endpoint...');
        const searchResponse = await fetch(`${apiBaseUrl}/search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({query: 'test query'})
        });
        const searchData = await searchResponse.json();
        console.log('Search results:', searchData);
    } catch (error) {
        console.log('Search failed (expected if backend not running):', error.message);
    }

    console.log('\nBackend testing completed.');
}

testBackend().catch(console.error);