import { useState, useEffect, useRef } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits } from 'viem'
import { ADDRESSES } from '../contracts/addresses'
import { FundVault_ABI } from '../contracts/abis'
import { fmtUsdc, shortErr } from '../utils'

// DEFAULT_ADMIN_ROLE in OpenZeppelin AccessControl = bytes32(0)
const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000' as const

type OpType = 'pauseDeposits' | 'unpauseDeposits' | 'pauseRedeems' | 'unpauseRedeems' | 'accrue' | 'transfer' | 'setMode' | 'openRound' | 'closeRound' | null

const MODE_LABELS = ['Normal', 'Paused', 'EmergencyExit']
const MODE_BADGE_CLASSES = ['badge-green', 'badge-yellow', 'badge-red']

export default function AdminConsole() {
  const { address } = useAccount()
  const vaultOk = !!ADDRESSES.FundVaultV01 && !!address

  // ── Role checks ────────────────────────────────────────────────────────────
  const { data: isAdmin, refetch: refetchAdmin } = useReadContract({
    address: ADDRESSES.FundVaultV01, abi: FundVault_ABI,
    functionName: 'hasRole',
    args: address ? [DEFAULT_ADMIN_ROLE, address] : undefined,
    query: { enabled: vaultOk },
  })

  const hasAccess = !!isAdmin

  // ── Vault state ────────────────────────────────────────────────────────────
  const { data: depositsPaused, refetch: r1 } = useReadContract({
    address: ADDRESSES.FundVaultV01, abi: FundVault_ABI,
    functionName: 'depositsPaused', query: { enabled: vaultOk },
  })
  const { data: redeemsPaused, refetch: r2 } = useReadContract({
    address: ADDRESSES.FundVaultV01, abi: FundVault_ABI,
    functionName: 'redeemsPaused', query: { enabled: vaultOk },
  })
  const { data: available, refetch: r3 } = useReadContract({
    address: ADDRESSES.FundVaultV01, abi: FundVault_ABI,
    functionName: 'availableToInvest', query: { enabled: vaultOk },
  })
  const { data: stratMgr, refetch: r4 } = useReadContract({
    address: ADDRESSES.FundVaultV01, abi: FundVault_ABI,
    functionName: 'strategyManager', query: { enabled: vaultOk },
  })
  const { data: vaultMode, refetch: r5 } = useReadContract({
    address: ADDRESSES.FundVaultV01, abi: FundVault_ABI,
    functionName: 'systemMode', query: { enabled: vaultOk },
  })
  const { data: currentRoundId, refetch: r6 } = useReadContract({
    address: ADDRESSES.FundVaultV01, abi: FundVault_ABI,
    functionName: 'currentRoundId', query: { enabled: vaultOk },
  })

  const currentMode = typeof vaultMode === 'number' ? vaultMode : (vaultMode !== undefined ? Number(vaultMode) : undefined)
  const roundId = currentRoundId as bigint | undefined

  // Read current round info if a round exists
  const roundEnabled = vaultOk && roundId !== undefined && roundId > 0n
  const { data: currentRound, refetch: r7 } = useReadContract({
    address: ADDRESSES.FundVaultV01, abi: FundVault_ABI,
    functionName: 'exitRounds',
    args: roundId !== undefined ? [roundId] : undefined,
    query: { enabled: roundEnabled },
  })

  // ── Write ──────────────────────────────────────────────────────────────────
  const [opType, setOpType]       = useState<OpType>(null)
  const [transferAmt, setTransferAmt] = useState('')
  const [availableAssetsInput, setAvailableAssetsInput] = useState('')
  const { writeContract, isPending, data: hash, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  const busy     = isPending || isConfirming
  const prevHash = useRef<string | undefined>(undefined)

  function refetch() { r1(); r2(); r3(); r4(); r5(); r6(); r7(); refetchAdmin() }

  useEffect(() => {
    if (isSuccess && hash && hash !== prevHash.current) {
      prevHash.current = hash
      refetch()
      if (opType === 'transfer') setTransferAmt('')
      if (opType === 'openRound') setAvailableAssetsInput('')
    }
  }, [isSuccess, hash])

  function exec(op: OpType, fn: string, args: unknown[] = []) {
    setOpType(op)
    writeContract({
      address: ADDRESSES.FundVaultV01,
      abi: FundVault_ABI,
      functionName: fn as never,
      args: args as never,
    })
  }

  // Don't render for non-admin wallets
  if (!address || !hasAccess) return null

  const dp = depositsPaused as boolean | undefined
  const rp = redeemsPaused  as boolean | undefined
  const av = available      as bigint  | undefined

  const transferBig = transferAmt ? parseUnits(transferAmt, 6) : 0n
  const canTransfer  = av !== undefined && transferBig > 0n && transferBig <= av

  const modeLabelText = currentMode !== undefined ? (MODE_LABELS[currentMode] ?? '–') : '–'
  const modeBadgeClass = currentMode !== undefined ? (MODE_BADGE_CLASSES[currentMode] ?? 'badge-gray') : 'badge-gray'

  const roundData = currentRound as readonly [bigint, bigint, bigint, bigint, boolean, bigint] | undefined
  const roundIsOpen = roundData ? roundData[4] : false

  const availableAssetsBig = availableAssetsInput ? parseUnits(availableAssetsInput, 6) : 0n

  return (
    <div className="admin-console">
      <div className="admin-console-header">
        <span>Admin / Operator Console</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {isAdmin && <span className="badge badge-yellow">DEFAULT_ADMIN</span>}
        </div>
      </div>

      <div className="admin-grid">

        {/* ── Emergency Pause ── */}
        <div className="card">
          <div className="card-title">Emergency Pause</div>

          <div className="info-row">
            <span className="info-label">Deposits</span>
            <span className={`badge ${dp ? 'badge-red' : 'badge-green'}`}>
              {dp === undefined ? '–' : dp ? 'PAUSED' : 'Active'}
            </span>
          </div>
          <div className="info-row">
            <span className="info-label">Redeems</span>
            <span className={`badge ${rp ? 'badge-red' : 'badge-green'}`}>
              {rp === undefined ? '–' : rp ? 'PAUSED' : 'Active'}
            </span>
          </div>

          <div className="btn-row" style={{ marginTop: 10 }}>
            {!dp
              ? <button className="btn-danger btn-sm" disabled={busy || !isAdmin} onClick={() => exec('pauseDeposits', 'pauseDeposits')}>
                  Pause Deposits
                </button>
              : <button className="btn-green btn-sm" disabled={busy || !isAdmin} onClick={() => exec('unpauseDeposits', 'unpauseDeposits')}>
                  Unpause Deposits
                </button>
            }
            {!rp
              ? <button className="btn-danger btn-sm" disabled={busy || !isAdmin} onClick={() => exec('pauseRedeems', 'pauseRedeems')}>
                  Pause Redeems
                </button>
              : <button className="btn-green btn-sm" disabled={busy || !isAdmin} onClick={() => exec('unpauseRedeems', 'unpauseRedeems')}>
                  Unpause Redeems
                </button>
            }
          </div>
          <p className="note" style={{ marginTop: 6 }}>
            Pause Deposits/Redeems can be called by <strong>EMERGENCY_ROLE</strong> or <strong>DEFAULT_ADMIN_ROLE</strong>.
            Unpause requires <strong>DEFAULT_ADMIN_ROLE</strong> only.
          </p>
        </div>

        {/* ── System Mode ── */}
        <div className="card">
          <div className="card-title">System Mode</div>
          <div className="info-row">
            <span className="info-label">Current Mode</span>
            <span className={`badge ${modeBadgeClass}`}>{modeLabelText}</span>
          </div>
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button className="btn-green btn-sm" disabled={busy || currentMode === 0} onClick={() => exec('setMode', 'setMode', [0])}>Normal</button>
            <button className="btn-secondary btn-sm" disabled={busy || currentMode === 1} onClick={() => exec('setMode', 'setMode', [1])}>Paused</button>
            <button className="btn-danger btn-sm" disabled={busy || currentMode === 2} onClick={() => exec('setMode', 'setMode', [2])}>EmergencyExit</button>
          </div>
          <p className="note" style={{ marginTop: 6 }}>
            Normal: all operations enabled. Paused: new deposits blocked. EmergencyExit: deposits and normal redeem blocked; exit rounds available.
          </p>
        </div>

        {/* ── Exit Round Management (only shown when mode == Exit) ── */}
        {currentMode === 2 && (
          <div className="card">
            <div className="card-title">Exit Round Management</div>

            <div className="info-row">
              <span className="info-label">Current Round ID</span>
              <span className="info-value">{roundId !== undefined ? roundId.toString() : '–'}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Round Status</span>
              <span className={`badge ${roundIsOpen ? 'badge-green' : 'badge-gray'}`}>
                {roundId === undefined || roundId === 0n ? 'No round' : roundIsOpen ? 'Open' : 'Closed'}
              </span>
            </div>
            {roundData && (
              <div className="info-row">
                <span className="info-label">Available Assets</span>
                <span className="info-value">{fmtUsdc(roundData[2])}</span>
              </div>
            )}
            {roundData && (
              <div className="info-row">
                <span className="info-label">Total Claimed</span>
                <span className="info-value">{fmtUsdc(roundData[3])}</span>
              </div>
            )}

            <div className="field" style={{ marginTop: 10 }}>
              <label>Available Assets for New Round (USDC)</label>
              <input
                type="number"
                placeholder="e.g. 10000"
                value={availableAssetsInput}
                onChange={e => setAvailableAssetsInput(e.target.value)}
              />
            </div>
            <div className="btn-row">
              <button
                className="btn-primary btn-sm"
                disabled={busy || !isAdmin || !availableAssetsInput || roundIsOpen}
                onClick={() => exec('openRound', 'openExitModeRound', [availableAssetsBig])}
              >
                {busy && opType === 'openRound' ? 'Pending…' : 'Open Round'}
              </button>
              <button
                className="btn-danger btn-sm"
                disabled={busy || !isAdmin || !roundIsOpen}
                onClick={() => exec('closeRound', 'closeExitModeRound')}
              >
                {busy && opType === 'closeRound' ? 'Pending…' : 'Close Round'}
              </button>
            </div>
            <p className="note" style={{ marginTop: 6 }}>
              Opening a round takes a share snapshot and sets available USDC for pro-rata claims. Close to finalize.
            </p>
          </div>
        )}

        {/* ── Strategy ── */}
        <div className="card">
          <div className="card-title">Strategy Switch</div>

          <div className="info-row">
            <span className="info-label">Strategy 1</span>
            <span className="badge badge-green">Aave-based Demo · Active</span>
          </div>
          <div className="info-row">
            <span className="info-label">Manager address</span>
            <span className="mono" style={{ fontSize: 11 }}>
              {stratMgr && stratMgr !== '0x0000000000000000000000000000000000000000'
                ? (stratMgr as string).slice(0, 10) + '…' + (stratMgr as string).slice(-6)
                : '–'}
            </span>
          </div>
          <div className="info-row">
            <span className="info-label">Strategy 2</span>
            <span className="badge badge-gray">In Development</span>
          </div>

          <div className="btn-row" style={{ marginTop: 10 }}>
            <button className="btn-secondary btn-sm" disabled title="Strategy 2 not yet deployed — switching unavailable">
              Switch Strategy
            </button>
          </div>
          <p className="note" style={{ marginTop: 6 }}>
            Once Strategy 2 is deployed, the Strategy Manager address can be switched via <code>setModules()</code>.
          </p>
        </div>

        {/* ── Fund Operations ── */}
        <div className="card">
          <div className="card-title">Fund Operations</div>

          <div className="info-row">
            <span className="info-label">Available to invest</span>
            <span className="info-value">{fmtUsdc(av)}</span>
          </div>

          <div className="field">
            <label>Transfer to Strategy Manager (USDC)</label>
            <input
              type="number"
              placeholder={`max ${av !== undefined ? (Number(av) / 1e6).toFixed(2) : '–'} USDC`}
              value={transferAmt}
              onChange={e => setTransferAmt(e.target.value)}
            />
          </div>
          <div className="btn-row">
            <button
              className="btn-primary btn-sm"
              disabled={busy || !isAdmin || !canTransfer}
              onClick={() => exec('transfer', 'transferToStrategyManager', [transferBig])}
            >
              {busy && opType === 'transfer' ? 'Pending…' : 'Transfer'}
            </button>
          </div>

          <hr className="divider" />

          <div className="info-row">
            <span className="info-label">Management Fee</span>
            <span className="info-value" style={{ color: 'var(--muted)', fontSize: 12 }}>Manually trigger settlement (auto-settled on deposit/redeem)</span>
          </div>
          <div className="btn-row">
            <button
              className="btn-secondary btn-sm"
              disabled={busy}
              onClick={() => exec('accrue', 'accrueManagementFee')}
            >
              {busy && opType === 'accrue' ? 'Pending…' : 'Accrue Fee'}
            </button>
          </div>
          <p className="note" style={{ marginTop: 6 }}>
            Accrue Fee can be called by anyone. Transfer requires DEFAULT_ADMIN_ROLE and externalTransfers must be enabled first.
          </p>
        </div>

      </div>

      <button className="btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={refetch}>
        ↻ Refresh
      </button>

      {busy     && opType && <div className="status info" style={{ marginTop: 8 }}>Executing {opType}…</div>}
      {isSuccess          && <div className="status ok"  style={{ marginTop: 8 }}>Done.</div>}
      {error              && <div className="status err" style={{ marginTop: 8 }}>{shortErr(error)}</div>}
    </div>
  )
}
