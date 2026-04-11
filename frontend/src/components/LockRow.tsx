import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { ADDRESSES } from '../contracts/addresses'
import { LockLedger_ABI, LockBenefit_ABI, LockRewardManager_ABI, UserState_ABI, RewardToken_ABI } from '../contracts/abis'
import { fmtShares, fmtTs, fmtBps, fmtRwt, shortErr, tierName, lockStateName } from '../utils'

type LockPosition = {
  owner: string
  shares: bigint
  lockedAt: bigint
  unlockAt: bigint
  unlocked: boolean
  earlyExited: boolean
}

interface Props {
  lockId: bigint
  userAddress: `0x${string}`
  onDone: () => void
}

export default function LockRow({ lockId, userAddress, onDone }: Props) {
  const { data: pos } = useReadContract({
    address: ADDRESSES.LockLedgerV02, abi: LockLedger_ABI,
    functionName: 'getLock', args: [lockId],
  })

  const position = pos as LockPosition | undefined

  const { data: state } = useReadContract({
    address: ADDRESSES.UserStateEngineV02, abi: UserState_ABI,
    functionName: 'lockStateOf', args: [lockId],
    query: { enabled: !!position },
  })
  const { data: tier } = useReadContract({
    address: ADDRESSES.LockBenefitV02, abi: LockBenefit_ABI,
    functionName: 'tierOf', args: [lockId],
    query: { enabled: !!position && !position?.unlocked },
  })
  const { data: discountBps } = useReadContract({
    address: ADDRESSES.LockBenefitV02, abi: LockBenefit_ABI,
    functionName: 'feeDiscountBpsOf', args: [lockId],
    query: { enabled: !!position && !position?.unlocked },
  })
  const { data: rebatePreview } = useReadContract({
    address: ADDRESSES.LockRewardManagerV02, abi: LockRewardManager_ABI,
    functionName: 'previewRebate', args: [lockId],
    query: { enabled: !!position && !position?.unlocked },
  })
  const { data: issuedRwt } = useReadContract({
    address: ADDRESSES.LockRewardManagerV02, abi: LockRewardManager_ABI,
    functionName: 'issuedRewardTokens', args: [lockId],
    query: { enabled: !!position && !position?.unlocked },
  })
  const { data: earlyExitInfo } = useReadContract({
    address: ADDRESSES.LockRewardManagerV02, abi: LockRewardManager_ABI,
    functionName: 'checkEarlyExit', args: [lockId],
    query: { enabled: !!position && !position?.unlocked && !position?.earlyExited },
  })
  const earlyInfo = earlyExitInfo as {
    tokensToReturn: bigint
    userTokenBalance: bigint
    userTokenAllowance: bigint
  } | undefined

  const { writeContract, isPending, data: hash, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  const busy = isPending || isConfirming

  if (isSuccess) onDone()

  if (!position || position.owner === '0x0000000000000000000000000000000000000000') return null
  if (position.owner.toLowerCase() !== userAddress.toLowerCase()) return null

  const stateNum = state as number | undefined
  const tierNum  = tier as number | undefined
  const isActive = !position.unlocked && !position.earlyExited
  const isMatured = stateNum === 2

  function badgeClass() {
    switch (stateNum) {
      case 1: return 'badge-blue'
      case 2: return 'badge-yellow'
      case 3: return 'badge-red'
      default: return 'badge-gray'
    }
  }

  function unlock() {
    writeContract({
      address: ADDRESSES.LockLedgerV02, abi: LockLedger_ABI,
      functionName: 'unlock', args: [lockId],
    })
  }

  function claimRebate() {
    writeContract({
      address: ADDRESSES.LockRewardManagerV02, abi: LockRewardManager_ABI,
      functionName: 'claimRebate', args: [lockId],
    })
  }

  function approveRwtForEarlyExit() {
    if (!earlyInfo) return
    writeContract({
      address: ADDRESSES.RewardToken, abi: RewardToken_ABI,
      functionName: 'approve',
      args: [ADDRESSES.LockRewardManagerV02, earlyInfo.tokensToReturn],
    })
  }

  function earlyExit() {
    writeContract({
      address: ADDRESSES.LockRewardManagerV02, abi: LockRewardManager_ABI,
      functionName: 'earlyExitWithReturn', args: [lockId],
    })
  }

  return (
    <div className="lock-row">
      <div className="lock-row-header">
        <span className="lock-id">Lock #{lockId.toString()}</span>
        <span className={`badge ${badgeClass()}`}>{lockStateName(stateNum)}</span>
        {tierNum !== undefined && tierNum > 0 && (
          <span className="badge badge-gray" style={{ marginLeft: 4 }}>{tierName(tierNum)}</span>
        )}
      </div>

      <div className="info-row"><span className="info-label">Locked shares</span> <span>{fmtShares(position.shares)}</span></div>
      <div className="info-row"><span className="info-label">Locked at</span>     <span>{fmtTs(position.lockedAt)}</span></div>
      <div className="info-row"><span className="info-label">Unlock at</span>     <span>{fmtTs(position.unlockAt)}</span></div>
      {isActive && (
        <>
          <div className="info-row"><span className="info-label">Fee discount</span>  <span>{fmtBps(discountBps as bigint | undefined)}</span></div>
          <div className="info-row"><span className="info-label">Rebate preview</span><span>{fmtShares(rebatePreview as bigint | undefined)}</span></div>
          <div className="info-row"><span className="info-label">RWT issued</span>    <span>{fmtRwt(issuedRwt as bigint | undefined)}</span></div>
        </>
      )}

      {isActive && (
        <div className="btn-row" style={{ marginTop: 8 }}>
          {isMatured ? (
            <button className="btn-green btn-sm" disabled={busy} onClick={unlock}>Unlock</button>
          ) : (
            <>
              <button className="btn-green btn-sm" disabled={busy} onClick={claimRebate}>Claim Rebate</button>
              <button className="btn-secondary btn-sm" disabled={busy} onClick={approveRwtForEarlyExit}
                title={`Must approve ${fmtRwt(earlyInfo?.tokensToReturn)} RWT first`}>
                1. Approve RWT
              </button>
              <button className="btn-danger btn-sm" disabled={busy} onClick={earlyExit}>2. Early Exit</button>
            </>
          )}
        </div>
      )}

      {busy  && <div className="status info" style={{ fontSize: 11 }}>Pending…</div>}
      {error && <div className="status err"  style={{ fontSize: 11 }}>{shortErr(error)}</div>}
    </div>
  )
}
