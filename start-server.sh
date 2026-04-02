#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/mnt/c/DISPOSITIVOS"
PORT="${1:-8000}"

if [ ! -d "$ROOT_DIR" ]; then
  echo "No se encontro $ROOT_DIR. Ajusta la ruta en start-server.sh"
  exit 1
fi

cd "$ROOT_DIR"
echo "Sirviendo $ROOT_DIR en http://localhost:$PORT"
python3 -m http.server "$PORT"
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/mnt/c/DISPOSITIVOS"
PORT="${1:-8000}"

if [ ! -d "$ROOT_DIR" ]; then
  echo "No se encontro $ROOT_DIR. Ajusta la ruta en start-server.sh"
  exit 1
fi

cd "$ROOT_DIR"
echo "Sirviendo $ROOT_DIR en http://localhost:$PORT"
python3 -m http.server "$PORT"
