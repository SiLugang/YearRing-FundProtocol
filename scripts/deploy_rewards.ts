import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying rewards contracts with account:", deployer.address);
  console.log("Network:", network.name);

  // Load existing deployment
  const deploymentsPath = path.join(__dirname, `../deployments/${network.name}.json`);
  if (!fs.existsSync(deploymentsPath)) {
    throw new Error(`No deployment found at ${deploymentsPath}. Run deploy.ts first.`);
  }
  const existing = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  console.log("Loaded existing deployment:", existing.contracts);

  const vaultAddress = existing.contracts.FundVault;
  const timelockAddress = existing.contracts.TimelockController;
  const treasury = existing.config.treasury;
  const guardian = existing.config.guardian;

  // Config
  const premintAmount = ethers.parseEther("1000000"); // 1M RWD
  const epochCap = ethers.parseEther("10000");        // 10K RWD per epoch
  const maxEpochCap = ethers.parseEther("100000");    // 100K RWD max cap

  // 1. Deploy RewardToken
  const RewardTokenFactory = await ethers.getContractFactory("RewardToken");
  const rewardToken = await RewardTokenFactory.deploy(
    "Reward Token",
    "RWD",
    premintAmount,
    treasury,
    timelockAddress
  );
  await rewardToken.waitForDeployment();
  const rewardTokenAddress = await rewardToken.getAddress();
  console.log("RewardToken deployed to:", rewardTokenAddress);

  // 2. Deploy MerkleRewardsDistributor
  const DistributorFactory = await ethers.getContractFactory("MerkleRewardsDistributor");
  const distributor = await DistributorFactory.deploy(
    rewardTokenAddress,
    vaultAddress,
    epochCap,
    maxEpochCap,
    timelockAddress, // admin = timelock
    guardian         // guardian
  );
  await distributor.waitForDeployment();
  const distributorAddress = await distributor.getAddress();
  console.log("MerkleRewardsDistributor deployed to:", distributorAddress);

  // 3. Update deployment file
  existing.contracts.RewardToken = rewardTokenAddress;
  existing.contracts.MerkleRewardsDistributor = distributorAddress;
  existing.config.premintAmount = premintAmount.toString();
  existing.config.epochCap = epochCap.toString();
  existing.config.maxEpochCap = maxEpochCap.toString();

  fs.writeFileSync(deploymentsPath, JSON.stringify(existing, null, 2));
  console.log("\nDeployment updated at:", deploymentsPath);

  console.log("\n=== Note ===");
  console.log("Treasury must approve distributor to transfer reward tokens.");
  console.log("RewardToken address:", rewardTokenAddress);
  console.log("Distributor address:", distributorAddress);
  console.log("Run treasury approve tx before distributing rewards.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
