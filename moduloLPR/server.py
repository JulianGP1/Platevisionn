from flask import Flask, jsonify, Response, request
from flask_cors import CORS
import cv2
from ultralytics import YOLO
import datetime
import easyocr
import base64
import threading
import time
import queue
import re
import requests
import numpy as np

app = Flask(__name__)
CORS(app)

# ─────────────────────────────────────────────────────────────────────────────
# MODELOS
# ─────────────────────────────────────────────────────────────────────────────
model = YOLO("runs/detect/placas_colombianas/weights/best.pt")
reader = easyocr.Reader(['en'], gpu=False)

# ─────────────────────────────────────────────────────────────────────────────
# ESTADO GLOBAL
# ─────────────────────────────────────────────────────────────────────────────
historial_detecciones = []
historial_lock = threading.Lock()

# Frame compartido entre hilos (hilo-captura escribe, hilo-stream lee)
frame_actual = None
frame_lock = threading.Lock()

# Cola captura → procesamiento  (maxsize=2 descarta frames viejos automáticamente)
frame_queue = queue.Queue(maxsize=2)

# Configuración de cámara (modificable en caliente via /api/config)
camara_config = {
    "tipo": "local",          # "local" | "ip" | "rtsp"
    "ip": "192.168.1.8",
    "puerto": "8080",
    "indice_local": 0,        # índice de webcam local
    "url_personalizada": ""   # si tipo == "rtsp", se usa directo
}
config_lock = threading.Lock()

# Evento que le dice al hilo de captura que debe reiniciarse con nueva config
reiniciar_evento = threading.Event()

# Estado de conexión visible desde /api/status
estado_conexion = {
    "conectado": False,
    "fuente": "",
    "intentos": 0,
    "ultimo_error": ""
}
estado_lock = threading.Lock()

# Cooldown por placa para no repetir detecciones
ultimas_placas = {}
TIEMPO_REPETICION = 5  # segundos

# ─────────────────────────────────────────────────────────────────────────────
# AJUSTES DE RENDIMIENTO
# ─────────────────────────────────────────────────────────────────────────────
CONF_YOLO_MIN    = 0.65   # umbral mínimo confianza YOLO
CONF_OCR_MIN     = 0.60   # umbral mínimo confianza OCR
PROCESAR_CADA_N  = 4      # procesar YOLO cada N frames
STREAM_SLEEP     = 0.033  # ~30 fps en stream
STREAM_QUALITY   = 70     # calidad JPEG stream al frontend
FOTO_QUALITY     = 75     # calidad JPEG foto guardada en historial
STREAM_ANCHO     = 640    # ancho al que se redimensiona el stream
STREAM_ALTO      = 480


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────
def _set_estado(conectado, fuente="", error=""):
    with estado_lock:
        estado_conexion["conectado"] = conectado
        if fuente:
            estado_conexion["fuente"] = fuente
        if error:
            estado_conexion["ultimo_error"] = error
            estado_conexion["intentos"] += 1


def _build_urls():
    """Construye lista de URLs a probar según la configuración actual."""
    with config_lock:
        cfg = camara_config.copy()

    if cfg["tipo"] == "local":
        return [("local", cfg["indice_local"])]

    if cfg["tipo"] == "rtsp" and cfg["url_personalizada"]:
        return [("stream", cfg["url_personalizada"])]

    # tipo == "ip" (celular con IP Webcam / DroidCam / etc.)
    ip, puerto = cfg["ip"].strip(), cfg["puerto"].strip()
    base = f"http://{ip}:{puerto}"
    return [
        ("stream", f"{base}/video"),
        ("stream", f"{base}/video?dummy=param.mjpg"),
        ("stream", f"{base}/videofeed"),
        ("stream", f"{base}/mjpegfeed"),
        ("foto",   f"{base}/shot.jpg"),      # fallback foto estática
    ]


