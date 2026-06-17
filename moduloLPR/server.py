"""
server.py — Módulo LPR local
Conecta con Supabase para leer cámaras registradas, captura video directamente
del celular (IP Webcam), corre YOLO + OCR y guarda detecciones en Supabase.
Flask expone /video_feed/entrada y /video_feed/salida para el monitor en vivo.
"""

import os
import re
import time
import base64
import queue
import threading
import datetime
from collections import Counter

import cv2
import numpy as np
import requests
from dotenv import load_dotenv
from flask import Flask, Response, jsonify
from flask_cors import CORS
from ultralytics import YOLO
import easyocr
from supabase import create_client, Client, ClientOptions

# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURACIÓN
# ─────────────────────────────────────────────────────────────────────────────
load_dotenv()

SUPABASE_URL  = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY  = os.getenv("SUPABASE_KEY", "")   # service_role key (bypass RLS)
ID_PROYECTO   = os.getenv("ID_PROYECTO",  "")
FLASK_PORT    = int(os.getenv("FLASK_PORT", "5000"))

# Ajustes de detección
CONF_YOLO_MIN    = 0.40   # confianza mínima YOLO
CONF_OCR_MIN     = 0.50   # confianza mínima OCR (un poco más baja para carros en movimiento)
PROCESAR_CADA_N  = 2      # procesar YOLO cada N frames (2 = más oportunidades de captura)
VOTOS_NECESARIOS = 2      # cuántas veces debe aparecer la misma placa en la ventana de tiempo
VENTANA_VOTOS_S  = 1.5    # segundos que dura la ventana de votación
COOLDOWN_PLACA_S = 30     # segundos antes de volver a registrar la misma placa
STREAM_QUALITY   = 65
FOTO_QUALITY     = 80
STREAM_ANCHO     = 640
STREAM_ALTO      = 480
STREAM_SLEEP     = 0.033  # ~30 fps

# ─────────────────────────────────────────────────────────────────────────────
# ESTADO GLOBAL (una instancia por cámara: 'entrada' y 'salida')
# ─────────────────────────────────────────────────────────────────────────────
camaras_activas: dict[str, dict] = {}
# Estructura por cámara:
# {
#   "id_camara": int,
#   "nombre": str,
#   "ip": str,
#   "funcion": "ENTRADA" | "SALIDA",
#   "frame_actual": np.ndarray | None,
#   "frame_lock": threading.Lock,
#   "frame_queue": queue.Queue,
#   "conectado": bool,
# }

# Cooldown global de placas (compartido entre entrada y salida)
placas_recientes: dict[str, float] = {}
placas_lock = threading.Lock()

# Votos acumulados por cámara: { rol: { placa: [(texto, timestamp), ...] } }
votos: dict[str, list] = {"entrada": [], "salida": []}
votos_lock = threading.Lock()

# ─────────────────────────────────────────────────────────────────────────────
# MODELOS (se cargan una sola vez)
# ─────────────────────────────────────────────────────────────────────────────
print("Cargando modelo YOLO...")
model = YOLO("runs/detect/placas_colombianas/weights/best.pt")
print("Cargando EasyOCR...")
reader = easyocr.Reader(['en'], gpu=False)
print("Modelos listos.\n")

# ─────────────────────────────────────────────────────────────────────────────
# SUPABASE
# ─────────────────────────────────────────────────────────────────────────────
def get_supabase() -> Client:
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise ValueError("Faltan SUPABASE_URL o SUPABASE_KEY en el archivo .env")
    opciones = ClientOptions(schema="platevision")
    return create_client(SUPABASE_URL, SUPABASE_KEY, options=opciones)

def cargar_camaras_proyecto(sb: Client) -> list[dict]:
    """Lee la tabla 'camara' filtrando por ID_PROYECTO y estado activo."""
    resp = sb.table("camara") \
             .select("id_camara, nombre, ip, funcion, estado") \
             .eq("id_proyecto", ID_PROYECTO) \
             .eq("estado", "A") \
             .execute()
    return resp.data or []


