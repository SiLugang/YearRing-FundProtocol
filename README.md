# YearRing-FundProtocol

An on-chain asset management protocol with a structured commitment incentive layer — application-version V3 testnet demo build.

Users deposit USDC into an ERC4626 vault and receive yield-bearing shares (fbUSDC). They can voluntarily lock those shares — at 30, 90, or 180 days in the current UI (Bronze / Silver / Gold tiers; the protocol supports any duration in the 30–365 day range) — to earn upfront reward tokens (RWT) and a management fee rebate that accrues linearly over the lock period. Early exit is permitted but requires returning the upfront RWT. The beneficiary module allows a designated address to inherit locked positions under predefined inactivity conditions.

---

## What This Demo Proves

| Capability | How it is demonstrated |
|---|---|
| ERC4626 deposit / redeem | Vault section — mint MockUSDC → approve → deposit → redeem |
| Share price accounting | `pricePerShare()` in the Stats Bar — rises when simulated yield is introduced |
| Lock + RWT issuance | Lock section — choose tier, enter amount; button auto-switches Approve fbUSDC → Lock + Earn RWT; RWT issued upfront |
| Fee rebate (linear accrual) | Lock row — `previewRebate` and `claimRebate` visible per position |
| Early exit | Lock row — approve RWT back, call `earlyExitWithReturn` |
| User state transitions | State section — Normal → LockedAccumulating → Matured → EarlyExited |
| Beneficiary continuity | Beneficiary section — `setBeneficiary`, `heartbeat`, `executeClaim` |
| Protocol metrics | Stats Bar — TVL, price per share, locked ratio, total locks ever |
| Seeded demo personas | Demo State section — Alice (Gold lock), Bob (free holder), Carol (Silver lock, inactive) |

---

## Testnet Self-Serve (Recommended for Reviewers)

**No local setup required for reviewers.** Use a browser wallet (e.g. MetaMask) on Base Sepolia (chain ID 84532) with a small amount of ETH for gas.

1. Open the deployed frontend in a browser with MetaMask
2. Click **Connect Wallet** — if on the wrong network, click **Switch to Base Sepolia**
3. In the **Vault** section: mint MockUSDC (no faucet or role needed), approve USDC, deposit
4. In the **Lock** section: choose a tier, enter an amount; the button auto-switches from **Approve fbUSDC** to **Lock + Earn RWT** — observe RWT issued
5. In the **Lock** row: check rebate preview, optionally claim rebate or early exit
6. In the **State** section: observe user state change
7. In the **Demo State** section: inspect pre-seeded Alice / Bob / Carol positions (read-only, no wallet needed)

> Fresh locks will not reach maturity on testnet within a short session. For the full lifecycle (lock → mature → unlock), use the local demo below.

---

## Local Full Lifecycle Demo

### Option A — Script demo (recommended, full lifecycle)

Runs all three scenes end-to-end in Hardhat's in-process EVM with `evm_increaseTime`:

```bash
npx hardhat run scripts/v2/run_demo.ts
```

No node to start, no `.env` required. Output covers Scene A (passive yield), Scene B (Gold lock → maturity → unlock), Scene C (beneficiary claim). Full lifecycle in a single command.

### Option B — Local frontend + manual interaction

For connecting the frontend to a local deployment (manual step-through, not full lifecycle script):

```bash
# 1. Start a local Hardhat node
npx hardhat node

# 2. In a separate terminal — deploy, configure, seed
npx hardhat run scripts/deploy.ts                  --network localhost
npx hardhat run scripts/v2/deploy_v2.ts            --network localhost
npx hardhat run scripts/v2/setup_v2.ts             --network localhost
npx hardhat run scripts/v2/seed_v2.ts              --network localhost

# 3. Sync addresses and start the frontend
npx hardhat run scripts/update_frontend_config.ts  --network localhost
cd frontend && npm install --legacy-peer-deps && npm run dev
# → http://localhost:5173
```

> Lock maturity on a local node still requires `evm_increaseTime` — use Option A or the Hardhat console to advance time.

**Run all tests:**

```bash
npm install --legacy-peer-deps
npx hardhat test
```

---

## Current Demo Scope

### Capital Layer

