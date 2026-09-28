#!/usr/bin/env bash
# Usage: ./set-domain.sh https://www.yourdomain.com
# Run from the project root (the folder containing server.js).
set -e
[ -z "$1" ] && { echo "Usage: ./set-domain.sh https://www.yourdomain.com"; exit 1; }
DOMAIN="${1%/}"
for f in public/index.html public/sponsorship.html public/robots.txt public/sitemap.xml; do
  sed -i.bak "s|https://YOURDOMAIN.com|$DOMAIN|g" "$f" && rm -f "$f.bak"
done
echo "Updated to $DOMAIN"
