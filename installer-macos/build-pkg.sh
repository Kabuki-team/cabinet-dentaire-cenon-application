#!/usr/bin/env bash
# Assemble le bundle macOS + produit CabinetCenon-<version>-<arch>.pkg.
# Invoqué par GitHub Actions sur macos-latest (arm64) et macos-13 (Intel x64).
#
# Env vars attendues :
#   VERSION        ex: 1.1.1
#   OFFICE_TOKEN   valeur du secret, baké dans postinstall (→ .env au runtime)
#   ARCH           arm64 ou x64
#   NODE_VERSION   ex: 22.11.0 (par défaut)
#
# Prérequis côté host : pkgbuild, curl, npm (déjà présents sur macOS CI runners).

set -euo pipefail

: "${VERSION:?VERSION env var requis}"
: "${OFFICE_TOKEN:?OFFICE_TOKEN env var requis}"
: "${ARCH:?ARCH env var requis (arm64 ou x64)}"
NODE_VERSION="${NODE_VERSION:-22.11.0}"

if [[ "$ARCH" != "arm64" && "$ARCH" != "x64" ]]; then
    echo "ARCH doit être 'arm64' ou 'x64', reçu : $ARCH" >&2
    exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGING="$ROOT/installer-macos/staging-$ARCH"
PAYLOAD="$STAGING/payload"
SCRIPTS_DIR="$STAGING/scripts"
OUTPUT="$ROOT/installer-macos/output"
APP_DIR_NAME="Cabinet Cenon"

echo "=== Build macOS .pkg v$VERSION arch=$ARCH ==="

rm -rf "$STAGING"
mkdir -p "$OUTPUT"
mkdir -p "$PAYLOAD/Applications/$APP_DIR_NAME"
mkdir -p "$SCRIPTS_DIR"

# 1. Copier le frontend buildé (dist/) → /Applications/Cabinet Cenon/dist/
echo "[1/5] Copie du frontend..."
cp -R "$ROOT/dist" "$PAYLOAD/Applications/$APP_DIR_NAME/dist"

# 2. Copier le backend compilé + installer les deps prod avec native darwin-$ARCH
echo "[2/5] Copie du backend et npm install (natif $ARCH)..."
SERVER_DEST="$PAYLOAD/Applications/$APP_DIR_NAME/server"
mkdir -p "$SERVER_DEST"
cp -R "$ROOT/server/dist" "$SERVER_DEST/dist"
cp -R "$ROOT/server/scripts" "$SERVER_DEST/scripts"
cp "$ROOT/server/package.json" "$SERVER_DEST/"
cp "$ROOT/server/package-lock.json" "$SERVER_DEST/"

pushd "$SERVER_DEST" >/dev/null
npm install --omit=dev --no-audit --no-fund --ignore-scripts 2>&1 | tail -5
# Rebuild explicite de better-sqlite3 pour le bon arch
npm rebuild better-sqlite3 --no-audit --no-fund 2>&1 | tail -5 || true
popd >/dev/null

# 3. Télécharger Node.js portable pour darwin-$ARCH
echo "[3/5] Téléchargement Node.js v$NODE_VERSION darwin-$ARCH..."
NODE_TAR="node-v${NODE_VERSION}-darwin-${ARCH}.tar.gz"
curl -sSL --retry 5 --retry-delay 10 "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TAR}" -o "$STAGING/$NODE_TAR"
tar xzf "$STAGING/$NODE_TAR" -C "$STAGING"
mv "$STAGING/node-v${NODE_VERSION}-darwin-${ARCH}" "$PAYLOAD/Applications/$APP_DIR_NAME/node"
# Trim : retirer la doc pour réduire la taille
find "$PAYLOAD/Applications/$APP_DIR_NAME/node" -type d \( -name doc -o -name man \) -exec rm -rf {} + 2>/dev/null || true

# 4. Préparer les scripts post/preinstall (embed du token via sed)
echo "[4/5] Préparation des scripts preinstall / postinstall..."
cp "$ROOT/installer-macos/preinstall"  "$SCRIPTS_DIR/preinstall"
cp "$ROOT/installer-macos/postinstall" "$SCRIPTS_DIR/postinstall"

# Remplacer le placeholder __OFFICE_TOKEN__ dans postinstall.
# On utilise un délimiteur | pour éviter les conflits avec / dans les chemins.
# Note : le token est hex (0-9a-f) donc pas de caractères spéciaux sed à échapper.
sed -i.bak "s|__OFFICE_TOKEN__|${OFFICE_TOKEN}|g" "$SCRIPTS_DIR/postinstall"
rm "$SCRIPTS_DIR/postinstall.bak"

chmod +x "$SCRIPTS_DIR/preinstall" "$SCRIPTS_DIR/postinstall"

# 5. Construire le .pkg
echo "[5/5] pkgbuild..."
PKG_FILE="$OUTPUT/CabinetCenon-${VERSION}-${ARCH}.pkg"
pkgbuild \
    --root "$PAYLOAD" \
    --scripts "$SCRIPTS_DIR" \
    --identifier "fr.cenon.cabinet" \
    --version "$VERSION" \
    --install-location "/" \
    "$PKG_FILE"

# SHA-256
shasum -a 256 "$PKG_FILE" > "${PKG_FILE}.sha256"

PKG_SIZE_MB=$(du -m "$PKG_FILE" | cut -f1)

echo ""
echo "=== Package prêt ==="
echo "  Fichier : $PKG_FILE"
echo "  Taille  : ${PKG_SIZE_MB} Mo"
echo "  SHA-256 : $(cat "${PKG_FILE}.sha256")"
