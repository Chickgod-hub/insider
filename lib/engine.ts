import {createClient} from '@supabase/supabase-js'
import {CONFIG as C} from './config'
import {WORDS} from './words'
const db=()=>createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
const rid=()=>Math.random().toString(36).slice(2,10)
const clean=(s:any,n=40)=>String(s??'').trim().slice(0,n)
const pick=<T,>(a:T[])=>a[Math.floor(Math.random()*a.length)]
export class Err extends Error{}
const E=(m:string):never=>{throw new Err(m)}
const online=(p:any)=>!!p&&Date.now()-p.seen<C.graceSecs*1000
const build=(v:any)=>({phase:v.phase,host:v.host,category:v.category,endsAt:v.endsAt,turn:v.turn,questions:v.questions,
  guesses:v.guesses,guessed:v.guessed,voted:Object.keys(v.votes),result:v.result,
  players:v.players.map((p:any)=>({id:p.id,name:p.name,ready:p.ready,online:online(p)})),
  cfg:{min:C.minPlayers,max:C.maxPlayers,cats:Object.keys(WORDS)},t:Date.now()})
const nm=(v:any,id:string)=>v.players.find((p:any)=>p.id===id)?.name??'?'

export async function act(a:any){
  const d=db(), now=Date.now(); let code=clean(a.code,6).toUpperCase(); let v:any
  const save=async(pubToo=true)=>{
    if(pubToo){ const r1=await d.from('rooms').upsert({code,pub:build(v),updated_at:new Date().toISOString()}); if(r1.error) throw new Err('DB: '+r1.error.message) }
    const r2=await d.from('room_private').upsert({code,data:v}); if(r2.error) throw new Err('DB: '+r2.error.message) }
  const mk=(name:string)=>({id:rid(),token:rid()+rid(),name,ready:false,seen:now})
  if(a.type==='create'){
    const name=clean(a.name,16)||E('Please enter a display name.')
    for(let i=0;i<10;i++){ code=Array.from({length:4},()=>pick('ABCDEFGHJKLMNPQRSTUVWXYZ23456789'.split(''))).join('')
      const {data}=await d.from('rooms').select('code').eq('code',code).maybeSingle(); if(!data)break }
    const p=mk(name)
    v={phase:'LOBBY',players:[p],host:p.id,category:'Random',questions:[],guesses:[],guessed:false,votes:{},turn:null,endsAt:null,result:null}
    await save(); return {code,id:p.id,token:p.token}
  }
  const {data}=await d.from('room_private').select('data').eq('code',code).maybeSingle()
  if(!data) E("We couldn't find that room. Check the code or ask for a fresh link.")
  v=data!.data
  if(a.type==='join'){
    let name=clean(a.name,16)||E('Please enter a display name.')
    if(v.phase!=='LOBBY') E('That game has already started.')
    if(v.players.length>=C.maxPlayers) E('This room is full.')
    const base=name; let n=2; while(v.players.some((p:any)=>p.name.toLowerCase()===name.toLowerCase())) name=`${base} ${n++}`
    const p=mk(name); v.players.push(p); await save(); return {code,id:p.id,token:p.token}
  }
  const me=v.players.find((p:any)=>p.id===a.id&&p.token===a.token)
  if(!me) E('Your session expired. Please rejoin the room.')
  me.seen=now
  if(!online(v.players.find((p:any)=>p.id===v.host))) v.host=me.id
  const isHost=()=>v.host===me.id||E('Only the host can do that.')
  const finish=()=>{ const t:Record<string,number>={}; Object.values(v.votes).forEach((x:any)=>t[x]=(t[x]||0)+1)
    const top=Math.max(0,...Object.values(t)); const lead=Object.keys(t).filter(k=>t[k]===top)
    const voted=Object.keys(v.votes).length>0
    v.result={word:v.word,insider:nm(v,v.insider),master:nm(v,v.master),guessed:v.guessed,
      caught:voted?(lead.length===1&&lead[0]===v.insider):null,
      tally:v.players.map((p:any)=>({name:p.name,n:t[p.id]||0})).sort((x:any,y:any)=>y.n-x.n),
      votes:Object.entries(v.votes).map(([f,to]:any)=>({from:nm(v,f),to:nm(v,to)}))}
    v.phase='RESULTS'; v.endsAt=null }
  const toVote=()=>{ if(C.requireWordGuess&&!v.guessed) return finish(); v.phase='INSIDER_VOTE'; v.endsAt=now+C.voteSecs*1000 }
  const nextTurn=()=>{ const q=v.players.filter((p:any)=>p.id!==v.master); const i=q.findIndex((p:any)=>p.id===v.turn); v.turn=q[(i+1)%q.length].id }
  switch(a.type){
    case 'state': { await save(false)
      const inGame=v.phase!=='LOBBY'; const role=!inGame?null:me.id===v.master?'MASTER':me.id===v.insider?'INSIDER':'COMMONER'
      const word=(role==='MASTER'||(role==='INSIDER'&&C.insiderKnowsWord))?v.word:null
      return {pub:build(v),role,word} }
    case 'ready': me.ready=!me.ready; break
    case 'cat': isHost(); v.category=WORDS[a.value]?a.value:'Random'; break
    case 'kick': isHost(); if(v.phase!=='LOBBY'||a.target===me.id) E("You can't remove that player now."); v.players=v.players.filter((p:any)=>p.id!==a.target); break
    case 'leave': v.players=v.players.filter((p:any)=>p.id!==me.id); if(v.host===me.id&&v.players[0]) v.host=v.players[0].id
      if(v.players.length<C.minPlayers&&v.phase!=='LOBBY'&&v.phase!=='RESULTS') v.phase='LOBBY'; break
    case 'start': { isHost(); if(v.phase!=='LOBBY') E('Game already started.')
      if(v.players.length<C.minPlayers) E(`You need at least ${C.minPlayers} players to start.`)
      const ids=v.players.map((p:any)=>p.id).sort(()=>Math.random()-.5); v.master=ids[0]; v.insider=ids[1]
      const cat=v.category==='Random'?pick(Object.keys(WORDS)):v.category; v.word=pick(WORDS[cat])
      v.questions=[];v.guesses=[];v.guessed=false;v.votes={};v.result=null;v.phase='QUESTIONING';v.endsAt=now+C.questionSecs*1000
      v.turn=ids[2]; v.players.forEach((p:any)=>p.ready=false); break }
    case 'ask': { if(v.phase!=='QUESTIONING'||v.turn!==me.id) E("It isn't your turn.")
      const t=clean(a.text,140); if(!t) E('Type a question first.'); if(v.questions.length>=C.maxQuestions) E('No questions left!')
      v.questions.push({by:me.name,text:t}); nextTurn(); break }
    case 'guess': { if(v.phase!=='QUESTIONING'||me.id===v.master) E("You can't guess right now.")
      const t=clean(a.text,40); if(t) v.guesses.push({by:me.name,text:t}); break }
    case 'confirm': if(v.phase!=='QUESTIONING'||me.id!==v.master) E('Only the Master can confirm.'); v.guessed=true; toVote(); break
    case 'tick': if(v.endsAt&&now>=v.endsAt-1000){ if(v.phase==='QUESTIONING') toVote(); else if(v.phase==='INSIDER_VOTE') finish() } break
    case 'vote': { if(v.phase!=='INSIDER_VOTE') E('Voting is closed.'); if(v.votes[me.id]) E('You already voted.')
      if(!v.players.some((p:any)=>p.id===a.target)||a.target===me.id) E('Pick another player.')
      v.votes[me.id]=a.target; if(Object.keys(v.votes).length>=v.players.length) finish(); break }
    case 'again': isHost(); v.phase='LOBBY'; v.word=v.insider=v.master=undefined; v.questions=[];v.guesses=[];v.votes={};v.result=null;v.endsAt=null; break
    default: E('Unknown action.')
  }
  await save(); return {ok:true}
}
