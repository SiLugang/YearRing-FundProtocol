import { useState, useEffect, useRef } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits, formatUnits } from 'viem'
import { ADDRESSES } from '../contracts/addresses'
import { MockUSDC_ABI, FundVault_ABI } from '../contracts/abis'
import { fmtUsdc, fmtShares, fmtPps, shortErr } from '../utils'

type OpType = 'mint' | 'approve' | 'deposit' | 'redeem' | 'claim' | null

const SYSTEM_MODE_LABELS = ['Normal', 'Paused', 'EmergencyExit']
const SYSTEM_MODE_BADGES = ['badge-green', 'badge-yellow', 'badge-red']

function useVaultReads(address: `0x${string}` | undefined) {
  const vaultOk = !!address && !!ADDRESSES.FundVaultV01
  const { data: usdcBal,       refetch: r1 } = useReadContract({ address: ADDRESSES.USDC,         abi: MockUSDC_ABI,  functionName: 'balanceOf',    args: address ? [address] : undefined, query: { enabled: !!address && !!ADDRESSES.USDC } })
  const { data: sharesBal,     refetch: r2 } = useReadContract({ address: ADDRESSES.FundVaultV01, abi: FundVault_ABI, functionName: 'balanceOf',    args: address ? [address] : undefined, query: { enabled: vaultOk } })
  const { data: totalAssets,   refetch: r3 } = useReadContract({ address: ADDRESSES.FundVaultV01, abi: FundVault_ABI, functionName: 'totalAssets',  query: { enabled: !!ADDRESSES.FundVaultV01 } })
  const { data: pps,           refetch: r4 } = useReadContract({ address: ADDRESSES.FundVaultV01, abi: FundVault_ABI, functionName: 'pricePerShare', query: { enabled: !!ADDRESSES.FundVaultV01 } })
  const { data: usdcAllowance, refetch: r5 } = useReadContract({ address: ADDRESSES.USDC, abi: MockUSDC_ABI, functionName: 'allowance', args: address ? [address, ADDRESSES.FundVaultV01] : undefined, query: { enabled: !!address && !!ADDRESSES.USDC && !!ADDRESSES.FundVaultV01 } })
  const { data: systemMode,    refetch: r6 } = useReadContract({ address: ADDRESSES.FundVaultV01, abi: FundVault_ABI, functionName: 'systemMode',   query: { enabled: !!ADDRESSES.FundVaultV01 } })
  const { data: currentRoundId, refetch: r7 } = useReadContract({ address: ADDRESSES.FundVaultV01, abi: FundVault_ABI, functionName: 'currentRoundId', query: { enabled: !!ADDRESSES.FundVaultV01 } })
  const { data: userAllowed,   refetch: r8 } = useReadContract({ address: ADDRESSES.FundVaultV01, abi: FundVault_ABI, functionName: 'isAllowed', args: address ? [address] : undefined, query: { enabled: vaultOk } })
  return {
    usdcBal:       usdcBal       as bigint | undefined,
    sharesBal:     sharesBal     as bigint | undefined,
    totalAssets:   totalAssets   as bigint | undefined,
    pps:           pps           as bigint | undefined,
    usdcAllowance: usdcAllowance as bigint | undefined,
    systemMode:    systemMode    as number | undefined,
    currentRoundId: currentRoundId as bigint | undefined,
    userAllowed:   userAllowed   as boolean | undefined,
    refetch: () => { r1(); r2(); r3(); r4(); r5(); r6(); r7(); r8() },
  }
}

