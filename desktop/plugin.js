/** Usage HUD — official Desktop SDK only; no credentials, shell or core patches.
 * Model and Context remain the native status-bar items (no duplicate gauge).
 * Account JSON: model.options -> inventory._apply_usage -> account_usage cache.
 * session.usage refreshes that same cache via the CLI's fetch_account_usage.
 */
import { host, useValue, useQuery, useQueryClient, Popover, PopoverTrigger, PopoverContent } from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'
import { useEffect, useRef, useState } from 'react'

/* PURE START */
function isCount(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 }
function resetCountdown(value, now) {
  if (!value) return null
  const diff = Date.parse(value) - now
  if (!Number.isFinite(diff) || diff <= 0) return null
  const minutes = Math.ceil(diff / 60000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  return `Reset in ${days ? `${days}d ` : ''}${hours || days ? `${hours}h ` : ''}${mins}m`
}
function windowViews(windows, now) {
  const labels = { Session: '5h', Weekly: 'Week' }
  return (Array.isArray(windows) ? windows : []).filter(w =>
    labels[w.label] && (!w.scope || w.scope === 'account') && isCount(w.used_percent) && w.used_percent <= 100 &&
    (!w.resets_at || (Number.isFinite(Date.parse(w.resets_at)) && Date.parse(w.resets_at) > now))
  ).map(w => ({ label: labels[w.label], remaining: Number((100 - w.used_percent).toFixed(6)), resets_at: w.resets_at || null }))
}
function accountView(payload, now) {
  const provider = payload?.providers?.find(p => p.slug === 'openai-codex')
  const usage = provider?.usage
  if (usage?.accounts?.length) {
    return { windows: [], multiple: true, accounts: usage.accounts.map(a => ({
      label: a.label || a.id, state: a.state,
      windows: windowViews(a.windows, now)
    })) }
  }
  return { windows: windowViews(usage?.windows, now), multiple: false, accounts: [] }
}
function remainingLevel(p) { return p < 20 ? 'danger' : p <= 50 ? 'warning' : 'normal' }
function contextLevel(p) { return p > 95 ? 'critical' : p >= 80 ? 'danger' : p >= 50 ? 'warning' : 'normal' }
function meterView(value, kind) {
  if (!isCount(value) || value > 100 || !['remaining','used'].includes(kind)) return null
  const percent = Number(value.toFixed(1))
  return { percent, text:`${percent}% ${kind}`, level:kind === 'remaining' ? remainingLevel(value) : contextLevel(value) }
}
function compactTokens(n) {
  if (!isCount(n)) return null
  return n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}
function sessionRows(usage) {
  return [['Input tokens','input'],['Output tokens','output'],['Session total','total']]
    .filter(([,key]) => isCount(usage?.[key]))
    .map(([label,key]) => [label,usage[key].toLocaleString('en-US')])
}
/* PURE END */

const ID = 'usage-hud'
const REFRESH_MS = 60000
const MIN_REFRESH_MS = 30000
const levelColor = level => level === 'normal' ? 'var(--ui-text-secondary)' : level === 'warning' ? 'var(--ui-yellow)' : 'var(--dt-destructive)'
const timeText = value => new Date(value).toLocaleString(undefined, { timeZoneName: 'short' })

function Meter({label,value,kind,detail,resetAt,now}) {
  const meter = meterView(value,kind)
  if (!meter) return null
  const color = meter.level === 'normal' ? 'var(--ui-accent)' : levelColor(meter.level)
  return jsxs('div',{style:{marginTop:10},children:[
    jsx(DetailRow,{label,value:meter.text,level:meter.level}),
    jsx('div',{role:'progressbar','aria-label':`${label}: ${kind}`,'aria-valuemin':0,'aria-valuemax':100,'aria-valuenow':meter.percent,'aria-valuetext':meter.text,
      style:{height:6,borderRadius:4,background:'var(--ui-stroke-secondary)',overflow:'hidden',marginTop:5},
      children:jsx('div',{style:{width:`${meter.percent}%`,height:'100%',borderRadius:4,background:color}})}),
    resetAt && resetCountdown(resetAt,now) ? jsxs('div',{style:{display:'flex',justifyContent:'space-between',gap:10,flexWrap:'wrap',fontSize:11,marginTop:4,color:'var(--ui-text-tertiary)'},children:[
      jsx('span',{children:resetCountdown(resetAt,now)}),jsx('span',{style:{marginLeft:'auto',textAlign:'right'},children:timeText(resetAt)})
    ]}) : detail ? jsx('div',{style:{fontSize:11,marginTop:4,color:'var(--ui-text-tertiary)'},children:detail}) : null
  ]})
}

function DetailRow({label,value,level='normal'}) {
  return jsxs('div', { style:{display:'flex',justifyContent:'space-between',gap:20}, children:[
    jsx('span',{style:{color:'var(--ui-text-tertiary)'},children:label}),
    jsx('span',{style:{color:levelColor(level),fontVariantNumeric:'tabular-nums',textAlign:'right',fontWeight:level==='critical'?700:undefined},children:value})
  ] })
}

function UsageHud() {
  const sid = useValue(host.state.focusedSessionId)
  const storedId = useValue(host.state.focusedStoredSessionId)
  const profile = useValue(host.state.focusedSessionProfile)
  const model = useValue(host.state.model)
  const gateway = useValue(host.state.gateway)
  const liveUsage = useValue(host.state.focusedUsage)
  const busy = useValue(host.state.busy)
  const owner = useValue(host.state.focusedSessionOwner)
  const [open,setOpen] = useState(false)
  const [clock,setClock] = useState(() => Date.now())
  useEffect(() => {
    if (!open) return
    setClock(Date.now())
    const timer = setInterval(() => setClock(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [open])
  const client = useQueryClient()
  const queryKey = [ID, owner?.connectionId ?? '', profile, sid, storedId, model]
  const query = useQuery({
    queryKey,
    enabled: gateway === 'open',
    staleTime: MIN_REFRESH_MS,
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async () => {
      // Read numeric usage and refresh account cache; never parse account_lines.
      let usage = null
      let usageError = null
      if (sid) {
        try { usage = await host.request('session.usage',{session_id:sid}) }
        catch(error) { usageError = String(error?.message || error) }
      }
      // host.request follows focus. Never issue the next call under a different session.
      if (host.state.focusedSessionId.get() !== sid || host.state.focusedSessionProfile.get() !== profile) {
        throw new Error('Session changed during refresh')
      }
      const catalog = await host.request('model.options',sid ? {session_id:sid} : {})
      return { catalog, usage, usageError, readAt:Date.now(), sid, storedId }
    }
  })
  const previous = useRef({sid:null,calls:null,busy:false})
  useEffect(() => {
    const prev = previous.current
    const changed = prev.sid === sid && ((isCount(liveUsage?.calls) && liveUsage.calls !== prev.calls) || (prev.busy && !busy))
    previous.current = {sid,calls:liveUsage?.calls,busy}
    // On call/turn completion, React Query dedupes and respects a 30s lower bound.
    if (changed && !query.isFetching && Date.now() - query.dataUpdatedAt >= MIN_REFRESH_MS) {
      void client.invalidateQueries({queryKey,exact:true})
    }
  }, [sid,liveUsage?.calls,busy,query.dataUpdatedAt,query.isFetching,client,profile,model,storedId])
  useEffect(() => { setOpen(false) }, [sid,storedId,profile])

  const fresh = gateway === 'open' && !query.isError && query.data && Date.now() - query.dataUpdatedAt < 150000
  const account = fresh ? accountView(query.data.catalog,Date.now()) : {windows:[],accounts:[],multiple:false}
  const usage = sid ? (liveUsage || query.data?.usage) : null
  const total = compactTokens(usage?.total)
  const segments = account.windows.map(w => ({text:`${w.label} ${w.remaining}% left`,level:remainingLevel(w.remaining)}))
  if (!account.windows.length) segments.push({text:account.multiple?'Accounts':'Limits —',level:'normal'})
  if (total !== null) segments.push({text:`Session ${total} tok`,level:'normal'})
  const label = segments.map(s=>s.text).join(' | ')
  const rows = []
  const actualModel = query.data?.catalog?.model || model
  if (actualModel) rows.push(['Model',actualModel])
  rows.push(...sessionRows(usage))
  // The SDK has no exact cached-token count or plan on model.options. Omit, don't infer.
  if (fresh) rows.push(['Read at',timeText(query.data.readAt)])
  const notice = query.isError ? `Usage unavailable: ${String(query.error?.message || query.error)}` :
    !fresh ? 'Waiting for current account usage' : account.multiple ? 'Multiple accounts: no combined percentage' :
    account.windows.length < 2 ? 'Some account limits are unavailable' : null
  return jsxs(Popover, {open,onOpenChange:setOpen,children:[
    jsx(PopoverTrigger,{asChild:true,children:jsx('button',{
      type:'button','data-usage-hud':'true','aria-label':`Usage HUD: ${label}`,
      title:'OpenAI Codex account remaining • click for session and reset details',
      style:{display:'inline-flex',alignItems:'center',gap:6,padding:'0 6px',height:'100%',fontSize:'0.6875rem',whiteSpace:'nowrap',fontVariantNumeric:'tabular-nums',cursor:'pointer'},
      children:segments.map((s,i)=>jsxs('span',{children:[i?jsx('span',{style:{color:'var(--ui-text-quaternary)',marginRight:6},children:'|'}):null,jsx('span',{style:{color:levelColor(s.level)},children:s.text})]},String(i)))
    })}),
    jsxs(PopoverContent,{side:'top',align:'end',sideOffset:8,style:{width:370,maxWidth:'calc(100vw - 24px)',padding:12},children:[

      jsx('div',{style:{fontSize:11,fontWeight:600,color:'var(--ui-text-secondary)'},children:'Codex account limits'}),
      ...account.windows.map(w=>jsx(Meter,{label:w.label === '5h' ? '5-hour limit' : 'Weekly limit',value:w.remaining,kind:'remaining',resetAt:w.resets_at,now:clock},w.label)),
      jsx('div',{style:{fontSize:11,fontWeight:600,color:'var(--ui-text-secondary)',marginTop:16,marginBottom:8},children:'Current session'}),
      isCount(usage?.context_used) && isCount(usage?.context_max) && usage.context_max > 0 ? jsx(Meter,{label:usage.context_estimated ? 'Context (Hermes estimate)' : 'Context',value:usage.context_percent,kind:'used',detail:`${usage.context_used.toLocaleString('en-US')} / ${usage.context_max.toLocaleString('en-US')} tokens`}) : null,
      jsx('div',{'data-usage-details':'true',style:{display:'flex',flexDirection:'column',gap:6,fontSize:12},children:rows.map(([label,value,level])=>jsx(DetailRow,{label,value,level},label))}),
      ...account.accounts.map((a,i)=>jsxs('div',{style:{marginTop:10,fontSize:12},children:[
        jsx('strong',{children:a.label}),jsx('span',{children:` · ${a.state}`}),
        ...a.windows.map(w=>jsx(DetailRow,{label:`${w.label} remaining`,value:`${w.remaining}%`,level:remainingLevel(w.remaining)},w.label))
      ]},String(i))),
      notice?jsx('p',{style:{fontSize:11,marginTop:10,color:'var(--ui-text-tertiary)'},children:notice}):null,
      jsx('p',{style:{fontSize:10,marginTop:10,color:'var(--ui-text-quaternary)'},children:'Account: Hermes JSON RPC · session: live SDK · refresh 60s'})
    ]})
  ]})
}

export default {
  id:ID,
  name:'Usage HUD',
  register(ctx) {
    ctx.register({id:'limits',area:'statusBar.right',order:80,title:'Usage HUD',render:()=>jsx(UsageHud,{})})
  }
}
