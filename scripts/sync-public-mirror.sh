#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT="$(git rev-parse --show-toplevel)"
MIRROR_REPO="${MIRROR_REPO:-alviehsan/selise_brisk_a5_public_deploy}"
MIRROR_DIR="${MIRROR_DIR:-${SOURCE_ROOT%/*}/selise_brisk_a5_public_deploy}"
BRANCH="${BRANCH:-main}"

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI is required. Install gh and authenticate first." >&2
  exit 1
fi

if ! git -C "$SOURCE_ROOT" diff --quiet || ! git -C "$SOURCE_ROOT" diff --cached --quiet; then
  echo "Refusing to export while the private repo has uncommitted changes." >&2
  git -C "$SOURCE_ROOT" status --short
  exit 1
fi

SOURCE_COMMIT="$(git -C "$SOURCE_ROOT" rev-parse --short=12 HEAD)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

git -C "$SOURCE_ROOT" archive --format=tar HEAD | tar -x -C "$TMP_DIR"

rm -rf \
  "$TMP_DIR/.env" \
  "$TMP_DIR"/.env.* \
  "$TMP_DIR/llm-docs" \
  "$TMP_DIR/docs/deployment" \
  "$TMP_DIR/docs/superpowers" \
  "$TMP_DIR/DEPLOYMENT.md" \
  "$TMP_DIR/deploy.sh" \
  "$TMP_DIR/ts_errors.txt" \
  "$TMP_DIR/ts_validation.txt"

mkdir -p "$TMP_DIR/.github/workflows"

cat > "$TMP_DIR/.env.example" <<'EOF_ENV'
VITE_BLOCKS_API_URL=https://api.seliseblocks.com
VITE_API_BASE_URL=https://api.seliseblocks.com
VITE_X_BLOCKS_KEY=
VITE_CAPTCHA_SITE_KEY=""
VITE_CAPTCHA_TYPE=
VITE_PROJECT_SLUG=
VITE_BLOCKS_OIDC_CLIENT_ID=
VITE_BLOCKS_OIDC_REDIRECT_URI=
EOF_ENV

cat > "$TMP_DIR/.github/workflows/verify.yml" <<'EOF_WORKFLOW'
name: Verify Public Mirror

on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
  workflow_dispatch:

jobs:
  verify:
    name: Lint, test, and build dev/prod
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Create Vite env files from GitHub Variables
        env:
          VITE_DEV_BLOCKS_API_URL: ${{ vars.VITE_DEV_BLOCKS_API_URL }}
          VITE_DEV_API_BASE_URL: ${{ vars.VITE_DEV_API_BASE_URL }}
          VITE_DEV_X_BLOCKS_KEY: ${{ vars.VITE_DEV_X_BLOCKS_KEY }}
          VITE_DEV_PROJECT_SLUG: ${{ vars.VITE_DEV_PROJECT_SLUG }}
          VITE_DEV_BLOCKS_OIDC_CLIENT_ID: ${{ vars.VITE_DEV_BLOCKS_OIDC_CLIENT_ID }}
          VITE_DEV_BLOCKS_OIDC_REDIRECT_URI: ${{ vars.VITE_DEV_BLOCKS_OIDC_REDIRECT_URI }}
          VITE_PROD_BLOCKS_API_URL: ${{ vars.VITE_PROD_BLOCKS_API_URL }}
          VITE_PROD_API_BASE_URL: ${{ vars.VITE_PROD_API_BASE_URL }}
          VITE_PROD_X_BLOCKS_KEY: ${{ vars.VITE_PROD_X_BLOCKS_KEY }}
          VITE_PROD_PROJECT_SLUG: ${{ vars.VITE_PROD_PROJECT_SLUG }}
          VITE_PROD_BLOCKS_OIDC_CLIENT_ID: ${{ vars.VITE_PROD_BLOCKS_OIDC_CLIENT_ID }}
          VITE_PROD_BLOCKS_OIDC_REDIRECT_URI: ${{ vars.VITE_PROD_BLOCKS_OIDC_REDIRECT_URI }}
        run: |
          cat > .env.dev <<EOF_DEV
          VITE_BLOCKS_API_URL=${VITE_DEV_BLOCKS_API_URL}
          VITE_API_BASE_URL=${VITE_DEV_API_BASE_URL}
          VITE_X_BLOCKS_KEY=${VITE_DEV_X_BLOCKS_KEY}
          VITE_CAPTCHA_SITE_KEY=""
          VITE_CAPTCHA_TYPE=
          VITE_PROJECT_SLUG=${VITE_DEV_PROJECT_SLUG}
          VITE_BLOCKS_OIDC_CLIENT_ID=${VITE_DEV_BLOCKS_OIDC_CLIENT_ID}
          VITE_BLOCKS_OIDC_REDIRECT_URI=${VITE_DEV_BLOCKS_OIDC_REDIRECT_URI}
          EOF_DEV

          cat > .env.prod <<EOF_PROD
          VITE_BLOCKS_API_URL=${VITE_PROD_BLOCKS_API_URL}
          VITE_API_BASE_URL=${VITE_PROD_API_BASE_URL}
          VITE_X_BLOCKS_KEY=${VITE_PROD_X_BLOCKS_KEY}
          VITE_CAPTCHA_SITE_KEY=""
          VITE_CAPTCHA_TYPE=
          VITE_PROJECT_SLUG=${VITE_PROD_PROJECT_SLUG}
          VITE_BLOCKS_OIDC_CLIENT_ID=${VITE_PROD_BLOCKS_OIDC_CLIENT_ID}
          VITE_BLOCKS_OIDC_REDIRECT_URI=${VITE_PROD_BLOCKS_OIDC_REDIRECT_URI}
          EOF_PROD

      - name: Lint
        run: npm run lint

      - name: Test
        run: npm test

      - name: Build dev
        run: npm run build:dev

      - name: Build prod
        run: npm run build:prod
