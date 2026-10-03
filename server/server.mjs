import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {randomUUID,randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {WebSocketServer,WebSocket} from 'ws';
import {createRoom,joinRoom,startRoom,readyRoom,answerRoom,tickRoom,finishRound,advanceRoom,snapshot,disconnectPlayer,removePlayer,MAX_PLAYERS} from '../room.mjs';
import {PACKS,validateSongs} from '../game.mjs';
const catalogue=validateSongs(JSON.parse(readFileSync(new URL('../songs.json',import.meta.url),'utf8')));
const clock=()=>Math.floor(performance.timeOrigin+performance.now());
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const validOwner=p=>p&&typeof p.id==='string'&&typeof p.token==='string'&&/^[-\w]{20,80}$/.test(p.id)&&/^[-\w]{20,80}$/.test(p.token);

export function createRoomServer({origins=['https://mupamuc.github.io'],hostGraceMs=90000,maxRooms=100,tickMs=100}={}){
  const rooms=new Map(),allowed=new Set(origins);
  const server=createServer((req,res)=>{
    if(req.url==='/health'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({status:'ok',maxPlayers:MAX_PLAYERS,rooms:rooms.size,transport:'websocket',build:process.env.BUILD_SHA||'local'}));}
    else{res.writeHead(404);res.end('Not found');}
  });
  const wss=new WebSocketServer({noServer:true,maxPayload:4096,perMessageDeflate:false});
  server.on('upgrade',(req,socket,head)=>{
    if(req.url!=='/rooms'||!allowed.has(req.headers.origin)){socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();return;}
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
  });
  const send=(ws,data)=>{if(ws?.readyState===WebSocket.OPEN){if(ws.bufferedAmount>512*1024){ws.close(1013,'Slow connection');return;}ws.send(JSON.stringify(data));}};
  function broadcast(entry){
    const now=clock(),stateFor=id=>({...snapshot(entry.model,id,now),paused:entry.pausedAt!==null});send(entry.host.ws,{type:'state',code:entry.code,state:stateFor(null)});
    for(const [id,ws] of entry.clients)send(ws,{type:'state',code:entry.code,state:stateFor(id)});
  }
  function endRoom(entry,message){rooms.delete(entry.code);for(const ws of [entry.host.ws,...entry.clients.values()]){if(ws){ws.session=null;send(ws,{type:'ended',message});ws.close(1000);}}}
  function reject(ws,message){send(ws,{type:'reject',message});ws.close(1008);}
  function roomCode(){let code;do{code=Array.from(randomBytes(8),n=>alphabet[n%alphabet.length]).join('');}while(rooms.has(code));return code;}
  wss.on('connection',ws=>{
    ws.session=null;ws.alive=true;ws.rate={start:clock(),count:0};const handshake=setTimeout(()=>{if(!ws.session)ws.close(1008,'Handshake timed out');},15000);
    ws.on('pong',()=>{ws.alive=true;});
    ws.on('message',raw=>{
      let data;try{data=JSON.parse(raw.toString());}catch{return reject(ws,'Некорректное сообщение');}
      if(!data||typeof data!=='object')return reject(ws,'Некорректное сообщение');
      const now=clock();if(now-ws.rate.start>=1000)ws.rate={start:now,count:0};if(++ws.rate.count>30)return reject(ws,'Слишком много сообщений. Подключись снова.');
      if(!ws.session){
        let entry;
        if(data.type==='host'){
          if(!validOwner(data.owner)||!Object.hasOwn(PACKS,data.pack)||![10,20,30].includes(data.rounds))return reject(ws,'Не удалось создать комнату: проверь настройки');
          if(rooms.size>=maxRooms)return reject(ws,'Все комнаты заняты. Попробуй позже.');
          const code=roomCode();entry={code,model:createRoom(catalogue,data.pack,data.rounds,randomUUID()),host:{...data.owner,ws},clients:new Map(),created:now,pausedAt:null};rooms.set(code,entry);ws.session={entry,role:'host'};
        }else if(data.type==='resume-host'){
          entry=rooms.get(data.code);if(!entry||!validOwner(data.owner)||data.owner.id!==entry.host.id||data.owner.token!==entry.host.token)return reject(ws,'Не удалось восстановить комнату');
          const old=entry.host.ws;entry.host.ws=ws;ws.session={entry,role:'host'};if(old&&old!==ws){old.session=null;old.close(1000);}
          if(entry.pausedAt!==null){if(entry.model.startAt!==null)entry.model.startAt+=now-entry.pausedAt;entry.pausedAt=null;}
        }else if(data.type==='join'){
          entry=rooms.get(data.code);if(!entry)return reject(ws,'Комната не найдена. Проверь код или дождись нового QR.');
          const result=joinRoom(entry.model,data.profile);if(result.error)return reject(ws,result.error);
          const id=result.player.id,old=entry.clients.get(id);entry.clients.set(id,ws);ws.session={entry,role:'player',id};if(old&&old!==ws){old.session=null;old.close(1000);}
        }else return reject(ws,'Сначала нужно войти в комнату');
        clearTimeout(handshake);broadcast(entry);if(entry.pausedAt!==null)send(ws,{type:'paused',message:'Ведущий потерял связь. Раунд на паузе; ждём его возвращения.'});return;
      }
      const {entry,role,id}=ws.session;
      if(data.type==='leave'){
        ws.session=null;if(role==='host')endRoom(entry,'Ведущий завершил комнату. Можно начать новую игру.');else{entry.clients.delete(id);removePlayer(entry.model,id,now);if(entry.pausedAt===null)tickRoom(entry.model,now);broadcast(entry);}return;
      }
      if(entry.pausedAt!==null)return;
      const before=entry.model.phase;let changed=false;
      if(role==='host'){
        if(data.type==='start')changed=startRoom(entry.model);
        else if(data.type==='finish')changed=finishRound(entry.model,now);
        else if(data.type==='next')changed=advanceRoom(entry.model);
        else if(data.type==='ready')changed=readyRoom(entry.model,null,data.key,now);
        else if(data.type==='remove'&&entry.model.phase==='lobby'){const removed=entry.clients.get(data.id);entry.clients.delete(data.id);if(removed){removed.session=null;reject(removed,'Ведущий убрал тебя из комнаты');}removePlayer(entry.model,data.id,now);changed=true;}
      }else{
        if(data.type==='ready')changed=readyRoom(entry.model,id,data.key,now);
        else if(data.type==='answer')changed=answerRoom(entry.model,id,data.key,data.choice,now);
      }
      tickRoom(entry.model,now);if(changed||before!==entry.model.phase)broadcast(entry);
    });
    ws.on('close',()=>{
      clearTimeout(handshake);if(!ws.session)return;const {entry,role,id}=ws.session;ws.session=null;
      if(!rooms.has(entry.code))return;
      if(role==='host'&&entry.host.ws===ws){entry.host.ws=null;entry.pausedAt=clock();for(const player of entry.clients.values())send(player,{type:'paused',message:'Ведущий потерял связь. Раунд на паузе; ждём его возвращения.'});}
      else if(role==='player'&&entry.clients.get(id)===ws){entry.clients.delete(id);disconnectPlayer(entry.model,id,clock());if(entry.pausedAt===null)tickRoom(entry.model,clock());broadcast(entry);}
    });
    ws.on('error',()=>{});
  });
  const timer=setInterval(()=>{
    const now=clock();for(const entry of rooms.values()){
      if((entry.pausedAt!==null&&now-entry.pausedAt>hostGraceMs)||now-entry.created>4*60*60*1000){endRoom(entry,'Комната закрыта. Создайте новую игру.');continue;}
      if(entry.pausedAt!==null)continue;const before=entry.model.phase;tickRoom(entry.model,now);if(before!==entry.model.phase)broadcast(entry);
    }
  },tickMs);
  const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}},30000);
  return {server,rooms,async close(){clearInterval(timer);clearInterval(heartbeat);for(const ws of wss.clients)ws.terminate();await new Promise(resolve=>wss.close(resolve));await new Promise(resolve=>server.close(resolve));}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const origins=(process.env.ALLOWED_ORIGINS||'https://mupamuc.github.io').split(',').map(s=>s.trim());
  const service=createRoomServer({origins});const port=Number(process.env.PORT||8890),host=process.env.HOST||'127.0.0.1';service.server.listen(port,host,()=>console.log(`Room service on ${host}:${port}; capacity ${MAX_PLAYERS}; allowed origins: ${origins.join(', ')}`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{void service.close().then(()=>process.exit(0));});
}
