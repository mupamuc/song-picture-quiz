import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {createRoomServer} from './server.mjs';
const origin='http://127.0.0.1:8767';
const owner=()=>({id:randomUUID(),token:randomUUID()});
const profile=n=>({...owner(),name:`Игрок ${n}`});
async function fixture(t,options={}){
  const service=createRoomServer({origins:[origin],...options});service.server.listen(0,'127.0.0.1');await once(service.server,'listening');
  t.after(()=>service.close());return {service,url:`ws://127.0.0.1:${service.server.address().port}/rooms`};
}
async function client(url,hello){
  const ws=new WebSocket(url,{origin}),inbox=[],listeners=new Set();
  ws.on('message',raw=>{const data=JSON.parse(raw.toString());inbox.push(data);for(const handler of listeners)handler(data);});
  ws.on('error',()=>{});await once(ws,'open');ws.send(JSON.stringify(hello));
  return {ws,inbox,send(data){ws.send(JSON.stringify(data));},wait(predicate,timeout=6000){const previous=inbox.findLast(predicate);if(previous)return Promise.resolve(previous);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{listeners.delete(handler);reject(new Error('Message timed out'));},timeout);const handler=data=>{if(predicate(data)){clearTimeout(timer);listeners.delete(handler);resolve(data);}};listeners.add(handler);});}};
}
const state=phase=>data=>data.type==='state'&&data.state.phase===phase;
async function host(url){const credentials=owner(),clientHost=await client(url,{type:'host',owner:credentials,pack:'all',rounds:10});const data=await clientHost.wait(state('lobby'));return {...clientHost,code:data.code,owner:credentials};}
async function readyRound(hostClient,players){
  hostClient.send({type:'start'});const preparing=await hostClient.wait(state('prepare'));const key=preparing.state.key;
  hostClient.send({type:'ready',key});for(const player of players)player.send({type:'ready',key});const question=await hostClient.wait(state('question'));return question.state;
}
test('WebSocket service joins 50 real clients, rejects the 51st and scores all 50 without exposing the answer early',async t=>{
  const {service,url}=await fixture(t),h=await host(url),players=[];
  for(let n=1;n<=50;n++){const player=await client(url,{type:'join',code:h.code,profile:profile(n)});await player.wait(state('lobby'));players.push(player);}
  const full=await h.wait(d=>state('lobby')(d)&&d.state.players.length===50);assert.equal(full.state.players.length,50);
  const extra=await client(url,{type:'join',code:h.code,profile:profile(51)});assert.match((await extra.wait(d=>d.type==='reject')).message,/50/);
  const question=await readyRound(h,players);assert.equal(question.participantCount,50);assert.equal(question.question.song,undefined);
  const correct=service.rooms.get(h.code).model.questions[0].song.id;
  for(const player of players){player.send({type:'answer',key:question.key,choice:correct});player.send({type:'answer',key:question.key,choice:null});}
  const revealed=(await h.wait(state('reveal'))).state;assert.equal(revealed.players.length,50);assert.equal(revealed.answeredCount,50);assert.equal(revealed.question.song.id,correct);assert.ok(revealed.players.every(p=>p.correct===1&&p.score>=95&&p.score<=100));
  assert.ok(players.every(player=>player.inbox.filter(d=>d.type==='state'&&['prepare','countdown','question'].includes(d.state.phase)).every(d=>!d.state.question.song)));
});
test('reconnecting player retains points, and a wrong recovery token is rejected',async t=>{
  const {service,url}=await fixture(t),h=await host(url),p=profile(1),a=await client(url,{type:'join',code:h.code,profile:p});await a.wait(state('lobby'));
  const q=await readyRound(h,[a]);a.send({type:'answer',key:q.key,choice:service.rooms.get(h.code).model.questions[0].song.id});const result=(await a.wait(state('reveal'))).state;
  a.ws.close();await once(a.ws,'close');await h.wait(d=>d.type==='state'&&d.state.players.some(player=>player.id===p.id&&!player.connected));
  const wrong=await client(url,{type:'join',code:h.code,profile:{...p,token:randomUUID()}});assert.match((await wrong.wait(d=>d.type==='reject')).message,/профиль/);
  const resumed=await client(url,{type:'join',code:h.code,profile:p});const returned=(await resumed.wait(state('reveal'))).state;assert.equal(returned.players[0].score,result.players[0].score);assert.equal(returned.players[0].connected,true);
});
test('host network loss pauses the round and a valid resume preserves room and shifts the clock',async t=>{
  const {service,url}=await fixture(t),h=await host(url),a=await client(url,{type:'join',code:h.code,profile:profile(1)});await a.wait(state('lobby'));
  const q=await readyRound(h,[a]);h.ws.close();await once(h.ws,'close');await a.wait(d=>d.type==='paused');const entry=service.rooms.get(h.code);assert.ok(entry.pausedAt);
  const wrong=await client(url,{type:'resume-host',code:h.code,owner:{...h.owner,token:randomUUID()}});assert.match((await wrong.wait(d=>d.type==='reject')).message,/восстановить/);
  await new Promise(resolve=>setTimeout(resolve,120));const resumed=await client(url,{type:'resume-host',code:h.code,owner:h.owner});const updated=(await resumed.wait(state('question'))).state;
  assert.equal(entry.pausedAt,null);assert.ok(updated.startAt>=q.startAt+100);assert.equal(updated.key,q.key);assert.equal(updated.paused,false);
});
test('only the host controls start, finish and advancement; state never includes profile tokens',async t=>{
  const {url}=await fixture(t),h=await host(url),p=profile(1),a=await client(url,{type:'join',code:h.code,profile:p});await a.wait(state('lobby'));a.send({type:'start'});a.send({type:'finish'});a.send({type:'next'});
  const b=await client(url,{type:'join',code:h.code,profile:profile(2)});const snapshot=(await b.wait(state('lobby'))).state;assert.equal(snapshot.phase,'lobby');assert.equal(snapshot.players.length,2);assert.ok(!JSON.stringify(snapshot).includes(p.token));
});
test('unknown rooms fail with a clear message and unexpected origins fail the WebSocket upgrade',async t=>{
  const {url}=await fixture(t),a=await client(url,{type:'join',code:'UNKNOWN2',profile:profile(1)});assert.match((await a.wait(d=>d.type==='reject')).message,/не найдена/);
  const code=await new Promise((resolve,reject)=>{const ws=new WebSocket(url,{origin:'https://other.example'});ws.on('unexpected-response',(_req,res)=>{res.resume();resolve(res.statusCode);ws.terminate();});ws.on('error',()=>{});ws.on('open',()=>{ws.terminate();reject(new Error('Unexpected origin accepted'));});});assert.equal(code,403);
});
