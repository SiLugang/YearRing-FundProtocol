## Summary

<!-- What does this PR do? One paragraph max. -->

## Type of Change

- [ ] Bug fix (non-breaking)
- [ ] New feature
- [ ] Breaking change (contract interface / deployment required)
- [ ] Refactor / tests / docs only
- [ ] Infrastructure / CI

## Affected Contracts / Components

<!-- List every contract modified. If none, write "Frontend only" or "Scripts only" -->

## NAV / Fund Safety Checklist

> Required for any PR that touches contracts/

- [ ] This change does NOT affect how assets are accounted in FundVaultV01
- [ ] OR — it DOES affect NAV, and I have listed the impact points below:
  -
- [ ] No new external calls introduced without re-entrancy analysis
- [ ] No `selfdestruct` or `delegatecall` to untrusted contracts
- [ ] Access control roles verified — no privilege escalation

## Testing

- [ ] Unit tests added / updated
- [ ] Integration test passes (`npx hardhat test`)
- [ ] Tested on Base fork or Base Mainnet (if applicable)
- [ ] Frontend manually tested (if applicable)

## Deployment Notes

<!-- If this requires a contract redeployment, describe the migration steps -->
- [ ] No deployment needed
- [ ] Deployment required — steps: ___

## References

<!-- Related issues, docs, or prior art -->
Closes #
