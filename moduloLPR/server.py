from flask import Flask, jsonify, Response
from flask_cors import CORS
import cv2
from ultralytics import YOLO
import datetime
import easyocr
import base64
import threading
import re  # 🔥 NUEVO

app = Flask(__name__)
CORS(app)

model = YOLO("runs/detect/placas_colombianas/weights/best.pt")
reader = easyocr.Reader(['es'])

historial_detecciones = []

# 🔥 Cámara única
camera = cv2.VideoCapture(0, cv2.CAP_DSHOW)
camera.set(3, 640)
camera.set(4, 480)

print("📷 Cámara abierta. Buscando placa...")

frame_actual = None
frame_count = 0


def camara_vigilancia():
    global historial_detecciones, frame_actual, frame_count

    print("🚀 Cámara de vigilancia encendida...")

    while True:
        success, frame = camera.read()

        if not success:
            continue

        # 🔥 Reducir resolución
        frame = cv2.resize(frame, (640, 480))

        frame_count += 1

        # 🔥 Mostrar SIEMPRE el frame (fluido)
        frame_actual = frame.copy()

        # 🔥 Procesar cada 5 frames
        if frame_count % 5 != 0:
            continue

        results = model(frame, verbose=False)

        for result in results:
            for box in result.boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                confianza_yolo = float(box.conf[0])

                # 🔥 Filtro YOLO
                if confianza_yolo < 0.6:
                    continue

                cv2.rectangle(frame_actual, (x1, y1), (x2, y2), (0, 255, 0), 2)

                placa_recortada = frame[y1:y2, x1:x2]

                if placa_recortada.size > 0:
                    gray = cv2.cvtColor(placa_recortada, cv2.COLOR_BGR2GRAY)

                    ocr_result = reader.readtext(gray)

                    for (_, text, prob) in ocr_result:
                        if prob > 0.5:

                            # 🔥 LIMPIAR (solo letras y números)
                            texto_placa = re.sub(r'[^A-Z0-9]', '', text.upper())

                            # 🔥 VALIDAR LONGITUD
                            if not (5 <= len(texto_placa) <= 7):
                                continue

                            # 🔥 VALIDAR FORMATO GENERAL
                            if not re.match(r'^[A-Z0-9]{5,7}$', texto_placa):
                                continue

                            # 🔥 EVITAR DUPLICADOS
                            if historial_detecciones and historial_detecciones[0]['placa'] == texto_placa:
                                continue

                            # 🔥 Imagen optimizada
                            _, buffer = cv2.imencode(
                                '.jpg',
                                frame_actual,
                                [int(cv2.IMWRITE_JPEG_QUALITY), 70]
                            )

                            img_base64 = base64.b64encode(buffer).decode('utf-8')

                            nueva = {
                                "id": len(historial_detecciones) + 1,
                                "placa": texto_placa,
                                "hora": datetime.datetime.now().strftime("%H:%M:%S"),
                                "precision_ocr": round(prob * 100, 2),
                                "precision_yolo": round(confianza_yolo * 100, 2),
                                "foto": f"data:image/jpeg;base64,{img_base64}"
                            }

                            historial_detecciones.insert(0, nueva)

                            print(f"✅ {texto_placa}")


# 🔥 STREAM
def generar_frames():
    global frame_actual

    while True:
        if frame_actual is None:
            continue

        ret, buffer = cv2.imencode(
            '.jpg',
            frame_actual,
            [int(cv2.IMWRITE_JPEG_QUALITY), 70]
        )

        frame_bytes = buffer.tobytes()

        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')


@app.route('/video_feed')
def video_feed():
    return Response(
        generar_frames(),
        mimetype='multipart/x-mixed-replace; boundary=frame'
    )


@app.route('/api/detecciones')
def obtener_detecciones():
    return jsonify(historial_detecciones)


if __name__ == '__main__':
    hilo = threading.Thread(target=camara_vigilancia, daemon=True)
    hilo.start()

    app.run(debug=False, port=5000)