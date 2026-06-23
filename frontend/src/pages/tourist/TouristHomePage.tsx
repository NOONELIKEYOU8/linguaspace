import { ArrowRight, Camera, Compass, Map, MessageCircle, Mic, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { touristApi } from "../../api/tourist";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";

const entries = [
  [MessageCircle, "多语问答", "用熟悉的语言，了解沿途文化故事。", "MULTILINGUAL RAG", "/tourist/chat", "/assets/public-yulong-mountain.jpg"],
  [Mic, "语音导览", "边走边问，让云南山水慢慢被听见。", "VOICE GUIDE", "/tourist/voice", "/assets/public-rainforest-waterfall.jpg"],
  [Camera, "拍照识别", "从古建细节与街巷风物中发现文化。", "VISION GUIDE", "/tourist/image", "/assets/intro-scenario-photo-recognition.png"],
  [Map, "路线推荐", "按兴趣选择更适合自己的云南路径。", "SMART ROUTES", "/tourist/routes", "/assets/route-photography.png"],
] as const;

const routeImages = [
  "/assets/public-asian-noodle-bowls.jpg",
  "/assets/route-heritage.png",
  "/assets/public-yunnan-sunlit-terraces.jpg",
];

export function TouristHomePage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof touristApi.home>>>();
  const [error, setError] = useState("");
  const load = () => {
    setError("");
    touristApi.home().then(setData).catch((reason: Error) => setError(reason.message));
  };
  useEffect(() => { load(); }, []);

  return (
    <section className="tourist-home tourist-service-page page-stack">
      <section className="scenic-banner tourist-home-hero">
        <div>
          <span className="page-kicker"><Sparkles size={15} /> YOUR YUNNAN JOURNEY</span>
          <h1>从云南山水出发，<br />读懂沿途文化</h1>
          <p>选择一种探索方式，让真实知识库、文化图谱和真人导游陪你走进云南。</p>
          <Link className="tourist-hero-action" to="/tourist/chat"><MessageCircle size={17} />开始多语导览 <ArrowRight size={15} /></Link>
        </div>
        <aside><Compass size={18} /><span>天气服务状态</span><strong>{data?.weather.status || "读取中"}</strong><small>{data?.weather.note}</small></aside>
      </section>

      <section className="tourist-service-section">
        <header className="tourist-section-heading"><span>EXPLORE WITH AI</span><div><h2>今天想怎么探索？</h2><p>服务入口保持清晰直接，每种体验都连接真实后端能力。</p></div></header>
        <div className="tourist-entry-grid">
          {entries.map(([Icon, title, text, tag, to, image], index) => (
            <Link key={title} to={to} style={{ "--tourist-order": index, "--tourist-card-image": `url(${image})` } as CSSProperties}>
              <Icon size={22} /><span>{tag}</span><h3>{title}</h3><p>{text}</p><b>进入服务 <ArrowRight size={15} /></b>
            </Link>
          ))}
        </div>
      </section>

      {!data && !error && <LoadingState />}
      {error && <ErrorState message={error} retry={load} />}
      {data && <section className="tourist-live-stats">
        <header><ShieldCheck size={16} /><span>真实服务数据</span></header>
        <div>
          <article><b>{data.overview.today_questions}</b><span>今日问答</span></article>
          <article><b>{data.overview.today_sessions}</b><span>今日会话</span></article>
          <article><b>{data.overview.routes}</b><span>主题路线</span></article>
          <article><b>{data.overview.terms}</b><span>多语术语</span></article>
        </div>
      </section>}

      {!!data?.routes.length && <section className="tourist-destination-section">
        <header className="tourist-section-heading"><span>CURATED JOURNEYS</span><div><h2>沿着真实路线，继续发现云南</h2><p>推荐内容来自后端路线库，图片用于营造目的地氛围。</p></div><Link to="/tourist/routes">查看全部路线 <ArrowRight size={15} /></Link></header>
        <div className="tourist-destination-grid">
          {data.routes.slice(0, 3).map((route, index) => (
            <Link to="/tourist/routes" key={route.route_key}>
              <img src={routeImages[index % routeImages.length]} alt="" />
              <div><small>0{index + 1} / {route.mode}</small><h3>{route.name}</h3><p>{route.reason}</p><b>探索路线 <ArrowRight size={14} /></b></div>
            </Link>
          ))}
        </div>
      </section>}
    </section>
  );
}