def _probar_fuente(tipo, url):
    """Intenta abrir la fuente; retorna (True, cap_or_url) o (False, motivo)."""
    try:
        if tipo == "local":
            cap = cv2.VideoCapture(url)
            cap.set(cv2.CAP_PROP_FRAME_WIDTH,  STREAM_ANCHO)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, STREAM_ALTO)
            cap.set(cv2.CAP_PROP_FPS, 30)
            if cap.isOpened():
                ok, _ = cap.read()
                if ok:
                    return True, cap
            cap.release()
            return False, "No se pudo abrir webcam local"

        if tipo == "foto":
            r = requests.get(url, timeout=3)
            if r.status_code == 200:
                return True, url
            return False, f"HTTP {r.status_code}"

        # tipo == "stream"
        cap = cv2.VideoCapture(url)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        if cap.isOpened():
            ok, _ = cap.read()
            if ok:
                return True, cap
        cap.release()
        return False, "Stream no responde"

    except Exception as e:
        return False, str(e)


def _detectar_fuente():
    """Prueba todas las URLs hasta encontrar una disponible."""
    urls = _build_urls()
    for tipo, url in urls:
        print(f"  [captura] Probando {tipo}: {url}")
        ok, resultado = _probar_fuente(tipo, url)
        if ok:
            label = url if isinstance(url, str) else f"webcam:{url}"
            print(f"  [captura] ✓ OK → {label}")
            _set_estado(True, fuente=label)
            return tipo, resultado
    return None, "Sin fuente disponible"


# ─────────────────────────────────────────────────────────────────────────────
# PREPROCESAMIENTO OCR
# ─────────────────────────────────────────────────────────────────────────────
def procesar_imagen_ocr(img):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.bilateralFilter(gray, 11, 17, 17)
    thresh = cv2.adaptiveThreshold(
        gray, 255,
        cv2.ADAPTIVE_THRESH_MEAN_C,
        cv2.THRESH_BINARY,
        11, 2
    )
    return thresh


def validar_placa(texto):
    """Valida formato de placa colombiana: ABC123 o ABC12D."""
    return bool(re.match(r'^[A-Z]{3}[0-9]{2,3}[A-Z0-9]?$', texto))


# ─────────────────────────────────────────────────────────────────────────────
# HILO 1 — CAPTURA
# Única responsabilidad: obtener frames y meterlos en frame_queue.
# Se reconecta automáticamente con backoff exponencial.
# ─────────────────────────────────────────────────────────────────────────────
def hilo_captura():
    global frame_actual

    print("[captura] Hilo iniciado")
    backoff = 3  # segundos de espera antes de reintentar

    while True:
        # ¿Llegó una señal de reconfiguración?
        reiniciar_evento.clear()

        print("[captura] Buscando fuente de video...")
        _set_estado(False, error="Buscando fuente...")
        tipo, fuente = _detectar_fuente()

        if tipo is None:
            print(f"[captura] ✗ {fuente} — reintentando en {backoff}s")
            _set_estado(False, error=fuente)
            # Espera backoff o hasta que llegue señal de reconfiguración
            reiniciar_evento.wait(timeout=backoff)
            backoff = min(backoff * 2, 60)
            continue

        backoff = 3  # reset backoff al conectar exitosamente

        try:
            if tipo == "local":
                _capturar_cv2(fuente)
            elif tipo == "stream":
                _capturar_cv2(fuente)
            elif tipo == "foto":
                _capturar_foto(fuente)
        except ConnectionError as e:
            print(f"[captura] Conexión perdida: {e}")
            _set_estado(False, error=str(e))
            try:
                fuente.release()
            except Exception:
                pass

        # Si salimos del loop de captura, esperamos antes de reconectar
        # a menos que haya una señal de reconfiguración inmediata
        if not reiniciar_evento.is_set():
            print(f"[captura] Reconectando en {backoff}s...")
            reiniciar_evento.wait(timeout=backoff)
            backoff = min(backoff * 2, 60)


