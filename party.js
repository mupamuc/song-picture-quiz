import {PACKS} from './game.mjs';
import {Peer,renderQR} from './vendor/realtime.mjs';
import {createRoom,joinRoom,startRoom,readyRoom,answerRoom,tickRoom,finishRound,advanceRoom,snapshot,disconnectPlayer,removePlayer,roundKey,pointsFor,ROUND_MS} from './room.mjs';
const $=id=>document.getElementById(id),prefix='song-picture-quiz:v1:';
let initialized=false;
const save=(key,value)=>{try{localStorage.setItem(prefix+key,JSON.stringify(value));}catch{}};
const read=key=>{try{return JSON.parse(localStorage.getItem(prefix+key));}catch{return null;}};
const monotonic=()=>Math.floor(performance.timeOrigin+performance.now());
export function initParty({songs,getSetup,showScreen}){
  if(initialized)return;initialized=true;$('host-room').disabled=false;
  let role=null,peer=null,connection=null,room=null,code='',profile=null,state=null,stateReceived=0,connections=new Map(),timer=null,joinTimeout=null,retryTimeout=null,retryCount=0,quitting=false,imageKey='',imageLoaded=false,pending=false,lastBroadcast=0,signalingReady=false;
  function status(text){$('party-status').textContent=text;}
  function clean(){quitting=true;clearInterval(timer);clearTimeout(joinTimeout);clearTimeout(retryTimeout);if(peer)peer.destroy();peer=null;connection=null;room=null;state=null;connections.clear();role=null;imageKey='';imageLoaded=false;pending=false;signalingReady=false;$('party-image').onload=null;$('party-image').onerror=null;$('party-reconnect').hidden=true;}
  function enter(){showScreen('party');$('join-form').hidden=true;$('party-lobby').hidden=true;$('party-question').hidden=true;$('party-ranking').hidden=true;$('party-clock').hidden=true;$('party-code-pill').hidden=true;$('host-invite').hidden=true;$('party-reconnect').hidden=true;$('party-eyebrow').textContent='ИГРА С ТЕЛЕФОНАМИ';$('party-title').textContent='Музыка объединяет';$('party-title').focus({preventScroll:true});}
  function leave(){clean();const url=new URL(location.href);url.searchParams.delete('room');history.replaceState(null,'',url);showScreen('home');}
  function openJoin(roomCode=''){clean();enter();$('party-role').textContent='Участник';$('party-title').textContent='Присоединиться к игре';$('join-form').hidden=false;$('nickname').value=read('name')||'';$('join-code').value=roomCode;status('Отсканируй QR ведущего или введи код комнаты.');$('nickname').focus();}
  function makePeer(id){
    const p=new Peer(id,{host:'0.peerjs.com',port:443,path:'/',secure:true,debug:0});
    p.on('error',error=>{
      const messages={'peer-unavailable':'Комната не найдена. Проверь код и убедись, что ведущий открыл игру.','unavailable-id':'Этот код уже занят. Вернись и создай новую комнату.','browser-incompatible':'Браузер не поддерживает соединение. Открой игру в свежем Chrome, Edge или Safari.','network':'Не удалось подключиться к серверу соединений. Проверь интернет.','webrtc':'Прямое соединение не установилось. Попробуй общую сеть Wi-Fi или отключи VPN.','server-error':'Сервер соединений сейчас недоступен. Попробуй позже.','socket-error':'Нет связи с сервером соединений. Проверь интернет.'};
      status(messages[error.type]||'Соединение прервалось. Проверь интернет и попробуй снова.');$('party-reconnect').hidden=false;if(role==='player')$('join-party').disabled=false;
    });
    p.on('disconnected',()=>{if(!quitting&&!p.destroyed){status('Связь с сервером соединений потеряна. Восстанавливаем…');try{p.reconnect();}catch{$('party-reconnect').hidden=false;}}});return p;
  }
  function send(conn,data){if(!conn?.open)return false;try{conn.send(data);return true;}catch{return false;}}
  function broadcast(){if(!room)return;const now=monotonic();state=snapshot(room,null,now);stateReceived=performance.now();render();for(const [id,conn] of connections)send(conn,{type:'state',state:snapshot(room,id,now)});lastBroadcast=now;}
  function playerDisconnected(conn,id){if(quitting||connections.get(id)!==conn||!room)return;connections.delete(id);disconnectPlayer(room,id,monotonic());broadcast();}
  function bindIncoming(conn){
    let id=null;const deadline=setTimeout(()=>{if(!id)conn.close();},15000);
    conn.on('data',data=>{
      if(!room||!data||typeof data!=='object')return;
      if(data.type==='join'&&!id){const result=joinRoom(room,data.profile);if(result.error){send(conn,{type:'reject',message:result.error});setTimeout(()=>conn.close(),200);return;}clearTimeout(deadline);id=result.player.id;const old=connections.get(id);connections.set(id,conn);if(old&&old!==conn)old.close();broadcast();return;}
      if(!id||connections.get(id)!==conn)return;
      if(data.type==='ready')readyRoom(room,id,data.key,monotonic());
      else if(data.type==='answer')answerRoom(room,id,data.key,data.choice,monotonic());
      else if(data.type==='leave'){removePlayer(room,id,monotonic());connections.delete(id);conn.close();}
      else return;
      tickRoom(room,monotonic());broadcast();
    });
    conn.on('close',()=>{clearTimeout(deadline);playerDisconnected(conn,id);});conn.on('error',()=>playerDisconnected(conn,id));
  }
  function host(){
    clean();quitting=false;enter();role='host';$('party-role').textContent='Ведущий';$('party-title').textContent='Собираем компанию';
    const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';code=Array.from(crypto.getRandomValues(new Uint8Array(8)),n=>alphabet[n%alphabet.length]).join('');const setup=getSetup();room=createRoom(songs,setup.pack,setup.rounds,crypto.randomUUID());status('Создаём комнату…');peer=makePeer('spq-v1-'+code);
    joinTimeout=setTimeout(()=>{if(!signalingReady){status('Не удалось создать комнату. Проверь интернет и попробуй снова.');$('party-reconnect').hidden=false;}},20000);
    peer.on('connection',bindIncoming);peer.on('open',()=>{
      signalingReady=true;clearTimeout(joinTimeout);
      const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('room',code);$('room-code').textContent=code;$('room-link').href=url.href;$('room-link').textContent=url.href;renderQR($('room-qr'),url.href).catch(()=>status('QR не удалось показать. Введите код вручную.'));broadcast();
    });
    timer=setInterval(()=>{if(!room||!signalingReady)return;const before=room.phase;tickRoom(room,monotonic());if(before!==room.phase||monotonic()-lastBroadcast>1000)broadcast();else updateClock();},150);
  }
  function getProfile(name){const key='profile:'+code+':'+name,stored=read(key);if(stored?.name===name)return stored;const next={id:crypto.randomUUID(),token:crypto.randomUUID(),name};save(key,next);return next;}
  function connectPlayer(){
    if(quitting||!peer||peer.destroyed)return;clearTimeout(joinTimeout);clearTimeout(retryTimeout);if(connection)connection.close();pending=false;
    status('Соединяемся с ведущим…');$('party-reconnect').hidden=true;const conn=peer.connect('spq-v1-'+code,{reliable:true,serialization:'json'});connection=conn;
    joinTimeout=setTimeout(()=>{if(connection===conn&&!state){status('Ведущий не отвечает. Проверь код, Wi-Fi и открыта ли комната.');$('party-reconnect').hidden=false;}},20000);
    conn.on('open',()=>send(conn,{type:'join',profile}));
    conn.on('data',data=>{
      if(conn!==connection||!data||typeof data!=='object')return;
      if(data.type==='reject'){quitting=true;clearTimeout(joinTimeout);status(data.message);$('join-form').hidden=false;$('join-party').disabled=false;return;}
      if(data.type!=='state'||data.state?.version!==1||!Array.isArray(data.state.players))return;
      if(data.state.question&&!/^assets\/\d+\.webp$/.test(data.state.question.image))return;
      clearTimeout(joinTimeout);retryCount=0;state=data.state;stateReceived=performance.now();pending=false;$('party-reconnect').hidden=true;$('join-form').hidden=true;render();
    });
    const lost=()=>{if(quitting||conn!==connection)return;status('Связь с ведущим потеряна. Ответы временно недоступны.');for(const b of $('party-answers').querySelectorAll('button'))b.disabled=true;$('party-reconnect').hidden=false;clearTimeout(retryTimeout);if(retryCount<3){retryTimeout=setTimeout(connectPlayer,[1500,3000,6000][retryCount++]);}};
    conn.on('close',lost);conn.on('error',lost);
  }
  function join(event){event.preventDefault();const name=$('nickname').value.trim().replace(/\s+/g,' ');code=$('join-code').value.trim().toUpperCase();if(!name||name.length>24||!/^[A-Z2-9]{8}$/.test(code)){status('Введи имя и восьмизначный код комнаты.');return;}
    if(peer)peer.destroy();role='player';state=null;imageKey='';imageLoaded=false;quitting=false;retryCount=0;profile=getProfile(name);save('name',name);$('join-party').disabled=true;$('party-role').textContent=name;peer=makePeer();peer.on('open',()=>{connectPlayer();$('join-party').disabled=false;});clearInterval(timer);timer=setInterval(updateClock,150);
  }
  function markReady(){if(!state||state.phase!=='prepare')return;if(role==='host'){readyRoom(room,null,state.key,monotonic());broadcast();}else send(connection,{type:'ready',key:state.key});}
  function loadImage(retry=false){
    if(!state?.question)return;const key=state.key;imageKey=key;imageLoaded=false;$('party-image-status').hidden=false;$('party-image-error').hidden=true;const image=$('party-image');
    image.onload=()=>{if(!state||state.key!==key||imageKey!==key)return;imageLoaded=true;$('party-image-status').hidden=!['prepare','countdown'].includes(state.phase);markReady();};
    image.onerror=()=>{if(imageKey!==key)return;$('party-image-status').hidden=true;$('party-image-error').hidden=false;status('Ждём загрузки картинки. Можно попробовать ещё раз.');};image.src=state.question.image+(retry?`?retry=${Date.now()}`:'');
  }
  function answer(choice){if(role!=='player'||!state||state.phase!=='question'||!state.eligible||state.answered||pending||!imageLoaded||!connection?.open)return;pending=true;for(const b of $('party-answers').querySelectorAll('button'))b.disabled=true;if(!send(connection,{type:'answer',key:state.key,choice})){pending=false;status('Ответ не отправлен. Восстанови соединение.');}}
  function renderPlayers(){
    $('party-players').replaceChildren();for(const p of state.players){const li=document.createElement('li');const name=document.createElement('span');name.textContent=p.name+(p.id===profile?.id?' · ты':'');const label=document.createElement('small');label.textContent=p.connected?(state.phase==='prepare'?(p.ready?'Картинка готова':'Загружаем картинку…'):'На связи'):'Нет связи';li.append(name,label);if(role==='host'&&state.phase==='lobby'&&!p.connected){const b=document.createElement('button');b.className='text-button';b.textContent='Убрать';b.onclick=()=>{removePlayer(room,p.id,monotonic());broadcast();};li.append(b);} $('party-players').append(li);}
    if(!state.players.length){const li=document.createElement('li');li.textContent='Участники появятся здесь после входа';$('party-players').append(li);}
  }
  function render(){
    if(!state)return;const host=role==='host',lobby=state.phase==='lobby',board=['leaderboard','finished'].includes(state.phase),revealed=state.phase==='reveal',me=state.players.find(p=>p.id===profile?.id);
    $('party-code-pill').hidden=false;$('party-code-small').textContent=code;$('join-form').hidden=true;$('party-lobby').hidden=!lobby;$('host-invite').hidden=!host;$('party-question').hidden=lobby||board;$('party-ranking').hidden=!board;$('party-clock').hidden=lobby||board;
    $('party-eyebrow').textContent=lobby?`${PACKS[state.pack]} · ${state.total} картинок`:board?(state.phase==='finished'?'ПАРТИЯ ЗАВЕРШЕНА':`ПОСЛЕ ${state.index+1} ПЕСЕН`):`КАРТИНКА ${state.index+1} ИЗ ${state.total}`;
    $('party-title').textContent=lobby?(host?'Собираем компанию':'Ты в игре!'):board?(state.phase==='finished'?'Финальный рейтинг':'Как идёт игра?'):'Какая это песня?';
    if(lobby){renderPlayers();const n=state.players.filter(p=>p.connected).length;$('party-start').hidden=!host;$('party-start').disabled=n===0;$('lobby-detail').textContent=`${n} из 10 участников · 100 очков за верный ответ, −1 за каждую секунду`;
      status(host?'Покажи QR на большом экране. Игроки вводят имя на своём телефоне.':'Ждём, когда ведущий начнёт партию. Не закрывай эту вкладку.');return;}
    if(board){$('ranking-description').textContent=state.phase==='finished'?`Разгадали ${state.total} музыкальных картинок. Спасибо за игру!`:`Позади ${state.index+1} из ${state.total} картинок. Впереди ещё есть шанс вырваться в лидеры.`;const body=$('ranking-body');body.replaceChildren();for(const p of state.players){const tr=document.createElement('tr');if(p.id===profile?.id)tr.className='my-ranking';for(const value of [p.rank,p.name+(p.id===profile?.id?' · ты':''),p.score,`${p.correct}/${state.index+1}`]){const td=document.createElement('td');td.textContent=value;tr.append(td);}body.append(tr);}
      $('ranking-next').hidden=!host;$('ranking-next').textContent=state.phase==='finished'?'Создать новую комнату ↗':'Продолжить игру →';status(host?(state.phase==='finished'?'Итоговый рейтинг виден у всех участников.':'Рейтинг обновлён у всех. Продолжай, когда компания будет готова.'):(state.phase==='finished'?`Твоё место: ${me?.rank??'—'}. Очки: ${me?.score??0}.`:'Ждём продолжения от ведущего.'));return;}
    if(imageKey!==state.key)loadImage();
    const preparing=['prepare','countdown'].includes(state.phase);$('party-image-status').hidden=imageLoaded&&!preparing;$('party-image-status').textContent=preparing?(state.phase==='countdown'?'Все готовы. Картинка откроется на старте!':'Готовим картинку у всех участников…'):'Загружаем картинку…';
    const answers=$('party-answers');answers.replaceChildren();for(const [i,s] of state.question.options.entries()){
      const b=document.createElement('button');b.type='button';b.className='answer';b.dataset.songId=s.id;b.setAttribute('aria-label',preparing?`Вариант ${i+1} появится на старте`:`Вариант ${i+1}: ${s.title} — ${s.artist}`);b.disabled=host||state.phase!=='question'||!state.eligible||state.answered||pending||!imageLoaded||!connection?.open;
      const number=document.createElement('span');number.className='answer-number';number.textContent=i+1;const label=document.createElement('span');const title=document.createElement('span');title.className='answer-title';title.textContent=preparing?'Скоро появится':s.title;const artist=document.createElement('span');artist.className='answer-artist';artist.textContent=preparing?'':s.artist;label.append(title,artist);b.append(number,label);
      if(state.answered&&state.ownChoice===s.id)b.classList.add('picked');if(revealed){b.classList.toggle('correct',s.id===state.question.song.id);b.classList.toggle('wrong',state.ownChoice===s.id&&s.id!==state.question.song.id);}b.onclick=()=>answer(s.id);answers.append(b);
    }
    $('party-answer-kicker').textContent=host?'ИГРОКИ ОТВЕЧАЮТ НА ТЕЛЕФОНАХ':'ВЫБЕРИ ОДНУ ИЗ ЧЕТЫРЁХ';$('party-finish').hidden=!host||state.phase!=='question';$('party-next').hidden=!host||!revealed;$('party-next').textContent=state.index+1===state.total?'Финальный рейтинг →':(state.index+1)%3===0?'Показать рейтинг →':'Следующая картинка →';$('party-answer-count').textContent=`Ответили ${state.answeredCount} из ${state.participantCount}`;
    $('party-caption').textContent=revealed?`${state.question.song.artist} — ${state.question.song.title}`:'✦ Название спрятано в деталях';$('party-feedback').replaceChildren();
    if(revealed){const strong=document.createElement('strong');strong.textContent=host?`Правильный ответ: ${state.question.song.title}`:state.result?.correct?`Верно! +${state.result.points} очков`:state.result?.answered?'На этот раз — 0 очков':'Без ответа — 0 очков';const detail=document.createElement('span');detail.textContent=`${state.question.song.title} — ${state.question.song.artist}`;$('party-feedback').append(strong,detail);status(host?'Ответ открыт у всех участников.':`У тебя ${me?.score??0} очков. Ждём следующую картинку.`);}
    else if(state.phase==='prepare')status('Сначала загружаем картинку у всех участников. Очки пока не убывают.');
    else if(state.phase==='countdown')status('Картинка готова. Начинаем одновременно через 3 секунды!');
    else if(!host&&!state.eligible)status('Этот раунд уже начался до твоего возвращения. Участвуешь со следующей картинки.');
    else status(host?'100 очков − 1 за каждую полную секунду. Неверный ответ: 0.':state.answered?'Ответ принят! Ждём остальных.':`Выбирай песню. Твой общий счёт: ${me?.score??0}.`);
    updateClock();
  }
  function updateClock(){if(!state||!state.startAt||!['countdown','question','reveal'].includes(state.phase))return;const now=state.serverNow+(performance.now()-stateReceived),elapsed=now-state.startAt;if(state.phase==='countdown')$('party-clock').textContent=`Старт через ${Math.max(0,Math.ceil(-elapsed/1000))}`;else if(state.phase==='question')$('party-clock').textContent=role==='player'&&state.answered?'Ответ принят':`${pointsFor(elapsed)} очков · ${Math.max(0,Math.ceil((ROUND_MS-elapsed)/1000))} сек`;else $('party-clock').textContent='Ответ открыт';}
  $('host-room').onclick=host;$('open-join').onclick=()=>openJoin();$('party-leave').onclick=()=>{if(role==='player')send(connection,{type:'leave'});leave();};$('join-form').onsubmit=join;
  $('copy-room').onclick=async()=>{try{await navigator.clipboard.writeText($('room-link').href);status('Приглашение скопировано. Отправь его участникам.');}catch{status('Скопируй ссылку под кодом комнаты.');}};
  $('party-start').onclick=()=>{if(role==='host'&&startRoom(room))broadcast();};$('party-finish').onclick=()=>{if(role==='host'){finishRound(room,monotonic());broadcast();}};$('party-next').onclick=()=>{if(role==='host'&&advanceRoom(room))broadcast();};$('ranking-next').onclick=()=>{if(role!=='host')return;if(room.phase==='finished')host();else if(advanceRoom(room))broadcast();};$('party-retry-image').onclick=()=>loadImage(true);
  $('party-reconnect').onclick=()=>{if(role==='host'){if(!signalingReady||!peer||peer.destroyed)host();else if(peer.disconnected)peer.reconnect();}else if(peer&&!peer.destroyed){quitting=false;if(peer.disconnected)peer.reconnect();connectPlayer();}else if(role==='player')join({preventDefault(){}});};
  window.addEventListener('beforeunload',event=>{if(role==='host'&&room&&room.players.some(p=>p.connected)&&room.phase!=='finished'){event.preventDefault();event.returnValue='';}});
  const invite=new URL(location.href).searchParams.get('room');if(invite)openJoin(invite.toUpperCase());
}
