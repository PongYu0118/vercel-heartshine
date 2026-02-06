// ========================================================
// 心晴情緒陪伴軟件 - 主邏輯檔案 (main.js)
// 畢業專案 by samuel
// 2026 年 1 月 29 日最新版本
// 功能：實時臉部情緒偵測 + 語音/文字輸入 + 廣東話陪伴
// 原創部分：危機警示彈窗、香港撒瑪利亞會熱線整合、
//           物件文字偵測提示、真實後端 API 呼叫 (/chat)
// 後端連線：http://localhost:5000/chat (已接入 OpenAI)
// ========================================================

document.addEventListener("DOMContentLoaded", () => {
  // UI 元素
  const video = document.getElementById("videoFeed");
  const recordBtn = document.getElementById("recordBtn");
  const doneBtn = document.getElementById("doneBtn");
  const chatContainer = document.getElementById("chatContainer");
  const chatInput = document.getElementById("chatInput");
  const sendBtn = document.getElementById("sendBtn");

  let isConversationActive = false;
  let recognition;
  let emotionInterval;
  let transcriptData = "";
  let lastEmotion = "neutral";
  let currentUserBubble = null;

  // ---------- 聊天泡泡函數 ----------
  function appendBubble(content, isUser = true) {
    const bubble = document.createElement("div");
    bubble.classList.add("message-bubble");
    bubble.classList.add(isUser ? "user-bubble" : "ai-bubble");
    bubble.innerText = content;
    chatContainer.appendChild(bubble);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  function updateUserBubble(text) {
    if (!currentUserBubble) {
      currentUserBubble = document.createElement("div");
      currentUserBubble.classList.add("message-bubble", "user-bubble");
      chatContainer.appendChild(currentUserBubble);
    }
    currentUserBubble.innerText = text;
    chatContainer.scrollTop = chatContainer.scrollHeight;
    transcriptData = text;
  }

  function finalizeUserBubble() {
    if (currentUserBubble) {
      const note = document.createElement("div");
      note.classList.add("emotion-note");
      note.innerText = `偵測到情緒：${lastEmotion}`;
      currentUserBubble.appendChild(note);
      currentUserBubble = null;
    }
  }

  // ---------- Face-API 設定 ----------
  async function loadFaceModels() {
    const modelUrl = "https://justadudewhohacks.github.io/face-api.js/models";
    await faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl);
    await faceapi.nets.faceExpressionNet.loadFromUri(modelUrl);
    console.log("臉部模型載入完成");
  }

  async function startVideo() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      video.srcObject = stream;
      console.log("攝像頭啟動成功");
    } catch (err) {
      console.error("攝像頭存取失敗:", err);
      appendBubble("抱歉，攝像頭未能啟動。請檢查權限或設備。", false);
    }
  }

  async function detectEmotion() {
    if (!video || video.paused || video.ended) return;
    try {
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceExpressions();
      if (detection) {
        const expressions = detection.expressions;
        const topEmotion = Object.keys(expressions).reduce((a, b) =>
          expressions[a] > expressions[b] ? a : b
        );
        lastEmotion = topEmotion;

        if ((topEmotion === 'sad' || topEmotion === 'fear' || topEmotion === 'angry') && expressions[topEmotion] > 0.75) {
          showCrisisAlert();
        }
      }
    } catch (err) {
      console.error("情緒偵測錯誤:", err);
    }

    // 文字危機偵測
    if (transcriptData.includes('刀') || transcriptData.includes('槍') || 
        transcriptData.includes('危險') || transcriptData.includes('自殺') || 
        transcriptData.includes('不想活') || transcriptData.includes('結束生命')) {
      showDangerObjectAlert();
    }
  }

  // ---------- 危機警示 ----------
  function showCrisisAlert() {
    const alert = document.createElement('div');
    alert.className = 'crisis-alert';
    alert.innerHTML = '偵測到高度負面情緒！<br>請即時聯絡香港撒瑪利亞會 2389 2222<br>你唔係一個人，我陪住你呀。';
    document.body.appendChild(alert);
    setTimeout(() => alert.remove(), 10000);
  }

  function showDangerObjectAlert() {
    const alert = document.createElement('div');
    alert.className = 'crisis-alert';
    alert.innerHTML = '偵測到危險內容或物件！<br>請立即放下並求助！<br>香港撒瑪利亞會 2389 2222';
    document.body.appendChild(alert);
    setTimeout(() => alert.remove(), 10000);
  }

  // ---------- 語音辨識 ----------
  function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.error("瀏覽器唔支援語音辨識");
      appendBubble("抱歉，呢個瀏覽器唔支援語音輸入。可以用文字傾偈啦。", false);
      return;
    }
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "yue-Hant-HK";
    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        interim += event.results[i][0].transcript;
      }
      updateUserBubble(interim);
    };
    recognition.onerror = (event) => {
      console.error("語音辨識錯誤:", event.error);
    };
  }

  // ---------- 文字輸入處理 ----------
  function sendTextMessage() {
    const input = document.getElementById("chatInput");
    const text = input.value.trim();
    if (text === "") return;

    appendBubble(text, true);
    input.value = "";

    // 呼叫後端
    fetch('http://localhost:5000/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        emotion: lastEmotion
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data.response) {
        appendBubble(data.response, false);
      } else if (data.error) {
        appendBubble("抱歉，後端出錯：" + data.error, false);
      }
    })
    .catch(err => {
      appendBubble("無法連到後端，請檢查伺服器是否運行。", false);
      console.error("聊天請求失敗:", err);
    });
  }

  // ---------- 對話流程 ----------
  async function startPipeline() {
    await loadFaceModels();
    initSpeechRecognition();
    recognition.start();
    emotionInterval = setInterval(detectEmotion, 500);
    doneBtn.style.display = "inline-block";
  }

  function stopPipeline() {
    if (recognition) recognition.stop();
    clearInterval(emotionInterval);
    doneBtn.style.display = "none";
  }

  // ---------- 問候 ----------
  async function greetUser() {
    appendBubble("哈囉！今日心情點呀？有咩想同我傾？", false);
    console.log("播放問候語音：哈囉！今日心情點呀？有咩想同我傾？");
    startPipeline();
  }

  // ---------- 按鈕處理 ----------
  recordBtn.addEventListener("click", async () => {
    if (!isConversationActive) {
      await greetUser();
      recordBtn.innerText = "停止傾偈";
      isConversationActive = true;
    } else {
      stopPipeline();
      recordBtn.innerText = "開始傾偈啦";
      isConversationActive = false;
    }
  });

  doneBtn.addEventListener("click", () => {
    stopPipeline();
    finalizeUserBubble();

    // 語音結束後自動送訊息給後端
    if (transcriptData.trim() !== "") {
      appendBubble("傾偈完畢，正在思考回應...", false);
      fetch('http://localhost:5000/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: transcriptData,
          emotion: lastEmotion
        })
      })
      .then(res => res.json())
      .then(data => {
        if (data.response) {
          appendBubble(data.response, false);
        } else if (data.error) {
          appendBubble("抱歉，後端出錯：" + data.error, false);
        }
      })
      .catch(err => {
        appendBubble("無法連到後端，請檢查伺服器。", false);
      });
    } else {
      appendBubble("你冇講嘢呀，再試一次好唔好？", false);
    }
  });

  // 載入時啟動攝像頭
  startVideo();
});