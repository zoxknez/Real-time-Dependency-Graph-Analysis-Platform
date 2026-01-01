# Development Tools

This directory contains development scripts and utilities.

## Scripts

| Script | Description |
|--------|-------------|
| `setup.sh` | Initial development environment setup |
| `reset-db.sh` | Reset all databases to clean state |
| `seed-data.sh` | Seed test data into databases |
| `loadgen.sh` | Load generator for performance testing |

## Usage

```bash
# Setup development environment
./tools/setup.sh

# Reset databases
./tools/reset-db.sh

# Generate load (10k packages)
./tools/loadgen.sh --count 10000 --registry npm
```
