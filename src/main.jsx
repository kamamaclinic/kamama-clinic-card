import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { supabase } from './supabaseClient'
import { Clock, Eye, Lock, LogOut, Minus, Plus, Search, ShieldCheck, Copy, Trash2 } from 'lucide-react'
import { motion } from 'framer-motion'
import './styles.css'

const CARD_SIZE = 300

function minutesToText(minutes){
  const safe = Math.max(0, Number(minutes||0));
  const h = Math.floor(safe/60); const m = safe%60;
  if(h && m) return `${h} שעות ו-${m} דקות`;
  if(h) return h === 1 ? 'שעה אחת' : `${h} שעות`;
  return `${m} דקות`;
}

function isExpired(date){
  if(!date) return false;
  return new Date(date) < new Date(new Date().toDateString());
}

function isExpiringSoon(date){
  if(!date) return false;

  const today = new Date();
  today.setHours(0,0,0,0);

  const target = new Date(date);
  target.setHours(23,59,59,999);

  const diff = target - today;
  const days = diff / (1000 * 60 * 60 * 24);

  return days >= 0 && days <= 30;
}
  if(!date) return false;
  const today = new Date();
  const target = new Date(date);
  const diff = target - today;
  const days = diff / (1000 * 60 * 60 * 24);
  return days >= 0 && days <= 30;
}

function oneYearFromToday(){
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0,10);
}

function getTokenFromPath(){
  const parts = window.location.pathname.split('/').filter(Boolean)
  return parts[0] === 'card' ? parts[1] : null
}

function Card({children, className=''}){ return <div className={`card ${className}`}>{children}</div> }
function Button({children,onClick,type='button',variant='',disabled=false}){ return <button type={type} disabled={disabled} onClick={onClick} className={`btn ${variant}`}>{children}</button> }
function Stat({icon:Icon,label,value}){ return <div className="stat"><div className="statLabel"><Icon size={16}/>{label}</div><div className="statValue">{value}</div></div> }

function ClientCard({card, history=[]}){
  const expired = isExpired(card.expires_at)
  const expiringSoon = isExpiringSoon(card.expires_at)
  const remaining = expired ? 0 : Math.max(0, card.total_minutes - card.used_minutes)
  const percent = Math.round((remaining / CARD_SIZE) * 100)
  const progressWidth = Math.max(0, Math.min(100, percent))

  return <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} className="clientWrap">
    <Card>
      <div className="hero">
        <div className="pill"><Eye size={16}/> צפייה בכרטיסייה</div>
        <h1>שלום {card.name}</h1>
        <p>כאן אפשר לראות את יתרת הזמן בכרטיסיית הטיפולים שלך.</p>
      </div>

      <div className="content">
        {(expired || expiringSoon) && (
          <div className="infoBox" style={{border: expired ? '2px solid #ff4d4f' : '2px solid #ffb84d'}}>
            <b style={{color: expired ? '#ff4d4f' : '#ffb84d'}}>
              {expired ? 'הכרטיסייה פגה תוקף' : 'הכרטיסייה עומדת לפוג בקרוב'}
            </b>
          </div>
        )}

        <div className="statsGrid">
          <Stat icon={ShieldCheck} label="מספר כרטיסייה" value={card.card_number ? `#${card.card_number}` : '—'} />
          <Stat icon={Clock} label="יתרה זמינה" value={minutesToText(remaining)} />
          <Stat icon={ShieldCheck} label="בתוקף עד" value={card.expires_at || 'לא הוגדר'} />
        </div>

        <div className="progressText">
          <span>יתרה ביחס לכרטיסייה רגילה</span>
          <span>{percent}%</span>
        </div>
        <div className="progress"><div style={{width:`${progressWidth}%`}} /></div>

        <div className="infoBox">
          <b>פרטים</b>
          <p>נוסף בתאריך: {card.purchased_at || '—'}</p>
          <p>הערה: {card.note || '—'}</p>
        </div>

        <h2>היסטוריית פעולות</h2>
        <div className="history">
          {history.length === 0 ? <div className="empty">אין עדיין פעולות בכרטיסייה.</div> : history.map((x)=><div className="histRow" key={x.id}><div><b>{x.description || 'פעולה'}</b><small>{new Date(x.created_at).toLocaleDateString('he-IL')}</small></div><b className={x.minutes < 0 ? 'red':'green'}>{x.minutes > 0 ? '+' : ''}{x.minutes} דק׳</b></div>)}
        </div>
      </div>
    </Card>
  </motion.div>
}

