from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import requests  # 用來呼叫火山引擎 API
from werkzeug.utils import secure_filename
from ultralytics import YOLO
import cv2
import numpy as np
import base64

app = Flask(__name__)
CORS(app)  # 允許前端跨域呼叫（重要！）

# 你的火山引擎 API key（最新版）
VOLCANO_API_KEY = "8352dfb4-23f4-4f96-bd5c-33804c7b66e5"

# YOLO 模型（nano 版最快，適合即時）
model = YOLO("yolov8n.pt")  # 如果你有自訂模型，改成你的路徑

# 上傳資料夾
UPLOAD_FOLDER = os.path.join(os.getcwd(), 'assets')
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# 建立資料夾
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'mp4', 'wav'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# 簡單 API key 驗證（開發用，可之後移除）
@app.before_request
def check_api_key():
    if request.method == 'OPTIONS':
        return
    auth_header = request.headers.get('Authorization')
    if not auth_header or auth_header != f"Bearer {VOLCANO_API_KEY}":
        return jsonify({'error': 'Invalid or missing API key'}), 401

@app.route('/saveVideo', methods=['POST'])
def save_video():
    if 'video' not in request.files:
        return jsonify({'error': 'No video file provided'}), 400
    video_file = request.files['video']
    if video_file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    if video_file and allowed_file(video_file.filename):
        filename = secure_filename(video_file.filename)
        save_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        video_file.save(save_path)
        return jsonify({'message': 'Video saved successfully', 'filename': filename})
    return jsonify({'error': 'File type not allowed'}), 400

@app.route('/saveAudio', methods=['POST'])
def save_audio():
    if 'audio' not in request.files:
        return jsonify({'error': 'No audio file provided'}), 400
    audio_file = request.files['audio']
    if audio_file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    if audio_file and allowed_file(audio_file.filename):
        filename = secure_filename(audio_file.filename)
        save_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        audio_file.save(save_path)
        return jsonify({'message': 'Audio saved successfully', 'filename': filename})
    return jsonify({'error': 'File type not allowed'}), 400

@app.route('/detect_objects', methods=['POST'])
def detect_objects():
    data = request.get_json()
    if not data or 'image' not in data:
        return jsonify({'error': 'No image data provided'}), 400

    try:
        img_data = base64.b64decode(data['image'])
        nparr = np.frombuffer(img_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    except Exception as e:
        return jsonify({'error': f'Invalid image data: {str(e)}'}), 400

    results = model(img)
    detections = []
    danger_detected = False

    for r in results:
        for box in r.boxes:
            cls_id = int(box.cls)
            label = r.names[cls_id]
            conf = float(box.conf)
            if conf > 0.5:
                detection = {
                    'label': label,
                    'confidence': conf,
                    'box': [int(x) for x in box.xyxy[0]]  # [x1,y1,x2,y2]
                }
                detections.append(detection)
                if label in ['knife', 'gun', 'scissors', 'blade']:
                    danger_detected = True

    return jsonify({
        'detections': detections,
        'danger_detected': danger_detected,
        'message': 'Danger object detected! Call 2389 2222' if danger_detected else 'No danger detected'
    })

# 聊天路由：使用火山引擎 Ark 生成回應
@app.route('/chat', methods=['POST'])
def chat():
    data = request.get_json()
    if not data or 'message' not in data:
        return jsonify({'error': 'No message provided'}), 400

    user_message = data['message']
    emotion = data.get('emotion', 'neutral')

    # 系統 prompt（廣東話優先 + 危機處理）
    system_prompt = """
    你係一個溫柔嘅香港陪伴AI，主要用香港廣東話回應，用口語化、親切嘅語氣，加入「啦」「喎」「呀」「好唔好」等詞。
    回應要簡短自然（1-3句）。永遠先認同用戶情緒，再安慰或引導。
    如果情緒係 sad/fear/angry 高，或用戶講「不想活」「結束」「自殺」等詞，溫柔提醒求助：香港撒瑪利亞會 24小時熱線 2389 2222。
    你唔係專業治療師，但會一直陪住佢。
    """

    try:
        headers = {
            "Authorization": f"Bearer {VOLCANO_API_KEY}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": "doubao-pro-32k",  # 改成你火山后台啟用的模型名，例如 doubao-lite-4k、doubao-pro-32k 等
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"用戶情緒：{emotion}\n用戶說：{user_message}"}
            ],
            "temperature": 0.7,
            "max_tokens": 150
        }
        # 火山引擎 endpoint（北京 region）
        response = requests.post("https://ark.cn-beijing.volcengine.com/api/v3/chat/completions", json=payload, headers=headers)
        response.raise_for_status()
        ai_reply = response.json()['choices'][0]['message']['content'].strip()
        return jsonify({'response': ai_reply})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)