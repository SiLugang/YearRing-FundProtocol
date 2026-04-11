export default function LimitationsPanel() {
  return (
    <>
      {/* ── Protocol Risk & Compliance Disclosure (COMPLIANCE §7) ── */}
      <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--danger, #c00)' }}>
        <div className="card-title">Protocol Risk & Compliance Disclosure</div>
        <ul className="limitations-list">
          <li>
            <strong>This protocol is not capital-guaranteed.</strong> Depositing USDC into the vault
            does not guarantee return of principal. Strategy losses, smart contract bugs, or adverse
            market conditions can reduce the value of your shares (fbUSDC).
          </li>
          <li>
            <strong>This protocol does not offer fixed or guaranteed returns.</strong>{' '}
            <code>pricePerShare</code> reflects actual strategy performance and can decrease as well
            as increase. No yield rate is promised or implied.
          </li>
          <li>
            <strong>RWT (Reward Token) is not part of NAV and does not constitute fund yield.</strong>{' '}
            RWT is issued as a commitment incentive. Its market price (if any) is independent of
            the vault's asset performance. A change in RWT price does not affect <code>pricePerShare</code>{' '}
            and should not be treated as protocol income.
          </li>
          <li>
            <strong>This protocol is not a security, and nothing here constitutes investment advice.</strong>{' '}
            Participation is voluntary and at your own risk. FinancialBase does not provide
            financial, legal, or tax advice.
          </li>
          <li>
            <strong>Governance votes are signal-layer only — they do not auto-execute.</strong>{' '}
            <code>GovernanceSignalV02</code> records on-chain vote weight and preference signals.
            No signal automatically triggers a protocol parameter change. All changes require an
            explicit admin action subject to the 24h timelock.
          </li>
        </ul>
      </div>

      {/* ── Admin / Governance Risk Disclosure ── */}
      <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--warn, #c60)' }}>
        <div className="card-title">Governance & Permission Risk Disclosure</div>
        <ul className="limitations-list">
          <li>
            <strong>DEFAULT_ADMIN_ROLE is held by a multisig wallet.</strong> Non-emergency protocol
            operations (fee updates, reserve ratio changes, strategy switches) are controlled by the
            multisig and subject to a 24-hour timelock delay via <code>ProtocolTimelockV02</code>.
          </li>
          <li>
            <strong>EMERGENCY_ROLE can act immediately, bypassing the timelock.</strong> This role
            exists to allow rapid response to exploits or market crises. The holder can pause deposits/redeems
            and trigger Emergency Exit without any delay. The multisig also holds this role in the current
            deployment.
          </li>
          <li>
            <strong>Emergency Exit gives admin exclusive control over exit round timing.</strong> During
            EmergencyExit mode, users can only redeem via <code>claimExitAssets()</code> within an admin-opened
            round. The admin determines how much USDC is made available and when rounds open/close.
          </li>
          <li>
            <strong>No upgrade proxy in V3.</strong> <code>FundVaultV01</code> is non-upgradeable. The{' '}
            <code>UPGRADER_ROLE</code> constant is defined for forward compatibility only and is not
            granted or used in this version. A contract migration would require a new deployment and
            voluntary user migration.
          </li>
          <li>
            <strong>Timelock delay: 24 hours minimum.</strong> Non-emergency governance operations must
            be scheduled and then executed after a 24h waiting period. This delay can be observed
            on-chain before execution.
          </li>
        </ul>
      </div>

      {/* ── Known Limitations ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Known Limitations (V3 Testnet Demo)</div>
        <ul className="limitations-list">
          <li>
            <strong>Maturity on testnet:</strong> Depending on tier, live maturity requires waiting
            through the full protocol duration (30–180 days). Full lifecycle (lock → matured → unlock)
            should be demonstrated via a local Hardhat demo with <code>evm_increaseTime</code>.
          </li>
          <li>
            <strong>Beneficiary: locked positions only.</strong> <code>executeClaim</code> transfers
            locked positions to the beneficiary. The original owner's free fbUSDC balance is{' '}
            <strong>not</strong> transferred automatically.
          </li>
          <li>
            <strong>Rebate rights not inherited.</strong> When a beneficiary claims a lock,
            the fee rebate entitlement stays with the original lock owner (not transferred to beneficiary).
          </li>
          <li>
            <strong>Strategy yield is admin-simulated.</strong> DummyStrategy on testnet does not
            automatically accrue yield. <code>pricePerShare</code> changes only when simulated
            yield is introduced and reflected into protocol assets.
          </li>
          <li>
            <strong>Admin actions not fully exposed:</strong> <code>adminMarkInactive</code> and
            yield simulation require the admin wallet via direct contract calls or Hardhat scripts.
            Standard admin operations (pause, accrue fee, transfer to strategy) are available in the Admin Console.
          </li>
          <li>
            <strong>Heartbeat ≠ other actions.</strong> Only <code>heartbeat()</code> resets
            the inactivity timer. Other protocol operations (deposit, lock, redeem) do not.
          </li>
          <li>
            <strong>MAX 5 active locks per address.</strong> Attempting a 6th lock will revert
            with <code>TooManyActiveLocks</code>.
          </li>
        </ul>
      </div>
    </>
  )
}