| Contract | Role |
|---|---|
| `FundVaultV01` | ERC4626 vault — USDC → fbUSDC shares, management fee accrues to treasury |
| `StrategyManagerV01` | Routes capital to the demo strategy; keeps vault `totalAssets` auditable |
| `RewardToken` | Fixed-supply ERC20, pre-minted to treasury at deploy |

### Commitment Layer

| Contract | Role |
|---|---|
| `LockLedgerV02` | Custody of locked fbUSDC; records owner, duration, tier |
| `LockBenefitV02` | View: tier classification (Bronze / Silver / Gold) and fee discount rate |
| `LockRewardManagerV02` | Entry point for lock / rebate claim / early exit |
| `BeneficiaryModuleV02` | Designated beneficiary inherits locked positions on inactivity |
| `UserStateEngineV02` | View: full user state across all modules in one call |
| `MetricsLayerV02` | View: protocol-level snapshot (TVL, locked shares, ratio, locks ever) |

**User-facing incentive stack:** RWT issuance + management fee rebate.

> Contracts outside this scope (`MerkleRewardsDistributorV01`, `LockPointsV02`, `GovernanceSignalV02`) are built but not part of the current demo-facing scope.

### Commitment Tiers

| Tier | Duration | RWT Multiplier | Fee Discount |
|---|---|---|---|
| Bronze | 30 days | 1.0× | 20% |
| Silver | 90 days | 1.3× | 40% |
| Gold | 180 days | 1.8× | 60% |

---

## Known Limitations

- **No auto-refresh.** Click ↻ on each section to update on-chain state.
- **Maturity on testnet.** Fresh locks will not mature for 30, 90, or 180 days depending on tier (current UI options). The full lock → mature → unlock lifecycle requires a local Hardhat node with `evm_increaseTime`.
- **Strategy yield is simulated.** The demo uses a `DummyStrategy`. `pricePerShare` changes only when simulated yield is introduced — it does not change autonomously.
- **Beneficiary: locked positions only.** `executeClaim` transfers lock ownership to the beneficiary; it does not transfer the original owner's free fbUSDC balance.
- **Rebate rights not inherited.** Fee rebate rights stay with the original lock owner after `executeClaim`.
- **Admin actions not in UI.** `adminMarkInactive` and yield simulation are performed via Hardhat scripts, not through the frontend.
- **MAX 5 active locks per address.**

See [`docs/V2_LIMITATIONS_AND_V3_NOTES.md`](docs/V2_LIMITATIONS_AND_V3_NOTES.md) for the full list with V3 fix notes.

---

## Documentation Index

| Document | Purpose |
|---|---|
| [`docs/DEMO_GUIDE.md`](docs/DEMO_GUIDE.md) | Three demo paths — steps, actions, expected results |
| [`docs/FRONTEND_DEMO_GUIDE.md`](docs/FRONTEND_DEMO_GUIDE.md) | Full frontend walkthrough — all 7 sections, local node setup |
| [`docs/CONTRACT_ADDRESSES.md`](docs/CONTRACT_ADDRESSES.md) | Deployed contract addresses by network |
| [`docs/PARAMETERS.md`](docs/PARAMETERS.md) | Tier durations, RWT formula, fee rates, exit and beneficiary rules |
| [`docs/ONE_PAGER.md`](docs/ONE_PAGER.md) | Protocol overview — problem, solution, verifiability |
| [`docs/PRODUCT_ARCHITECTURE.md`](docs/PRODUCT_ARCHITECTURE.md) | Layer-by-layer architecture breakdown |
| [`docs/TOKEN_ROLE.md`](docs/TOKEN_ROLE.md) | Token dependency model — what works with and without RWT |
| [`docs/ACCOUNTING_NOTES.md`](docs/ACCOUNTING_NOTES.md) | Accounting audit — three V2 paths and their vault impact |
| [`docs/V2_LIMITATIONS_AND_V3_NOTES.md`](docs/V2_LIMITATIONS_AND_V3_NOTES.md) | Contract-level V2 limitations and V3 fix notes |
| [`docs/INDEX.md`](docs/INDEX.md) | Full document index |

---

## Tech Stack

- Solidity `^0.8.20` (compiler 0.8.26), Hardhat + TypeScript, OpenZeppelin v4
- Frontend: Vite + React + TypeScript + wagmi v2 + viem, Base Sepolia
