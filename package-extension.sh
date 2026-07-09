#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="${ROOT_DIR}/dist"
OUTPUT_ZIP="${DIST_DIR}/money-is-time-extension.zip"

# File richiesti dal manifest e dall'estensione.
REQUIRED_FILES=(
  manifest.json
  background.js
  contentScript.js
  popup.html
  popup.js
  money-is-time-icon.png
)

echo "==> Money is Time — packaging per Chrome Web Store"
echo

missing=0
for file in "${REQUIRED_FILES[@]}"; do
  if [[ ! -f "${ROOT_DIR}/${file}" ]]; then
    echo "ERRORE: file mancante: ${file}"
    missing=1
  fi
done

if [[ "${missing}" -eq 1 ]]; then
  echo
  echo "Correggi i file mancanti prima di creare lo ZIP."
  exit 1
fi

echo "==> Verifica percorsi icone nel manifest..."
python3 - <<'PY' "${ROOT_DIR}/manifest.json"
import json
import sys
from pathlib import Path

manifest_path = Path(sys.argv[1])
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
root = manifest_path.parent
icon_paths = []

for key in ("icons",):
    section = manifest.get(key, {})
    if isinstance(section, dict):
        icon_paths.extend(section.values())

action = manifest.get("action", {})
default_icon = action.get("default_icon", {})
if isinstance(default_icon, dict):
    icon_paths.extend(default_icon.values())

if not icon_paths:
    print("ATTENZIONE: nessuna icona dichiarata nel manifest.")
    sys.exit(0)

for icon_path in sorted(set(icon_paths)):
    full_path = root / icon_path
    if not full_path.is_file():
        print(f"ERRORE: icona dichiarata ma assente: {icon_path}")
        sys.exit(1)
    print(f"OK: {icon_path}")
PY

echo
echo "==> Verifica permessi nel manifest..."
python3 - <<'PY' "${ROOT_DIR}/manifest.json"
import json
import sys

manifest = json.loads(open(sys.argv[1], encoding="utf-8").read())
permissions = manifest.get("permissions", [])
host_permissions = manifest.get("host_permissions", [])

print("permissions:", permissions or "(nessuna)")
print("host_permissions:", host_permissions or "(nessuna)")

if "activeTab" in permissions:
    print("ERRORE: activeTab è presente ma non dovrebbe essere richiesto.")
    sys.exit(1)

allowed = {"storage"}
extra = set(permissions) - allowed
if extra:
    print(f"ATTENZIONE: permessi extra rilevati: {sorted(extra)}")
PY

mkdir -p "${DIST_DIR}"
rm -f "${OUTPUT_ZIP}"

echo
echo "==> Creazione ZIP..."
(
  cd "${ROOT_DIR}"
  zip -q -X "${OUTPUT_ZIP}" "${REQUIRED_FILES[@]}"
)

echo "Creato: ${OUTPUT_ZIP}"
echo
echo "Contenuto del pacchetto:"
unzip -l "${OUTPUT_ZIP}"

echo
echo "Prossimi passi:"
echo "1. Apri chrome://extensions"
echo "2. Attiva 'Modalità sviluppatore'"
echo "3. 'Carica estensione non pacchettizzata' e seleziona la cartella del progetto"
echo "4. Verifica che non compaiano errori (icone, popup, conversione prezzi)"
echo "5. Carica ${OUTPUT_ZIP} nella Chrome Web Store Developer Dashboard"