def _capturar_cv2(cap):
    """Captura frames desde un VideoCapture (local o stream IP)."""
    global frame_actual
    errores = 0

    while not reiniciar_evento.is_set():
        ok, frame = cap.read()

        if not ok:
            errores += 1
            print(f"[captura] Frame fallido ({errores})")
            time.sleep(0.2)
            if errores > 15:
                cap.release()
                raise ConnectionError("Demasiados frames fallidos")
            continue

        errores = 0
        frame = cv2.resize(frame, (STREAM_ANCHO, STREAM_ALTO))

        # Actualizar frame_actual (para el stream en vivo)
        with frame_lock:
            frame_actual = frame.copy()

        # Meter en cola de procesamiento (descarta el más viejo si está llena)
        if frame_queue.full():
            try:
                frame_queue.get_nowait()
            except queue.Empty:
                pass
        frame_queue.put(frame)

    cap.release()


def _capturar_foto(url):
    """Fallback: descarga JPEG repetidamente (~3 fps)."""
    global frame_actual

    while not reiniciar_evento.is_set():
        try:
            resp  = requests.get(url, timeout=3)
            arr   = np.frombuffer(resp.content, np.uint8)
            frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)

            if frame is not None:
                frame = cv2.resize(frame, (STREAM_ANCHO, STREAM_ALTO))

                with frame_lock:
                    frame_actual = frame.copy()

                if frame_queue.full():
                    try:
                        frame_queue.get_nowait()
                    except queue.Empty:
                        pass
                frame_queue.put(frame)

        except Exception as e:
            print(f"[captura-foto] Error: {e}")
            time.sleep(1)
            if not reiniciar_evento.is_set():
                raise ConnectionError(f"Endpoint foto no disponible: {e}")

        time.sleep(0.33)  # ~3 fps para modo foto


