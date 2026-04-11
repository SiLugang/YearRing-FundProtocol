import { useState, useEffect, useRef, useMemo } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits } from 'viem'
import { ADDRESSES } from '../contracts/addresses'
import { FundVault_ABI, LockLedger_ABI, LockRewardManager_ABI } from '../contracts/abis'
import { fmtShares, fmtRwt, shortErr, DURATION_30D, DURATION_90D, DURATION_180D } from '../utils'
import LockRow from './LockRow'

type OpType = 'approve' | 'lock' | null

const DURATIONS = [
  { label: 'Bronze — 30 days',  seconds: DURATION_30D,  tier: 'Bronze', discount: '20%', multiplier: '1.0×', days: 30n,  multiplierBps: 10_000n },
  { label: 'Silver — 90 days',  seconds: DURATION_90D,  tier: 'Silver', discount: '40%', multiplier: '1.3×', days: 90n,  multiplierBps: 13_000n },
  { label: 'Gold — 180 days',   seconds: DURATION_180D, tier: 'Gold',   discount: '60%', multiplier: '1.8×', days: 180n, multiplierBps: 18_000n },
]

const REWARD_DENOMINATOR = 5_000_000n
const USDC_TO_TOKEN_SCALE = 1_000_000_000_000n  // 1e12

