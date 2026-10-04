'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import {createClient} from '@supabase/supabase-js'
const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
const api=async(b:any)=>{const r=await fetch('/api/action',{method:'POST',body:JSON.stringify(b)});const j=await r.json();if(!r.ok)throw new Error(j.error);return j}
const mmss=(s:number)=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

export default function Game({initial=''}:{initial?:string}){
  const [code,setCode]=useState(initial.toUpperCase()),[sess,setSess]=useState<any>(null),[name,setName]=useState('')
  const [pub,setPub]=useState<any>(null),[priv,setPriv]=useState<any>({}),[err,setErr]=useState(''),[txt,setTxt]=useState('')
  const [now,setNow]=useState(Date.now()),[off,setOff]=useState(0),[show,setShow]=useState(true),[sel,setSel]=useState('')
  const ticked=useRef('')
  useEffect(()=>{ if(code){const s=localStorage.getItem('insider:'+code); if(s) setSess(JSON.parse(s))} },[code])
  const run=async(b:any)=>{ try{ setErr(''); return await api({...b,code,...sess}) }catch(e:any){ setErr(e.message) } }
  const refresh=useCallback(async()=>{
    if(!code||!sess) return
    try{ const r=await api({type:'state',code,...sess}); setPub(r.pub); setPriv({role:r.role,word:r.word}); setOff(r.pub.t-Date.now()) }
    catch(e:any){ setErr(e.message); if(/expired|find that room/.test(e.message)){ localStorage.removeItem('insider:'+code); setSess(null); setPub(null) } }
  },[code,sess])
  useEffect(()=>{ refresh(); if(!sess) return
    const ch=sb.channel('room-'+code).on('postgres_changes',{event:'*',schema:'public',table:'rooms',filter:`code=eq.${code}`},()=>refresh()).subscribe()
    const poll=setInterval(refresh,6000), clk=setInterval(()=>setNow(Date.now()),500)
    return ()=>{ sb.removeChannel(ch); clearInterval(poll); clearInterval(clk) } },[sess,code,refresh])
  const left=pub?.endsAt?Math.max(0,Math.ceil((pub.endsAt-(now+off))/1000)):null
  useEffect(()=>{ const k=pub?.phase+':'+pub?.endsAt
    if(left===0&&ticked.current!==k){ ticked.current=k; run({type:'tick'}).then(refresh) } })
  useEffect(()=>{ setSel(''); setShow(true) },[pub?.phase])

  const enter=async(type:'create'|'join')=>{ try{ setErr(''); const r=await api({type,name,code})
    localStorage.setItem('insider:'+r.code,JSON.stringify({id:r.id,token:r.token})); setCode(r.code); setSess({id:r.id,token:r.token})
    history.replaceState(null,'','/room/'+r.code) }catch(e:any){ setErr(e.message) } }
  const Err=()=>err?<div className="err">{err}</div>:null

  if(!sess||!pub) return <main><h1>INSIDER</h1><p className="sub">A social deduction game of questions, deception, and guessing.</p>
    <div className="card"><input placeholder="Your display name" value={name} maxLength={16} onChange={e=>setName(e.target.value)}/>
    <input placeholder="Room code (to join)" value={code} maxLength={6} onChange={e=>setCode(e.target.value.toUpperCase())}/>
    <Err/><button className="btn" disabled={!name} onClick={()=>enter('create')}>Create Game</button>
    <button className="btn ghost" disabled={!name||!code} onClick={()=>enter('join')}>Join Game</button></div></main>

  const meId=sess.id, isHost=pub.host===meId, isMe=pub.turn===meId, ph=pub.phase
  const nameOf=(id:string)=>pub.players.find((p:any)=>p.id===id)?.name
  const link=typeof location!=='undefined'?`${location.origin}/room/${code}`:''
  const Timer=()=>left===null?null:<div className={'timer '+(left<=30?'warn':'')}>{mmss(left)}</div>
  return <main><h1 style={{fontSize:'1.6rem'}}>INSIDER</h1>
    <div className="card"><div className="code">{code}</div>
      <button className="btn ghost" onClick={()=>navigator.clipboard?.writeText(link)}>Copy Invite Link</button></div><Err/>
    {ph!=='LOBBY'&&ph!=='RESULTS'&&priv.role&&<div className="card" onClick={()=>setShow(!show)}>
      <h2>You are the {priv.role}</h2>{show?(priv.word?<div className="big">The secret word:<br/>{priv.word}</div>:<p>You do NOT know the secret word.</p>):<p>(tap to show)</p>}</div>}
    {ph==='LOBBY'&&<div className="card"><h2>Players ({pub.players.length}/{pub.cfg.max})</h2>
      {pub.players.map((p:any)=><div className="row" key={p.id}><span>{p.id===pub.host?'👑':'🧑'} {p.name}{p.id===meId?' (you)':''}{!p.online&&' · away'}</span>
        <span>{p.ready?'✅ Ready':'Not ready'}{isHost&&p.id!==meId&&<button onClick={()=>run({type:'kick',target:p.id})}> ✕</button>}</span></div>)}
      <button className="btn ghost" onClick={()=>run({type:'ready'}).then(refresh)}>Toggle Ready</button>
      {isHost&&<><select value={pub.category} onChange={e=>run({type:'cat',value:e.target.value})}>{['Random',...pub.cfg.cats].map((c:string)=><option key={c}>{c}</option>)}</select>
        <button className="btn" disabled={pub.players.length<pub.cfg.min} onClick={()=>run({type:'start'})}>Start Game{pub.players.length<pub.cfg.min?` (need ${pub.cfg.min})`:''}</button></>}</div>}
    {ph==='QUESTIONING'&&<div className="card"><h2>QUESTIONING</h2><Timer/>
      <p>Current questioner: <b>{nameOf(pub.turn)}</b></p>
      {pub.questions.map((q:any,i:number)=><div className="row" key={i}><span><b>{q.by}:</b> {q.text}</span></div>)}
      {isMe&&<><input placeholder="Ask a question…" value={txt} onChange={e=>setTxt(e.target.value)}/>
        <button className="btn" onClick={async()=>{await run({type:'ask',text:txt});setTxt('')}}>Ask Question</button></>}
      <h2 style={{marginTop:16}}>What is the secret word?</h2>
      {pub.guesses.slice(-5).map((g:any,i:number)=><div key={i}>{g.by}: <b>{g.text}</b></div>)}
      {priv.role==='MASTER'?<button className="btn red" onClick={()=>run({type:'confirm'})}>✔ Someone guessed it!</button>
        :<><input placeholder="Enter guess" id="g"/><button className="btn" onClick={()=>{const el=document.getElementById('g') as HTMLInputElement; run({type:'guess',text:el.value}); el.value=''}}>Submit Guess</button></>}</div>}
    {ph==='INSIDER_VOTE'&&<div className="card"><h2>WHO IS THE INSIDER?</h2><Timer/>
      {pub.voted.includes(meId)?<p>Vote locked in. {pub.voted.length}/{pub.players.length} voted…</p>:<>
        {pub.players.filter((p:any)=>p.id!==meId).map((p:any)=><button key={p.id} className={'vote '+(sel===p.id?'sel':'')} onClick={()=>setSel(p.id)}>🎭 {p.name}</button>)}
        <button className="btn red" disabled={!sel} onClick={()=>run({type:'vote',target:sel})}>Cast Vote</button></>}</div>}
    {ph==='RESULTS'&&pub.result&&<div className="card"><h2 style={{textAlign:'center'}}>GAME OVER</h2>
      <p>THE INSIDER WAS…</p><div className="big">🎭 {pub.result.insider}</div>
      <p>THE SECRET WORD WAS…</p><div className="big">{pub.result.word}</div>
      <p>Master: {pub.result.master} · Word guessed: {pub.result.guessed?'Yes':'No'}</p>
      <h2>Votes</h2>{pub.result.tally.map((t:any)=><div className="row" key={t.name}><span>{t.name}</span><b>{t.n}</b></div>)}
      <div className="big">{pub.result.caught===null?'WORD NOT GUESSED':pub.result.caught?'INSIDER CAUGHT!':'INSIDER ESCAPED!'}</div>
      {isHost&&<button className="btn" onClick={()=>run({type:'again'})}>Play Again / Return to Lobby</button>}</div>}
    <button className="btn ghost" onClick={async()=>{await run({type:'leave'});localStorage.removeItem('insider:'+code);setSess(null);setPub(null);history.replaceState(null,'','/')}}>Leave room</button></main>
}
