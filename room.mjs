import {createGame} from './game.mjs';
export const MAX_PLAYERS=10, COUNTDOWN_MS=3000, ROUND_MS=100000;
export const pointsFor=elapsed=>Math.max(0,100-Math.floor(Math.max(0,elapsed)/1000));
export function createRoom(songs,pack,rounds,nonce,rng=Math.random){const game=createGame(songs,pack,rounds,rng);return {pack,questions:game.questions,index:0,phase:'lobby',players:[],nonce,hostReady:false,startAt:null,eligible:[],answers:new Map(),results:[]};}
export function joinRoom(room,profile){
  if(!profile||typeof profile.id!=='string'||typeof profile.token!=='string'||!/^[-\w]{20,80}$/.test(profile.id)||!/^[-\w]{20,80}$/.test(profile.token)||typeof profile.name!=='string')return {error:'Некорректный профиль'};
  const name=profile.name.trim().replace(/\s+/g,' ');
  if(name.length<1||name.length>24||/[\u0000-\u001f\u007f]/.test(name))return {error:'Имя должно содержать от 1 до 24 символов'};
  const previous=room.players.find(p=>p.id===profile.id);
  if(previous){if(previous.token!==profile.token)return {error:'Не удалось восстановить профиль'};previous.connected=true;return {player:previous};}
  if(room.phase!=='lobby')return {error:'Партия уже началась. Дождись новой комнаты.'};
  if(room.players.length>=MAX_PLAYERS)return {error:`В комнате уже ${MAX_PLAYERS} участников`};
  if(room.players.some(p=>p.name.toLocaleLowerCase('ru')===name.toLocaleLowerCase('ru')))return {error:'Это имя уже занято в комнате'};
  const player={id:profile.id,token:profile.token,name,connected:true,ready:false,score:0,correct:0,elapsed:0};room.players.push(player);return {player};
}
export function disconnectPlayer(room,id,now){const p=room.players.find(p=>p.id===id);if(p)p.connected=false;maybeCountdown(room,now);}
export function removePlayer(room,id,now){if(room.phase==='lobby')room.players=room.players.filter(p=>p.id!==id);else disconnectPlayer(room,id,now);}
function prepare(room){room.phase='prepare';room.hostReady=false;room.startAt=null;room.eligible=[];room.answers=new Map();room.results=[];for(const p of room.players)p.ready=false;}
export function startRoom(room){if(room.phase!=='lobby'||!room.players.some(p=>p.connected))return false;prepare(room);return true;}
export function roundKey(room){return `${room.nonce}:${room.index}`;}
function maybeCountdown(room,now){const active=room.players.filter(p=>p.connected);if(room.phase==='prepare'&&room.hostReady&&active.length&&active.every(p=>p.ready)){room.phase='countdown';room.startAt=now+COUNTDOWN_MS;room.eligible=active.map(p=>p.id);}}
export function readyRoom(room,id,key,now){if(room.phase!=='prepare'||key!==roundKey(room))return false;if(id===null)room.hostReady=true;else{const p=room.players.find(p=>p.id===id&&p.connected);if(!p)return false;p.ready=true;}maybeCountdown(room,now);return true;}
export function answerRoom(room,id,key,choice,now){
  tickRoom(room,now);
  if(room.phase!=='question'||key!==roundKey(room)||!room.eligible.includes(id)||room.answers.has(id)||!room.players.some(p=>p.id===id&&p.connected))return false;
  const q=room.questions[room.index];if(choice!==null&&!q.options.some(s=>s.id===choice))return false;
  room.answers.set(id,{choice,elapsed:Math.max(0,now-room.startAt)});return true;
}
export function finishRound(room,now){
  if(room.phase!=='question')return false;const q=room.questions[room.index];room.results=[];
  for(const id of room.eligible){const p=room.players.find(p=>p.id===id);if(!p)continue;const a=room.answers.get(id),correct=!!a&&a.choice===q.song.id,elapsed=a?.elapsed??Math.min(ROUND_MS,Math.max(0,now-room.startAt));const points=correct?pointsFor(elapsed):0;p.score+=points;p.correct+=Number(correct);p.elapsed+=correct?elapsed:ROUND_MS;room.results.push({id,choice:a?.choice??null,correct,points,elapsed,answered:!!a});}
  room.phase='reveal';return true;
}
export function tickRoom(room,now){if(room.phase==='countdown'&&now>=room.startAt)room.phase='question';if(room.phase==='question'){const active=room.eligible.filter(id=>room.players.some(p=>p.id===id&&p.connected));if(now>=room.startAt+ROUND_MS||active.every(id=>room.answers.has(id)))finishRound(room,now);}}
export function advanceRoom(room){if(room.phase==='reveal'){if(room.index+1===room.questions.length){room.phase='finished';return true;}if((room.index+1)%3===0){room.phase='leaderboard';return true;}room.index++;prepare(room);return true;}if(room.phase==='leaderboard'){room.index++;prepare(room);return true;}return false;}
export function ranking(room){const sorted=[...room.players].sort((a,b)=>b.score-a.score||b.correct-a.correct||a.elapsed-b.elapsed||a.name.localeCompare(b.name,'ru'));let previous=null,rank=0;return sorted.map((p,i)=>{if(!previous||p.score!==previous.score||p.correct!==previous.correct||p.elapsed!==previous.elapsed)rank=i+1;previous=p;return {id:p.id,name:p.name,connected:p.connected,ready:p.ready,score:p.score,correct:p.correct,rank};});}
export function snapshot(room,id,now){const q=room.questions[room.index],reveal=['reveal','leaderboard','finished'].includes(room.phase);return {version:1,phase:room.phase,pack:room.pack,index:room.index,total:room.questions.length,key:roundKey(room),serverNow:now,startAt:room.startAt,players:ranking(room),eligible:room.eligible.includes(id),answered:room.answers.has(id),ownChoice:room.answers.get(id)?.choice??null,answeredCount:room.answers.size,participantCount:room.eligible.length,question:room.phase==='lobby'?null:{image:q.song.image,options:q.options.map(s=>({id:s.id,title:s.title,artist:s.artist})),...(reveal?{song:{id:q.song.id,title:q.song.title,artist:q.song.artist}}:{})},result:reveal?(room.results.find(r=>r.id===id)??null):null};}
