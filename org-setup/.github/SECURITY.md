# Security Policy

## Supported Versions

| Version | Status |
|---|---|
| V02 (Base Mainnet) | Active — current production deployment |
| V01 (Base Mainnet) | Legacy — no new deposits; redeem-only |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

### Preferred Channel

Email: **security@yearringfund.com**

Include in your report:
- Affected contract(s) and address(es)
- Description of the vulnerability
- Potential impact (funds at risk, access control bypass, etc.)
- Steps to reproduce or proof-of-concept (if available)
- Your preferred contact method for follow-up

### Response Timeline

| Stage | Target |
|---|---|
| Acknowledgement | Within 48 hours |
| Initial triage | Within 5 business days |
| Resolution / disclosure | Coordinated with reporter |

We will not take legal action against researchers who follow responsible disclosure.

## Scope

### In Scope

- All deployed contracts listed in [yearring-protocol](https://github.com/yearring-fund/yearring-protocol)
- Frontend at [app.yearringfund.com](https://app.yearringfund.com) (client-side logic, ABI mismatches)
- Smart contract logic bugs that could result in loss of funds

### Out of Scope

- Issues in third-party dependencies (OpenZeppelin, Aave V3, Base L2 infrastructure)
- Gas optimization suggestions
- Issues requiring physical access to a private key
- Social engineering attacks

## Disclosure Policy

We follow a coordinated disclosure model. Once a fix is deployed on-chain, we will publish a post-mortem on [docs.yearringfund.com](https://docs.yearringfund.com) crediting the reporter (unless anonymity is requested).

## Bug Bounty

No formal bug bounty program is active at this time. Significant findings may be recognized at the team's discretion.