export default function VaultSection() {
  const { address } = useAccount()
  const { usdcBal, sharesBal, totalAssets, pps, usdcAllowance, systemMode, currentRoundId, userAllowed, refetch } = useVaultReads(address)

  const modeNum      = systemMode !== undefined ? Number(systemMode) : undefined
  const isExit       = modeNum === 2
  const roundId      = currentRoundId as bigint | undefined
  // userAllowed: undefined = still loading (don't block), false = explicitly not allowlisted
  const notAllowed   = userAllowed === false

  // Exit round data — read only when in EmergencyExit and a round exists
  const roundEnabled = isExit && !!ADDRESSES.FundVaultV01 && roundId !== undefined && roundId > 0n
  const { data: currentRound, refetch: refetchRound } = useReadContract({
    address: ADDRESSES.FundVaultV01, abi: FundVault_ABI,
    functionName: 'exitRounds',
    args: roundId !== undefined ? [roundId] : undefined,
    query: { enabled: roundEnabled },
  })
  const { data: alreadyClaimed, refetch: refetchClaimed } = useReadContract({
    address: ADDRESSES.FundVaultV01, abi: FundVault_ABI,
    functionName: 'roundSharesClaimed',
    args: roundId !== undefined && address ? [roundId, address] : undefined,
    query: { enabled: roundEnabled && !!address },
  })

  const roundData    = currentRound as readonly [bigint, bigint, bigint, bigint, boolean, bigint] | undefined
  const roundIsOpen  = roundData ? roundData[4] : false
  const roundAvail   = roundData ? roundData[2] : undefined
  const roundSupply  = roundData ? roundData[1] : undefined
  const alrClaimed   = alreadyClaimed as bigint | undefined

  const [mintAmt,    setMintAmt]    = useState('')
  const [depositAmt, setDepositAmt] = useState('')
  const [redeemAmt,  setRedeemAmt]  = useState('')
  const [claimAmt,   setClaimAmt]   = useState('')
  const [opType,     setOpType]     = useState<OpType>(null)

  const { writeContract, isPending, data: hash, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  const busy    = isPending || isConfirming
  const prevHash = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (isSuccess && hash && hash !== prevHash.current) {
      prevHash.current = hash
      refetch(); refetchRound(); refetchClaimed()
      if (opType === 'mint')    setMintAmt('')
      if (opType === 'deposit') setDepositAmt('')
      if (opType === 'redeem')  setRedeemAmt('')
      if (opType === 'claim')   setClaimAmt('')
    }
  }, [isSuccess, hash])

  const configOk         = !!ADDRESSES.USDC && !!ADDRESSES.FundVaultV01
  const depositAmountBig = depositAmt ? parseUnits(depositAmt, 6) : 0n
  const needsApprove     = !usdcAllowance || usdcAllowance < depositAmountBig

  const depositBtnLabel =
    busy && (opType === 'approve' || opType === 'deposit') ? 'Pending…' :
    needsApprove ? 'Approve USDC' : 'Deposit'

  // Estimated USDC from claim
  const claimAmtBig = claimAmt ? parseUnits(claimAmt, 18) : 0n
  const estimatedClaim =
    claimAmtBig > 0n && roundAvail !== undefined && roundSupply !== undefined && roundSupply > 0n
      ? (claimAmtBig * roundAvail) / roundSupply
      : undefined

  function mint() {
    if (!address || !mintAmt) return
    setOpType('mint')
    writeContract({ address: ADDRESSES.USDC, abi: MockUSDC_ABI, functionName: 'mint', args: [address, parseUnits(mintAmt, 6)] })
  }

  function depositOrApprove() {
    if (!address || !depositAmt) return
    if (needsApprove) {
      setOpType('approve')
      writeContract({ address: ADDRESSES.USDC, abi: MockUSDC_ABI, functionName: 'approve', args: [ADDRESSES.FundVaultV01, depositAmountBig] })
    } else {
      setOpType('deposit')
      writeContract({ address: ADDRESSES.FundVaultV01, abi: FundVault_ABI, functionName: 'deposit', args: [depositAmountBig, address] })
    }
  }

  function redeem() {
    if (!address || !redeemAmt) return
    setOpType('redeem')
    writeContract({ address: ADDRESSES.FundVaultV01, abi: FundVault_ABI, functionName: 'redeem', args: [parseUnits(redeemAmt, 18), address, address] })
  }

  function claimExit() {
    if (!address || !claimAmt || roundId === undefined) return
    setOpType('claim')
    writeContract({ address: ADDRESSES.FundVaultV01, abi: FundVault_ABI, functionName: 'claimExitAssets', args: [roundId, claimAmtBig] })
  }

  const pendingLabel: Record<NonNullable<OpType>, string> = {
    mint: 'Minting…', approve: 'Approving USDC…', deposit: 'Depositing…', redeem: 'Redeeming…', claim: 'Claiming…',
  }

  const modeLabel = modeNum !== undefined ? (SYSTEM_MODE_LABELS[modeNum] ?? '–') : '–'
  const modeBadge = modeNum !== undefined ? (SYSTEM_MODE_BADGES[modeNum] ?? 'badge-gray') : 'badge-gray'

  return (
    <div className="card">
      <div className="card-title">Vault</div>

      {/* ── System mode badge ── */}
      {modeNum !== undefined && (
        <div className="info-row" style={{ marginBottom: 8 }}>
          <span className="info-label">System Mode</span>
          <span className={`badge ${modeBadge}`}>{modeLabel}</span>
        </div>
      )}

      {/* ── EmergencyExit banner ── */}
      {isExit && (
        <div className="status err" style={{ marginBottom: 12 }}>
          ⚠️ System is in <strong>Emergency Exit</strong> mode. Normal deposits and redeems are disabled.
          Use the <strong>Claim Exit Assets</strong> section below to redeem your shares pro-rata.
        </div>
      )}

      <div className="info-row"><span className="info-label">Your USDC</span>    <span className="info-value">{fmtUsdc(usdcBal)}</span></div>
      <div className="info-row"><span className="info-label">Your fbUSDC</span>  <span className="info-value">{fmtShares(sharesBal)}</span></div>
      <div className="info-row"><span className="info-label">Total Assets</span> <span className="info-value">{fmtUsdc(totalAssets)}</span></div>
      <div className="info-row"><span className="info-label">Price/Share</span>  <span className="info-value">{fmtPps(pps)}</span></div>
      <button className="btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={refetch}>↻ Refresh</button>

      <hr className="divider" />

      {/* ── Mint ── */}
      <div className="field">
        <label>Mint MockUSDC</label>
        <input type="number" placeholder="e.g. 1000" value={mintAmt} onChange={e => setMintAmt(e.target.value)} />
      </div>
      <div className="btn-row">
        <button className="btn-secondary" disabled={busy || !address || !configOk || !mintAmt} onClick={mint}>
          {busy && opType === 'mint' ? 'Minting…' : 'Mint USDC'}
        </button>
      </div>
      <p className="note">This demo uses publicly mintable MockUSDC on Base Sepolia — no faucet or role needed.</p>

      <hr className="divider" />

      {/* ── Deposit — disabled in EmergencyExit or if not allowlisted ── */}
      <div className="field">
        <label>Deposit USDC → fbUSDC</label>
        <input type="number" placeholder="e.g. 100" value={depositAmt} onChange={e => setDepositAmt(e.target.value)} disabled={isExit || notAllowed} />
      </div>
      {isExit && (
        <p className="note" style={{ color: 'var(--err, #c00)', marginTop: 4 }}>
          Deposits are disabled in Emergency Exit mode.
        </p>
      )}
      {!isExit && notAllowed && (
        <p className="note" style={{ color: 'var(--err, #c00)', marginTop: 4 }}>
          Your address is not on the deposit allowlist. This fund uses an invite-only model — please contact the fund admin to request access.
        </p>
      )}
      {!isExit && !notAllowed && depositAmt && usdcAllowance !== undefined && (
        <p className="note" style={{ marginTop: 4 }}>
          {needsApprove
            ? `Allowance: ${fmtUsdc(usdcAllowance)} — approval required first.`
            : 'Allowance sufficient — ready to deposit.'}
        </p>
      )}
      {!isExit && userAllowed === true && (
        <p className="note" style={{ color: 'var(--ok, #080)', marginTop: 4 }}>
          ✓ Address is allowlisted.
        </p>
      )}
      <div className="btn-row">
        <button className="btn-primary" disabled={busy || !address || !configOk || !depositAmt || isExit || notAllowed} onClick={depositOrApprove}>
          {depositBtnLabel}
        </button>
      </div>

      <hr className="divider" />

      {/* ── Redeem — disabled in EmergencyExit, shows alternative hint ── */}
      <div className="field">
        <label>Redeem fbUSDC → USDC</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="number"
            placeholder="fbUSDC amount (e.g. 100)"
            value={redeemAmt}
            onChange={e => setRedeemAmt(e.target.value)}
            style={{ flex: 1 }}
            disabled={isExit}
          />
          <button
            className="btn-secondary btn-sm"
            disabled={!sharesBal || isExit}
            onClick={() => sharesBal && setRedeemAmt(formatUnits(sharesBal, 18))}
          >
            Max
          </button>
        </div>
      </div>
      {isExit ? (
        <p className="note" style={{ color: 'var(--err, #c00)', marginTop: 4 }}>
          Normal redeem is disabled in Emergency Exit mode. Use <strong>Claim Exit Assets</strong> below.
        </p>
      ) : null}
      <div className="btn-row">
        <button className="btn-secondary" disabled={busy || !address || !configOk || !redeemAmt || isExit} onClick={redeem}>
          {busy && opType === 'redeem' ? 'Redeeming…' : 'Redeem'}
        </button>
      </div>
      {!isExit && (
        <p className="note">
          Deposit button auto-switches: shows <em>Approve USDC</em> when allowance is insufficient,
          then <em>Deposit</em> once approved. Redeem burns fbUSDC and returns USDC at current price.
        </p>
      )}

      {/* ── claimExitAssets — only shown in EmergencyExit mode ── */}
      {isExit && (
        <>
          <hr className="divider" />
          <div className="card-title" style={{ fontSize: 13, marginBottom: 10 }}>Claim Exit Assets</div>

          {/* Round info */}
          {roundId !== undefined && roundId > 0n ? (
            <>
              <div className="info-row">
                <span className="info-label">Exit Round</span>
                <span className="info-value">#{roundId.toString()}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Round Status</span>
                <span className={`badge ${roundIsOpen ? 'badge-green' : 'badge-gray'}`}>
                  {roundIsOpen ? 'Open' : 'Closed'}
                </span>
              </div>
              {roundAvail !== undefined && (
                <div className="info-row">
                  <span className="info-label">Round Assets</span>
                  <span className="info-value">{fmtUsdc(roundAvail)} USDC</span>
                </div>
              )}
              {alrClaimed !== undefined && (
                <div className="info-row">
                  <span className="info-label">Your Claimed</span>
                  <span className="info-value">{fmtShares(alrClaimed)} fbUSDC</span>
                </div>
              )}
            </>
          ) : (
            <p className="note">No exit round has been opened yet. Please wait for the admin to open a round.</p>
          )}

          {/* Claim input */}
          {roundIsOpen && (
            <>
              <div className="field" style={{ marginTop: 10 }}>
                <label>fbUSDC to burn (claim pro-rata USDC)</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="number"
                    placeholder="e.g. 100"
                    value={claimAmt}
                    onChange={e => setClaimAmt(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button
                    className="btn-secondary btn-sm"
                    disabled={!sharesBal}
                    onClick={() => sharesBal && setClaimAmt(formatUnits(sharesBal, 18))}
                  >
                    Max
                  </button>
                </div>
              </div>
              {estimatedClaim !== undefined && claimAmt && (
                <p className="note" style={{ marginTop: 4 }}>
                  Estimated return: ~{fmtUsdc(estimatedClaim)} USDC
                </p>
              )}
              <div className="btn-row">
                <button
                  className="btn-primary"
                  disabled={busy || !address || !claimAmt || !roundIsOpen}
                  onClick={claimExit}
                >
                  {busy && opType === 'claim' ? 'Claiming…' : 'Claim Exit Assets'}
                </button>
              </div>
              <p className="note" style={{ marginTop: 6 }}>
                Claiming burns your fbUSDC and returns USDC pro-rata based on round snapshot. No approval needed.
              </p>
            </>
          )}
        </>
      )}

      {busy     && opType && <div className="status info">{pendingLabel[opType]}</div>}
      {isSuccess          && <div className="status ok">Done — balances refreshed.</div>}
      {error              && <div className="status err">{shortErr(error)}</div>}
    </div>
  )
}
