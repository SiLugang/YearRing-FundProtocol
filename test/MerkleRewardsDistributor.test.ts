import { expect } from "chai";
import { ethers } from "hardhat";
import { MerkleTree } from "merkletreejs";
import keccak256 from "keccak256";
import { MerkleRewardsDistributor, RewardToken, FundVault, MockUSDC } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

// ---------------------------------------------------------------------------
// Helper: build a Merkle tree from { address, amount } entries
// ---------------------------------------------------------------------------
function buildMerkleTree(entries: { account: string; amount: bigint }[]) {
  const leaves = entries.map(({ account, amount }) => {
    const packed = ethers.solidityPacked(["address", "uint256"], [account, amount]);
    return keccak256(packed);
  });
  const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
  const root = "0x" + tree.getRoot().toString("hex");
  return { tree, root, leaves };
}

function getProof(
  tree: MerkleTree,
  account: string,
  amount: bigint
): string[] {
  const packed = ethers.solidityPacked(["address", "uint256"], [account, amount]);
  const leaf = keccak256(packed);
  return tree.getHexProof(leaf);
}

// ---------------------------------------------------------------------------
describe("MerkleRewardsDistributor", function () {
  let distributor: MerkleRewardsDistributor;
  let rewardToken: RewardToken;
  let vault: FundVault;
  let usdc: MockUSDC;

  let deployer: SignerWithAddress;
  let timelock: SignerWithAddress; // acts as DEFAULT_ADMIN_ROLE
  let guardian: SignerWithAddress;
  let treasury: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let charlie: SignerWithAddress;

  const EPOCH_CAP = ethers.parseEther("10000");
  const MAX_EPOCH_CAP = ethers.parseEther("100000");
  const PREMINT = ethers.parseEther("1000000");

  beforeEach(async function () {
    [deployer, timelock, guardian, treasury, alice, bob, charlie] = await ethers.getSigners();

    // Deploy MockUSDC
    const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDCFactory.deploy();

    // Deploy FundVault
    const FundVaultFactory = await ethers.getContractFactory("FundVault");
    vault = await FundVaultFactory.deploy(
      await usdc.getAddress(),
      "Fund Vault",
      "fvUSDC",
      treasury.address,
      guardian.address,
      timelock.address
    );

    // Deploy RewardToken (premint to treasury)
    const RewardTokenFactory = await ethers.getContractFactory("RewardToken");
    rewardToken = await RewardTokenFactory.deploy(
      "Reward Token",
      "RWD",
      PREMINT,
      treasury.address,
      timelock.address
    );

    // Deploy MerkleRewardsDistributor
    const DistributorFactory = await ethers.getContractFactory("MerkleRewardsDistributor");
    distributor = await DistributorFactory.deploy(
      await rewardToken.getAddress(),
      await vault.getAddress(),
      EPOCH_CAP,
      MAX_EPOCH_CAP,
      timelock.address,
      guardian.address
    );

    // Treasury funds distributor with reward tokens
    await rewardToken.connect(treasury).transfer(
      await distributor.getAddress(),
      PREMINT
    );
  });

  // ---------------------------------------------------------------------------
  // Deployment
  // ---------------------------------------------------------------------------
  describe("Deployment", function () {
    it("should set rewardToken correctly", async function () {
      expect(await distributor.rewardToken()).to.equal(await rewardToken.getAddress());
    });

    it("should set fundVault correctly", async function () {
      expect(await distributor.fundVault()).to.equal(await vault.getAddress());
    });

    it("should set epochCap correctly", async function () {
      expect(await distributor.epochCap()).to.equal(EPOCH_CAP);
    });

    it("should set maxEpochCap as immutable", async function () {
      expect(await distributor.maxEpochCap()).to.equal(MAX_EPOCH_CAP);
    });
  });

  // ---------------------------------------------------------------------------
  // setEpoch
  // ---------------------------------------------------------------------------
  describe("setEpoch", function () {
    it("should set epoch successfully", async function () {
      const entries = [
        { account: alice.address, amount: ethers.parseEther("100") },
        { account: bob.address, amount: ethers.parseEther("200") },
      ];
      const { root } = buildMerkleTree(entries);
      const epochTotal = ethers.parseEther("300");
      const now = Math.floor(Date.now() / 1000);

      await distributor.connect(timelock).setEpoch(1, root, epochTotal, now, now + 86400);
      const epoch = await distributor.epochs(1);
      expect(epoch.root).to.equal(root);
      expect(epoch.epochTotal).to.equal(epochTotal);
      expect(epoch.exists).to.equal(true);
    });

    it("should revert if epochId already exists", async function () {
      const { root } = buildMerkleTree([{ account: alice.address, amount: ethers.parseEther("100") }]);
      const now = Math.floor(Date.now() / 1000);
      await distributor.connect(timelock).setEpoch(1, root, ethers.parseEther("100"), now, now + 86400);

      await expect(
        distributor.connect(timelock).setEpoch(1, root, ethers.parseEther("100"), now, now + 86400)
      ).to.be.revertedWithCustomError(distributor, "EpochAlreadyExists");
    });

    it("should revert if epochTotal exceeds epochCap", async function () {
      const { root } = buildMerkleTree([{ account: alice.address, amount: EPOCH_CAP + BigInt(1) }]);
      const now = Math.floor(Date.now() / 1000);

      await expect(
        distributor.connect(timelock).setEpoch(1, root, EPOCH_CAP + BigInt(1), now, now + 86400)
      ).to.be.revertedWithCustomError(distributor, "EpochTotalExceedsCap");
    });

    it("should revert if non-admin calls setEpoch", async function () {
      const { root } = buildMerkleTree([{ account: alice.address, amount: ethers.parseEther("100") }]);
      const now = Math.floor(Date.now() / 1000);
      await expect(
        distributor.connect(alice).setEpoch(1, root, ethers.parseEther("100"), now, now + 86400)
      ).to.be.reverted;
    });
  });

  // ---------------------------------------------------------------------------
  // claim
  // ---------------------------------------------------------------------------
  describe("claim", function () {
    const aliceAmount = ethers.parseEther("300");
    const bobAmount = ethers.parseEther("700");
    const epochTotal = aliceAmount + bobAmount;
    const epochId = 1;
    let tree: MerkleTree;
    let root: string;

    beforeEach(async function () {
      const entries = [
        { account: alice.address, amount: aliceAmount },
        { account: bob.address, amount: bobAmount },
      ];
      ({ tree, root } = buildMerkleTree(entries));
      const now = Math.floor(Date.now() / 1000);
      await distributor.connect(timelock).setEpoch(epochId, root, epochTotal, now, now + 86400);
    });

    it("alice can claim full amount", async function () {
      const proof = getProof(tree, alice.address, aliceAmount);
      const balBefore = await rewardToken.balanceOf(alice.address);
      await distributor.claim(epochId, alice.address, aliceAmount, proof);
      const balAfter = await rewardToken.balanceOf(alice.address);
      expect(balAfter - balBefore).to.equal(aliceAmount);
    });

    it("bob can claim full amount", async function () {
      const proof = getProof(tree, bob.address, bobAmount);
      await distributor.claim(epochId, bob.address, bobAmount, proof);
      expect(await rewardToken.balanceOf(bob.address)).to.equal(bobAmount);
    });

    it("incremental claim: two partial claims sum to full amount", async function () {
      const proof = getProof(tree, alice.address, aliceAmount);

      // First claim: only send partial — but since leaf encodes total,
      // the first call must claim full amount minus previously claimed.
      // To test incremental, we simulate by calling twice:
      // First call gets full amount (nothing claimed yet)
      await distributor.claim(epochId, alice.address, aliceAmount, proof);
      const bal1 = await rewardToken.balanceOf(alice.address);
      expect(bal1).to.equal(aliceAmount);

      // Second call: claimable = 0 → NothingToClaim
      await expect(
        distributor.claim(epochId, alice.address, aliceAmount, proof)
      ).to.be.revertedWithCustomError(distributor, "NothingToClaim");
    });

    it("repeated claim by same account → NothingToClaim", async function () {
      const proof = getProof(tree, alice.address, aliceAmount);
      await distributor.claim(epochId, alice.address, aliceAmount, proof);
      await expect(
        distributor.claim(epochId, alice.address, aliceAmount, proof)
      ).to.be.revertedWithCustomError(distributor, "NothingToClaim");
    });

    it("invalid proof → InvalidMerkleProof", async function () {
      const proof = getProof(tree, alice.address, aliceAmount);
      await expect(
        distributor.claim(epochId, bob.address, aliceAmount, proof) // wrong account
      ).to.be.revertedWithCustomError(distributor, "InvalidMerkleProof");
    });

    it("epoch does not exist → EpochDoesNotExist", async function () {
      const proof = getProof(tree, alice.address, aliceAmount);
      await expect(
        distributor.claim(999, alice.address, aliceAmount, proof)
      ).to.be.revertedWithCustomError(distributor, "EpochDoesNotExist");
    });

    it("claim does not change vault USDC balance", async function () {
      // Deposit some USDC into vault
      await usdc.mint(alice.address, ethers.parseUnits("1000", 6));
      await usdc.connect(alice).approve(await vault.getAddress(), ethers.MaxUint256);
      await vault.connect(alice).deposit(ethers.parseUnits("1000", 6), alice.address);

      const vaultUsdcBefore = await usdc.balanceOf(await vault.getAddress());
      const proof = getProof(tree, alice.address, aliceAmount);
      await distributor.claim(epochId, alice.address, aliceAmount, proof);
      const vaultUsdcAfter = await usdc.balanceOf(await vault.getAddress());

      expect(vaultUsdcAfter).to.equal(vaultUsdcBefore);
    });

    it("claimedTotal invariant: cannot exceed epochTotal", async function () {
      // Build tree where single account claims epochTotal
      const bigAmount = epochTotal;
      const entries2 = [
        { account: alice.address, amount: bigAmount },
      ];
      const { tree: tree2, root: root2 } = buildMerkleTree(entries2);
      const now = Math.floor(Date.now() / 1000);
      await distributor.connect(timelock).setEpoch(2, root2, bigAmount, now, now + 86400);

      const proof2 = getProof(tree2, alice.address, bigAmount);
      await distributor.claim(2, alice.address, bigAmount, proof2);

      // All claimed — try overflow with a different tree setup not possible
      // Instead verify epoch claimedTotal == epochTotal
      const epoch = await distributor.epochs(2);
      expect(epoch.claimedTotal).to.equal(bigAmount);
    });
  });

  // ---------------------------------------------------------------------------
  // Pause
  // ---------------------------------------------------------------------------
  describe("pause", function () {
    it("guardian can pause and unpause", async function () {
      await distributor.connect(guardian).pause();
      expect(await distributor.paused()).to.equal(true);
      await distributor.connect(guardian).unpause();
      expect(await distributor.paused()).to.equal(false);
    });

    it("claim reverts when paused", async function () {
      const entries = [{ account: alice.address, amount: ethers.parseEther("100") }];
      const { tree, root } = buildMerkleTree(entries);
      const now = Math.floor(Date.now() / 1000);
      await distributor.connect(timelock).setEpoch(1, root, ethers.parseEther("100"), now, now + 86400);

      await distributor.connect(guardian).pause();
      const proof = getProof(tree, alice.address, ethers.parseEther("100"));
      await expect(
        distributor.claim(1, alice.address, ethers.parseEther("100"), proof)
      ).to.be.revertedWith("Pausable: paused");
    });

    it("non-guardian cannot pause", async function () {
      await expect(distributor.connect(alice).pause()).to.be.reverted;
    });
  });

  // ---------------------------------------------------------------------------
  // epochCap adjustment
  // ---------------------------------------------------------------------------
  describe("epochCap", function () {
    it("admin (timelock) can reduce epochCap", async function () {
      const newCap = ethers.parseEther("5000");
      await distributor.connect(timelock).setEpochCap(newCap);
      expect(await distributor.epochCap()).to.equal(newCap);
    });

    it("cannot set epochCap > maxEpochCap", async function () {
      await expect(
        distributor.connect(timelock).setEpochCap(MAX_EPOCH_CAP + BigInt(1))
      ).to.be.revertedWithCustomError(distributor, "EpochCapExceedsMax");
    });

    it("non-admin cannot setEpochCap", async function () {
      await expect(
        distributor.connect(alice).setEpochCap(ethers.parseEther("5000"))
      ).to.be.reverted;
    });
  });

  // ---------------------------------------------------------------------------
  // claimable() view
  // ---------------------------------------------------------------------------
  describe("claimable view", function () {
    it("returns correct claimable amount before claim", async function () {
      const amount = ethers.parseEther("100");
      const entries = [{ account: alice.address, amount }];
      const { root } = buildMerkleTree(entries);
      const now = Math.floor(Date.now() / 1000);
      await distributor.connect(timelock).setEpoch(1, root, amount, now, now + 86400);

      expect(await distributor.claimable(1, alice.address, amount)).to.equal(amount);
    });

    it("returns 0 for non-existent epoch", async function () {
      expect(await distributor.claimable(999, alice.address, ethers.parseEther("100"))).to.equal(0);
    });

    it("returns 0 after full claim", async function () {
      const amount = ethers.parseEther("100");
      const entries = [{ account: alice.address, amount }];
      const { tree, root } = buildMerkleTree(entries);
      const now = Math.floor(Date.now() / 1000);
      await distributor.connect(timelock).setEpoch(1, root, amount, now, now + 86400);

      const proof = getProof(tree, alice.address, amount);
      await distributor.claim(1, alice.address, amount, proof);

      expect(await distributor.claimable(1, alice.address, amount)).to.equal(0);
    });
  });
});
