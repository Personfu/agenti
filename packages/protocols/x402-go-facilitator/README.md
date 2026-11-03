# x402-facilitator

**x402-facilitator** is a Go-based middleware that settles on-chain payments authorized via the [x402 protocol](https://x402.dev).

## Prerequisites
- Go 1.26.10 or later on a supported release line; reproducible builds use Go 1.27.3
- Docker
- Docker Compose

## Support Schemes
| Scheme     | Status           | Description                   |
|------------|------------------|-------------------------------|
| EVM       | ✅ Supported      | Ethereum and EVM chains       |
| Solana    | 🚧 Planned        |                               |
| Sui       | 🚧 Planned        |                               |
| Tron      | 🚧 Planned        |                               |

## How to run

### Build binary
```bash
make build
```

### Run x402-facilitator

#### 1. Run with docker compose
```bash
docker compose up
```

#### 2. Configuration
x402-facilitator is configured via `config.toml`.
```
# Port for HTTP server (default: 9090)
port = 9090

# Blockchain access configuration
scheme = "evm"                   # Supported: "evm", "solana", "sui", "tron"
network = "base-sepolia"         # Network or chain name
url = "https://sepolia.base.org" # RPC endpoint or node URL
privateKey = ""                  # Private key for fee payer (hex string)
```

#### 3. Api Specification
After starting the service, open your browser to:
```
/swagger/index.html
```

### Run x402-client
```
Usage:
  x402-client [flags]

Flags:
  -A, --amount string    Amount to send
  -F, --from string      Sender address
  -h, --help             help for x402-client
  -n, --network string   Blockchain network to use (default "base-sepolia")
  -P, --privkey string   Sender private key
  -s, --scheme string    Scheme to use (default "evm")
  -T, --to string        Recipient address
  -t, --token string     token contract for sending (default "USDC")
  -u, --url string       Base URL of the facilitator server (default "http://localhost:9090")

Example:
  x402-client -n base-sepolia -s evm -t USDC -F {0xYourSenderAddress} -T {0xRecipientAddress} -P {YourPrivateKey} -A 1000
```


## Contributing
We welcome any contributions! Feel free to open issues or submit pull requests at any time.


## HTTP and configuration security

The facilitator pins Echo 4.16.3, the current compatible Go cryptography/network
modules, and updated Ethereum/WebSocket dependencies. The container uses Go
1.27.3 and an immutable Debian base rather than floating runtime tags.

[Echo GHSA-cxf3-9h37-7rr8](https://github.com/labstack/echo/security/advisories/GHSA-cxf3-9h37-7rr8)
describes a rejected WebSocket upgrade becoming a raw connection that can bypass
route authorization. This service currently does not configure Echo's Proxy
middleware. The dependency is still upgraded, and a loopback-only regression
verifies that a subsequent private request receives 401 and never reaches the
upstream handler. Mapstructure errors are also checked with synthetic malformed
integer and duration inputs so that rejected configuration does not echo values.

Run these checks without wallets, production environment files or RPC credentials:

```sh
go mod verify
go test -mod=readonly -count=1 ./security
go test -mod=readonly -count=1 ./internal/sdk -run 'TestSDK|TestPayloadDetection|TestFacilitatorCreation'
go vet -mod=readonly ./...
go build -mod=readonly ./...
go run golang.org/x/vuln/cmd/govulncheck@v1.9.0 ./...
```

The SDK subset checks imports, types, constants and payload classification. These
checks do not settle payments, sign transactions, validate live RPC integrations
or prove a deployed container has been rebuilt. Production rollout requires
verification of the actual binary's Go build information and container digest.

The first Linux CI scan flagged the legacy x402 module even though the local
Windows scan did not report a reachable symbol. The service now migrates to the
maintained `github.com/x402-foundation/x402/go/v2` module at v2.29.0. Its unused
internal `GetNetworkConfig` re-export was removed because the supported SDK no
longer provides that helper; application call sites did not use it. The checked
SDK contract tests retain payload classification and facilitator construction.
Solana remains planned and no real payment behavior was tested.

The module report still includes the unmaintained `x/crypto/openpgp` package.
Do not infer a clean module audit from zero reachable-symbol findings. Linux CI,
container-build and deployment evidence remain separate requirements.

Additional primary references, reviewed November 3, 2026:

- [Mapstructure malformed-data disclosure](https://github.com/go-viper/mapstructure/security/advisories/GHSA-fv92-fjc5-jj9h)
- [Mapstructure duration disclosure](https://github.com/go-viper/mapstructure/security/advisories/GHSA-2464-8j7c-4cjm)
- [Go vulnerability database](https://pkg.go.dev/vuln/)
- [x402 SDK advisory](https://github.com/advisories/GHSA-qr2g-p6q7-w82m)
