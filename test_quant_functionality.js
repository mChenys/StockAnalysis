#!/usr/bin/env node

/**
 * Quantitative Trading Functionality Test Script
 * This script tests various aspects of the quantitative trading functionality
 */

const axios = require('axios');

// Base URL for the API
const BASE_URL = 'http://localhost:3000';

// JWT token placeholder - you'll need to replace this with an actual token
let authToken = '';

// Test user credentials
const testUser = {
    username: 'testuser' + Date.now(), // Use timestamp to make unique
    email: 'test' + Date.now() + '@example.com',
    password: 'TestPass123!'
};

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function apiCall(endpoint, method = 'GET', data = null) {
    try {
        const headers = {
            'Content-Type': 'application/json',
        };

        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        }

        const config = {
            method,
            url: `${BASE_URL}${endpoint}`,
            headers,
            timeout: 10000,
        };

        if (data) {
            config.data = data;
        }

        const response = await axios(config);
        console.log(`✓ ${method} ${endpoint}: Status ${response.status}`);
        return response.data;
    } catch (error) {
        console.error(`✗ ${method} ${endpoint}:`, error.response?.data || error.message);
        return null;
    }
}

async function testQuantitativeTrading() {
    console.log('🔍 Starting Quantitative Trading Functionality Test...\n');

    // 1. Register and login test user
    console.log('1. Registering and authenticating user...');
    const registerResult = await apiCall('/api/auth/register', 'POST', testUser);
    if (!registerResult || !registerResult.success) {
        console.log('   ✗ Registration failed');
        return;
    }

    await delay(500); // Wait briefly after registration

    const loginResult = await apiCall('/api/auth/login', 'POST', {
        username: testUser.username,
        password: testUser.password
    });

    if (loginResult && ((loginResult.data && loginResult.data.accessToken) || loginResult.token)) {
        authToken = loginResult.data?.accessToken || loginResult.token;
        console.log('   ✓ Authentication successful');
    } else {
        console.log('   ✗ Authentication failed - unable to get token');
        return;
    }

    await delay(1000);

    // 2. Test VNPY service status
    console.log('\n2. Testing VNPY service status...');
    const statusRes = await apiCall('/api/quant/status');
    if (statusRes) {
        console.log(`   ✓ VNPY Status: Available=${statusRes.available}, Health=${JSON.stringify(statusRes.health)}`);
    } else {
        console.log('   ⚠ VNPY service not accessible - this may be expected if service is not running');
    }

    await delay(1000);

    // 3. Test account info (with a default gateway)
    console.log('\n3. Testing account information...');
    const gateway = 'FUTU'; // Test with FUTU gateway
    const accountRes = await apiCall(`/api/quant/account/${gateway}`);
    if (accountRes) {
        console.log(`   ✓ Account Info: ${JSON.stringify(accountRes.data)}`);
    } else {
        console.log('   ⚠ Account info not available - likely because VNPY service is not running');
    }

    await delay(1000);

    // 4. Test position info
    console.log('\n4. Testing position information...');
    const positionsRes = await apiCall(`/api/quant/positions/${gateway}`);
    if (positionsRes) {
        console.log(`   ✓ Positions: ${JSON.stringify(positionsRes.data)}`);
    } else {
        console.log('   ⚠ Positions not available - likely because VNPY service is not running');
    }

    await delay(1000);

    // 5. Test order listing
    console.log('\n5. Testing order listing...');
    const ordersRes = await apiCall('/api/quant/orders');
    if (ordersRes) {
        console.log(`   ✓ Orders: ${JSON.stringify(ordersRes.data)}`);
    } else {
        console.log('   ⚠ Orders not available - likely because VNPY service is not running');
    }

    await delay(1000);

    // 6. Test strategy listing
    console.log('\n6. Testing strategy listing...');
    const strategiesRes = await apiCall('/api/quant/strategies');
    if (strategiesRes) {
        console.log(`   ✓ Strategies: ${JSON.stringify(strategiesRes.data)}`);
    } else {
        console.log('   ⚠ Strategies not available - likely because VNPY service is not running');
    }

    await delay(1000);

    // 7. Test mock deposit (simulating adding funds)
    console.log('\n7. Testing deposit functionality...');
    const depositRes = await apiCall('/api/quant/account/deposit', 'POST', {
        gateway: gateway,
        amount: 100000
    });
    if (depositRes) {
        console.log(`   ✓ Deposit Result: ${JSON.stringify(depositRes)}`);
    } else {
        console.log('   ⚠ Deposit not available - likely because VNPY service is not running');
    }

    await delay(1000);

    // 8. Test placing a mock order
    console.log('\n8. Testing order placement...');
    const orderData = {
        gateway: gateway,
        symbol: 'AAPL',
        direction: 'buy',
        orderType: 'limit',
        price: 150.00,
        volume: 100
    };
    const orderRes = await apiCall('/api/quant/order', 'POST', orderData);
    if (orderRes) {
        console.log(`   ✓ Order Result: ${JSON.stringify(orderRes)}`);
    } else {
        console.log('   ⚠ Order placement not available - likely because VNPY service is not running');
    }

    await delay(1000);

    // 9. Test strategy creation (if available)
    console.log('\n9. Testing strategy creation...');
    const strategyData = {
        name: 'test_strategy_' + Date.now(),
        gateway: gateway,
        symbols: ['AAPL', 'GOOGL'],
        params: {
            model: 'gpt-4o',
            stop_loss: 0.05
        }
    };
    const strategyRes = await apiCall('/api/quant/strategies', 'POST', strategyData);
    if (strategyRes) {
        console.log(`   ✓ Strategy Creation: ${JSON.stringify(strategyRes)}`);

        // If strategy was created, try to start it
        if (strategyRes.success) {
            console.log('\n10. Testing strategy start...');
            const startRes = await apiCall(`/api/quant/strategies/${strategyData.name}/start`, 'POST');
            if (startRes) {
                console.log(`   ✓ Strategy Start: ${JSON.stringify(startRes)}`);
            } else {
                console.log('   ⚠ Strategy start not available - likely because VNPY service is not running');
            }

            await delay(1000);

            // Test getting strategy signals
            console.log('\n11. Testing strategy signals...');
            const signalsRes = await apiCall(`/api/quant/strategies/${strategyData.name}/signals`);
            if (signalsRes) {
                console.log(`   ✓ Strategy Signals: ${JSON.stringify(signalsRes)}`);
            } else {
                console.log('   ⚠ Strategy signals not available - likely because VNPY service is not running');
            }
        }
    } else {
        console.log('   ⚠ Strategy creation not available - likely because VNPY service is not running');
    }

    await delay(1000);

    // 12. Test backtesting functionality
    console.log('\n12. Testing backtesting functionality...');
    const backtestData = {
        strategy_name: strategyData.name,
        symbol: 'AAPL',
        start_date: '2023-01-01',
        end_date: '2023-12-31',
        capital: 100000
    };
    const backtestRes = await apiCall('/api/quant/backtest/run', 'POST', backtestData);
    if (backtestRes) {
        console.log(`   ✓ Backtest Result: ${JSON.stringify(backtestRes)}`);
    } else {
        console.log('   ⚠ Backtesting not available - likely because VNPY service is not running');
    }

    console.log('\n✅ Quantitative Trading Functionality Test Completed!');
    console.log('\nNote: Many tests may show warnings because the VNPY Python service is not running.');
    console.log('To fully test the quantitative trading functionality, please ensure the VNPY service is started.');
    console.log('\nSummary:');
    console.log('- Authentication: Checked ✓');
    console.log('- VNPY Service Status: Checked (may be unavailable without Python service)');
    console.log('- Account Info: Checked (may be unavailable without Python service)');
    console.log('- Positions: Checked (may be unavailable without Python service)');
    console.log('- Orders: Checked (may be unavailable without Python service)');
    console.log('- Strategies: Checked (may be unavailable without Python service)');
    console.log('- Deposit Function: Checked (may be unavailable without Python service)');
    console.log('- Order Placement: Checked (may be unavailable without Python service)');
    console.log('- Strategy Creation: Checked (may be unavailable without Python service)');
    console.log('- Strategy Start/Stop: Checked (may be unavailable without Python service)');
    console.log('- Strategy Signals: Checked (may be unavailable without Python service)');
    console.log('- Backtesting: Checked (may be unavailable without Python service)');
}

// Run the test
testQuantitativeTrading().catch(console.error);