# ─────────────────────────────────────────────────────────────────────────────
# HILO 2 — PROCESAMIENTO YOLO + OCR
# Única responsabilidad: consumir frames, detectar placas, actualizar historial.
# ─────────────────────────────────────────────────────────────────────────────
def hilo_procesamiento():
    global frame_actual
    frame_count = 0
    print("[proceso] Hilo iniciado")

    while True:
        try:
            frame = frame_queue.get(timeout=1.0)
        except queue.Empty:
            continue

        frame_count += 1

        # Procesar YOLO solo cada N frames para aliviar CPU
        if frame_count % PROCESAR_CADA_N != 0:
            continue

        results = model(frame, verbose=False)

        for result in results:
            for box in result.boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                confianza_yolo  = float(box.conf[0])

                if confianza_yolo < CONF_YOLO_MIN:
                    continue

                recorte = frame[y1:y2, x1:x2]
                if recorte.size == 0:
                    continue

                recorte_proc = procesar_imagen_ocr(recorte)
                ocr_result   = reader.readtext(recorte_proc)

                for (_, text, prob) in ocr_result:
                    if prob < CONF_OCR_MIN:
                        continue

                    texto = re.sub(r'[^A-Z0-9]', '', text.upper())

                    if not (5 <= len(texto) <= 7):
                        continue

                    if not validar_placa(texto):
                        continue

                    ahora = time.time()
                    if texto in ultimas_placas:
                        if ahora - ultimas_placas[texto] < TIEMPO_REPETICION:
                            continue
                    ultimas_placas[texto] = ahora

                    # Anotar en el frame_actual
                    with frame_lock:
                        if frame_actual is not None:
                            cv2.rectangle(frame_actual, (x1, y1), (x2, y2), (0, 255, 0), 2)
                            cv2.putText(
                                frame_actual, texto,
                                (x1, max(y1 - 10, 14)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2
                            )
                            _, buf = cv2.imencode(
                                '.jpg', frame_actual,
                                [int(cv2.IMWRITE_JPEG_QUALITY), FOTO_QUALITY]
                            )
                            img_b64 = base64.b64encode(buf).decode('utf-8')
                    # Guardar en historial
                    nueva = {
                        "id":           len(historial_detecciones) + 1,
                        "placa":        texto,
                        "hora":         datetime.datetime.now().strftime("%H:%M:%S"),
                        "precision_ocr":  round(prob * 100, 2),
                        "precision_yolo": round(confianza_yolo * 100, 2),
                        "foto":         f"data:image/jpeg;base64,{img_b64}"
                    }
                    with historial_lock:
                        historial_detecciones.insert(0, nueva)

                    print(f"[proceso] ✓ Placa: {texto}  YOLO:{confianza_yolo:.2f}  OCR:{prob:.2f}")


# ─────────────────────────────────────────────────────────────────────────────
# HILO 3 — STREAM MJPEG
# Única responsabilidad: generar el multipart stream hacia el frontend.
# ─────────────────────────────────────────────────────────────────────────────
def generar_frames():
    """Generador MJPEG que Flask usa como Response."""
    placeholder = None  # frame negro de espera

    while True:
        with frame_lock:
            f = frame_actual.copy() if frame_actual is not None else None

        if f is None:
            # Generar frame negro con mensaje si aún no hay señal
            if placeholder is None:
                placeholder = np.zeros((STREAM_ALTO, STREAM_ANCHO, 3), dtype=np.uint8)
                cv2.putText(
                    placeholder, "Esperando camara...",
                    (120, STREAM_ALTO // 2),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.0, (180, 180, 180), 2
                )
            f = placeholder

        ret, buffer = cv2.imencode(
            '.jpg', f,
            [int(cv2.IMWRITE_JPEG_QUALITY), STREAM_QUALITY]
        )
        if not ret:
            time.sleep(STREAM_SLEEP)
            continue

        yield (
            b'--frame\r\n'
            b'Content-Type: image/jpeg\r\n\r\n'
            + buffer.tobytes()
            + b'\r\n'
        )
        time.sleep(STREAM_SLEEP)


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINTS FLASK
# ─────────────────────────────────────────────────────────────────────────────
@app.route('/video_feed')
def video_feed():
    return Response(
        generar_frames(),
        mimetype='multipart/x-mixed-replace; boundary=frame'
    )


@app.route('/api/detecciones')
def obtener_detecciones():
    with historial_lock:
        return jsonify(historial_detecciones.copy())


@app.route('/api/status')
def obtener_status():
    with estado_lock:
        est = estado_conexion.copy()
    with config_lock:
        cfg = camara_config.copy()
    with historial_lock:
        total = len(historial_detecciones)
    return jsonify({
        "conectado":  est["conectado"],
        "fuente":     est["fuente"],
        "intentos":   est["intentos"],
        "error":      est["ultimo_error"],
        "total":      total,
        "config":     cfg
    })


@app.route('/api/config', methods=['POST'])
def actualizar_config():
    """
    Actualiza la configuración de la cámara en caliente.
    Body JSON esperado:
      { "tipo": "local"|"ip"|"rtsp",
        "ip": "192.168.x.x",
        "puerto": "8080",
        "indice_local": 0,
        "url_personalizada": "rtsp://..." }
    """
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"ok": False, "error": "JSON inválido"}), 400

    campos_validos = {"tipo", "ip", "puerto", "indice_local", "url_personalizada"}
    tipos_validos  = {"local", "ip", "rtsp"}

    if "tipo" in data and data["tipo"] not in tipos_validos:
        return jsonify({"ok": False, "error": f"tipo debe ser uno de {tipos_validos}"}), 400

    with config_lock:
        for k, v in data.items():
            if k in campos_validos:
                camara_config[k] = v

    print(f"[config] Nueva configuración: {camara_config}")
    reiniciar_evento.set()   # señal al hilo de captura para reconectar
    return jsonify({"ok": True, "config": camara_config})


@app.route('/api/historial/limpiar', methods=['POST'])
def limpiar_historial():
    with historial_lock:
        historial_detecciones.clear()
    return jsonify({"ok": True})


# ─────────────────────────────────────────────────────────────────────────────
# ARRANQUE
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    threading.Thread(target=hilo_captura,      daemon=True, name="captura").start()
    threading.Thread(target=hilo_procesamiento, daemon=True, name="proceso").start()

    print("🚀 LPR Server corriendo en http://localhost:5000")
    print("   Stream:      /video_feed")
    print("   Detecciones: /api/detecciones")
    print("   Status:      /api/status")
    print("   Config:      POST /api/config")

    app.run(debug=False, port=5000, threaded=True)
