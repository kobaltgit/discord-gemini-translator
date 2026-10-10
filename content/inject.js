(() => {
  function findSlateEditor(slateEditor) {
    if (!slateEditor) return null;

    // 1. Поиск через React Fiber
    const fiberKey = Object.keys(slateEditor).find((k) =>
      k.startsWith("__reactFiber$"),
    );
    if (fiberKey && slateEditor[fiberKey]) {
      let curr = slateEditor[fiberKey];
      while (curr) {
        if (curr.memoizedProps?.editor) {
          return curr.memoizedProps.editor;
        }
        if (curr.stateNode?.editor) {
          return curr.stateNode.editor;
        }
        curr = curr.return;
      }
    }

    // 2. Поиск через React Props
    const propsKey = Object.keys(slateEditor).find((k) =>
      k.startsWith("__reactProps$"),
    );
    if (propsKey && slateEditor[propsKey]) {
      const props = slateEditor[propsKey];
      if (props.editor) return props.editor;
      if (props.children?.props?.editor) return props.children.props.editor;
    }

    return null;
  }

  function setSlateText(editor, newText) {
    if (!editor || !Array.isArray(editor.children)) return false;

    try {
      // 1. Удаляем все дополнительные строки/блоки, если их больше одного
      while (editor.children.length > 1) {
        const idx = editor.children.length - 1;
        editor.apply({
          type: "remove_node",
          path: [idx],
          node: editor.children[idx],
        });
      }

      // 2. Очищаем все текстовые узлы внутри первого блока
      const firstBlock = editor.children[0];
      if (firstBlock && Array.isArray(firstBlock.children)) {
        while (firstBlock.children.length > 1) {
          const idx = firstBlock.children.length - 1;
          editor.apply({
            type: "remove_node",
            path: [0, idx],
            node: firstBlock.children[idx],
          });
        }

        const firstTextNode = firstBlock.children[0];
        const oldText = firstTextNode?.text || "";
        if (oldText.length > 0) {
          editor.apply({
            type: "remove_text",
            path: [0, 0],
            offset: 0,
            text: oldText,
          });
        }
      }

      // 3. Вставляем новый переведенный текст через нативную операцию Slate
      editor.apply({
        type: "insert_text",
        path: [0, 0],
        offset: 0,
        text: newText,
      });

      // 4. Перемещаем каретку в конец перевода
      editor.apply({
        type: "set_selection",
        properties: editor.selection,
        newProperties: {
          anchor: { path: [0, 0], offset: newText.length },
          focus: { path: [0, 0], offset: newText.length },
        },
      });

      // 5. Уведомляем внутреннее состояние Slate
      if (typeof editor.onChange === "function") {
        editor.onChange();
      }

      return true;
    } catch (e) {
      console.warn("[DGT] Ошибка прямого обновления Slate:", e);
      return false;
    }
  }

  function fallbackReplace(slateEditor, newText) {
    slateEditor.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(slateEditor);
    selection.removeAllRanges();
    selection.addRange(range);

    document.execCommand("delete", false, null);

    const dataTransfer = new DataTransfer();
    dataTransfer.setData("text/plain", newText);
    const pasteEvent = new ClipboardEvent("paste", {
      clipboardData: dataTransfer,
      bubbles: true,
      cancelable: true,
    });
    slateEditor.dispatchEvent(pasteEvent);
    slateEditor.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // --- ГОЛОСОВОЙ ЗАХВАТ WEBRTC И ЛОКАЛЬНЫЙ VAD ---

  let activeVoiceTracks = new Set();
  let isVoiceCaptureActive = false;
  let audioContext = null;
  let scriptProcessor = null;
  let silenceCounter = 0;
  const VAD_THRESHOLD = 0.003; // Порог громкости для мягкого отсечения тишины без обрезания окончаний и тихих согласных
  const SILENCE_HANGOVER_CHUNKS = 10; // Продление захвата на ~850мс, чтобы естественные паузы между словами не рвали поток
  let isSpeaking = false;

  function float32ToInt16Pcm(float32Array) {
    if (!float32Array) return new Int16Array(0);
    const int16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16[i] = s < 0 ? Math.floor(s * 0x8000) : Math.floor(s * 0x7fff);
    }
    return int16;
  }

  function calculateRMS(float32Array) {
    if (!float32Array || float32Array.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < float32Array.length; i++) {
      sum += float32Array[i] * float32Array[i];
    }
    return Math.sqrt(sum / float32Array.length);
  }

  function int16ToBase64(int16Array) {
    if (!int16Array || int16Array.length === 0) return "";
    const bytes = new Uint8Array(
      int16Array.buffer,
      int16Array.byteOffset,
      int16Array.byteLength,
    );
    let binary = "";
    const len = bytes.byteLength;
    const chunkSize = 8192;
    for (let i = 0; i < len; i += chunkSize) {
      const slice = bytes.subarray(i, Math.min(i + chunkSize, len));
      binary += String.fromCharCode.apply(null, slice);
    }
    return typeof btoa !== "undefined"
      ? btoa(binary)
      : Buffer.from(binary, "binary").toString("base64");
  }

  function downsampleBuffer(buffer, inputSampleRate, outputSampleRate = 16000) {
    if (inputSampleRate === outputSampleRate || !buffer || buffer.length === 0) {
      return buffer;
    }
    const sampleRateRatio = inputSampleRate / outputSampleRate;
    const newLength = Math.round(buffer.length / sampleRateRatio);
    const result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;
    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
      let accum = 0;
      let count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }
      result[offsetResult] = count > 0 ? accum / count : 0;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
    return result;
  }

  function initAudioContext() {
    if (typeof window === "undefined") return null;
    if (audioContext && audioContext.state !== "closed") {
      if (audioContext.state === "suspended") {
        audioContext.resume().catch(() => {});
      }
      return audioContext;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    try {
      audioContext = new AudioContextClass({ sampleRate: 16000 });
    } catch {
      audioContext = new AudioContextClass();
    }
    return audioContext;
  }

  function scanMediaStreams() {
    if (typeof document === "undefined") return;
    document.querySelectorAll("audio, video").forEach((media) => {
      if (media.srcObject && typeof media.srcObject.getAudioTracks === "function") {
        media.srcObject.getAudioTracks().forEach((track) => {
          if (track.readyState === "live" && !activeVoiceTracks.has(track)) {
            activeVoiceTracks.add(track);
            track.addEventListener("ended", () => {
              activeVoiceTracks.delete(track);
            });
            if (isVoiceCaptureActive) {
              setupAudioPipeline();
            }
          }
        });
      }
    });
  }

  function setupAudioPipeline() {
    if (!isVoiceCaptureActive) return;
    const ctx = initAudioContext();
    if (!ctx) return;

    if (activeVoiceTracks.size === 0) return;

    if (scriptProcessor) {
      try {
        scriptProcessor.disconnect();
      } catch {}
      scriptProcessor = null;
    }

    try {
      const mixer = ctx.createGain();
      mixer.gain.value = 1.0;

      activeVoiceTracks.forEach((track) => {
        if (track.readyState === "live") {
          try {
            const stream = new MediaStream([track]);
            const source = ctx.createMediaStreamSource(stream);
            source.connect(mixer);
          } catch (e) {
            console.warn("[DGT] Ошибка подключения дорожки к микшеру:", e);
          }
        }
      });

      const bufferSize = 4096;
      scriptProcessor = ctx.createScriptProcessor(bufferSize, 1, 1);
      mixer.connect(scriptProcessor);
      scriptProcessor.connect(ctx.destination);

      scriptProcessor.onaudioprocess = (e) => {
        if (!isVoiceCaptureActive) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const rms = calculateRMS(inputData);

        if (rms >= VAD_THRESHOLD) {
          isSpeaking = true;
          silenceCounter = 0;
        } else if (isSpeaking) {
          silenceCounter++;
          if (silenceCounter > SILENCE_HANGOVER_CHUNKS) {
            isSpeaking = false;
          }
        }

        if (isSpeaking) {
          const resampled = downsampleBuffer(inputData, ctx.sampleRate, 16000);
          const pcm16 = float32ToInt16Pcm(resampled);
          const base64 = int16ToBase64(pcm16);
          if (base64) {
            window.dispatchEvent(
              new CustomEvent("DGT_VOICE_AUDIO_CHUNK", {
                detail: { pcmBase64: base64, rms },
              }),
            );
          }
        }
      };
    } catch (e) {
      console.warn("[DGT] Ошибка настройки Web Audio:", e);
    }
  }

  function hookWebRTC() {
    if (typeof window === "undefined" || !window.RTCPeerConnection) return;
    const OrigPeerConnection = window.RTCPeerConnection;
    if (OrigPeerConnection.__dgtHooked) return;

    const PatchedPeerConnection = function (...args) {
      const pc = new OrigPeerConnection(...args);
      pc.addEventListener("track", (event) => {
        if (event.track && event.track.kind === "audio") {
          activeVoiceTracks.add(event.track);
          event.track.addEventListener("ended", () => {
            activeVoiceTracks.delete(event.track);
          });
          if (isVoiceCaptureActive) {
            setupAudioPipeline();
          }
        }
      });
      return pc;
    };

    PatchedPeerConnection.prototype = OrigPeerConnection.prototype;
    PatchedPeerConnection.__dgtHooked = true;
    window.RTCPeerConnection = PatchedPeerConnection;

    if (OrigPeerConnection.prototype.addEventListener) {
      const origAddEventListener = OrigPeerConnection.prototype.addEventListener;
      OrigPeerConnection.prototype.addEventListener = function (
        type,
        listener,
        ...args
      ) {
        if (type === "track" && typeof listener === "function") {
          const wrappedListener = function (event) {
            if (event.track && event.track.kind === "audio") {
              activeVoiceTracks.add(event.track);
              event.track.addEventListener("ended", () => {
                activeVoiceTracks.delete(event.track);
              });
              if (isVoiceCaptureActive) {
                setupAudioPipeline();
              }
            }
            return listener.apply(this, arguments);
          };
          return origAddEventListener.call(this, type, wrappedListener, ...args);
        }
        return origAddEventListener.call(this, type, listener, ...args);
      };
    }
  }

  if (typeof window !== "undefined") {
    hookWebRTC();

    window.addEventListener("DGT_START_VOICE_CAPTURE", () => {
      isVoiceCaptureActive = true;
      scanMediaStreams();
      setupAudioPipeline();
      console.log(`[DGT Inject] Запущен захват голоса WebRTC. Обнаружено аудиодорожек: ${activeVoiceTracks.size}`);
      window.dispatchEvent(
        new CustomEvent("DGT_VOICE_STATUS", {
          detail: { active: true, tracksCount: activeVoiceTracks.size },
        }),
      );
    });

    window.addEventListener("DGT_STOP_VOICE_CAPTURE", () => {
      isVoiceCaptureActive = false;
      console.log("[DGT Inject] Захват голоса остановлен");
      if (scriptProcessor) {
        try {
          scriptProcessor.disconnect();
        } catch {}
        scriptProcessor = null;
      }
      if (audioContext && audioContext.state !== "closed") {
        try {
          audioContext.suspend();
        } catch {}
      }
      window.dispatchEvent(
        new CustomEvent("DGT_VOICE_STATUS", {
          detail: { active: false, tracksCount: 0 },
        }),
      );
    });

    // Периодическое обнаружение новых аудиоэлементов
    setInterval(() => {
      if (isVoiceCaptureActive) {
        scanMediaStreams();
      }
    }, 2000);
  }

  // Слушаем команду от изолированного content-скрипта
  if (typeof window !== "undefined") {
    window.addEventListener("DGT_REPLACE_TEXT", (e) => {
      const newText = e.detail?.text;
      if (!newText) return;

      const slateEditor = document.querySelector(
        '[role="textbox"][contenteditable="true"]',
      );
      if (!slateEditor) return;

      slateEditor.focus();

      const editor = findSlateEditor(slateEditor);
      let success = false;
      if (editor) {
        success = setSlateText(editor, newText);
      }

      if (!success) {
        fallbackReplace(slateEditor, newText);
      }

      slateEditor.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      float32ToInt16Pcm,
      calculateRMS,
      int16ToBase64,
      downsampleBuffer,
    };
  }
})();
