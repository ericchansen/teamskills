#!/bin/sh
# Generate runtime config from environment variables.
# Placed in /docker-entrypoint.d/ so nginx:alpine runs it before starting.
cat > /usr/share/nginx/html/config.js << EOF
window.__CONFIG__ = {
  VITE_API_URL: "${VITE_API_URL:-}",
  VITE_AZURE_AD_CLIENT_ID: "${VITE_AZURE_AD_CLIENT_ID:-}",
  VITE_AZURE_AD_TENANT_ID: "${VITE_AZURE_AD_TENANT_ID:-}",
  VITE_AGENT_URL: "${VITE_AGENT_URL:-}"
};
EOF
echo "Runtime config.js generated with VITE_API_URL=${VITE_API_URL:-<empty>}"