function ClientPage({token}){
  const [card,setCard]=useState(null); const [history,setHistory]=useState([]); const [loading,setLoading]=useState(true); const [err,setErr]=useState('')

  async function load(){
    setLoading(true); setErr('')
    const {data,error}=await supabase.rpc('get_client_card',{token})
    if(error){ setErr(error.message); setLoading(false); return }
    if(!data || data.length===0){ setErr('הכרטיסייה לא נמצאה.'); setLoading(false); return }

    const found=data[0]; setCard(found)

    const {data:fullClient}=await supabase.from('clients').select('id,current_cycle_started_at').eq('view_token',token).maybeSingle()

    if(fullClient?.id){
      let query = supabase.from('transactions').select('*').eq('client_id',fullClient.id).order('created_at',{ascending:false})

      if(fullClient.current_cycle_started_at){
        query = query.gte('created_at', fullClient.current_cycle_started_at)
      }

      const {data:tx}=await query
      setHistory(tx||[])
    }

    setLoading(false)
  }

  useEffect(()=>{load()},[token])

  if(loading) return <Shell><div className="center">טוען כרטיסייה...</div></Shell>
  if(err) return <Shell><Card><div className="content"><h1>אופס</h1><p>{err}</p></div></Card></Shell>
  return <Shell><ClientCard card={card} history={history}/></Shell>
}

function Login({onDone}){
  const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [err,setErr]=useState(''); const [loading,setLoading]=useState(false)

  async function submit(e){
    e.preventDefault(); setLoading(true); setErr('')
    const {error}=await supabase.auth.signInWithPassword({email,password})
    if(error) setErr('ההתחברות נכשלה. בדוק אימייל וסיסמה.')
    else onDone()
    setLoading(false)
  }

  return <Shell><div className="clientWrap"><Card><div className="hero"><div className="pill"><Lock size={16}/> כניסת מנהל</div><h1>Kamama Clinic Card</h1><p>כניסה מאובטחת לניהול כרטיסיות.</p></div><form onSubmit={submit} className="content form"><input placeholder="אימייל" value={email} onChange={e=>setEmail(e.target.value)} /><input placeholder="סיסמה" type="password" value={password} onChange={e=>setPassword(e.target.value)} />{err && <p className="error">{err}</p>}<Button type="submit" disabled={loading}>{loading?'מתחבר...':'כניסה'}</Button></form></Card></div></Shell>
}

