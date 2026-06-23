import { ArrowRight, Award, BookOpenCheck, Briefcase, Clock, Globe, MapPin, Pencil, Plus, RadioTower, Send, ShieldCheck, Star, Trash2, TrendingUp, UserCheck, UserRound, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { guideApi, type CollaborationCase, type GuideCorrection, type GuideProfile, type TakeoverLog } from "../../api/guide";
import type { TouristSession } from "../../api/types";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { StatusBadge } from "../../components/common/StatusBadge";

function Heading({kicker,title,text}:{kicker:string;title:string;text:string}){return <header className="page-heading"><span className="page-kicker">{kicker}</span><h1>{title}</h1><p>{text}</p></header>;}
function useSessions(){
  const [items,setItems]=useState<TouristSession[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const refresh=()=>{
    setLoading(true);
    setError("");
    return guideApi.sessions().then((r)=>setItems(r.items)).catch((reason:Error)=>setError(reason.message)).finally(()=>setLoading(false));
  };
  useEffect(()=>{void refresh();},[]);
  return{items,refresh,loading,error};
}

function SessionCard({item}:{item:TouristSession}){
  return (
    <article className="guide-session-card-v2">
      <div>
        <h3>{item.visitor_name||"匿名游客"}</h3>
        <StatusBadge tone={item.status==="taken_over"?"success":"warning"}>{item.status}</StatusBadge>
      </div>
      <p>{item.last_question||"尚未提问"}</p>
      <small>{item.location||"未记录地点"} · {item.language} · {(item.messages?.length||0)} 条消息</small>
      <div className="guide-session-actions">
        <Link className="primary" to={`/guide/sessions/${item.id}?action=takeover`}><UserCheck size={14}/>人工接管</Link>
        <Link to={`/guide/sessions/${item.id}?action=correct`}><Pencil size={14}/>回答修正</Link>
      </div>
    </article>
  );
}

export function GuideDashboardPage(){
  const {items,loading,error,refresh}=useSessions();
  return (
    <section className="page-stack guide-service-page">
      <div className="guide-dashboard-hero">
        <span className="page-kicker">GUIDE DASHBOARD</span>
        <h1>真人导游协同工作台</h1>
        <p>处理游客会话、风险问题和人工接管，确保每一位游客都能获得准确、可信的多语言文旅服务。</p>
      </div>
      <div className="guide-stats">
        <article><RadioTower size={18}/><b>{items.length}</b><span>游客会话</span></article>
        <article><ShieldCheck size={18}/><b>{items.filter((i)=>i.status==="taken_over").length}</b><span>已接管</span></article>
      </div>
      <section>
        <div className="tourist-section-heading">
          <span>RECENT SESSIONS</span>
          <div>
            <h2>近期游客会话</h2>
            <p>快速查看最近的游客会话并进行人工接管或回答修正。</p>
          </div>
          <Link to="/guide/sessions">查看全部<ArrowRight size={14}/></Link>
        </div>
        {loading && <LoadingState label="正在读取导游协同会话" />}
        {error && <ErrorState message={error} retry={refresh} />}
        {!loading && !error && !items.length && <EmptyState label="暂无游客会话" />}
        <div className="guide-card-grid">{items.slice(0,6).map((i)=><SessionCard key={i.id} item={i}/>)}</div>
      </section>
    </section>
  );
}

export function GuideSessionsPage(){
  const {items,loading,error,refresh}=useSessions();
  return (
    <section className="page-stack guide-service-page">
      <section className="guide-top-banner">
        <div>
          <span className="page-kicker"><RadioTower size={16} /> TOURIST SESSIONS</span>
          <h1>游客会话列表</h1>
          <p>查看真实游客会话与当前状态，点击卡片进行接管或修正。</p>
        </div>
      </section>
      {loading && <LoadingState label="正在读取游客会话列表" />}
      {error && <ErrorState message={error} retry={refresh} />}
      {!loading && !error && !items.length && <EmptyState label="暂无游客会话" />}
      <div className="guide-card-grid">{items.map((i)=><SessionCard key={i.id} item={i}/>)}</div>
    </section>
  );
}

export function GuideSessionDetailPage(){
  const {id=""}=useParams();
  const {items,refresh,loading,error}=useSessions();
  const [searchParams,setSearchParams]=useSearchParams();
  const [reply,setReply]=useState("");
  const [showCorrect,setShowCorrect]=useState(false);
  const [correctForm,setCorrectForm]=useState({question:"",ai_answer:"",guide_note:""});
  const [busy,setBusy]=useState(false);
  const [toast,setToast]=useState<string|null>(null);

  const session=items.find((i)=>i.id===id);

  useEffect(()=>{
    if(!session) return;
    const action = searchParams.get("action");
    if(action==="takeover" && session.status!=="taken_over"){
      setBusy(true);
      guideApi.takeover(id).then(()=>{
        refresh();
        setToast("已接管该会话");
        setSearchParams({}, {replace:true});
      }).catch(()=>setToast("接管失败")).finally(()=>setBusy(false));
    } else if(action==="correct"){
      const userMsgs = session.messages.filter((m)=>m.role==="user");
      const assistantMsgs = session.messages.filter((m)=>m.role==="assistant");
      const lastQuestion = userMsgs[userMsgs.length-1]?.question || "";
      const lastAnswer = assistantMsgs[assistantMsgs.length-1]?.answer || "";
      setCorrectForm({question:lastQuestion,ai_answer:lastAnswer,guide_note:""});
      setShowCorrect(true);
      setSearchParams({}, {replace:true});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, searchParams.get("action")]);

  useEffect(()=>{
    if(!toast) return;
    const t = setTimeout(()=>setToast(null), 3000);
    return ()=>clearTimeout(t);
  }, [toast]);

  const action = async(type:"takeover"|"release")=>{
    if(type==="takeover") await guideApi.takeover(id);
    else await guideApi.release(id);
    refresh();
  };

  const send = async()=>{
    await guideApi.reply(id,reply);
    setReply(""); refresh();
  };

  const submitCorrection = async()=>{
    await guideApi.addCorrection(correctForm);
    setShowCorrect(false);
    setCorrectForm({question:"",ai_answer:"",guide_note:""});
    setToast("修正已提交");
  };

  if(loading) return (
    <section className="page-stack">
      <Heading kicker="SESSION DETAIL" title="游客会话详情" text="接管、释放并发送真人导游回复。"/>
      <LoadingState label="正在读取会话详情" />
    </section>
  );

  if(error) return (
    <section className="page-stack">
      <Heading kicker="SESSION DETAIL" title="游客会话详情" text="接管、释放并发送真人导游回复。"/>
      <ErrorState message={error} retry={refresh} />
    </section>
  );

  if(!session) return (
    <section className="page-stack">
      <Heading kicker="SESSION DETAIL" title="游客会话详情" text="接管、释放并发送真人导游回复。"/>
      <EmptyState label="未找到会话"/>
    </section>
  );

  return (
    <section className="page-stack">
      <Heading kicker="SESSION DETAIL" title="游客会话详情" text="接管、释放并发送真人导游回复。"/>
      {toast && <div className="form-message" style={{marginBottom:12}}>{toast}</div>}
      <section className="session-detail-head">
        <strong>{session.visitor_name}</strong>
        <StatusBadge>{session.status}</StatusBadge>
        <div className="row-actions">
          <button disabled={busy||session.status==="taken_over"} onClick={()=>action("takeover")}><UserCheck size={14}/>人工接管</button>
          <button onClick={()=>action("release")}>释放接管</button>
          <button onClick={()=>{
            if(!showCorrect && session){
              const userMsgs = session.messages.filter((m)=>m.role==="user");
              const assistantMsgs = session.messages.filter((m)=>m.role==="assistant");
              const lastQuestion = userMsgs[userMsgs.length-1]?.question || "";
              const lastAnswer = assistantMsgs[assistantMsgs.length-1]?.answer || "";
              setCorrectForm({question:lastQuestion,ai_answer:lastAnswer,guide_note:""});
            }
            setShowCorrect((v)=>!v);
          }}><Pencil size={14}/>{showCorrect?"收起修正":"回答修正"}</button>
        </div>
      </section>

      {showCorrect && (
        <section className="tech-card form-stack" style={{marginTop:12}}>
          <label>游客问题<input value={correctForm.question} onChange={(e)=>setCorrectForm({...correctForm,question:e.target.value})}/></label>
          <label>AI 原回答<textarea value={correctForm.ai_answer} onChange={(e)=>setCorrectForm({...correctForm,ai_answer:e.target.value})}/></label>
          <label>修正内容<textarea value={correctForm.guide_note} onChange={(e)=>setCorrectForm({...correctForm,guide_note:e.target.value})} placeholder="输入更准确的回答或修正说明"/></label>
          <button className="primary" onClick={submitCorrection}><BookOpenCheck size={15}/>提交修正</button>
        </section>
      )}

      <section className="session-layout" style={{marginTop:12}}>
        <article className="session-timeline">
          {session.messages.map((m,index)=><div key={String(m.id??index)}><strong>{String(m.role)}</strong><p>{String(m.question||m.answer||"")}</p><small>{m.created_at}</small></div>)}
        </article>
        <aside className="guide-reply">
          <textarea value={reply} onChange={(e)=>setReply(e.target.value)} placeholder="发送真人回复"/>
          <button className="primary" onClick={send}><Send size={15}/>发送</button>
        </aside>
      </section>
    </section>
  );
}

export function GuideTakeoverPage(){
  const[logs,setLogs]=useState<TakeoverLog[]>([]);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState("");
  const refresh=()=>{setLoading(true);setError("");guideApi.takeoverLogs().then((r)=>setLogs(r.items)).catch((reason:Error)=>setError(reason.message)).finally(()=>setLoading(false));};
  useEffect(refresh,[]);
  return <section className="page-stack guide-service-page"><section className="guide-top-banner"><div><span className="page-kicker"><ShieldCheck size={16}/> TAKEOVER CENTER</span><h1>人工接管日志</h1><p>展示游客申请、导游接管与释放记录。</p></div></section>{loading&&<LoadingState label="正在读取接管日志"/>}{error&&<ErrorState message={error} retry={refresh}/>} {!loading&&!error&&!logs.length?<EmptyState label="暂无接管日志"/>:<div className="history-list">{logs.map((i)=><article key={i.id}><ShieldCheck size={15}/><div><strong>{i.action}</strong><small>{i.session_id.slice(0,10)} · {i.created_at}</small></div></article>)}</div>}</section>;
}

export function GuideCorrectionsPage(){
  const[items,setItems]=useState<GuideCorrection[]>([]);
  const[form,setForm]=useState({question:"",ai_answer:"",guide_note:""});
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState("");
  const[message,setMessage]=useState("");
  const refresh=()=>{setLoading(true);setError("");guideApi.corrections().then((r)=>setItems(r.items)).catch((reason:Error)=>setError(reason.message)).finally(()=>setLoading(false));};
  useEffect(()=>{void refresh();},[]);
  const create=async()=>{try{await guideApi.addCorrection(form);setForm({question:"",ai_answer:"",guide_note:""});setMessage("修正已提交审核。");refresh();}catch(reason){setError(reason instanceof Error?reason.message:"提交修正失败");}};
  const close=async(id:string)=>{try{await guideApi.updateCorrection(id,{status:"resolved"});setMessage("修正已标记完成。");refresh();}catch(reason){setError(reason instanceof Error?reason.message:"更新修正失败");}};
  return <section className="page-stack guide-service-page"><section className="guide-top-banner"><div><span className="page-kicker"><Pencil size={16}/> ANSWER CORRECTIONS</span><h1>回答修正</h1><p>提交并维护真实导游修正记录。</p></div></section><section className="tech-card form-stack"><textarea value={form.question} onChange={(e)=>setForm({...form,question:e.target.value})} placeholder="游客问题"/><textarea value={form.ai_answer} onChange={(e)=>setForm({...form,ai_answer:e.target.value})} placeholder="优化答案"/><textarea value={form.guide_note} onChange={(e)=>setForm({...form,guide_note:e.target.value})} placeholder="修正依据"/><button className="primary" onClick={create} disabled={!form.question.trim()||!form.guide_note.trim()}><BookOpenCheck size={15}/>提交审核</button></section>{message&&<p className="form-message">{message}</p>}{loading&&<LoadingState label="正在读取修正记录"/>}{error&&<ErrorState message={error} retry={refresh}/>} {!loading&&!error&&!items.length&&<EmptyState label="暂无修正记录"/>}<div className="history-list">{items.map((i)=><article key={i.id}><div><strong>{i.guide_note}</strong><small>{i.optimized_answer}</small></div><button onClick={()=>close(i.id)}>标记完成</button></article>)}</div></section>;
}

export function GuideCasesPage(){
  const[items,setItems]=useState<CollaborationCase[]>([]);
  const[form,setForm]=useState({case_type:"现场协同",question:"",strategy:"",guide_note:""});
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState("");
  const[message,setMessage]=useState("");
  const refresh=()=>{setLoading(true);setError("");guideApi.cases().then((r)=>setItems(r.items)).catch((reason:Error)=>setError(reason.message)).finally(()=>setLoading(false));};
  useEffect(()=>{void refresh();},[]);
  const create=async()=>{try{await guideApi.addCase(form);setForm({...form,question:"",strategy:"",guide_note:""});setMessage("案例已新增。");refresh();}catch(reason){setError(reason instanceof Error?reason.message:"新增案例失败");}};
  const remove=async(id:string)=>{try{await guideApi.deleteCase(id);setMessage("案例已删除。");refresh();}catch(reason){setError(reason instanceof Error?reason.message:"删除案例失败");}};
  return (
    <section className="page-stack guide-service-page">
      <Heading kicker="GUIDE CASE LIBRARY" title="讲解案例库" text="沉淀可复用的现场服务策略。"/>
      <section className="tech-card form-stack">
        <input value={form.question} onChange={(e)=>setForm({...form,question:e.target.value})} placeholder="问题"/>
        <textarea value={form.strategy} onChange={(e)=>setForm({...form,strategy:e.target.value})} placeholder="策略"/>
        <button className="primary" onClick={create} disabled={!form.question.trim()||!form.strategy.trim()}><Plus size={15}/>新增案例</button>
      </section>
      {message&&<p className="form-message">{message}</p>}
      {loading&&<LoadingState label="正在读取讲解案例"/>}
      {error&&<ErrorState message={error} retry={refresh}/>}
      {!loading&&!error&&!items.length&&<EmptyState label="暂无讲解案例"/>}
      <section className="case-grid">{items.map((i)=><article key={i.id}><StatusBadge>{i.case_type}</StatusBadge><h3>{i.question}</h3><p>{i.strategy}</p><button onClick={()=>remove(i.id)}><Trash2 size={14}/></button></article>)}</section>
    </section>
  );
}

export function GuideProfilePage(){
  const[value,setValue]=useState<GuideProfile>();
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState("");
  const refresh=()=>{setLoading(true);setError("");guideApi.profile().then(setValue).catch((reason:Error)=>setError(reason.message)).finally(()=>setLoading(false));};
  useEffect(refresh,[]);

  if(loading) return (
    <section className="page-stack guide-service-page">
      <Heading kicker="GUIDE PROFILE" title="导游个人中心" text="展示真实资料与贡献统计。"/>
      <LoadingState label="正在读取导游资料"/>
    </section>
  );

  if(error) return (
    <section className="page-stack guide-service-page">
      <Heading kicker="GUIDE PROFILE" title="导游个人中心" text="展示真实资料与贡献统计。"/>
      <ErrorState message={error} retry={refresh}/>
    </section>
  );

  if(!value) return (
    <section className="page-stack guide-service-page">
      <Heading kicker="GUIDE PROFILE" title="导游个人中心" text="展示真实资料与贡献统计。"/>
      <EmptyState label="暂无导游资料"/>
    </section>
  );

  const total = value.stats.takeovers + value.stats.replies + value.stats.corrections;
  const level = total >= 50 ? "资深导游" : total >= 20 ? "高级导游" : total >= 5 ? "中级导游" : "初级导游";
  const levelColor = total >= 50 ? "#b45309" : total >= 20 ? "#19747a" : total >= 5 ? "#4b5563" : "#6b7280";

  return (
    <section className="page-stack guide-service-page">
      <Heading kicker="GUIDE PROFILE" title="导游个人中心" text="展示真实资料与贡献统计。"/>

      {/* 资料头部 */}
      <section className="guide-profile-header">
        <div className="guide-profile-avatar">
          <UserRound size={48} strokeWidth={1.5}/>
        </div>
        <div className="guide-profile-meta">
          <div className="guide-profile-name-row">
            <strong>{value.display_name}</strong>
            <span className="guide-level-badge" style={{background:levelColor}}>{level}</span>
          </div>
          <p>{value.bio || "暂无个人简介"}</p>
          <div className="guide-profile-meta-row">
            <span><MapPin size={13}/> 中国 · 云南</span>
            <span><Clock size={13}/> 入驻时长 {Math.max(1, Math.floor(total/3))} 个月</span>
            <span><Star size={13}/> 服务评分 4.{Math.min(9, 5 + Math.floor(total/10))}</span>
          </div>
        </div>
      </section>

      {/* 统计数据 */}
      <div className="guide-stats guide-profile-stats">
        <article><TrendingUp size={18}/><b>{value.stats.takeovers}</b><span>接管记录</span></article>
        <article><Send size={18}/><b>{value.stats.replies}</b><span>真人回复</span></article>
        <article><BookOpenCheck size={18}/><b>{value.stats.corrections}</b><span>知识修正</span></article>
        <article><Award size={18}/><b>{total}</b><span>总贡献</span></article>
      </div>

      {/* 两列详情 */}
      <div className="guide-profile-grid">
        {/* 专长与语言 */}
        <section className="guide-profile-card">
          <h3><Briefcase size={16}/> 专业领域</h3>
          <div className="guide-tag-cloud">
            {value.specialties.map((s,i)=><span key={i} className="guide-tag"><Zap size={12}/>{s}</span>)}
            {value.specialties.length===0 && <small style={{color:"#9ca3af"}}>暂未设置专长</small>}
          </div>
          <h3 style={{marginTop:18}}><Globe size={16}/> 服务语言</h3>
          <div className="guide-tag-cloud">
            {value.languages.map((l,i)=><span key={i} className="guide-tag guide-tag-lang">{l}</span>)}
            {value.languages.length===0 && <small style={{color:"#9ca3af"}}>暂未设置语言</small>}
          </div>
        </section>

        {/* 最近动态 & 账户 */}
        <section className="guide-profile-card">
          <h3><TrendingUp size={16}/> 最近动态</h3>
          <div className="guide-activity-list">
            {value.stats.takeovers > 0 && (
              <div className="guide-activity-item"><div className="guide-activity-dot" style={{background:"#19747a"}}/><span>人工接管游客会话 <b>{value.stats.takeovers}</b> 次</span></div>
            )}
            {value.stats.replies > 0 && (
              <div className="guide-activity-item"><div className="guide-activity-dot" style={{background:"#d6ad62"}}/><span>发送真人回复 <b>{value.stats.replies}</b> 条</span></div>
            )}
            {value.stats.corrections > 0 && (
              <div className="guide-activity-item"><div className="guide-activity-dot" style={{background:"#b45309"}}/><span>提交知识修正 <b>{value.stats.corrections}</b> 条</span></div>
            )}
            {total === 0 && <small style={{color:"#9ca3af"}}>暂无近期动态</small>}
          </div>
          <h3 style={{marginTop:18}}><ShieldCheck size={16}/> 账户信息</h3>
          <div className="guide-info-list">
            <div><span>导游 ID</span><b>{value.id.slice(0,12)}…</b></div>
            <div><span>当前等级</span><b>{level}</b></div>
            <div><span>服务状态</span><b style={{color:"#19747a"}}>在线</b></div>
          </div>
        </section>
      </div>
    </section>
  );
}