EOF_WORKFLOW

cat > "$TMP_DIR/README.md" <<EOF_README
# SELISE Brisk a5 Public Deploy Mirror

This repository is a generated public verification mirror for the private source repository \`alviehsan/selise_brisk_a5\`.

Do not edit this mirror by hand. Regenerate it from the private repository with:

\`\`\`sh
scripts/sync-public-mirror.sh
\`\`\`

Generated from private commit: \`$SOURCE_COMMIT\`

## CI configuration

The workflow creates \`.env.dev\` and \`.env.prod\` at runtime from GitHub repository Variables. These values are browser-visible after a Vite build, so only frontend-safe configuration belongs there.

Required Variables:

- \`VITE_DEV_BLOCKS_API_URL\`
- \`VITE_DEV_API_BASE_URL\`
- \`VITE_DEV_X_BLOCKS_KEY\`
- \`VITE_DEV_PROJECT_SLUG\`
- \`VITE_DEV_BLOCKS_OIDC_CLIENT_ID\`
- \`VITE_DEV_BLOCKS_OIDC_REDIRECT_URI\`
- \`VITE_PROD_BLOCKS_API_URL\`
- \`VITE_PROD_API_BASE_URL\`
- \`VITE_PROD_X_BLOCKS_KEY\`
- \`VITE_PROD_PROJECT_SLUG\`
- \`VITE_PROD_BLOCKS_OIDC_CLIENT_ID\`
- \`VITE_PROD_BLOCKS_OIDC_REDIRECT_URI\`
EOF_README

if ! gh repo view "$MIRROR_REPO" >/dev/null 2>&1; then
  gh repo create "$MIRROR_REPO" --public --description "Public verification mirror for SELISE Brisk a5" --confirm
fi

mkdir -p "$MIRROR_DIR"
if [ ! -d "$MIRROR_DIR/.git" ]; then
  git clone "https://github.com/${MIRROR_REPO}.git" "$MIRROR_DIR"
fi

git -C "$MIRROR_DIR" checkout "$BRANCH" 2>/dev/null || git -C "$MIRROR_DIR" checkout -b "$BRANCH"
find "$MIRROR_DIR" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -R "$TMP_DIR"/. "$MIRROR_DIR"/

git -C "$MIRROR_DIR" add -A
if git -C "$MIRROR_DIR" diff --cached --quiet; then
  echo "Public mirror already matches private commit $SOURCE_COMMIT."
else
  git -C "$MIRROR_DIR" commit -m "sync: mirror private commit $SOURCE_COMMIT"
  git -C "$MIRROR_DIR" push -u origin "$BRANCH"
fi

echo "Public mirror is ready: https://github.com/${MIRROR_REPO}"
