# SELISE Brisk a5 Public Deploy Mirror

This repository is a generated public verification mirror for the private source repository `alviehsan/selise_brisk_a5`.

Do not edit this mirror by hand. Regenerate it from the private repository with:

```sh
scripts/sync-public-mirror.sh
```

Generated from private commit: `3641b3bb687e`

## CI configuration

The workflow creates `.env.dev` and `.env.prod` at runtime from GitHub repository Variables. These values are browser-visible after a Vite build, so only frontend-safe configuration belongs there.

Required Variables:

- `VITE_DEV_BLOCKS_API_URL`
- `VITE_DEV_API_BASE_URL`
- `VITE_DEV_X_BLOCKS_KEY`
- `VITE_DEV_PROJECT_SLUG`
- `VITE_DEV_BLOCKS_OIDC_CLIENT_ID`
- `VITE_DEV_BLOCKS_OIDC_REDIRECT_URI`
- `VITE_PROD_BLOCKS_API_URL`
- `VITE_PROD_API_BASE_URL`
- `VITE_PROD_X_BLOCKS_KEY`
- `VITE_PROD_PROJECT_SLUG`
- `VITE_PROD_BLOCKS_OIDC_CLIENT_ID`
- `VITE_PROD_BLOCKS_OIDC_REDIRECT_URI`