export default function LockSection() {
  const { address } = useAccount()
  const [lockAmt, setLockAmt] = useState('')
  const [durIdx, setDurIdx]   = useState(2)  // default Gold
  const [opType, setOpType]   = useState<OpType>(null)

  const configOk = !!ADDRESSES.FundVaultV01 && !!ADDRESSES.LockLedgerV02 && !!ADDRESSES.LockRewardManagerV02

  const { data: sharesBal, refetch: refetchBal } = useReadContract({
    address: ADDRESSES.FundVaultV01, abi: FundVault_ABI, functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!ADDRESSES.FundVaultV01 },
  })

  const { data: lockIds, refetch: refetchIds } = useReadContract({
    address: ADDRESSES.LockLedgerV02,
    abi: LockLedger_ABI,
    functionName: 'userLockIds',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!ADDRESSES.LockLedgerV02 },
  })

  // Read fbUSDC allowance to LockLedger — manager checks this value internally
  const { data: shareAllowance, refetch: refetchAllow } = useReadContract({
    address: ADDRESSES.FundVaultV01, abi: FundVault_ABI, functionName: 'allowance',
    args: address ? [address, ADDRESSES.LockLedgerV02] : undefined,
    query: { enabled: !!address && !!ADDRESSES.FundVaultV01 && !!ADDRESSES.LockLedgerV02 },
  })

  const ids           = (lockIds as bigint[] | undefined) ?? []
  const allowance     = shareAllowance as bigint | undefined
  const lockAmountBig = lockAmt ? parseUnits(lockAmt, 18) : 0n
  const needsApprove  = !allowance || allowance < lockAmountBig

  // RWT preview: convert entered shares → USDC value (6-dec) for client-side RWT estimate
  const { data: lockValueUsdc } = useReadContract({
    address: ADDRESSES.FundVaultV01, abi: FundVault_ABI,
    functionName: 'convertToAssets',
    args: lockAmountBig > 0n ? [lockAmountBig] : undefined,
    query: { enabled: !!ADDRESSES.FundVaultV01 && lockAmountBig > 0n },
  })

  const previewRwt = useMemo(() => {
    const usdcVal = lockValueUsdc as bigint | undefined
    if (!usdcVal || lockAmountBig === 0n) return undefined
    const { days, multiplierBps } = DURATIONS[durIdx]
    return usdcVal * USDC_TO_TOKEN_SCALE * days * multiplierBps / REWARD_DENOMINATOR
  }, [lockValueUsdc, lockAmountBig, durIdx])

  const { writeContract, isPending, data: hash, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  const busy = isPending || isConfirming
  const prevHash = useRef<string | undefined>(undefined)

  function refetch() { refetchBal(); refetchIds(); refetchAllow() }

  useEffect(() => {
    if (isSuccess && hash && hash !== prevHash.current) {
      prevHash.current = hash
      refetch()
      if (opType === 'lock') setLockAmt('')
    }
  }, [isSuccess, hash])

  function approveOrLock() {
    if (!address || !lockAmt) return
    if (needsApprove) {
      setOpType('approve')
      writeContract({
        address: ADDRESSES.FundVaultV01, abi: FundVault_ABI, functionName: 'approve',
        args: [ADDRESSES.LockLedgerV02, lockAmountBig],
      })
    } else {
      setOpType('lock')
      writeContract({
        address: ADDRESSES.LockRewardManagerV02, abi: LockRewardManager_ABI,
        functionName: 'lockWithReward', args: [lockAmountBig, BigInt(DURATIONS[durIdx].seconds)],
      })
    }
  }

  const lockBtnLabel =
    busy && (opType === 'approve' || opType === 'lock') ? 'Pending…' :
    needsApprove ? 'Approve fbUSDC' : 'Lock + Earn RWT'

  const tier = DURATIONS[durIdx]

  return (
    <div className="card">
      <div className="card-title">Lock</div>

      <div className="info-row">
        <span className="info-label">Available fbUSDC</span>
        <span className="info-value">{fmtShares(sharesBal as bigint | undefined)}</span>
      </div>
      <button className="btn-secondary btn-sm" style={{ marginTop: 4 }} onClick={refetch}>↻ Refresh</button>

      <hr className="divider" />

      <div className="field">
        <label>Duration / Tier</label>
        <select value={durIdx} onChange={e => setDurIdx(Number(e.target.value))}>
          {DURATIONS.map((d, i) => (
            <option key={i} value={i}>{d.label}</option>
          ))}
        </select>
      </div>

      {/* Tier preview */}
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, padding: '6px 8px', background: 'var(--bg)', borderRadius: 4, border: '1px solid var(--border)' }}>
        <strong>{tier.tier}</strong> · {tier.discount} fee rebate · {tier.multiplier} RWT multiplier
        {previewRwt !== undefined && (
          <span style={{ marginLeft: 8, color: 'var(--blue)' }}>
            → Estimated RWT: <strong>{fmtRwt(previewRwt)}</strong>
          </span>
        )}
      </div>

      <div className="field">
        <label>Amount to lock (fbUSDC shares — e.g. 100)</label>
        <input type="number" placeholder="e.g. 100" value={lockAmt} onChange={e => setLockAmt(e.target.value)} />
      </div>

      {lockAmt && allowance !== undefined && (
        <p className="note" style={{ marginTop: 4 }}>
          {needsApprove
            ? `Allowance to LockLedger: ${fmtShares(allowance)} — approval required first.`
            : 'Allowance sufficient — ready to lock.'}
        </p>
      )}

      <div className="btn-row">
        <button className="btn-primary" disabled={busy || !address || !configOk || !lockAmt} onClick={approveOrLock}>
          {lockBtnLabel}
        </button>
      </div>

      {busy     && opType && <div className="status info">{opType === 'approve' ? 'Approving fbUSDC…' : 'Locking + issuing RWT…'}</div>}
      {isSuccess          && <div className="status ok">Done — lock created. See positions below.</div>}
      {error              && <div className="status err">{shortErr(error)}</div>}

      <p className="note">
        Button auto-switches: <em>Approve fbUSDC</em> when allowance is insufficient (approval targets LockLedger),
        then <em>Lock + Earn RWT</em>. RWT is issued upfront from treasury at lock time.
        <br />
        On testnet, lock entry is live. Full maturity/unlock is demonstrated via local full demo
        or pre-seeded positions in the Demo State section below.
      </p>

      {ids.length > 0 && (
        <>
          <hr className="divider" />
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
            Your locks ({ids.length})
          </div>
          {ids.map(id => (
            <LockRow
              key={id.toString()}
              lockId={id}
              userAddress={address!}
              onDone={refetch}
            />
          ))}
        </>
      )}
    </div>
  )
}