function Admin(){
  const [session,setSession]=useState(null);
  const [clients,setClients]=useState([]);
  const [archivedClients,setArchivedClients]=useState([]);
  const [adminHistory,setAdminHistory]=useState([]);
  const [showArchive,setShowArchive]=useState(false);
  const [selectedId,setSelectedId]=useState(null);
  const [query,setQuery]=useState('');
  const [minutes,setMinutes]=useState(60);
  const [desc,setDesc]=useState('טיפול');
  const [loading,setLoading]=useState(true);

  const selected=useMemo(
    ()=>[...clients, ...archivedClients].find(c=>c.id===selectedId) || null,
    [clients, archivedClients, selectedId]
  )

  const displayedClients = showArchive ? archivedClients : clients;

  async function check(){
    const {data}=await supabase.auth.getSession();
    setSession(data.session);
    setLoading(false);
    if(data.session) load()
  }

  async function load(){ 
    const {data: activeData, error: activeError}=await supabase
      .from('clients')
      .select('*')
      .is('archived_at', null)
      .order('created_at',{ascending:false}); 

    const {data: archiveData}=await supabase
      .from('clients')
      .select('*')
      .not('archived_at', 'is', null)
      .order('archived_at',{ascending:false}); 

    if(!activeError){
      setClients(activeData||[]);
      setArchivedClients(archiveData||[]);
    } 
  }

  async function loadAdminHistory(clientId){
    if(!clientId){
      setAdminHistory([]);
      return;
    }

    const {data}=await supabase
      .from('transactions')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at',{ascending:false});

    setAdminHistory(data||[]);
  }

  useEffect(()=>{check()},[])

  useEffect(()=>{
    if(session && selected?.id) loadAdminHistory(selected.id)
    else setAdminHistory([])
  },[session, selectedId])

  if(loading) return <Shell><div className="center">טוען...</div></Shell>
  if(!session) return <Login onDone={check}/>

  async function signOut(){ await supabase.auth.signOut(); setSession(null) }

  async function updateClient(patch){
    if(!selected) return;
    await supabase.from('clients').update(patch).eq('id',selected.id);
    await load();
  }

  async function createClient(){
    const now = new Date().toISOString();

    const {data}=await supabase
      .from('clients')
      .insert({name:'מטופל חדש', used_minutes:0, current_cycle_started_at: now})
      .select()
      .single();

    await load();
    if(data?.id) setSelectedId(data.id)
  }

  async function deleteClient(){
    if(!selected) return;
    const ok = confirm('האם אתה בטוח שברצונך להעביר את הכרטיסייה לארכיון?');
    if(!ok) return;

    await supabase
      .from('clients')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', selected.id);

    setSelectedId(null);
    await load();
  }

  async function restoreClient(id){
    await supabase
      .from('clients')
      .update({ archived_at: null })
      .eq('id', id);

    setShowArchive(false);
    setSelectedId(null);
    await load();
  }

  async function permanentlyDeleteClient(id){
    const ok = confirm('מחיקה סופית! הכרטיסייה תימחק לצמיתות ולא ניתן יהיה לשחזר אותה. האם אתה בטוח?');
    if(!ok) return;

    await supabase
      .from('clients')
      .delete()
      .eq('id', id);

    setSelectedId(null);
    await load();
  }

  async function addTx(amount){
    if(!selected) return;

    const newUsed = amount < 0
      ? Math.min(selected.total_minutes, selected.used_minutes + Math.abs(amount))
      : Math.max(0, selected.used_minutes - amount);

    await supabase.from('transactions').insert({client_id:selected.id, minutes:amount, description:desc});
    await supabase.from('clients').update({used_minutes:newUsed}).eq('id',selected.id);
    await load();
    await loadAdminHistory(selected.id);
  }

  async function quickCharge300(){
    if(!selected) return;

    const expired = isExpired(selected.expires_at);
    const now = new Date().toISOString();
    const currentRemaining = Math.max(0, selected.total_minutes - selected.used_minutes);
    const transferredRemaining = expired ? 0 : currentRemaining;
    const expiredUnusedTotal = (selected.expired_unused_minutes || 0) + (expired ? currentRemaining : 0);
    const newTotal = transferredRemaining + CARD_SIZE;

    const ok = confirm(
      expired
        ? `הכרטיסייה פגה תוקף. ${minutesToText(currentRemaining)} שלא נוצלו יתועדו פנימית, והכרטיסייה החדשה תתחיל עם 300 דקות. להמשיך?`
        : `לחדש כרטיסייה: היתרה הקיימת (${minutesToText(transferredRemaining)}) תתווסף ל-300 דקות חדשות. להמשיך?`
    );
    if(!ok) return;

    await supabase
      .from('clients')
      .update({
        total_minutes: newTotal,
        used_minutes: 0,
        expires_at: oneYearFromToday(),
        purchased_at: new Date().toISOString().slice(0,10),
        expired_unused_minutes: expiredUnusedTotal,
        current_cycle_started_at: now
      })
      .eq('id', selected.id);

await supabase.from('transactions').insert({
  client_id:selected.id,
  minutes:CARD_SIZE,
  description: expired
    ? 'רכישת כרטיסייה חדשה - 300 דקות'
    : `רכישת כרטיסייה חדשה - 300 דקות + העברת יתרה קודמת של ${transferredRemaining} דקות`,
  created_at: now
});

    await load();
    await loadAdminHistory(selected.id);
  }

  function copyLink(){
    if(!selected) return;
    const link=`${window.location.origin}/card/${selected.view_token}`;
    navigator.clipboard.writeText(link);
    alert('הקישור הועתק')
  }

  function toggleArchive(){
    setShowArchive(!showArchive);
    setSelectedId(null);
  }

  return <Shell>
    <header className="top">
      <div>
        <div className="pill"><ShieldCheck size={16}/> אזור ניהול</div>
        <h1>כרטיסיות טיפולים</h1>
      </div>
      <Button onClick={signOut} variant="outline"><LogOut size={16}/> יציאה</Button>
    </header>

    <div className="adminGrid">
      <Card>
        <div className="content">
          <div className="rowBetween">
            <h2>{showArchive ? 'ארכיון' : 'מטופלים'}</h2>

            <div className="actions">
              <Button onClick={toggleArchive} variant="outline">
                {showArchive ? 'חזרה לפעילים' : 'ארכיון'}
              </Button>

              {!showArchive && (
                <Button onClick={createClient}>
                  <Plus size={16}/> חדש
                </Button>
              )}
            </div>
          </div>

          <div className="search">
            <Search size={16}/>
            <input placeholder="חיפוש לפי שם / טלפון / מספר כרטיסייה" value={query} onChange={e=>setQuery(e.target.value)} />
          </div>

          {displayedClients.filter(c=>`${c.name||''} ${c.phone||''} ${c.card_number||''}`.includes(query)).map(c=>{
            const expired = isExpired(c.expires_at);
            const expiringSoon = isExpiringSoon(c.expires_at);
            const remaining = expired ? 0 : Math.max(0, c.total_minutes-c.used_minutes);
            const ended = !expired && remaining <= 0;

            return (
              <button
                className={`clientBtn ${selected?.id===c.id?'active':''}`}
                key={c.id}
                onClick={()=>setSelectedId(c.id)}
                style={{
                  border: expired ? '2px solid #ff4d4f' : ended ? '2px solid #777' : expiringSoon ? '2px solid #ffb84d' : undefined
                }}
              >
                <b>{c.name}</b>
                <small>כרטיסייה #{c.card_number || '—'} · נותרו {minutesToText(remaining)}</small>
                {expired && <div style={{color:'#ff4d4f',fontSize:'12px',marginTop:'4px'}}>פג תוקף</div>}
                {ended && <div style={{color:'#777',fontSize:'12px',marginTop:'4px'}}>הכרטיסייה הסתיימה</div>}
                {!expired && !ended && expiringSoon && <div style={{color:'#ffb84d',fontSize:'12px',marginTop:'4px'}}>פג תוקף בקרוב</div>}
              </button>
            )
          })}
        </div>
      </Card>

      {selected ? <Card>
        <div className="content">
          <div className="rowBetween">
            <div>
              <h2>{selected.name}</h2>
              <p>כרטיסייה #{selected.card_number || '—'} · יתרה זמינה: {minutesToText(isExpired(selected.expires_at) ? 0 : selected.total_minutes-selected.used_minutes)}</p>
              {isExpired(selected.expires_at) && <p style={{color:'#ff4d4f',fontWeight:'bold'}}>פג תוקף</p>}
              {!isExpired(selected.expires_at) && (selected.total_minutes-selected.used_minutes)<=0 && <p style={{color:'#777',fontWeight:'bold'}}>הכרטיסייה הסתיימה</p>}
              {!isExpired(selected.expires_at) && (selected.total_minutes-selected.used_minutes)>0 && isExpiringSoon(selected.expires_at) && <p style={{color:'#ffb84d',fontWeight:'bold'}}>פג תוקף בקרוב</p>}
              {(selected.expired_unused_minutes || 0) > 0 && <p style={{color:'#888'}}>דקות שפגו ותועדו: {minutesToText(selected.expired_unused_minutes)}</p>}
            </div>

            <div className="actions">
              <Button onClick={copyLink} variant="outline">
                <Copy size={16}/> קישור
              </Button>

              {showArchive ? (
                <>
                  <Button onClick={()=>restoreClient(selected.id)} variant="green">שחזר</Button>
                  <Button onClick={()=>permanentlyDeleteClient(selected.id)} variant="danger">
                    <Trash2 size={16}/> מחק סופית
                  </Button>
                </>
              ) : (
                <Button onClick={deleteClient} variant="danger">
                  <Trash2 size={16}/> מחק
                </Button>
              )}
            </div>
          </div>

          <div className="fields">
            <label>שם<input value={selected.name||''} onChange={e=>updateClient({name:e.target.value})}/></label>
            <label>טלפון<input value={selected.phone||''} onChange={e=>updateClient({phone:e.target.value})}/></label>
            <label>מספר כרטיסייה<input type="number" value={selected.card_number||''} onChange={e=>updateClient({card_number:Number(e.target.value)})}/></label>
            <label>סה״כ דקות שנרכשו<input type="number" value={selected.total_minutes||0} onChange={e=>updateClient({total_minutes:Number(e.target.value)})}/></label>
            <label>דקות שפגו ותועדו<input type="number" value={selected.expired_unused_minutes||0} onChange={e=>updateClient({expired_unused_minutes:Number(e.target.value)})}/></label>
            <label>תוקף<input type="date" value={selected.expires_at||''} onChange={e=>updateClient({expires_at:e.target.value})}/></label>
          </div>

          <label>הערה<textarea value={selected.note||''} onChange={e=>updateClient({note:e.target.value})}/></label>

          {!showArchive && (
            <div className="charge">
              <h3>טעינה / גריעת זמן</h3>

              <Button onClick={quickCharge300} variant="green">
                <Plus size={16}/> חידוש כרטיסייה 300 דקות
              </Button>

              <div className="chargeGrid">
                <input type="number" value={minutes} onChange={e=>setMinutes(Number(e.target.value))}/>
                <input value={desc} onChange={e=>setDesc(e.target.value)}/>
                <Button onClick={()=>addTx(-Number(minutes))} variant="danger"><Minus size={16}/> גרע</Button>
                <Button onClick={()=>addTx(Number(minutes))} variant="green"><Plus size={16}/> טען</Button>
              </div>
            </div>
          )}

          <ClientCard card={selected} history={adminHistory} />
        </div>
      </Card> : <Card><div className="content">{showArchive ? 'בחר כרטיסייה מהארכיון.' : 'בחר כרטיסייה פעילה מהרשימה.'}</div></Card>}
    </div>
  </Shell>
}

function Shell({children}){ return <main><div className="app">{children}</div></main> }
function App(){ const token=getTokenFromPath(); return token ? <ClientPage token={token}/> : <Admin/> }
createRoot(document.getElementById('root')).render(<App />)
