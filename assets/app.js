const $ = (s, root=document) => root.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const api = async (action, {method='GET', data=null, query=''}={}) => {
  const options={method,headers:{'Accept':'application/json'}};
  if(data){options.headers['Content-Type']='application/json';options.headers['X-CSRF-Token']=window.QUEUE_CSRF||'';options.body=JSON.stringify(data);}
  const response=await fetch(`api.php?action=${encodeURIComponent(action)}${query}`,options);
  const result=await response.json().catch(()=>({error:'Jawaban server tidak dapat dibaca.'}));
  if(!response.ok)throw new Error(result.error||'Permintaan gagal.');return result;
};
const toast = message => {const el=$('#toast');if(!el)return;el.textContent=message;el.classList.remove('hidden');clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>el.classList.add('hidden'),3200);};
const setError = (el,msg) => {if(!el)return;el.textContent=msg;el.classList.toggle('hidden',!msg);};
const fmtTime = value => {if(!value)return '—';const d=new Date(String(value).replace(' ','T'));return d.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});};

// QR Code versi 5-L, cukup untuk URL pelacakan aplikasi dan tidak bergantung layanan luar.
function qrSvg(text){
  const version=5,size=37,dataCodewords=108,eccCodewords=26,bytes=new TextEncoder().encode(text);
  if(bytes.length>106)throw new Error('Alamat pelacakan terlalu panjang untuk QR tiket.');
  const bits=[];const appendBits=(value,length)=>{for(let i=length-1;i>=0;i--)bits.push((value>>>i)&1);};
  appendBits(4,4);appendBits(bytes.length,8);bytes.forEach(b=>appendBits(b,8));
  for(let i=0;i<Math.min(4,dataCodewords*8-bits.length);i++)bits.push(0);
  while(bits.length%8)bits.push(0);
  const data=[];for(let i=0;i<bits.length;i+=8){let value=0;for(let j=0;j<8;j++)value=(value<<1)|bits[i+j];data.push(value);}
  for(let pad=0;data.length<dataCodewords;pad++)data.push(pad%2===0?0xec:0x11);
  const gfMul=(x,y)=>{let z=0;while(y){if(y&1)z^=x;y>>>=1;x=((x<<1)^((x&0x80)?0x11d:0))&0xff;}return z;};
  const divisor=new Uint8Array(eccCodewords);divisor[eccCodewords-1]=1;let root=1;
  for(let i=0;i<eccCodewords;i++){
    for(let j=0;j<divisor.length;j++){divisor[j]=gfMul(divisor[j],root);if(j+1<divisor.length)divisor[j]^=divisor[j+1];}
    root=gfMul(root,2);
  }
  const remainder=new Uint8Array(eccCodewords);
  data.forEach(value=>{const factor=value^remainder[0];remainder.copyWithin(0,1);remainder[eccCodewords-1]=0;for(let i=0;i<remainder.length;i++)remainder[i]^=gfMul(divisor[i],factor);});
  const codewords=[...data,...remainder],modules=Array.from({length:size},()=>Array(size).fill(false)),func=Array.from({length:size},()=>Array(size).fill(false));
  const setFunc=(x,y,dark)=>{if(x>=0&&x<size&&y>=0&&y<size){modules[y][x]=dark;func[y][x]=true;}};
  const finder=(cx,cy)=>{for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const dist=Math.max(Math.abs(dx),Math.abs(dy));setFunc(cx+dx,cy+dy,dist!==2&&dist!==4);}};
  finder(3,3);finder(size-4,3);finder(3,size-4);
  for(let i=0;i<size;i++){if(!func[6][i])setFunc(i,6,i%2===0);if(!func[i][6])setFunc(6,i,i%2===0);}
  for(const cy of [6,30])for(const cx of [6,30])if(!func[cy][cx])for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)setFunc(cx+dx,cy+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1);
  const drawFormat=mask=>{
    const value=(1<<3)|mask;let rem=value;for(let i=0;i<10;i++)rem=(rem<<1)^(((rem>>>9)&1)*0x537);const format=((value<<10)|rem)^0x5412;const bit=i=>((format>>>i)&1)!==0;
    for(let i=0;i<=5;i++)setFunc(8,i,bit(i));setFunc(8,7,bit(6));setFunc(8,8,bit(7));setFunc(7,8,bit(8));
    for(let i=9;i<15;i++)setFunc(14-i,8,bit(i));for(let i=0;i<8;i++)setFunc(size-1-i,8,bit(i));for(let i=8;i<15;i++)setFunc(8,size-15+i,bit(i));setFunc(8,size-8,true);
  };
  drawFormat(0);
  let bitIndex=0;
  for(let right=size-1;right>=1;right-=2){if(right===6)right=5;for(let vert=0;vert<size;vert++)for(let j=0;j<2;j++){const x=right-j,y=((right+1)&2)===0?size-1-vert:vert;if(!func[y][x]){if(bitIndex<codewords.length*8)modules[y][x]=((codewords[bitIndex>>>3]>>>(7-(bitIndex&7)))&1)!==0;bitIndex++;}}}
  for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(!func[y][x]&&(x+y)%2===0)modules[y][x]=!modules[y][x];
  drawFormat(0);
  const quiet=4,total=size+quiet*2;let path='';for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(modules[y][x])path+=`M${x+quiet} ${y+quiet}h1v1h-1z`;
  return `<svg class="ticket-qr" viewBox="0 0 ${total} ${total}" role="img" aria-label="QR pelacakan antrean" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

async function initKiosk(){
  const office=document.body.dataset.office;let services=[];
  try{const data=await api('public_init',{query:`&office=${encodeURIComponent(office)}`});$('#officeName').textContent=data.office.name;services=data.services;$('#serviceSelect').innerHTML='<option value="">Pilih jenis layanan</option>'+services.map(s=>`<option value="${s.id}">${esc(s.code)} · ${esc(s.name)}</option>`).join('');$('#issueBtn').disabled=!services.length;}
  catch(e){setError($('#kioskError'),e.message);}
  $('#serviceSelect')?.addEventListener('change',()=>$('#issueBtn').disabled=!$('#serviceSelect').value);
  $('#issueBtn')?.addEventListener('click',async()=>{setError($('#kioskError'),'');$('#issueBtn').disabled=true;try{const d=await api('issue',{method:'POST',data:{office,service_id:Number($('#serviceSelect').value)}});renderTicket(d.ticket);$('#kioskForm').classList.add('hidden');}catch(e){setError($('#kioskError'),e.message);$('#issueBtn').disabled=false;}});
}
function renderTicket(t){
  const box=$('#ticketResult');let qr='';try{qr=qrSvg(t.track_url);}catch(e){qr='<p class="ticket-qr-error">QR tidak dapat dibuat.</p>';}
  box.innerHTML=`<div class="ticket-paper"><img class="ticket-logo" src="assets/logo-djp.svg" alt="Logo DJP"><div class="ticket-label">TIKET ANTREAN</div><div class="ticket-number">${esc(t.ticket_no)}</div><div class="ticket-divider"></div><p class="ticket-service">${esc(t.service_name)}</p><p class="ticket-office">${esc(t.office_name)}</p><p class="ticket-time">${esc(t.issued_at)}</p><div class="ticket-code-label">PANTAU ANTREAN</div><div class="ticket-qr-wrap">${qr}</div><p class="ticket-qr-caption">Pindai QR untuk melihat posisi antrean</p><p class="ticket-url">${esc(t.track_url)}</p><p class="ticket-reminder">Mohon simpan tiket ini. Nomor Anda akan dipanggil di layar.</p></div><div class="ticket-actions"><button class="button primary" id="printTicket">Cetak tiket</button><button class="button outline" id="newTicket">Ambil tiket lain</button></div>`;box.classList.remove('hidden');$('#printTicket').onclick=()=>window.print();$('#newTicket').onclick=()=>{box.classList.add('hidden');$('#kioskForm').classList.remove('hidden');$('#issueBtn').disabled=!$('#serviceSelect').value;};
}

function displaySpeechController(){
  const supported='speechSynthesis' in window&&'SpeechSynthesisUtterance' in window;
  const state={enabled:false,wantsSound:false,firstState:true,events:new Map(),voices:[],voiceUri:''};
  try{state.wantsSound=supported&&localStorage.getItem('queue-display-sound')==='on';state.voiceUri=localStorage.getItem('queue-display-voice')||'';}catch(e){}
  const controls=document.createElement('div');controls.className='sound-controls';controls.innerHTML='<select class="sound-voice-select" aria-label="Pilih suara Bahasa Indonesia"></select><button type="button" class="sound-toggle"></button>';
  $('.display-header').insertBefore(controls,$('.live'));const button=$('.sound-toggle',controls),select=$('.sound-voice-select',controls);
  const isIndonesian=item=>/^id(?:-|_)/i.test(item.lang)||/(indonesia|bahasa indonesia|andika)/i.test(item.name);
  const score=item=>(/^id-ID$/i.test(item.lang)?100:0)+(/natural/i.test(item.name)?80:0)+(/google/i.test(item.name)?60:0)+(/online/i.test(item.name)?40:0)+(/andika/i.test(item.name)?20:0);
  const selectedVoice=()=>state.voices.find(item=>item.voiceURI===state.voiceUri)||null;
  const updateButton=()=>{const available=state.voices.length>0;state.enabled=state.wantsSound&&available;button.classList.toggle('active',state.enabled);button.disabled=!supported||!available;button.setAttribute('aria-pressed',String(state.enabled));button.title=!supported?'Browser tidak mendukung suara':!available?'Pasang suara Bahasa Indonesia pada Windows lalu buka ulang browser':'';button.innerHTML=supported&&available?`<span aria-hidden="true">${state.enabled?'🔊':'🔈'}</span><span class="sound-label">${state.enabled?'Suara aktif':'Aktifkan suara'}</span>`:'<span aria-hidden="true">🔇</span><span class="sound-label">Suara Indonesia belum tersedia</span>';};
  const refreshVoices=()=>{
    if(!supported)return;const previous=state.voiceUri;state.voices=speechSynthesis.getVoices().filter(isIndonesian).sort((a,b)=>score(b)-score(a)||a.name.localeCompare(b.name));
    if(!state.voices.some(item=>item.voiceURI===previous))state.voiceUri=state.voices[0]?.voiceURI||'';
    select.innerHTML=state.voices.length?state.voices.map(item=>`<option value="${esc(item.voiceURI)}" ${item.voiceURI===state.voiceUri?'selected':''}>${esc(item.name)} · ${esc(item.lang)}</option>`).join(''):'<option value="">Suara Bahasa Indonesia belum terpasang</option>';
    select.disabled=state.voices.length===0;try{if(state.voiceUri)localStorage.setItem('queue-display-voice',state.voiceUri);}catch(e){}updateButton();
  };
  const speak=text=>{const voice=selectedVoice();if(!state.enabled||!supported||!voice)return;const message=new SpeechSynthesisUtterance(text);message.lang='id-ID';message.rate=.95;message.pitch=1;message.volume=1;message.voice=voice;speechSynthesis.speak(message);};
  const ticketWords=ticket=>{const digits=['nol','satu','dua','tiga','empat','lima','enam','tujuh','delapan','sembilan'],letters={A:'a',B:'be',C:'ce',D:'de',E:'e',F:'ef',G:'ge',H:'ha',I:'i',J:'je',K:'ka',L:'el',M:'em',N:'en',O:'o',P:'pe',Q:'ki',R:'er',S:'es',T:'te',U:'u',V:'ve',W:'we',X:'eks',Y:'ye',Z:'zet'};return String(ticket).toUpperCase().split('').map(char=>/\d/.test(char)?digits[Number(char)]:char==='-'?',':letters[char]||char).join(' ');};
  button.onclick=()=>{if(!supported||!state.voices.length)return;state.wantsSound=!state.enabled;try{localStorage.setItem('queue-display-sound',state.wantsSound?'on':'off');}catch(e){}speechSynthesis.cancel();updateButton();if(state.enabled)speak('Suara Bahasa Indonesia aktif. Contoh, nomor antrean a, nol nol satu. Silakan menuju loket a.');};
  select.onchange=()=>{state.voiceUri=select.value;try{localStorage.setItem('queue-display-voice',state.voiceUri);}catch(e){}speechSynthesis.cancel();if(state.enabled)speak('Ini contoh suara panggilan antrean.');};
  refreshVoices();if(supported)speechSynthesis.onvoiceschanged=refreshVoices;
  return calls=>{
    const next=new Map();
    calls.forEach(call=>{if(!call.ticket_no)return;const key=`${call.ticket_no}:${call.call_count||call.called_at||''}`,counter=String(call.counter_id);next.set(counter,key);if(!state.firstState&&state.events.get(counter)!==key){const repeat=Number(call.call_count)>1?'Panggilan ulang. ':'';const destination=call.counter_name||`Loket ${call.counter_code}`;speak(`${repeat}Nomor antrean ${ticketWords(call.ticket_no)}. Silakan menuju ${destination}.`);}});
    state.events=next;state.firstState=false;
  };
}

async function initDisplay(){
  const office=document.body.dataset.office;
  try{const d=await api('public_init',{query:`&office=${encodeURIComponent(office)}`});$('#displayOffice').textContent=d.office.name;}catch(e){$('#displayOffice').textContent='Kantor tidak ditemukan';return;}
  const announceCalls=displaySpeechController();
  const clock=()=>$('#displayClock').textContent=new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});clock();setInterval(clock,1000);
  const refresh=async()=>{try{const d=await api('public_state',{query:`&office=${encodeURIComponent(office)}`});
    const cards=d.calls.length?d.calls.map(c=>`<article class="call-card"><div class="call-top"><span>${esc(c.service_name)}</span><span>${esc(c.counter_code)}</span></div><div class="call-number">${esc(c.ticket_no||'—')}</div><div class="call-bottom">${c.ticket_no?'Silakan menuju loket':'Belum ada panggilan'}</div></article>`).join(''):'<div class="empty-call">Belum ada loket aktif.</div>';
    $('#callGrid').innerHTML=cards;$('#waitingServices').innerHTML=d.services.length?d.services.map(s=>`<div class="wait-line"><span><b>${esc(s.code)}</b> ${esc(s.name)}</span><strong>${Number(s.waiting)}</strong></div>`).join(''):'<p class="muted">Belum ada layanan.</p>';
    $('#recentCalls').innerHTML=d.recent.length?d.recent.map(r=>`<div class="recent-line"><b>${esc(r.ticket_no)}</b><span>Loket ${esc(r.counter_code||'—')}</span></div>`).join(''):'<p class="muted">Belum ada panggilan.</p>';
    announceCalls(d.calls);$('#displayUpdated').textContent='Diperbarui '+new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  }catch(e){$('#displayUpdated').textContent='Koneksi terputus · mencoba kembali';}};await refresh();setInterval(refresh,3000);
}

async function initTrack(){
  const params=new URLSearchParams(location.search);const initialOffice=params.get('office')||document.body.dataset.office;const initialTicket=params.get('ticket')||'';const code=params.get('code')||'';
  try{const d=await api('offices_list');$('#trackOffice').innerHTML='<option value="">Pilih kantor</option>'+d.offices.map(o=>`<option value="${esc(o.slug)}">${esc(o.name)}</option>`).join('');if(initialOffice)$('#trackOffice').value=initialOffice;}catch(e){setError($('#trackError'),e.message);}
  if(initialTicket)$('#trackInput').value=initialTicket;
  $('#trackForm').addEventListener('submit',e=>{e.preventDefault();const ticket=$('#trackInput').value.trim().toUpperCase();const office=$('#trackOffice').value;if(ticket&&office){history.replaceState({},'',`index.php?page=track&office=${encodeURIComponent(office)}&ticket=${encodeURIComponent(ticket)}`);loadTrack({office,ticket});}});
  if(code)loadTrack({code});else if(initialOffice&&initialTicket)loadTrack({office:initialOffice,ticket:initialTicket});
  setInterval(()=>{if(window.currentTrack)loadTrack(window.currentTrack);},5000);
}
async function loadTrack(identity){
  window.currentTrack=identity;
  try{const query=identity.code?`&code=${encodeURIComponent(identity.code)}`:`&office=${encodeURIComponent(identity.office)}&ticket=${encodeURIComponent(identity.ticket)}`;const d=await api('track',{query});setError($('#trackError'),'');const t=d.ticket;const labels={waiting:'Menunggu panggilan',called:'Sedang dipanggil',done:'Selesai dilayani',absent:'Belum hadir'};const lead=t.status==='waiting'?`<b>${d.ahead}</b> antrean di depan Anda`:t.status==='called'?'Silakan menuju loket':t.status==='absent'?'Hubungi petugas saat Anda kembali':'Terima kasih telah menggunakan layanan';
    $('#trackResult').innerHTML=`<div class="track-ticket"><div class="track-status"><span class="status-dot ${esc(t.status)}"></span>${esc(labels[t.status]||t.status)}</div><div class="track-number">${esc(t.ticket_no)}</div><div class="track-service">${esc(t.service_name)} · ${esc(t.office_name)}</div><div class="ahead-box"><b>${lead}</b><small>Nomor yang sedang dilayani: ${esc(d.now_serving||'belum ada')}</small></div>${t.callback==1?'<div class="callback-tip">Nomor Anda akan dipanggil kembali setelah antrean yang sedang menunggu.</div>':''}</div>`;$('#trackResult').classList.remove('hidden');
  }catch(e){$('#trackResult').classList.add('hidden');setError($('#trackError'),e.message);}
}

let operatorData=null, adminData=null;
async function initOperator(){
  const loginPanel=$('#loginPanel'),opPanel=$('#operatorPanel');
  $('#loginForm').addEventListener('submit',async e=>{e.preventDefault();setError($('#loginError'),'');const form=new FormData(e.currentTarget);try{const d=await api('login',{method:'POST',data:{username:form.get('username'),password:form.get('password')}});window.QUEUE_CSRF=d.csrf;location.reload();}catch(err){setError($('#loginError'),err.message);}});
  try{operatorData=await api('operator_init');loginPanel.classList.add('hidden');opPanel.classList.remove('hidden');$('#sideUser').textContent=operatorData.user.name;$('#sideOffice').textContent=operatorData.user.office_name;$('#greeting').textContent=`Halo, ${operatorData.user.name}`;$('#todayLabel').textContent=new Date().toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
    $('#counterSelect').innerHTML=operatorData.counters.map(c=>`<option value="${c.id}">${esc(c.code)} · ${esc(c.name)}</option>`).join('');if(!operatorData.counters.length)$('#counterSelect').innerHTML='<option value="">Belum ada loket. Minta administrator menambahkan.</option>';
    $('#nextBtn').onclick=async()=>{try{await api('operator_action',{method:'POST',data:{op:'next',counter_id:Number($('#counterSelect').value)}});await refreshOperator();}catch(e){toast(e.message);}};
    $('#refreshBtn').onclick=refreshOperator;$('#logoutBtn').onclick=async()=>{try{await api('logout',{method:'POST',data:{}});}finally{location.reload();}};
    $('#ticketRows').addEventListener('click',handleTicketAction);
    if(operatorData.user.role==='admin'){$$('.admin-only').forEach(x=>x.classList.remove('hidden'));initDashboardUi();initAdmin();}
    await refreshOperator();setInterval(refreshOperator,5000);
  }catch(e){if(!String(e.message).includes('masuk')){if(e.message.includes('administrator')){loginPanel.classList.remove('hidden');} }else loginPanel.classList.remove('hidden');}
}
const $$ = (s,root=document)=>[...root.querySelectorAll(s)];
function initDashboardUi(){
  const settingsNav=$('.nav-item[href="#settings"]');
  settingsNav.insertAdjacentHTML('beforebegin','<a class="nav-item admin-only" href="#dashboard">▦ <span>Dashboard</span></a>');
  $('#settings').insertAdjacentHTML('beforebegin',`<section id="dashboard" class="dashboard-panel hidden"><div class="content-heading dashboard-heading"><div><p class="eyebrow">ADMINISTRATOR</p><h2>Dashboard antrean</h2><p class="muted">Ringkasan layanan hari ini dan tujuh hari terakhir.</p></div><button id="refreshDashboardBtn" class="icon-button" aria-label="Muat ulang dashboard">↻</button></div><div id="dashboardError" class="notice error hidden"></div><div class="dashboard-stats"><div class="dashboard-stat"><span>TIKET TERBIT</span><b id="dashIssued">0</b></div><div class="dashboard-stat"><span>MENUNGGU</span><b id="dashWaiting">0</b></div><div class="dashboard-stat"><span>DIPANGGIL</span><b id="dashCalled">0</b></div><div class="dashboard-stat"><span>SELESAI</span><b id="dashDone">0</b></div><div class="dashboard-stat"><span>BELUM HADIR</span><b id="dashAbsent">0</b></div><div class="dashboard-stat"><span>RATA-RATA TUNGGU</span><b id="dashAvgWait">—</b></div></div><div class="dashboard-grid"><article class="dashboard-card"><div class="dashboard-card-head"><div><p class="eyebrow">7 HARI TERAKHIR</p><h3>Volume antrean</h3></div><div class="chart-legend"><span><i class="issued"></i>Terbit</span><span><i class="done"></i>Selesai</span></div></div><div id="dashboardTrend" class="dashboard-trend"></div></article><article class="dashboard-card dashboard-service-card"><div class="dashboard-card-head"><div><p class="eyebrow">HARI INI</p><h3>Rincian per layanan</h3></div></div><div class="table-scroll"><table class="dashboard-table"><thead><tr><th>Layanan</th><th>Terbit</th><th>Menunggu</th><th>Selesai</th><th>Belum hadir</th><th>Rata-rata tunggu</th></tr></thead><tbody id="dashboardServices"></tbody></table></div></article></div><p id="dashboardUpdated" class="dashboard-updated"></p></section>`);
  const showPanel=name=>{
    ['queue','dashboard','settings'].forEach(id=>$('#'+id)?.classList.toggle('hidden',id!==name));
    $$('.nav-item[href^="#"]').forEach(link=>link.classList.toggle('active',link.getAttribute('href')==='#'+name));
    if(name==='dashboard')loadDashboard();if(name==='settings')loadAdmin();
  };
  $$('.nav-item[href="#queue"],.nav-item[href="#dashboard"],.nav-item[href="#settings"]').forEach(link=>link.addEventListener('click',e=>{e.preventDefault();showPanel(link.getAttribute('href').slice(1));}));
  $('#refreshDashboardBtn').onclick=loadDashboard;
}
async function loadDashboard(){
  try{
    const data=await api('admin_dashboard');setError($('#dashboardError'),'');const s=data.summary;
    $('#dashIssued').textContent=Number(s.issued||0);$('#dashWaiting').textContent=Number(s.waiting||0);$('#dashCalled').textContent=Number(s.called||0);$('#dashDone').textContent=Number(s.done||0);$('#dashAbsent').textContent=Number(s.absent||0);$('#dashAvgWait').textContent=s.avg_wait_minutes===null?'—':`${Number(s.avg_wait_minutes).toLocaleString('id-ID')} mnt`;
    const max=Math.max(1,...data.trend.map(row=>Number(row.issued)));
    $('#dashboardTrend').innerHTML=data.trend.map(row=>{const date=new Date(row.date+'T00:00:00');const label=date.toLocaleDateString('id-ID',{weekday:'short',day:'numeric'});const issued=Math.max(row.issued?6:2,Number(row.issued)/max*100);const done=Math.max(row.done?6:2,Number(row.done)/max*100);return `<div class="trend-column"><div class="trend-value">${Number(row.issued)}</div><div class="trend-bars"><i class="issued" style="height:${issued}%" title="${Number(row.issued)} tiket terbit"></i><i class="done" style="height:${done}%" title="${Number(row.done)} selesai"></i></div><small>${esc(label)}</small></div>`;}).join('');
    $('#dashboardServices').innerHTML=data.services.length?data.services.map(row=>`<tr><td><b class="service-code">${esc(row.code)}</b><span>${esc(row.name)}</span></td><td>${Number(row.issued)}</td><td>${Number(row.waiting)}</td><td>${Number(row.done)}</td><td>${Number(row.absent)}</td><td>${row.avg_wait_minutes===null?'—':Number(row.avg_wait_minutes).toLocaleString('id-ID')+' mnt'}</td></tr>`).join(''):'<tr><td colspan="6" class="muted">Belum ada layanan.</td></tr>';
    $('#dashboardUpdated').textContent='Diperbarui '+new Date(data.generated_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  }catch(e){setError($('#dashboardError'),e.message);}
}
async function refreshOperator(){try{const d=await api('operator_state');const rows=d.tickets;$('#activeCount').textContent=rows.filter(t=>['waiting','called'].includes(t.status)).length;$('#callbackCount').textContent=rows.filter(t=>t.callback==1&&t.status==='waiting').length;$('#absentCount').textContent=rows.filter(t=>t.status==='absent').length;
  $('#ticketRows').innerHTML=rows.length?rows.map(t=>{const status={waiting:'Menunggu',called:'Dipanggil',absent:'Belum hadir'}[t.status];const badge={waiting:'wait',called:'calling',absent:'absent'}[t.status];let actions='';if(t.status==='called')actions=`<button class="table-action" data-op="recall" data-id="${t.id}">Panggil ulang</button><button class="table-action good" data-op="done" data-id="${t.id}">Selesai</button><button class="table-action danger" data-op="absent" data-id="${t.id}">Belum hadir</button>`;else if(t.status==='absent')actions=`<button class="table-action good" data-op="return" data-id="${t.id}">Hadir kembali</button>`;return `<tr><td><b class="ticket-table-no">${esc(t.ticket_no)}</b>${t.callback==1?'<small class="callback-tag">Panggilan ulang</small>':''}</td><td>${esc(t.service_name)}</td><td><span class="status-pill ${badge}">${status}</span></td><td>${esc(t.counter_code||'—')}</td><td class="actions-cell">${actions||'—'}</td></tr>`;}).join(''):'<tr><td colspan="5" class="muted">Belum ada tiket hari ini.</td></tr>';
  }catch(e){if(e.message.includes('masuk'))location.reload();}}
async function handleTicketAction(e){const b=e.target.closest('[data-op]');if(!b)return;b.disabled=true;try{await api('operator_action',{method:'POST',data:{op:b.dataset.op,ticket_id:Number(b.dataset.id)}});await refreshOperator();}catch(err){toast(err.message);}finally{b.disabled=false;}}

function initAdmin(){
  $$('.setting-title [data-new]').forEach(b=>b.onclick=()=>openEditor(b.dataset.new));$('#closeDialog').onclick=$('#cancelDialog').onclick=()=>$('#editDialog').classList.add('hidden');$('#editForm').addEventListener('submit',saveAdmin);
}
async function loadAdmin(){try{adminData=await api('admin_data');renderAdmin();}catch(e){setError($('#settingsError'),e.message);}}
function renderAdmin(){
  const list=(items,type)=>items.length?items.map(x=>`<div class="setting-row"><div><b>${esc(x.code||x.name)}</b><small>${esc(x.name)}${x.service_name?' · '+esc(x.service_name):''}${x.username?' · '+esc(x.username):''}</small></div><div><span class="mini-state ${x.active==1?'on':'off'}">${x.active==1?'Aktif':'Nonaktif'}</span><button class="mini-edit" data-edit="${type}" data-id="${x.id}">Ubah</button></div></div>`).join(''):'<p class="empty-list">Belum ada data.</p>';
  $('#serviceList').innerHTML=list(adminData.services,'service');$('#counterList').innerHTML=list(adminData.counters,'counter');$('#userList').innerHTML=list(adminData.users,'user');$$('[data-edit]').forEach(b=>b.onclick=()=>openEditor(b.dataset.edit,Number(b.dataset.id)));
}
function openEditor(type,id=0){
  const collection={service:adminData.services,counter:adminData.counters,user:adminData.users}[type];const item=id?collection.find(x=>Number(x.id)===id):{};const titles={service:'Jenis layanan',counter:'Loket',user:'Pengguna'};$('#dialogTitle').textContent=(id?'Ubah ':'Tambah ')+titles[type];let fields='';
  if(type==='service')fields=`<label>Kode layanan<input name="code" maxlength="8" required value="${esc(item.code||'')}"></label><label>Nama layanan<input name="name" required value="${esc(item.name||'')}"></label>`;
  if(type==='counter')fields=`<label>Jenis layanan<select name="service_id" required>${adminData.services.filter(s=>s.active==1||Number(s.id)===Number(item.service_id)).map(s=>`<option value="${s.id}" ${Number(s.id)===Number(item.service_id)?'selected':''}>${esc(s.code)} · ${esc(s.name)}</option>`).join('')}</select></label><label>Kode loket<input name="code" maxlength="12" required value="${esc(item.code||'')}"></label><label>Nama loket<input name="name" required value="${esc(item.name||'')}"></label>`;
  if(type==='user')fields=`<label>Nama petugas<input name="name" required value="${esc(item.name||'')}"></label><label>Username<input name="username" required value="${esc(item.username||'')}"></label><label>Kata sandi ${id?'<small>(kosongkan jika tidak diubah)</small>':''}<input name="password" type="password" ${id?'':'required'} minlength="10" autocomplete="new-password"></label><label>Peran<select name="role"><option value="operator" ${(item.role||'operator')==='operator'?'selected':''}>Petugas</option><option value="admin" ${item.role==='admin'?'selected':''}>Administrator</option></select></label>`;
  fields+=`<label class="check-field"><input type="checkbox" name="active" ${!id||item.active==1?'checked':''}> Aktif</label>`;$('#dialogFields').innerHTML=fields;$('#editForm').dataset.type=type;$('#editForm').dataset.id=id||'';$('#editDialog').classList.remove('hidden');
}
async function saveAdmin(e){e.preventDefault();const f=new FormData(e.currentTarget);const data={type:e.currentTarget.dataset.type,id:Number(e.currentTarget.dataset.id||0),active:f.has('active')?1:0};for(const [k,v] of f.entries())if(k!=='active')data[k]=v;try{await api('admin_save',{method:'POST',data});$('#editDialog').classList.add('hidden');setError($('#settingsError'),'');await loadAdmin();toast('Pengaturan disimpan.');}catch(err){setError($('#settingsError'),err.message);}}

document.addEventListener('DOMContentLoaded',()=>{const page=document.body.dataset.page;if(page==='kiosk')initKiosk();if(page==='display')initDisplay();if(page==='track')initTrack();if(page==='operator')initOperator();});
