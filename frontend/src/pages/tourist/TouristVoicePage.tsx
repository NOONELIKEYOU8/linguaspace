import { Mic, Square, Upload, Volume2 } from "lucide-react";
import { useRef, useState } from "react";
import { touristApi } from "../../api/tourist";
import type { AudioAskResult } from "../../api/types";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";

export function TouristVoicePage() {
  const [file, setFile] = useState<File>();
  const [result, setResult] = useState<AudioAskResult>();
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder>();
  const chunks = useRef<Blob[]>([]);

  const start = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks.current = [];
      recorder.current = new MediaRecorder(stream);
      recorder.current.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      recorder.current.onstop = () => {
        const blob = new Blob(chunks.current, { type: "audio/webm" });
        setFile(new File([blob], "browser-recording.webm", { type: blob.type }));
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.current.start();
      setRecording(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法访问麦克风，请检查浏览器权限。");
    }
  };
  const stop = () => {
    recorder.current?.stop();
    setRecording(false);
  };
  const ask = async () => {
    if (!file) return;
    setBusy(true);
    setError("");
    setResult(undefined);
    try {
      setResult(await touristApi.askAudio(file));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "语音问答失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page-stack tourist-service-page tourist-voice-page">
      <section className="media-banner voice-banner">
        <div>
          <span className="page-kicker"><Mic size={16} /> VOICE GUIDE</span>
          <h1>边走边问，听见云南</h1>
          <p>可以浏览器内录音，也可以上传音频文件。音频会进入真实 ASR 与 RAG 链路。</p>
        </div>
      </section>
      <section className="media-workspace">
        <div className="upload-zone">
          <Mic size={36} />
          <strong>{recording ? "正在录音" : file?.name || "尚未选择音频"}</strong>
          <p>{recording ? "再次点击停止后，录音将作为语音问题提交。" : "建议控制在 30 秒内，问题越清晰，转写与回答越稳定。"}</p>
          <div className="row-actions">
            {recording
              ? <button className="primary" onClick={stop}><Square size={15} />停止录音</button>
              : <button className="primary" onClick={start} disabled={busy}><Mic size={15} />开始录音</button>}
            <label className="ghost-upload"><Upload size={15} />选择文件<input type="file" accept="audio/*" onChange={(event) => setFile(event.target.files?.[0])} /></label>
          </div>
          <button className="primary" disabled={!file || busy || recording} onClick={ask}>
            <Volume2 size={15} />{busy ? "处理中" : "提交语音问答"}
          </button>
        </div>
        <article className="result-panel">
          {busy && <LoadingState label="正在转写音频、检索知识库并生成多语讲解" />}
          {error && <ErrorState message={error} retry={file ? ask : undefined} />}
          {!busy && !error && !result && <EmptyState label="录音或上传音频后，这里展示转写、回答和来源状态" />}
          {result && (
            <>
              <span className="page-kicker">TRANSCRIPT</span>
              <p>{result.transcript.text}</p>
              <span className="page-kicker">RAG VOICE ANSWER</span>
              <p>{result.answer}</p>
              <small>来源 {result.sources.length} 条 · {result.reliable ? "已命中可靠资料" : "未达到可靠阈值"} · {result.provider}</small>
            </>
          )}
        </article>
      </section>
    </section>
  );
}
