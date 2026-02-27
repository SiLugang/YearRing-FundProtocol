import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Network:", network.name);

  // Config
  const minDelay = process.env.MIN_DELAY ? parseInt(process.env.MIN_DELAY) : 0;
  const treasury = process.env.TREASURY || deployer.address;
  const guardian = process.env.GUARDIAN || deployer.address;

  console.log("Treasury:", treasury);
  console.log("Guardian:", guardian);
  console.log("MinDelay:", minDelay);

  // 1. Deploy TimelockController
  const TimelockFactory = await ethers.getContractFactory("TimelockController");
  const timelock = await TimelockFactory.deploy(
    minDelay,
    [deployer.address], // proposers
    [deployer.address], // executors
    deployer.address    // admin
  );
  await timelock.waitForDeployment();
  const timelockAddress = await timelock.getAddress();
  console.log("TimelockController deployed to:", timelockAddress);

  // 2. Deploy MockUSDC (localhost/hardhat only)
  let usdcAddress: string;
  if (network.name === "hardhat" || network.name === "localhost") {
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();
    usdcAddress = await usdc.getAddress();
    console.log("MockUSDC deployed to:", usdcAddress);
  } else {
    usdcAddress = process.env.USDC_ADDRESS || "";
    if (!usdcAddress) throw new Error("USDC_ADDRESS env var required for non-local networks");
    console.log("Using existing USDC at:", usdcAddress);
  }

  // 3. Deploy FundVault
  const FundVaultFactory = await ethers.getContractFactory("FundVault");
  const vault = await FundVaultFactory.deploy(
    usdcAddress,
    "Fund Vault",
    "fvUSDC",
    treasury,
    guardian,
    timelockAddress
  );
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("FundVault deployed to:", vaultAddress);

  // 4. Save deployment addresses
  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentData = {
    network: network.name,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      TimelockController: timelockAddress,
      MockUSDC: usdcAddress,
      FundVault: vaultAddress,
    },
    config: {
      minDelay,
      treasury,
      guardian,
    },
  };

  const outputPath = path.join(deploymentsDir, `${network.name}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(deploymentData, null, 2));
  console.log("\nDeployment saved to:", outputPath);
  console.log("\n=== Deployment Summary ===");
  console.log(JSON.stringify(deploymentData.contracts, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
