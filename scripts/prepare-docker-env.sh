#!/bin/bash
# Write .env.docker for a local Dhanakosh container.
# Does not print the password, the master key, or the password hash.
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f compose.yml || ! -f Dockerfile ]]; then
  echo "This script must run from a Dhanakosh checkout." >&2
  exit 1
fi

if [[ -e .env.docker && "${1:-}" != "--force" ]]; then
  echo ".env.docker already exists. Run again with --force to replace it." >&2
  exit 1
fi

password="${DHANAKOSH_PASSWORD:-}"
if [[ -z "$password" ]]; then
  if [[ ! -t 0 ]]; then
    echo "Set DHANAKOSH_PASSWORD, or run this in a terminal so it can ask." >&2
    exit 1
  fi
  printf 'Password for the browser login: '
  IFS= read -r password
  printf '\n'
fi

if [[ ${#password} -lt 8 ]]; then
  echo "Use at least 8 characters." >&2
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required to create the master key." >&2
  exit 1
fi

secret="$(openssl rand -base64 32)"
salt="$(openssl rand -hex 8)"

if command -v argon2 >/dev/null 2>&1; then
  hash="$(printf '%s' "$password" | argon2 "$salt" -id -e)"
elif command -v docker >/dev/null 2>&1; then
  hash="$(
    printf '%s' "$password" | docker run --rm -i alpine:3.20 \
      sh -c "apk add --no-cache argon2 >/dev/null && argon2 '$salt' -id -e"
  )"
else
  echo "Install argon2 (brew install argon2) or start Docker so the password can be hashed." >&2
  exit 1
fi

case "$hash" in
  \$argon2id\$*) ;;
  *)
    echo "Password hashing failed." >&2
    exit 1
    ;;
esac

# Compose treats $ as interpolation. Double each one so the hash survives.
escaped_hash="$(printf '%s' "$hash" | sed 's/\$/$$/g')"

umask 077
cat > .env.docker << EOF
# Generated for this computer. Do not commit or send this file.
WF_LISTEN_ADDR=0.0.0.0:8088
WF_DB_PATH=/data/wealthfolio.db
WF_SECRET_KEY=${secret}
WF_AUTH_PASSWORD_HASH=${escaped_hash}
WF_CORS_ALLOW_ORIGINS=http://localhost:8088,http://127.0.0.1:8088
WF_REQUEST_TIMEOUT_MS=30000
WF_STATIC_DIR=dist
EOF
chmod 600 .env.docker

echo "Wrote .env.docker."
echo "Next: docker compose --env-file .env.docker up -d --build"
echo "Then open http://localhost:8088"
