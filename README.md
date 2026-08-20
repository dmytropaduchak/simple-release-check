# simple-release-check

Checks release hygiene: changelog present, and workflows mentioning SBOM / provenance attestation.

## Usage

```yaml
- uses: actions/checkout@v4
- uses: dmytropaduchak/simple-release-check@v0.1.0
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

## Develop

```bash
npm install && npm run build
```
