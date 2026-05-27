#!/bin/bash
echo "============================================"
echo "  Instalando entorno ANPR - Deteccion Placas"
echo "============================================"

# 1. Crear entorno virtual
echo ""
echo "[1/4] Creando entorno virtual..."
python3 -m venv venv
if [ $? -ne 0 ]; then
    echo "ERROR: No se pudo crear el entorno virtual. Asegurate de tener Python 3.10+"
    exit 1
fi

# 2. Activar entorno virtual
echo "[2/4] Activando entorno virtual..."
source venv/bin/activate

# 3. Actualizar pip
echo "[3/4] Actualizando pip..."
pip install --upgrade pip

# 4. Instalar dependencias
echo "[4/4] Instalando dependencias (esto puede tardar unos minutos)..."
pip install -r requirements.txt

echo ""
echo "============================================"
echo "  Entorno listo!"
echo "  Para iniciar el servidor de camara ejecuta:"
echo "  source venv/bin/activate  y luego  python camera.py"
echo "============================================"
