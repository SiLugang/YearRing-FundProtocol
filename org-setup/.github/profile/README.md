# YearRing Fund Protocol

**On-chain fund infrastructure for the next generation of capital management.**

YearRing is a fully on-chain, 100%-reserve fund protocol built on Base. It combines ERC-4626 vault accounting, a programmable lock-and-reward system, and an on-chain beneficiary/inheritance layer — giving asset managers institutional-grade tooling without intermediaries.

---

## Repositories

| Repo | Description |
|---|---|
| [yearring-protocol](https://github.com/yearring-fund/yearring-protocol) | Core smart contracts — FundVault, LockLedger, LockRewardManager, StrategyManager |
| [yearring-app](https://github.com/yearring-fund/yearring-app) | dApp frontend — [app.yearringfund.com](https://app.yearringfund.com) |
| [yearring-docs](https://github.com/yearring-fund/yearring-docs) | Documentation & whitepaper — [docs.yearringfund.com](https://docs.yearringfund.com) |

## Deployments

**Network: Base Mainnet (Chain ID 8453)**

| Contract | Address |
|---|---|
| FundVaultV01 | `0x9dD61ee543a9C51aBe7B26A89687C9aEeea98a54` |
| LockLedgerV02 | `0x2FC1d315c67AE3Df2a062f7130d58FaA6c0ce9EF` |
| LockRewardManagerV02 | `0xB1e6eC37113B4cF2608acFDf9A8f8Bf38ccBf633` |
| StrategyManagerV01 | `0xa44d3b9b0ECD6fFa4bD646957468c0B5Bfa64A54` |

## Security

To report a vulnerability, see [SECURITY.md](https://github.com/yearring-fund/.github/blob/main/SECURITY.md).

Smart contracts are tested but have not yet been formally audited by a third party.

---

*Built on [Base](https://base.org) · Solidity 0.8.26 · OpenZeppelin v4*
