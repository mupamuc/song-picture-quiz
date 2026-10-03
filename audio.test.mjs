import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {createExcerptPlayer,validExcerpt} from './audio.mjs';
const songs=JSON.parse(readFileSync(new URL('./songs.json',import.meta.url),'utf8'));
class Media{
  constructor(){this.handlers=new Map();this.currentTime=0;this.plays=0;this.paused=true;this.src='';this.error=null;this.reject=null;}
  addEventListener(type,fn){this.handlers.set(type,fn);}
  play(){this.plays++;if(this.reject)return Promise.reject(this.reject);this.paused=false;return Promise.resolve();}
  pause(){this.paused=true;}
  removeAttribute(name){if(name==='src')this.src='';}
  load(){}
  emit(type){this.handlers.get(type)?.();}
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function setup(enabled=true){const audio=new Media(),states=[];const player=createExcerptPlayer({audio,enabled,onChange:state=>states.push(state)});return {audio,states,player,state:()=>states.at(-1)};}
test('241 songs have bounded local audio excerpts and no private source paths',()=>{for(const song of songs){assert.ok(validExcerpt(song.audio));assert.ok(statSync(new URL(song.audio.src,import.meta.url)).size>10000);assert.ok(!JSON.stringify(song).includes('F:\\'));}assert.ok(!validExcerpt({...songs[0].audio,src:'https://example.test/song.mp3'}));assert.ok(!validExcerpt({...songs[0].audio,duration:300}));});
test('reveal can auto-play only once per round; repeated room snapshots do not restart it',async()=>{const p=setup();p.player.reveal(songs[0],'round-1',true);await flush();assert.equal(p.audio.plays,1);assert.equal(p.state().phase,'playing');p.audio.currentTime=5;p.audio.emit('timeupdate');p.player.reveal(songs[0],'round-1',true);assert.equal(p.audio.plays,1);assert.equal(p.audio.currentTime,5);assert.equal(p.state().progress,5/songs[0].audio.duration);});
test('disabled sound suppresses automatic playback; manual replay enables it',async()=>{const p=setup(false);p.player.reveal(songs[0],'round-1',true);assert.equal(p.audio.plays,0);await p.player.play();assert.equal(p.audio.plays,1);assert.equal(p.player.enabled,true);p.player.setEnabled(false);assert.equal(p.audio.paused,true);});
test('wrong-answer reveal waits for manual listening and next question removes the source',async()=>{const p=setup();p.player.reveal(songs[0],'round-1',false);assert.equal(p.audio.plays,0);await p.player.play();p.player.stop();assert.equal(p.audio.paused,true);assert.equal(p.audio.src,'');assert.equal(p.state().song,null);});
test('autoplay denial and missing media leave actionable replay rather than breaking the game',async()=>{const p=setup();p.audio.reject={name:'NotAllowedError'};p.player.reveal(songs[0],'round-1',true);await flush();assert.equal(p.state().phase,'blocked');p.audio.reject=null;await p.player.play();assert.equal(p.state().phase,'playing');p.audio.error={code:4};p.audio.emit('error');assert.equal(p.state().phase,'error');p.player.stop();assert.equal(p.state().phase,'idle');});
test('pending playback from an old round never changes the next screen',async()=>{const p=setup();let resolve;p.audio.play=()=>new Promise(r=>resolve=r);p.player.reveal(songs[0],'old',true);p.player.stop();resolve();await flush();assert.equal(p.state().phase,'idle');assert.equal(p.audio.paused,true);});
test('silent gesture unlock never reveals music and does not overwrite an answer',async()=>{const p=setup();let resolve;p.audio.play=()=>new Promise(r=>resolve=r);const pending=p.player.unlock();assert.equal(p.audio.src,'audio/unlock.wav');p.player.reveal(songs[0],'new',false);resolve();await pending;assert.equal(p.state().song.id,songs[0].id);assert.equal(p.state().phase,'ready');await flush();});
