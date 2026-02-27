import { ethers } from "hardhat";
import { MerkleTree } from "merkletreejs";
import keccak256 from "keccak256";
import * as fs from "fs";
import * as path from "path";

interface ClaimEntry {
  address: string;
  amount: string;
  proof: string[];
}

interface ClaimsOutput {
  epochId: number;
  root: string;
  epochTotal: string;
  snapshotBlock: number;
  claims: Record<string, ClaimEntry>;
}

async function main() {
  // --- Parameters (set via env or hardcode for local dev) ---
  const vaultAddress = process.env.VAULT_ADDRESS || "";
  const snapshotBlock = process.env.SNAPSHOT_BLOCK
    ? parseInt(process.env.SNAPSHOT_BLOCK)
    : await ethers.provider.getBlockNumber();
  const epochId = process.env.EPOCH_ID ? parseInt(process.env.EPOCH_ID) : 1;
  const epochCap = process.env.EPOCH_CAP
    ? BigInt(process.env.EPOCH_CAP)
    : ethers.parseEther("10000");

  if (!vaultAddress) throw new Error("VAULT_ADDRESS env var required");

  console.log("Building Merkle tree for:");
  console.log("  Vault:", vaultAddress);
  console.log("  Snapshot block:", snapshotBlock);
  console.log("  Epoch ID:", epochId);
  console.log("  Epoch cap:", epochCap.toString());

  // --- 1. Get FundVault contract ---
  const vault = await ethers.getContractAt("FundVault", vaultAddress);

  // --- 2. Collect all Transfer events to find shareholders ---
  const filter = vault.filters.Transfer();
  const events = await vault.queryFilter(filter, 0, snapshotBlock);

  const holderSet = new Set<string>();
  for (const ev of events) {
    if (ev.args) {
      const { from, to } = ev.args;
      if (to !== ethers.ZeroAddress) holderSet.add(to.toLowerCase());
      if (from !== ethers.ZeroAddress) holderSet.add(from.toLowerCase());
    }
  }

  console.log(`Found ${holderSet.size} unique addresses from Transfer events`);

  // --- 3. Fetch balances at snapshot block ---
  const balances: Record<string, bigint> = {};
  let totalShares = BigInt(0);

  for (const holder of holderSet) {
    const balance: bigint = await vault.balanceOf(holder, { blockTag: snapshotBlock });
    if (balance > BigInt(0)) {
      balances[holder] = balance;
      totalShares += balance;
    }
  }

  console.log(`${Object.keys(balances).length} holders with non-zero balance`);
  console.log("Total shares at snapshot:", totalShares.toString());

  if (totalShares === BigInt(0)) {
    console.log("No shares found — aborting");
    process.exit(0);
  }

  // --- 4. Calculate proportional rewards ---
  const rewardAmounts: Record<string, bigint> = {};
  let allocatedTotal = BigInt(0);

  const holders = Object.entries(balances);
  for (let i = 0; i < holders.length; i++) {
    const [holder, balance] = holders[i];
    let reward: bigint;

    if (i === holders.length - 1) {
      // Last holder gets the remainder to avoid rounding dust
      reward = epochCap - allocatedTotal;
    } else {
      reward = (balance * epochCap) / totalShares;
    }

    if (reward > BigInt(0)) {
      rewardAmounts[holder] = reward;
      allocatedTotal += reward;
    }
  }

  console.log("Total allocated rewards:", allocatedTotal.toString());

  // --- 5. Build Merkle tree ---
  // Leaf = keccak256(abi.encodePacked(account, amount))
  const leaves = Object.entries(rewardAmounts).map(([account, amount]) => {
    const packed = ethers.solidityPacked(["address", "uint256"], [account, amount]);
    return keccak256(packed);
  });

  const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
  const root = "0x" + tree.getRoot().toString("hex");

  console.log("Merkle root:", root);

  // --- 6. Build claims output ---
  const claims: Record<string, ClaimEntry> = {};
  for (const [account, amount] of Object.entries(rewardAmounts)) {
    const packed = ethers.solidityPacked(["address", "uint256"], [account, amount]);
    const leaf = keccak256(packed);
    const proof = tree.getHexProof(leaf);
    claims[account] = {
      address: account,
      amount: amount.toString(),
      proof,
    };
  }

  const output: ClaimsOutput = {
    epochId,
    root,
    epochTotal: allocatedTotal.toString(),
    snapshotBlock,
    claims,
  };

  // --- 7. Write output ---
  const outputDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const outputPath = path.join(outputDir, `claims_epoch_${epochId}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log("\nClaims written to:", outputPath);
  console.log("Root:", root);
  console.log("Total holders:", Object.keys(claims).length);
  console.log("Epoch total:", allocatedTotal.toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
