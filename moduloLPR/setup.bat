@echo off
echo ============================================
echo   Instalando entorno ANPR - Deteccion Placas
echo ============================================

:: 1. Crear entorno virtual
echo.
echo [1/4] Creando entorno virtual...
python -m venv venv
if errorlevel 1 (
    echo ERROR: No se pudo crear el entorno virtual. Asegurate de tener Python 3.10+
    pause
    exit /b 1
)

:: 2. Activar entorno virtual
echo [2/4] Activando entorno virtual...
call venv\Scripts\activate.bat

:: 3. Actualizar pip
echo [3/4] Actualizando pip...
python -m pip install --upgrade pip

:: 4. Instalar dependencias
echo [4/4] Instalando dependencias (esto puede tardar unos minutos)...
pip install -r requirements.txt

echo.
echo ============================================
echo   Entorno listo!
echo   Para iniciar el servidor de camara ejecuta:
echo   venv\Scripts\activate  y luego  python camera.py
echo ============================================
pause
