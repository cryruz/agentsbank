#!/bin/bash

BASE_URL="http://localhost:3000"
echo "🧪 AgentsBank API Test Suite"
echo "================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0

test_endpoint() {
    local name="$1"
    local method="$2"
    local endpoint="$3"
    local data="$4"
    local expected_status="$5"
    local headers="$6"
    
    echo -n "Testing: $name ... "
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" $headers "$BASE_URL$endpoint")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" $headers -H "Content-Type: application/json" -d "$data" "$BASE_URL$endpoint")
    fi
    
    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "$expected_status" ]; then
        echo -e "${GREEN}✓ PASS${NC} (HTTP $http_code)"
        PASSED=$((PASSED + 1))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC} (Expected $expected_status, got $http_code)"
        echo "Response: $body"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

echo "1️⃣  Health Check Tests"
echo "----------------------"
test_endpoint "Health endpoint" "GET" "/health" "" "200"
echo ""

echo "2️⃣  Authentication Tests"
echo "------------------------"

# Register human user
TIMESTAMP=$(date +%s)
USERNAME="testuser_$TIMESTAMP"
EMAIL="test_${TIMESTAMP}@example.com"
PASSWORD="SecurePass123!"

echo "Registering user: $USERNAME"
register_response=$(curl -s -X POST "$BASE_URL/api/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$USERNAME\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

if echo "$register_response" | grep -q "human_id"; then
    echo -e "${GREEN}✓ User registration successful${NC}"
    PASSED=$((PASSED + 1))
    HUMAN_ID=$(echo "$register_response" | grep -o '"human_id":"[^"]*"' | cut -d'"' -f4)
else
    echo -e "${RED}✗ User registration failed${NC}"
    echo "Response: $register_response"
    FAILED=$((FAILED + 1))
fi

# Login human
echo "Logging in as: $USERNAME"
login_response=$(curl -s -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}")

if echo "$login_response" | grep -q "token"; then
    echo -e "${GREEN}✓ Login successful${NC}"
    PASSED=$((PASSED + 1))
    HUMAN_TOKEN=$(echo "$login_response" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    echo "Token: ${HUMAN_TOKEN:0:20}..."
else
    echo -e "${RED}✗ Login failed${NC}"
    echo "Response: $login_response"
    FAILED=$((FAILED + 1))
fi
echo ""

echo "3️⃣  Agent Management Tests"
echo "--------------------------"

if [ -n "$HUMAN_TOKEN" ]; then
    # Register agent
    echo "Registering agent..."
    agent_response=$(curl -s -X POST "$BASE_URL/api/auth/agent/register" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $HUMAN_TOKEN" \
        -d '{"first_name":"TestBot","last_name":"Agent","agent_password":"AgentPass123!"}')
    
    if echo "$agent_response" | grep -q "agent_id"; then
        echo -e "${GREEN}✓ Agent registration successful${NC}"
        PASSED=$((PASSED + 1))
        AGENT_ID=$(echo "$agent_response" | grep -o '"agent_id":"[^"]*"' | cut -d'"' -f4)
        AGENT_USERNAME=$(echo "$agent_response" | grep -o '"agent_username":"[^"]*"' | cut -d'"' -f4)
        API_KEY=$(echo "$agent_response" | grep -o '"api_key":"[^"]*"' | cut -d'"' -f4)
        echo "Agent ID: $AGENT_ID"
        echo "Agent Username: $AGENT_USERNAME"
    else
        echo -e "${RED}✗ Agent registration failed${NC}"
        echo "Response: $agent_response"
        FAILED=$((FAILED + 1))
    fi
    
    # Login agent
    if [ -n "$AGENT_USERNAME" ]; then
        echo "Logging in as agent..."
        agent_login=$(curl -s -X POST "$BASE_URL/api/auth/agent/login" \
            -H "Content-Type: application/json" \
            -d "{\"agent_username\":\"$AGENT_USERNAME\",\"agent_password\":\"AgentPass123!\"}")
        
        if echo "$agent_login" | grep -q "token"; then
            echo -e "${GREEN}✓ Agent login successful${NC}"
            PASSED=$((PASSED + 1))
            AGENT_TOKEN=$(echo "$agent_login" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
        else
            echo -e "${RED}✗ Agent login failed${NC}"
            echo "Response: $agent_login"
            FAILED=$((FAILED + 1))
        fi
    fi
    
    # List agents
    echo "Listing agents..."
    agents_response=$(curl -s -X GET "$BASE_URL/api/agents" \
        -H "Authorization: Bearer $HUMAN_TOKEN")
    
    if echo "$agents_response" | grep -q "agent_id"; then
        echo -e "${GREEN}✓ List agents successful${NC}"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}✗ List agents failed${NC}"
        FAILED=$((FAILED + 1))
    fi
fi
echo ""

echo "4️⃣  Wallet Tests"
echo "----------------"

if [ -n "$AGENT_TOKEN" ]; then
    # Create wallet
    echo "Creating Ethereum wallet..."
    wallet_response=$(curl -s -X POST "$BASE_URL/api/wallets" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $AGENT_TOKEN" \
        -d '{"chain":"ethereum","type":"non-custodial"}')
    
    if echo "$wallet_response" | grep -q "wallet_id"; then
        echo -e "${GREEN}✓ Wallet creation successful${NC}"
        PASSED=$((PASSED + 1))
        WALLET_ID=$(echo "$wallet_response" | grep -o '"wallet_id":"[^"]*"' | cut -d'"' -f4)
        WALLET_ADDRESS=$(echo "$wallet_response" | grep -o '"address":"[^"]*"' | cut -d'"' -f4)
        echo "Wallet ID: $WALLET_ID"
        echo "Address: $WALLET_ADDRESS"
    else
        echo -e "${RED}✗ Wallet creation failed${NC}"
        echo "Response: $wallet_response"
        FAILED=$((FAILED + 1))
    fi
    
    # Get wallet details
    if [ -n "$WALLET_ID" ]; then
        echo "Getting wallet details..."
        wallet_details=$(curl -s -X GET "$BASE_URL/api/wallets/$WALLET_ID" \
            -H "Authorization: Bearer $AGENT_TOKEN")
        
        if echo "$wallet_details" | grep -q "wallet_id"; then
            echo -e "${GREEN}✓ Get wallet details successful${NC}"
            PASSED=$((PASSED + 1))
        else
            echo -e "${RED}✗ Get wallet details failed${NC}"
            FAILED=$((FAILED + 1))
        fi
    fi
fi
echo ""

echo "5️⃣  Transaction Tests"
echo "---------------------"

if [ -n "$WALLET_ID" ] && [ -n "$AGENT_TOKEN" ]; then
    # Note: Creating a real transaction will fail without actual blockchain setup
    echo "Attempting to create transaction (expected to create pending tx)..."
    tx_response=$(curl -s -X POST "$BASE_URL/api/transactions" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $AGENT_TOKEN" \
        -d "{\"wallet_id\":\"$WALLET_ID\",\"to_address\":\"0x742d35Cc6634C0532925a3b844Bc9e7595f7c8c\",\"amount\":\"0.01\",\"currency\":\"ETH\",\"type\":\"transfer\"}")
    
    if echo "$tx_response" | grep -q "tx_id"; then
        echo -e "${GREEN}✓ Transaction creation successful${NC}"
        PASSED=$((PASSED + 1))
        TX_ID=$(echo "$tx_response" | grep -o '"tx_id":"[^"]*"' | cut -d'"' -f4)
        echo "Transaction ID: $TX_ID"
        
        # Get transaction details
        echo "Getting transaction details..."
        tx_details=$(curl -s -X GET "$BASE_URL/api/transactions/$TX_ID" \
            -H "Authorization: Bearer $AGENT_TOKEN")
        
        if echo "$tx_details" | grep -q "tx_id"; then
            echo -e "${GREEN}✓ Get transaction details successful${NC}"
            PASSED=$((PASSED + 1))
        else
            echo -e "${RED}✗ Get transaction details failed${NC}"
            FAILED=$((FAILED + 1))
        fi
        
        # Get wallet transactions
        echo "Getting wallet transactions..."
        wallet_txs=$(curl -s -X GET "$BASE_URL/api/transactions/wallet/$WALLET_ID" \
            -H "Authorization: Bearer $AGENT_TOKEN")
        
        if echo "$wallet_txs" | grep -q "transactions"; then
            echo -e "${GREEN}✓ Get wallet transactions successful${NC}"
            PASSED=$((PASSED + 1))
        else
            echo -e "${RED}✗ Get wallet transactions failed${NC}"
            FAILED=$((FAILED + 1))
        fi
    else
        echo -e "${YELLOW}⚠ Transaction creation returned error (may be expected)${NC}"
        echo "Response: $tx_response"
    fi
fi
echo ""

echo "6️⃣  Error Handling Tests"
echo "------------------------"

# Test unauthorized access
test_endpoint "Unauthorized wallet access" "GET" "/api/wallets/fake-id" "" "401"

# Test invalid credentials
test_endpoint "Invalid login credentials" "POST" "/api/auth/login" '{"username":"invalid","password":"wrong"}' "401"

# Test missing required fields
test_endpoint "Missing registration fields" "POST" "/api/auth/register" '{"username":"test"}' "400"

echo ""
echo "================================"
echo "📊 Test Results Summary"
echo "================================"
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo "Total: $((PASSED + FAILED))"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    exit 1
fi
