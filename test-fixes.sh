#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

API_URL="https://api.agentsbank.online"

echo -e "${YELLOW}Testing AgentsBank API Fixes${NC}\n"

# Test 1: Register a new agent
echo -e "${YELLOW}[1] Testing agent registration...${NC}"
REGISTER_RESPONSE=$(curl -s -X POST "${API_URL}/auth/register-self" \
  -H "Content-Type: application/json" \
  -d '{
    "humanUsername": "testuser_'$(date +%s)'",
    "humanEmail": "test_'$(date +%s)'@agentsbank.com",
    "firstName": "Test",
    "lastName": "User",
    "agentPassword": "TestPass123!"
  }')

echo "Response: $REGISTER_RESPONSE" | jq .

AGENT_ID=$(echo "$REGISTER_RESPONSE" | jq -r '.agent.agent_id' 2>/dev/null)
TOKEN=$(echo "$REGISTER_RESPONSE" | jq -r '.token' 2>/dev/null)
API_KEY=$(echo "$REGISTER_RESPONSE" | jq -r '.agent.api_key' 2>/dev/null)

if [ "$AGENT_ID" == "null" ] || [ -z "$AGENT_ID" ]; then
  echo -e "${RED}✗ Registration failed${NC}\n"
  exit 1
fi

echo -e "${GREEN}✓ Registration successful${NC}"
echo "  Agent ID: $AGENT_ID"
echo "  Token: ${TOKEN:0:20}..."
echo "  API Key: ${API_KEY:0:20}..."
echo ""

# Test 2: Create wallet and check wallet_id
echo -e "${YELLOW}[2] Testing wallet creation (Fix #1 - wallet_id should be present)...${NC}"
WALLET_RESPONSE=$(curl -s -X POST "${API_URL}/wallets/create" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "chain": "solana"
  }')

echo "Response: $WALLET_RESPONSE" | jq .

WALLET_ID=$(echo "$WALLET_RESPONSE" | jq -r '.wallet_id' 2>/dev/null)
WALLET_ADDRESS=$(echo "$WALLET_RESPONSE" | jq -r '.address' 2>/dev/null)

if [ "$WALLET_ID" == "null" ] || [ -z "$WALLET_ID" ]; then
  echo -e "${RED}✗ wallet_id is missing or null${NC}\n"
  exit 1
fi

echo -e "${GREEN}✓ wallet_id present in response: $WALLET_ID${NC}"
echo "  Address: $WALLET_ADDRESS"
echo ""

# Test 3: Get wallet (Fix #2 - should return 200, not 404)
echo -e "${YELLOW}[3] Testing getWallet endpoint (Fix #2 - should return 200, not 404)...${NC}"
GET_WALLET_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "${API_URL}/wallets/${WALLET_ID}" \
  -H "Authorization: Bearer $TOKEN")

HTTP_CODE=$(echo "$GET_WALLET_RESPONSE" | tail -1)
WALLET_BODY=$(echo "$GET_WALLET_RESPONSE" | head -n -1)

echo "HTTP Status: $HTTP_CODE"
echo "Response: $WALLET_BODY" | jq .

if [ "$HTTP_CODE" != "200" ]; then
  echo -e "${RED}✗ getWallet returned HTTP $HTTP_CODE (expected 200)${NC}\n"
  exit 1
fi

echo -e "${GREEN}✓ getWallet returned HTTP 200${NC}\n"

# Test 4: API Key authentication (Fix #3)
echo -e "${YELLOW}[4] Testing API Key authentication (Fix #3 - X-API-Key header)...${NC}"
API_KEY_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "${API_URL}/wallets" \
  -H "X-API-Key: $API_KEY")

HTTP_CODE=$(echo "$API_KEY_RESPONSE" | tail -1)
API_KEY_BODY=$(echo "$API_KEY_RESPONSE" | head -n -1)

echo "HTTP Status: $HTTP_CODE"
echo "Response: $API_KEY_BODY" | jq .

if [ "$HTTP_CODE" != "200" ]; then
  echo -e "${RED}✗ API Key auth returned HTTP $HTTP_CODE (expected 200)${NC}\n"
  exit 1
fi

echo -e "${GREEN}✓ API Key authentication works (HTTP 200)${NC}\n"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✓ All fixes validated successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