def insertar_registro(sb: Client, rol: str, placa: str, foto_b64: str):
    """
    Inserta un nuevo registro en registros_estadia.
    - Si rol == 'ENTRADA': crea registro nuevo con fecha_ingreso
    - Si rol == 'SALIDA':  busca registro abierto y lo cierra con fecha_salida
    """
    camara = camaras_activas.get(rol)
    if not camara:
        return

    ahora = datetime.datetime.utcnow().isoformat()
    foto_url = f"data:image/jpeg;base64,{foto_b64}"

    if rol == "entrada":
        payload = {
            "id_proyecto":       ID_PROYECTO,
            "id_camara_entrada": camara["id_camara"],
            "placa_capturada":   placa,
            "fecha_ingreso":     ahora,
            "foto_entrada_url":  foto_url,
            "estado":            "ADENTRO",
        }
        resp = sb.table("registros_estadia").insert(payload).execute()
        print(f"  [supabase] ✓ Ingreso registrado: {placa}")

    elif rol == "salida":
        # Buscar el registro abierto más reciente de esta placa
        resp = sb.table("registros_estadia") \
                 .select("id_registro") \
                 .eq("id_proyecto", ID_PROYECTO) \
                 .eq("placa_capturada", placa) \
                 .eq("estado", "ADENTRO") \
                 .order("fecha_ingreso", desc=True) \
                 .limit(1) \
                 .execute()

        if not resp.data:
            # Placa no estaba adentro — crear registro de todas formas
            payload = {
                "id_proyecto":      ID_PROYECTO,
                "id_camara_salida": camara["id_camara"],
                "placa_capturada":  placa,
                "fecha_salida":     ahora,
                "foto_salida_url":  foto_url,
                "estado":           "AFUERA",
            }
            sb.table("registros_estadia").insert(payload).execute()
            print(f"  [supabase] ⚠ Salida sin ingreso previo: {placa}")
        else:
            id_reg = resp.data[0]["id_registro"]
            sb.table("registros_estadia").update({
                "id_camara_salida": camara["id_camara"],
                "fecha_salida":     ahora,
                "foto_salida_url":  foto_url,
                "estado":           "AFUERA",
            }).eq("id_registro", id_reg).execute()
            print(f"  [supabase] ✓ Salida registrada: {placa}")


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS DE CAPTURA
# ─────────────────────────────────────────────────────────────────────────────
def _formatear_url(ip_raw: str) -> list[str]:
    """
    Dada una IP como '192.168.1.8:8080', devuelve lista de URLs a probar
    en orden de prioridad para IP Webcam / DroidCam.
    """
    ip = ip_raw.strip()

    # Si ya es una URL completa (rtsp://, http://, etc.) la usamos directo
    if ip.startswith(("rtsp://", "http://", "https://")):
        return [ip]

    base = f"http://{ip}"
    return [
        f"{base}/video",
        f"{base}/video?dummy=param.mjpg",
        f"{base}/videofeed",
        f"{base}/mjpegfeed",
        f"{base}/shot.jpg",   # fallback foto estática
    ]


def _abrir_fuente(url: str):
    """Intenta abrir la URL con OpenCV. Retorna (cap, tipo) o (None, None)."""
    # Fallback foto estática
    if url.endswith((".jpg", ".jpeg", ".png")):
        try:
            r = requests.get(url, timeout=3)
            if r.status_code == 200:
                return url, "foto"
        except Exception:
            pass
        return None, None

    cap = cv2.VideoCapture(url)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)          # ← clave para baja latencia
    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  STREAM_ANCHO)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, STREAM_ALTO)
    cap.set(cv2.CAP_PROP_FPS, 30)
    if cap.isOpened():
        ok, _ = cap.read()
        if ok:
            return cap, "stream"
    cap.release()
    return None, None


