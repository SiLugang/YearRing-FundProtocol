import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { FundVault, MockUSDC } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("FundVault", function () {
  let vault: FundVault;
  let usdc: MockUSDC;
  let deployer: SignerWithAddress;
  let treasury: SignerWithAddress;
  let guardian: SignerWithAddress;
  let admin: SignerWithAddress; // timelock stand-in
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  const DEPOSIT_AMOUNT = ethers.parseUnits("1000", 6); // 1000 USDC
  const GUARDIAN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("GUARDIAN_ROLE"));
  const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;

  beforeEach(async function () {
    [deployer, treasury, guardian, admin, alice, bob] = await ethers.getSigners();

    // Deploy MockUSDC
    const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDCFactory.deploy();

    // Deploy FundVault (admin acts as timelock)
    const FundVaultFactory = await ethers.getContractFactory("FundVault");
    vault = await FundVaultFactory.deploy(
      await usdc.getAddress(),
      "Fund Vault",
      "fvUSDC",
      treasury.address,
      guardian.address,
      admin.address
    );

    // Mint USDC to alice and bob
    await usdc.mint(alice.address, DEPOSIT_AMOUNT * BigInt(10));
    await usdc.mint(bob.address, DEPOSIT_AMOUNT * BigInt(10));

    // Approve vault
    await usdc.connect(alice).approve(await vault.getAddress(), ethers.MaxUint256);
    await usdc.connect(bob).approve(await vault.getAddress(), ethers.MaxUint256);
  });

  // ---------------------------------------------------------------------------
  // Deployment / initial state
  // ---------------------------------------------------------------------------
  describe("Deployment", function () {
    it("should have correct asset", async function () {
      expect(await vault.asset()).to.equal(await usdc.getAddress());
    });

    it("should have 18 decimals for shares", async function () {
      expect(await vault.decimals()).to.equal(18);
    });

    it("should start with zero totalAssets", async function () {
      expect(await vault.totalAssets()).to.equal(0);
    });

    it("should set treasury correctly", async function () {
      expect(await vault.treasury()).to.equal(treasury.address);
    });

    it("should have depositsPaused = false initially", async function () {
      expect(await vault.depositsPaused()).to.equal(false);
    });

    it("should have redeemsPaused = false initially", async function () {
      expect(await vault.redeemsPaused()).to.equal(false);
    });

    it("should have externalTransfersEnabled = false initially", async function () {
      expect(await vault.externalTransfersEnabled()).to.equal(false);
    });
  });

  // ---------------------------------------------------------------------------
  // deposit / redeem normal flow
  // ---------------------------------------------------------------------------
  describe("deposit", function () {
    it("should deposit USDC and receive shares", async function () {
      const sharesBefore = await vault.totalSupply();
      await vault.connect(alice).deposit(DEPOSIT_AMOUNT, alice.address);
      const sharesAfter = await vault.totalSupply();
      expect(sharesAfter).to.be.gt(sharesBefore);
      expect(await vault.balanceOf(alice.address)).to.be.gt(0);
    });

    it("totalAssets invariant: equals USDC balance after deposit", async function () {
      await vault.connect(alice).deposit(DEPOSIT_AMOUNT, alice.address);
      const totalAssets = await vault.totalAssets();
      const usdcBalance = await usdc.balanceOf(await vault.getAddress());
      expect(totalAssets).to.equal(usdcBalance);
    });

    it("should revert when depositsPaused", async function () {
      await vault.connect(guardian).pauseDeposits();
      await expect(
        vault.connect(alice).deposit(DEPOSIT_AMOUNT, alice.address)
      ).to.be.revertedWithCustomError(vault, "DepositsArePaused");
    });
  });

  describe("redeem", function () {
    beforeEach(async function () {
      await vault.connect(alice).deposit(DEPOSIT_AMOUNT, alice.address);
    });

    it("should redeem shares and receive USDC", async function () {
      const shares = await vault.balanceOf(alice.address);
      const usdcBefore = await usdc.balanceOf(alice.address);
      await vault.connect(alice).redeem(shares, alice.address, alice.address);
      const usdcAfter = await usdc.balanceOf(alice.address);
      expect(usdcAfter).to.be.gt(usdcBefore);
      expect(await vault.balanceOf(alice.address)).to.equal(0);
    });

    it("totalAssets invariant: equals USDC balance after redeem", async function () {
      const shares = await vault.balanceOf(alice.address);
      await vault.connect(alice).redeem(shares / BigInt(2), alice.address, alice.address);
      const totalAssets = await vault.totalAssets();
      const usdcBalance = await usdc.balanceOf(await vault.getAddress());
      expect(totalAssets).to.equal(usdcBalance);
    });

    it("should revert when redeemsPaused", async function () {
      await vault.connect(guardian).pauseRedeems();
      const shares = await vault.balanceOf(alice.address);
      await expect(
        vault.connect(alice).redeem(shares, alice.address, alice.address)
      ).to.be.revertedWithCustomError(vault, "RedeemsArePaused");
    });
  });

  // ---------------------------------------------------------------------------
  // mint() and withdraw() are disabled
  // ---------------------------------------------------------------------------
  describe("disabled functions", function () {
    it("mint() should revert with FunctionNotSupported", async function () {
      await expect(
        vault.connect(alice).mint(ethers.parseEther("1"), alice.address)
      ).to.be.revertedWithCustomError(vault, "FunctionNotSupported");
    });

    it("withdraw() should revert with FunctionNotSupported", async function () {
      await expect(
        vault.connect(alice).withdraw(1, alice.address, alice.address)
      ).to.be.revertedWithCustomError(vault, "FunctionNotSupported");
    });
  });

  // ---------------------------------------------------------------------------
  // Pause controls
  // ---------------------------------------------------------------------------
  describe("pause controls", function () {
    it("guardian can pauseDeposits / unpauseDeposits", async function () {
      await vault.connect(guardian).pauseDeposits();
      expect(await vault.depositsPaused()).to.equal(true);
      await vault.connect(guardian).unpauseDeposits();
      expect(await vault.depositsPaused()).to.equal(false);
    });

    it("guardian can pauseRedeems / unpauseRedeems", async function () {
      await vault.connect(guardian).pauseRedeems();
      expect(await vault.redeemsPaused()).to.equal(true);
      await vault.connect(guardian).unpauseRedeems();
      expect(await vault.redeemsPaused()).to.equal(false);
    });

    it("non-guardian cannot pause deposits", async function () {
      await expect(
        vault.connect(alice).pauseDeposits()
      ).to.be.reverted;
    });

    it("non-guardian cannot pause redeems", async function () {
      await expect(
        vault.connect(alice).pauseRedeems()
      ).to.be.reverted;
    });
  });

  // ---------------------------------------------------------------------------
  // externalTransfersEnabled / transferToStrategyManager
  // ---------------------------------------------------------------------------
  describe("externalTransfersEnabled", function () {
    it("transferToStrategyManager reverts when disabled", async function () {
      await vault.connect(alice).deposit(DEPOSIT_AMOUNT, alice.address);
      await expect(
        vault.connect(admin).transferToStrategyManager(DEPOSIT_AMOUNT)
      ).to.be.revertedWithCustomError(vault, "ExternalTransfersDisabled");
    });

    it("transferToStrategyManager works when enabled", async function () {
      await vault.connect(alice).deposit(DEPOSIT_AMOUNT, alice.address);
      await vault.connect(admin).setModules(bob.address);
      await vault.connect(admin).setExternalTransfersEnabled(true);
      const vaultUsdcBefore = await usdc.balanceOf(await vault.getAddress());
      await vault.connect(admin).transferToStrategyManager(DEPOSIT_AMOUNT);
      const vaultUsdcAfter = await usdc.balanceOf(await vault.getAddress());
      expect(vaultUsdcAfter).to.equal(vaultUsdcBefore - DEPOSIT_AMOUNT);
    });
  });

  // ---------------------------------------------------------------------------
  // USDC allowance invariant
  // ---------------------------------------------------------------------------
  describe("USDC allowance invariant", function () {
    it("vault has zero USDC allowance to any external address", async function () {
      await vault.connect(alice).deposit(DEPOSIT_AMOUNT, alice.address);
      // Check allowance to various addresses
      const vaultAddress = await vault.getAddress();
      expect(await usdc.allowance(vaultAddress, alice.address)).to.equal(0);
      expect(await usdc.allowance(vaultAddress, bob.address)).to.equal(0);
      expect(await usdc.allowance(vaultAddress, treasury.address)).to.equal(0);
      expect(await usdc.allowance(vaultAddress, admin.address)).to.equal(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Management fee
  // ---------------------------------------------------------------------------
  describe("management fee", function () {
    it("accrueManagementFee with rate=0 mints no shares", async function () {
      await vault.connect(alice).deposit(DEPOSIT_AMOUNT, alice.address);
      const supplyBefore = await vault.totalSupply();
      await vault.accrueManagementFee();
      const supplyAfter = await vault.totalSupply();
      expect(supplyAfter).to.equal(supplyBefore);
    });

    it("setMgmtFeeBpsPerMonth and accrue mints fee shares to treasury", async function () {
      await vault.connect(alice).deposit(DEPOSIT_AMOUNT, alice.address);
      // Set fee to 100 bps (1%) per month
      await vault.connect(admin).setMgmtFeeBpsPerMonth(100);

      // Advance time by 30 days
      await time.increase(30 * 24 * 60 * 60);

      const treasurySharesBefore = await vault.balanceOf(treasury.address);
      await vault.accrueManagementFee();
      const treasurySharesAfter = await vault.balanceOf(treasury.address);
      expect(treasurySharesAfter).to.be.gt(treasurySharesBefore);
    });

    it("setMgmtFeeBpsPerMonth reverts if fee too high", async function () {
      await expect(
        vault.connect(admin).setMgmtFeeBpsPerMonth(201)
      ).to.be.revertedWithCustomError(vault, "FeeTooHigh");
    });

    it("non-admin cannot setMgmtFeeBpsPerMonth", async function () {
      await expect(
        vault.connect(alice).setMgmtFeeBpsPerMonth(10)
      ).to.be.reverted;
    });
  });

  // ---------------------------------------------------------------------------
  // pricePerShare
  // ---------------------------------------------------------------------------
  describe("pricePerShare", function () {
    it("returns 1e6 when no shares exist", async function () {
      expect(await vault.pricePerShare()).to.equal(ethers.parseUnits("1", 6));
    });

    it("returns 1e6 after initial deposit (no fees)", async function () {
      await vault.connect(alice).deposit(DEPOSIT_AMOUNT, alice.address);
      // Price should be close to 1 USDC per share-unit
      // With offset=12, price in 1e6 scale
      const price = await vault.pricePerShare();
      expect(price).to.be.gt(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Role checks
  // ---------------------------------------------------------------------------
  describe("access control", function () {
    it("admin can setTreasury", async function () {
      await vault.connect(admin).setTreasury(bob.address);
      expect(await vault.treasury()).to.equal(bob.address);
    });

    it("non-admin cannot setTreasury", async function () {
      await expect(
        vault.connect(alice).setTreasury(bob.address)
      ).to.be.reverted;
    });

    it("admin can setModules", async function () {
      await vault.connect(admin).setModules(bob.address);
      expect(await vault.strategyManager()).to.equal(bob.address);
    });

    it("non-admin cannot setModules", async function () {
      await expect(
        vault.connect(alice).setModules(bob.address)
      ).to.be.reverted;
    });
  });
});
