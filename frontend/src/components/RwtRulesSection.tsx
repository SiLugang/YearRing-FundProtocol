import { useReadContract } from 'wagmi'
import { ADDRESSES } from '../contracts/addresses'
import { FundVault_ABI, RewardToken_ABI } from '../contracts/abis'
import { fmtRwt } from '../utils'

export default function RwtRulesSection() {
  const { data: treasury, refetch: r1 } = useReadContract({
    address: ADDRESSES.FundVaultV01, abi: FundVault_ABI,
    functionName: 'treasury',
    query: { enabled: !!ADDRESSES.FundVaultV01 },
  })

  const treasuryAddr = treasury as `0x${string}` | undefined

  const { data: treasuryBal, refetch: r2 } = useReadContract({
    address: ADDRESSES.RewardToken, abi: RewardToken_ABI,
    functionName: 'balanceOf',
    args: treasuryAddr ? [treasuryAddr] : undefined,
    query: { enabled: !!treasuryAddr && !!ADDRESSES.RewardToken },
  })
  const { data: totalSupply, refetch: r3 } = useReadContract({
    address: ADDRESSES.RewardToken, abi: RewardToken_ABI,
    functionName: 'totalSupply',
    query: { enabled: !!ADDRESSES.RewardToken },
  })

  const bal     = treasuryBal as bigint | undefined
  const supply  = totalSupply as bigint | undefined
  const issued  = bal !== undefined && supply !== undefined ? supply - bal : undefined

  const issuedPct = issued !== undefined && supply !== undefined && supply > 0n
    ? ((Number(issued) / Number(supply)) * 100).toFixed(2) + '%'
    : '–'

  function refetch() { r1(); r2(); r3() }

  return (
    <div className="card">
      <div className="card-title">RWT Rules</div>

      {/* ── Supply ── */}
      <div className="rules-block">
        <div className="rules-block-title">Token Supply</div>
        <div className="info-row">
          <span className="info-label">Total Supply (fixed)</span>
          <span className="info-value">{supply !== undefined ? (Number(supply) / 1e18).toLocaleString() + ' RWT' : '–'}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Issuance Method</span>
          <span className="info-value">Pre-minted in full to Treasury at deployment</span>
        </div>
        <div className="info-row">
          <span className="info-label">V2 Additional Mint</span>
          <span className="info-value" style={{ color: 'var(--red)' }}>No — supply is permanently fixed</span>
        </div>
        <div className="info-row">
          <span className="info-label">Treasury Balance</span>
          <span className="info-value">{fmtRwt(bal)}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Issued to Users</span>
          <span className="info-value">
            {fmtRwt(issued)}
            {issued !== undefined && (
              <span style={{ color: 'var(--muted)', fontSize: 11, marginLeft: 4 }}>
                ({issuedPct})
              </span>
            )}
          </span>
        </div>
      </div>

      <hr className="divider" />

      {/* ── Issuance Rules ── */}
      <div className="rules-block">
        <div className="rules-block-title">Issuance Rules</div>
        <div className="info-row">
          <span className="info-label">Distribution Method</span>
          <span className="info-value">Upfront — issued in full at lock time</span>
        </div>
        <div className="info-row">
          <span className="info-label">Base Issuance Rate</span>
          <span className="info-value">500 USDC principal × 1 day = 1 RWT</span>
        </div>
        <div className="info-row">
          <span className="info-label">Calculation Basis</span>
          <span className="info-value">USDC value of fbUSDC at the time of locking</span>
        </div>
        <p className="note" style={{ marginTop: 6 }}>
          Formula: RWT = lockValue(USDC) × lockDays × tierMultiplier ÷ 500
        </p>
      </div>

      <hr className="divider" />

      {/* ── Tier Multipliers ── */}
      <div className="rules-block">
        <div className="rules-block-title">Tier Multipliers</div>
        <table className="yield-table">
          <thead>
            <tr>
              <th>Tier</th>
              <th>Lock Duration</th>
              <th>RWT Multiplier</th>
              <th>Example (1000 USDC × lock period)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><span className="badge badge-gray">Bronze</span></td>
              <td>30 days</td>
              <td>1.0×</td>
              <td style={{ color: 'var(--muted)' }}>1000 × 30 × 1.0 ÷ 500 = <strong style={{ color: 'var(--text)' }}>60 RWT</strong></td>
            </tr>
            <tr>
              <td><span className="badge badge-blue">Silver</span></td>
              <td>90 days</td>
              <td>1.3×</td>
              <td style={{ color: 'var(--muted)' }}>1000 × 90 × 1.3 ÷ 500 = <strong style={{ color: 'var(--text)' }}>234 RWT</strong></td>
            </tr>
            <tr>
              <td><span className="badge badge-yellow">Gold</span></td>
              <td>180 days</td>
              <td>1.8×</td>
              <td style={{ color: 'var(--muted)' }}>1000 × 180 × 1.8 ÷ 500 = <strong style={{ color: 'var(--text)' }}>648 RWT</strong></td>
            </tr>
          </tbody>
        </table>
        <p className="note" style={{ marginTop: 8 }}>
          Early exit requires returning all issued RWT, otherwise the transaction will revert. Holding to maturity permanently retains RWT — no return required.
        </p>
      </div>

      <button className="btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={refetch}>
        ↻ Refresh
      </button>
    </div>
  )
}
