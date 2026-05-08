import cv2
import numpy as np
import base64
import time
from flask import Flask
from flask_socketio import SocketIO, emit
from ultralytics import YOLO

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet")

model = YOLO("yolov8n.pt")

# -----------------------------
# HOMOGRAPHY SETUP
# -----------------------------
SRC_PTS = np.float32([
    [500, 75],
    [900, 75],
    [10, 280],
    [1270, 250]
])

ROAD_W = 14
ROAD_L = 50
SCALE = 20

out_w = int(ROAD_W * SCALE)
out_h = int(ROAD_L * SCALE)

DST_PTS = np.float32([
    [0, 0],
    [out_w, 0],
    [0, out_h],
    [out_w, out_h]
])

H = cv2.getPerspectiveTransform(SRC_PTS, DST_PTS)

LANE_COUNT = 4
LANE_W = out_w / LANE_COUNT
METERS_PER_PIXEL = ROAD_L / out_h

# -----------------------------
# HELPERS
# -----------------------------
def get_bird_points(detections):
    """Transforms pixel coordinates to bird's-eye view (meters*scale)."""
    points = []
    for d in detections:
        x, y, w_box, h_box = d["bbox"]
        cx = x + w_box / 2
        cy = y + h_box 

        pt = np.array([[[cx, cy]]], dtype=np.float32)
        bp = cv2.perspectiveTransform(pt, H)[0][0]

        points.append({
            "bird_x": bp[0],
            "bird_y": bp[1],
            "bbox": d["bbox"],
            "label": d["label"],
            "id": None
        })
    return points

def detect_vehicles(img):
    """Runs YOLO detection and returns base detection objects."""
    results = model(img, verbose=False)[0]
    detections = []

    for box in results.boxes:
        cls = int(box.cls[0])
        label = results.names[cls]
        conf = float(box.conf[0])

        if label in ["car", "motorcycle", "bus", "truck"] and conf > 0.4:
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            detections.append({
                "bbox": [float(x1), float(y1), float(x2 - x1), float(y2 - y1)],
                "label": label
            })
    return detections

# -----------------------------
# MATCH + SPEED
# -----------------------------
next_id = 1

def match_in_bird_view(p1, p2, dt=1.0):
    global next_id
    results = []
    used_p2 = set()

    for a in p1:
        a_lane = int(a["bird_x"] // LANE_W)
        best_j = -1
        best_score = 1e9

        for j, b in enumerate(p2):
            if j in used_p2: continue

            b_lane = int(b["bird_x"] // LANE_W)
            if a_lane != b_lane: continue

            dy = b["bird_y"] - a["bird_y"]
            score = abs(dy)

            if score < best_score:
                best_score = score
                best_j = j

        if best_j != -1:
            used_p2.add(best_j)
            best_b = p2[best_j]
            
            best_b["id"] = a["id"]
            
            dy = best_b["bird_y"] - a["bird_y"]
            dy_m = abs(dy) * METERS_PER_PIXEL
            speed = (dy_m / dt) * 3.6

            results.append({
                "id": int(best_b["id"]),
                "label": best_b["label"],
                "bbox": best_b["bbox"],
                "speed": round(float(speed), 1)
            })


    for b in p2:
        if b["id"] is None:
            b["id"] = next_id
            next_id += 1
            results.append({
                "id": int(b["id"]),
                "label": b["label"],
                "bbox": b["bbox"],
                "speed": 0.0
            })

    return results

# -----------------------------
# SOCKET HANDLER
# -----------------------------
prev_bird_points = None
prev_time = None

import threading
import os


if not os.path.exists("imgs"):
    os.makedirs("imgs")

def save_debug_image(img, detections):
    try:
        vis = img.copy()
        for obj in detections:
            x, y, w, h = obj["bbox"]
            speed = obj["speed"]
            
            cv2.rectangle(vis, (int(x), int(y)), (int(x+w), int(y+h)), (0, 255, 0), 2)

            cv2.putText(vis,
                        f"{speed} km/h",
                        (int(x), int(y)-10),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.8,
                        (0, 255, 0),
                        2)
        
        timestamp = int(time.time() * 1000)
        cv2.imwrite(f"imgs/frame_{timestamp}.jpg", vis)
    except Exception as e:
        print(f"Error saving image: {e}")

@socketio.on("stream_frame")
def handle_frame(data):
    global prev_bird_points, prev_time

    try:
        if 'image' not in data or 'timestamp' not in data:
            return

        img_data = base64.b64decode(data["image"])
        nparr = np.frombuffer(img_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None: return

        now_client = data['timestamp'] / 1000.0
        
        img = cv2.resize(img, (1280, 720))
        
        raw_detections = detect_vehicles(img)
        curr_bird_points = get_bird_points(raw_detections)

        final_results = []

        if prev_bird_points is not None:
            dt = now_client - prev_time if prev_time else 0.1
            if dt <= 0: dt = 0.01
            
            final_results = match_in_bird_view(prev_bird_points, curr_bird_points, dt)
        else:
            global next_id
            for p in curr_bird_points:
                p["id"] = next_id
                next_id += 1
                final_results.append({
                    "id": int(p["id"]),
                    "label": p["label"],
                    "bbox": p["bbox"],
                    "speed": 0.0
                })

        prev_bird_points = curr_bird_points
        prev_time = now_client

        if final_results:
            threading.Thread(target=save_debug_image, args=(img.copy(), final_results)).start()

        emit("result", {
            "detections": final_results,
            "image_size": [1280, 720]
        })
    except Exception as e:
        print(f"Error in handle_frame: {e}")

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000, debug=False)