# ─────────────────────────────────────────────────────────────────────────────
# OCR
# ─────────────────────────────────────────────────────────────────────────────
def procesar_imagen_ocr(img: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.bilateralFilter(gray, 11, 17, 17)
    thresh = cv2.adaptiveThreshold(
        gray, 255,
        cv2.ADAPTIVE_THRESH_MEAN_C,
        cv2.THRESH_BINARY, 11, 2
    )
    return thresh

def combinar_fragmentos_ocr(ocr_result: list) -> str:
    """
    Une todos los textos del OCR de un recorte en un solo string,
    ordenados de izquierda a derecha por su posición x.
    """
    # Ordenar por coordenada x del punto superior izquierdo
    ordenados = sorted(ocr_result, key=lambda r: r[0][0][0])
    textos = [re.sub(r'[^A-Z0-9]', '', text.upper()) for (_, text, _) in ordenados]
    return ''.join(textos)


def validar_placa(texto: str) -> bool:
    """Formato placa colombiana: ABC123 o ABC12D."""
    return bool(re.match(r'^[A-Z]{3}[0-9]{2,3}[A-Z0-9]?$', texto))


# ─────────────────────────────────────────────────────────────────────────────
# SISTEMA DE VOTACIÓN — evita falsas detecciones en carros en movimiento
# ─────────────────────────────────────────────────────────────────────────────
def registrar_voto(rol: str, texto: str) -> str | None:
    """
    Agrega un voto para 'texto' en el rol dado.
    Si la misma placa aparece VOTOS_NECESARIOS veces en VENTANA_VOTOS_S segundos
    devuelve el texto ganador; si no, devuelve None.
    """
    ahora = time.time()
    with votos_lock:
        # Limpiar votos viejos
        votos[rol] = [(t, ts) for t, ts in votos[rol] if ahora - ts < VENTANA_VOTOS_S]
        # Agregar voto nuevo
        votos[rol].append((texto, ahora))
        # Contar
        conteo = Counter(t for t, _ in votos[rol])
        ganador, cantidad = conteo.most_common(1)[0]
        if cantidad >= VOTOS_NECESARIOS:
            votos[rol].clear()  # reset para próxima placa
            return ganador
    return None


# ─────────────────────────────────────────────────────────────────────────────
# HILO DE CAPTURA — uno por cámara activa
# ─────────────────────────────────────────────────────────────────────────────
def hilo_captura(rol: str):
    """Lee frames de la fuente y los pone en el queue de la cámara."""
    estado = camaras_activas[rol]
    ip_raw = estado["ip"]
    urls   = _formatear_url(ip_raw)

    print(f"[{rol}] Intentando conectar a {ip_raw}...")

    fuente = None
    tipo   = None
    backoff = 3

    while True:
        # Buscar fuente disponible
        for url in urls:
            fuente, tipo = _abrir_fuente(url)
            if fuente:
                print(f"[{rol}] ✓ Conectado: {url}")
                estado["conectado"] = True
                break
        else:
            print(f"[{rol}] ✗ Sin fuente. Reintentando en {backoff}s...")
            estado["conectado"] = False
            time.sleep(backoff)
            backoff = min(backoff * 2, 60)
            continue

        backoff = 3

        # Loop de captura
        try:
            if tipo == "foto":
                _loop_foto(rol, fuente)
            else:
                _loop_stream(rol, fuente)
        except Exception as e:
            print(f"[{rol}] Conexión perdida: {e}")
            estado["conectado"] = False
            try:
                fuente.release()
            except Exception:
                pass


def _loop_stream(rol: str, cap):
    estado = camaras_activas[rol]
    while True:
        ok, frame = cap.read()
        if not ok:
            raise ConnectionError("Stream interrumpido")

        frame = cv2.resize(frame, (STREAM_ANCHO, STREAM_ALTO))

        with estado["frame_lock"]:
            estado["frame_actual"] = frame.copy()

        # Descartar frame anterior si el queue está lleno (siempre frame fresco)
        try:
            estado["frame_queue"].get_nowait()
        except queue.Empty:
            pass
        estado["frame_queue"].put(frame)


def _loop_foto(rol: str, url: str):
    """Fallback: descarga foto estática repetidamente (~3 fps)."""
    estado = camaras_activas[rol]
    while True:
        try:
            r = requests.get(url, timeout=3)
            if r.status_code != 200:
                raise ConnectionError(f"HTTP {r.status_code}")
            arr = np.frombuffer(r.content, np.uint8)
            frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if frame is None:
                raise ConnectionError("Frame vacío")
            frame = cv2.resize(frame, (STREAM_ANCHO, STREAM_ALTO))
            with estado["frame_lock"]:
                estado["frame_actual"] = frame.copy()
            try:
                estado["frame_queue"].get_nowait()
            except queue.Empty:
                pass
            estado["frame_queue"].put(frame)
        except Exception as e:
            raise ConnectionError(f"Endpoint foto no disponible: {e}")
        time.sleep(0.33)


# ─────────────────────────────────────────────────────────────────────────────
# HILO DE PROCESAMIENTO — uno por cámara activa
# ─────────────────────────────────────────────────────────────────────────────
import time  # ya está importado

def hilo_procesamiento(rol: str, sb: Client):
    """Consume frames del queue, corre YOLO + OCR, vota y registra en Supabase."""
    estado      = camaras_activas[rol]
    frame_count = 0
    print(f"[{rol}] Hilo de procesamiento iniciado")

    while True:
        try:
            frame = estado["frame_queue"].get(timeout=1.0)
        except queue.Empty:
            continue

        frame_count += 1
        if frame_count % PROCESAR_CADA_N != 0:
            continue

        # Medir tiempo YOLO
        t0 = time.time()
        results = model(frame, verbose=False)
        print(f"[{rol}] YOLO tardó: {(time.time()-t0)*1000:.0f}ms  |  boxes: {sum(len(r.boxes) for r in results)}")

        for result in results:
            for box in result.boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                confianza_yolo  = float(box.conf[0])

                print(f"[{rol}] Box — confianza: {confianza_yolo:.2f}  recorte:{x2-x1}x{y2-y1}px")

                if confianza_yolo < CONF_YOLO_MIN:
                    continue

                recorte = frame[y1:y2, x1:x2]
                if recorte.size == 0:
                    continue

                recorte_proc = procesar_imagen_ocr(recorte)
                ocr_result   = reader.readtext(recorte_proc)

                print(f"[{rol}] OCR raw: {[(text, round(prob,2)) for (_,text,prob) in ocr_result]}")
                print(f"[{rol}] Combinado: '{combinar_fragmentos_ocr(ocr_result) if ocr_result else ''}'")

                if not ocr_result:
                    continue

                candidatos = []

                texto_combinado = combinar_fragmentos_ocr(ocr_result)
                if 5 <= len(texto_combinado) <= 7 and validar_placa(texto_combinado):
                    prob_min = min(prob for (_, _, prob) in ocr_result)
                    if prob_min >= CONF_OCR_MIN:
                        candidatos.append((texto_combinado, prob_min))

                for (_, text, prob) in ocr_result:
                    if prob < CONF_OCR_MIN:
                        continue
                    texto = re.sub(r'[^A-Z0-9]', '', text.upper())
                    if 5 <= len(texto) <= 7 and validar_placa(texto):
                        if texto not in [c[0] for c in candidatos]:
                            candidatos.append((texto, prob))

                for texto, prob in candidatos:
                    print(f"[{rol}] Candidato: {texto}  YOLO:{confianza_yolo:.2f}  OCR:{prob:.2f}")

                    ganador = registrar_voto(rol, texto)
                    if not ganador:
                        continue

                    with placas_lock:
                        ultima = placas_recientes.get(f"{rol}:{ganador}", 0)
                        if time.time() - ultima < COOLDOWN_PLACA_S:
                            print(f"[{rol}] Cooldown activo para {ganador}")
                            continue
                        placas_recientes[f"{rol}:{ganador}"] = time.time()

                    with estado["frame_lock"]:
                        if estado["frame_actual"] is not None:
                            f = estado["frame_actual"]
                            cv2.rectangle(f, (x1, y1), (x2, y2), (0, 255, 0), 2)
                            cv2.putText(
                                f, ganador,
                                (x1, max(y1 - 10, 14)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2
                            )
                            _, buf = cv2.imencode(
                                '.jpg', f,
                                [int(cv2.IMWRITE_JPEG_QUALITY), FOTO_QUALITY]
                            )
                            foto_b64 = base64.b64encode(buf).decode('utf-8')

                    print(f"[{rol}] ✓ CONFIRMADO: {ganador}")

                    try:
                        insertar_registro(sb, rol, ganador, foto_b64)
                    except Exception as e:
                        print(f"[{rol}] ✗ Error Supabase: {e}")
# ─────────────────────────────────────────────────────────────────────────────
# FLASK — STREAM MJPEG
# ─────────────────────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)

def _generar_frames(rol: str):
    """Generador MJPEG para el rol dado."""
    placeholder = None

    while True:
        estado = camaras_activas.get(rol)

        if estado is None:
            # Cámara no configurada
            if placeholder is None:
                placeholder = np.zeros((STREAM_ALTO, STREAM_ANCHO, 3), dtype=np.uint8)
                cv2.putText(
                    placeholder, f"Camara '{rol}' no activa",
                    (80, STREAM_ALTO // 2),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.9, (100, 100, 100), 2
                )
            frame = placeholder
        else:
            with estado["frame_lock"]:
                frame = estado["frame_actual"].copy() if estado["frame_actual"] is not None else None

            if frame is None:
                if placeholder is None:
                    placeholder = np.zeros((STREAM_ALTO, STREAM_ANCHO, 3), dtype=np.uint8)
                    cv2.putText(
                        placeholder, "Conectando...",
                        (180, STREAM_ALTO // 2),
                        cv2.FONT_HERSHEY_SIMPLEX, 1.0, (180, 180, 180), 2
                    )
                frame = placeholder
            else:
                placeholder = None  # reset placeholder cuando hay señal

        ret, buffer = cv2.imencode(
            '.jpg', frame,
            [int(cv2.IMWRITE_JPEG_QUALITY), STREAM_QUALITY]
        )
        if ret:
            yield (
                b'--frame\r\n'
                b'Content-Type: image/jpeg\r\n\r\n'
                + buffer.tobytes()
                + b'\r\n'
            )
        time.sleep(STREAM_SLEEP)


@app.route('/video_feed/entrada')
def video_feed_entrada():
    return Response(
        _generar_frames("entrada"),
        mimetype='multipart/x-mixed-replace; boundary=frame'
    )


@app.route('/video_feed/salida')
def video_feed_salida():
    return Response(
        _generar_frames("salida"),
        mimetype='multipart/x-mixed-replace; boundary=frame'
    )


@app.route('/api/status')
def api_status():
    status = {}
    for rol, estado in camaras_activas.items():
        status[rol] = {
            "nombre":    estado["nombre"],
            "ip":        estado["ip"],
            "conectado": estado["conectado"],
        }
    return jsonify({"activas": status, "proyecto": ID_PROYECTO})


# ─────────────────────────────────────────────────────────────────────────────
# MENÚ DE CONSOLA
# ─────────────────────────────────────────────────────────────────────────────
def _crear_estado_camara(cam: dict) -> dict:
    return {
        "id_camara": cam["id_camara"],
        "nombre":    cam["nombre"],
        "ip":        cam["ip"],
        "funcion":   cam["funcion"],
        "frame_actual": None,
        "frame_lock":   threading.Lock(),
        "frame_queue":  queue.Queue(maxsize=2),
        "conectado":    False,
    }


def menu_consola(camaras: list[dict], sb: Client):
    """Muestra las cámaras disponibles y el operador elige cuáles activar."""

    entradas = [c for c in camaras if c["funcion"] == "ENTRADA"]
    salidas  = [c for c in camaras if c["funcion"] == "SALIDA"]

    print("\n" + "="*50)
    print("  PlateVision — Módulo LPR")
    print("="*50)
    print(f"  Proyecto: {ID_PROYECTO}")
    print(f"  Cámaras activas en BD: {len(camaras)}\n")

    # ── Elegir cámara de ENTRADA ──────────────────────────────────────────
    if not entradas:
        print("⚠  No hay cámaras de ENTRADA registradas en este proyecto.")
        print("   Registra una desde la web antes de continuar.\n")
    else:
        print("Cámaras de ENTRADA disponibles:")
        for i, c in enumerate(entradas):
            print(f"  [{i+1}] {c['nombre']}  —  {c['ip']}")
        print("  [0] No usar cámara de entrada\n")

        while True:
            try:
                op = int(input("Selecciona cámara de entrada: "))
                if op == 0:
                    break
                if 1 <= op <= len(entradas):
                    cam = entradas[op - 1]
                    camaras_activas["entrada"] = _crear_estado_camara(cam)
                    print(f"  ✓ Entrada: {cam['nombre']} ({cam['ip']})\n")
                    break
                print("  Opción inválida.")
            except ValueError:
                print("  Ingresa un número.")

    # ── Elegir cámara de SALIDA ───────────────────────────────────────────
    if not salidas:
        print("ℹ  No hay cámaras de SALIDA registradas. El sistema funcionará solo con entrada.\n")
    else:
        print("Cámaras de SALIDA disponibles:")
        for i, c in enumerate(salidas):
            print(f"  [{i+1}] {c['nombre']}  —  {c['ip']}")
        print("  [0] No usar cámara de salida\n")

        while True:
            try:
                op = int(input("Selecciona cámara de salida: "))
                if op == 0:
                    break
                if 1 <= op <= len(salidas):
                    cam = salidas[op - 1]
                    camaras_activas["salida"] = _crear_estado_camara(cam)
                    print(f"  ✓ Salida: {cam['nombre']} ({cam['ip']})\n")
                    break
                print("  Opción inválida.")
            except ValueError:
                print("  Ingresa un número.")

    if not camaras_activas:
        print("✗ No se seleccionó ninguna cámara. Saliendo.")
        exit(1)

    # ── Arrancar hilos ────────────────────────────────────────────────────
    for rol in camaras_activas:
        threading.Thread(
            target=hilo_captura,
            args=(rol,),
            daemon=True,
            name=f"captura-{rol}"
        ).start()
        threading.Thread(
            target=hilo_procesamiento,
            args=(rol, sb),
            daemon=True,
            name=f"proceso-{rol}"
        ).start()

    print("="*50)
    print("  Hilos iniciados. Servidor Flask corriendo.\n")
    print(f"  Stream entrada: http://localhost:{FLASK_PORT}/video_feed/entrada")
    print(f"  Stream salida:  http://localhost:{FLASK_PORT}/video_feed/salida")
    print(f"  Status:         http://localhost:{FLASK_PORT}/api/status")
    print("\n  Para exponer a internet (Netlify):")
    print(f"  → ngrok http {FLASK_PORT}")
    print("  → Copia la URL https://xxxx.ngrok.io y úsala en el monitor en vivo")
    print("="*50 + "\n")


# ─────────────────────────────────────────────────────────────────────────────
# ARRANQUE
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    # Validar configuración
    if not all([SUPABASE_URL, SUPABASE_KEY, ID_PROYECTO]):
        print("✗ ERROR: Faltan variables en el archivo .env")
        print("  Crea un archivo .env con SUPABASE_URL, SUPABASE_KEY e ID_PROYECTO")
        exit(1)

    # Conectar a Supabase
    print("Conectando a Supabase...")
    try:
        sb = get_supabase()
        camaras_bd = cargar_camaras_proyecto(sb)
        print(f"✓ {len(camaras_bd)} cámara(s) encontrada(s) en el proyecto.\n")
    except Exception as e:
        print(f"✗ Error conectando a Supabase: {e}")
        exit(1)

    if not camaras_bd:
        print("✗ No hay cámaras activas registradas para este proyecto.")
        print("  Regístralas desde la web antes de arrancar el servidor.")
        exit(1)

    # Menú de selección
    menu_consola(camaras_bd, sb)

    # Arrancar Flask (bloqueante)
    app.run(debug=False, port=FLASK_PORT, threaded=True)