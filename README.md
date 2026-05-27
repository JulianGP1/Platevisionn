# 🚗 Sistema de Reconocimiento de Placas (LPR)

Proyecto de reconocimiento automático de placas colombianas con cámara en tiempo real.
Compuesto por dos partes:

- **`PROJECT-SYSTEMLPR/`** — Frontend en React + Supabase que muestra el historial de detecciones
- **`ANPR_PROJECT/`** — Backend Python con YOLO + EasyOCR que procesa la cámara y expone una API

---

## ⚙️ Requisitos previos

| Herramienta | Versión mínima | Descarga |
|---|---|---|
| Node.js | 18+ | https://nodejs.org |
| Python | 3.10+ | https://python.org |
| Git | cualquiera | https://git-scm.com |

---

## 🚀 Instalación rápida

### 1. Clonar el repositorio

```bash
git clone <URL_DEL_REPO>
cd <nombre-del-repo>
```

---

### 2. Instalar el Frontend (React)

```bash
cd PROJECT-SYSTEMLPR
```

**Windows:**
```bash
setup.bat
```

**Mac / Linux:**
```bash
cp .env.example .env
npm install
```

> ⚠️ Abre el archivo `.env` y llena las credenciales de Supabase antes de correr el proyecto.
> Las consigues en: [supabase.com](https://supabase.com) → Tu proyecto → Settings → API

Iniciar el frontend:
```bash
npm run dev
```
Abre [http://localhost:5173](http://localhost:5173) en el navegador.

---

### 3. Instalar el Backend ANPR (Python)

```bash
cd ANPR_PROJECT
```

**Windows:**
```bash
setup.bat
```

**Mac / Linux:**
```bash
chmod +x setup.sh
./setup.sh
```

Esto crea el entorno virtual e instala todas las dependencias automáticamente.

> ⚠️ La primera instalación puede tardar varios minutos por PyTorch y EasyOCR.

---

### 4. Correr el sistema completo

Necesitas **dos terminales abiertas al mismo tiempo**:

**Terminal 1 — Frontend:**
```bash
cd PROJECT-SYSTEMLPR
npm run dev
```

**Terminal 2 — Cámara / Backend:**
```bash
cd ANPR_PROJECT
venv\Scripts\activate      # Windows
# o
source venv/bin/activate   # Mac/Linux

python camera.py
```

El backend corre en `http://localhost:5000` y el frontend lo consume automáticamente.

---

## 📁 Estructura del proyecto

```
├── PROJECT-SYSTEMLPR/       # Frontend React
│   ├── src/
│   ├── .env.example         # ← Copia a .env y llena tus credenciales
│   ├── package.json
│   └── setup.bat
│
└── ANPR_PROJECT/            # Backend Python
    ├── camera.py            # Servidor Flask + cámara + YOLO + OCR
    ├── train.py             # Script de entrenamiento (opcional)
    ├── requirements.txt
    ├── setup.bat
    ├── setup.sh
    └── runs/detect/placas_colombianas/weights/
        └── best.pt          # Modelo entrenado ← necesario para que funcione
```

---

## 🧠 Sobre el modelo entrenado (`best.pt`)

El archivo `best.pt` es el modelo YOLO entrenado para detectar placas colombianas.
Es necesario para que `camera.py` funcione.

- Si está en el repositorio: ya lo tienes al clonar.
- Si **no** está por ser muy pesado para GitHub: descárgalo desde este enlace y colócalo en:
  ```
  ANPR_PROJECT/runs/detect/placas_colombianas/weights/best.pt
  ```
  📥 **Link del modelo:** `[REEMPLAZAR CON LINK DE DRIVE]`

---

## ❓ Problemas comunes

**`ModuleNotFoundError`** → El entorno virtual no está activado. Corre `venv\Scripts\activate` primero.

**`Camera not found`** → Verifica que tu cámara esté conectada y no la esté usando otra app.

**Página en blanco en React** → Revisa que el `.env` tenga las credenciales de Supabase correctas.

**Puerto 5000 ocupado** → Cierra otras apps que usen ese puerto o cambia el puerto en `camera.py`.

