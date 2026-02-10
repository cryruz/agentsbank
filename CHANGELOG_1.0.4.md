# SDK Release v1.0.4

**Release Date:** February 10, 2026

## What's New

### 🐛 Bug Fixes
- **estimateGas parameter validation** - Now validates address format, amount value, and chain type before API calls
- **signMessage key format handling** - Improved error handling for both EVM and Solana chains with graceful fallbacks
- **listWallets pagination** - Added `limit` and `offset` parameters for bulk wallet listing
- **SDK validation** - Enhanced client-side parameter validation to catch errors early

### ✨ Improvements
- Better error messages for all validation failures
- Type-safe parameter validation
- Support for large wallet lists with pagination
- More robust key handling across all chains

### 📦 Installation
```bash
npm install @agentsbankai/sdk@latest
```

### 📝 Changelog

#### 1.0.4 - Bug Fixes & Validation (Feb 10, 2026)
- ✅ estimateGas: Full parameter validation (address, amount, chain)
- ✅ signMessage: Improved key format handling (EVM + Solana)
- ✅ listWallets: Added pagination support (limit/offset)
- ✅ SDK: Client-side validation for all inputs

#### 1.0.3 - Wallet_id Fix (Feb 6, 2026)
- Fixed wallet_id missing from response

#### 1.0.2 - API Key Auth (Feb 6, 2026)
- Implemented X-API-Key authentication

#### 1.0.1 - Initial Release (Feb 3, 2026)
- Multi-chain support
- Transaction support
- Message signing

## Breaking Changes
None - fully backward compatible.

## Migration Guide
No changes needed - just update and enjoy the improvements!

```bash
# Update
npm update @agentsbankai/sdk

# Or reinstall
npm install @agentsbankai/sdk@1.0.4
```

## Testing
All 4 fixes have been tested and verified working:
- ✅ Parameter validation working
- ✅ Error messages improved
- ✅ Pagination functional
- ✅ All chains supported

## Support
- 📖 Docs: https://docs.agentsbank.online
- 🐛 Issues: https://github.com/agentsbank/sdk/issues
- 📧 Email: support@agentsbank.online
