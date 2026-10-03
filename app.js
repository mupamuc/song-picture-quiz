import {PACKS,validateSongs,poolFor,createGame,answerGame,nextQuestion,mistakes,wordForm,recordKey} from './game.mjs';
import catalogue from './songs.json';
import {createExcerptPlayer} from './audio.mjs';
const $=id=>document.getElementById(id);
let songs=[],pack='all',game=null,imageReady=false,imageGeneration=0,partyModule=null;
const storage={get(key,fallback){try{return localStorage.getItem(key)??fallback;}catch{return fallback;}},set(key,value){try{localStorage.setItem(key,String(value));return true;}catch{return false;}}};
let audioView='solo';
const excerpt=createExcerptPlayer({audio:$('song-audio'),enabled:storage.get('song-picture-quiz:sound:v1','on')!=='off',onEnabledChange:value=>storage.set('song-picture-quiz:sound:v1',value?'on':'off'),onChange:renderAudio});
function renderAudio({song,phase,enabled,progress}){
  $('sound-toggle').setAttribute('aria-pressed',String(enabled));$('sound-toggle').textContent=enabled?'♫ Звук вкл.':'♫ Звук выкл.';
  for(const view of ['solo','host']){const panel=$(`${view}-audio`);panel.hidden=!song||view!==audioView;if(panel.hidden)continue;
    const message=phase==='playing'?'Играет фрагмент · 15 секунд':phase==='loading'?'Загружаем фрагмент…':phase==='blocked'?'Нажми «Послушать» для запуска звука':phase==='error'?'Фрагмент не загрузился. Попробуй ещё раз':phase==='ended'?'Можно послушать ещё раз':'15 секунд · без длинного вступления';
    const status=$(`${view}-audio-status`);if(status.textContent!==message)status.textContent=message;
    $(`${view}-audio-play`).textContent=phase==='playing'?'↻ Сначала':phase==='ended'?'↻ Ещё раз':'▶ Послушать';$(`${view}-audio-stop`).hidden=!['playing','loading'].includes(phase);$(`${view}-audio-progress`).value=progress;
  }
}
function revealAudio(song,key,autoplay,view='solo'){audioView=view;excerpt.reveal(song,key,autoplay);}
function showScreen(name){excerpt.stop();for(const id of ['home','game','results','party'])$(id).hidden=id!==name;window.scrollTo({top:0,behavior:'instant'});}
function updateSetup(){
  const pool=songs.length?poolFor(songs,pack):[];const requested=Number($('rounds').value);const n=Math.min(requested,pool.length);
  for(const button of $('packs').querySelectorAll('button')){const active=button.dataset.pack===pack;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));}
  $('start').disabled=pool.length<4;
  if(songs.length){$('start').replaceChildren(document.createTextNode('Начать игру '),arrow('↗'));$('start-summary').textContent=`${n} ${wordForm(n,'картинка','картинки','картинок')} · ${PACKS[pack]} · ${pool.length} ${wordForm(pool.length,'песня','песни','песен')} в подборке`;}
  storage.set('song-picture-quiz:pack:v1',pack);storage.set('song-picture-quiz:rounds:v1',requested);
}
function arrow(text){const span=document.createElement('span');span.textContent=text;span.setAttribute('aria-hidden','true');return span;}
function loadSongs(){
  $('load-error').hidden=true;$('start').disabled=true;
  try{
    songs=validateSongs(catalogue);
    for(const key of Object.keys(PACKS)){const n=poolFor(songs,key).length;$(`count-${key}`).textContent=`${n} ${wordForm(n,'песня','песни','песен')}`;}
    const saved=storage.get('song-picture-quiz:pack:v1','all');if(Object.hasOwn(PACKS,saved)&&poolFor(songs,saved).length>=4)pack=saved;
    const rounds=storage.get('song-picture-quiz:rounds:v1','20');if(['10','20','30'].includes(rounds))$('rounds').value=rounds;
    updateSetup();
    $('host-room').disabled=false;
    window.dispatchEvent(new Event('quiz:ready'));
    const invite=new URL(location.href).searchParams.get('room');if(invite)openParty('join',invite.toUpperCase());
  }catch(error){window.dispatchEvent(new CustomEvent('quiz:failed',{detail:'Не удалось открыть подборку песен. Обнови игру.'}));}
}
async function openParty(action,invite=''){
  if(!songs.length)return;
  if(location.protocol==='file:'){$('notice').textContent='Для игры с телефонами открой https://mupamuc.github.io/song-picture-quiz/';return;}
  $('host-room').disabled=true;$('open-join').disabled=true;$('notice').textContent='Готовим игру с телефонами…';
  try{
    partyModule??=import('./party.js');const {initParty}=await partyModule;
    const controls=initParty({songs,getSetup:()=>({pack,rounds:Number($('rounds').value)}),showScreen,excerpt:{unlock:excerpt.unlock,stop:excerpt.stop,reveal:(song,key)=>revealAudio(songs.find(s=>s.id===song.id),`party:${key}`,true,'host')}});
    $('notice').textContent='';if(action==='host')controls.host();else controls.openJoin(invite);
  }catch(error){partyModule=null;$('notice').textContent='Не удалось запустить игру с телефонами. Обнови страницу или попробуй другой браузер. Одиночная игра доступна.';}
  finally{$('host-room').disabled=false;$('open-join').disabled=false;}
}
function startGame(){try{game=createGame(songs,pack,Number($('rounds').value));showScreen('game');void excerpt.unlock();$('game-pack').textContent=PACKS[pack];renderQuestion();}catch{$('notice').textContent='Эту подборку пока не удалось открыть. Выбери другую.';}}
function loadQuestionImage(retry=false){
  const generation=++imageGeneration;imageReady=false;$('image-status').hidden=false;$('image-error').hidden=true;$('skip').disabled=true;
  for(const button of $('answers').querySelectorAll('button'))button.disabled=true;
  const image=$('round-image'),question=game.questions[game.index];
  image.onload=()=>{if(generation!==imageGeneration)return;imageReady=true;$('image-status').hidden=true;$('image-error').hidden=true;if(!question.answered){$('skip').disabled=false;for(const button of $('answers').querySelectorAll('button'))button.disabled=false;}};
  image.onerror=()=>{if(generation!==imageGeneration)return;$('image-status').hidden=true;$('image-error').hidden=false;$('skip').disabled=false;};
  image.src=question.song.image+(retry?`?retry=${Date.now()}`:'');
}
function renderQuestion(){
  excerpt.stop();
  const q=game.questions[game.index],total=game.questions.length;
  $('round-label').textContent=`КАРТИНКА ${game.index+1} ИЗ ${total}`;$('score').textContent=game.score;
  $('progress').setAttribute('aria-valuemax',total);$('progress').setAttribute('aria-valuenow',game.index);$('progress-fill').style.width=`${game.index/total*100}%`;
  $('streak').textContent=game.streak>=2?`${game.streak} ${wordForm(game.streak,'попадание','попадания','попаданий')} подряд ✦`:'';
  $('feedback').hidden=true;$('next').hidden=true;$('skip').hidden=false;$('keyboard-hint').textContent='Клавиши 1–4';$('round-image').alt='Картинка-загадка к песне';
  $('image-caption').replaceChildren(arrow('✦'),document.createTextNode(' Название спрятано в деталях'));
  $('answers').replaceChildren();
  q.options.forEach((s,i)=>{
    const button=document.createElement('button');button.className='answer';button.type='button';button.dataset.songId=s.id;button.disabled=true;button.setAttribute('aria-label',`Вариант ${i+1}: ${s.title} — ${s.artist}`);
    const number=document.createElement('span');number.className='answer-number';number.textContent=i+1;number.setAttribute('aria-hidden','true');
    const label=document.createElement('span');const title=document.createElement('span');title.className='answer-title';title.textContent=s.title;const artist=document.createElement('span');artist.className='answer-artist';artist.textContent=s.artist;label.append(title,artist);button.append(number,label);button.addEventListener('click',()=>submit(s.id));$('answers').append(button);
  });
  loadQuestionImage();$('question-title').focus({preventScroll:true});
}
function submit(choice){
  if(!game||game.finished||(!imageReady&&choice!==null))return;
  const answer=answerGame(game,choice);if(!answer)return;const q=game.questions[game.index];
  for(const button of $('answers').querySelectorAll('button')){
    button.disabled=true;const correct=button.dataset.songId===answer.song.id,wrong=!answer.correct&&button.dataset.songId===choice;
    button.classList.toggle('correct',correct);button.classList.toggle('wrong',wrong);
    if(correct||wrong){const mark=document.createElement('span');mark.className='answer-mark';mark.textContent=correct?'✓':'×';mark.setAttribute('aria-hidden','true');button.append(mark);button.setAttribute('aria-label',`${button.getAttribute('aria-label')}. ${correct?'Правильный ответ':'Неверный ответ'}`);}
  }
  $('score').textContent=game.score;$('progress').setAttribute('aria-valuenow',game.index+1);$('progress-fill').style.width=`${(game.index+1)/game.questions.length*100}%`;
  $('image-caption').textContent=`${answer.song.artist} — ${answer.song.title}`;$('round-image').alt=`Фон песни ${answer.song.title}, ${answer.song.artist}`;
  const feedback=$('feedback');feedback.className=`feedback${answer.correct?'':' miss'}`;const heading=document.createElement('strong');heading.textContent=answer.correct?'Верно! +100 очков':choice===null?'Теперь знаешь эту песню':'Почти! Здесь другая песня';const detail=document.createElement('span');detail.textContent=`${answer.song.title} — ${answer.song.artist}`;feedback.replaceChildren(heading,detail);feedback.hidden=false;
  $('skip').hidden=true;$('keyboard-hint').textContent='Enter — продолжить';$('next').replaceChildren(document.createTextNode(game.index+1===game.questions.length?'Посмотреть результат ':'Следующая картинка '),arrow('→'));$('next').hidden=false;
  $('streak').textContent=game.streak>=2?`${game.streak} ${wordForm(game.streak,'попадание','попадания','попаданий')} подряд ✦`:'';
  $('next').focus({preventScroll:true});
  revealAudio(answer.song,`solo:${game.index}`,answer.correct);
}
function advance(){if(!game||!game.questions[game.index].answered||game.finished)return;if(nextQuestion(game))renderQuestion();else renderResults();}
function renderResults(){
  showScreen('results');const n=game.questions.length;const perfect=game.correctCount===n;
  $('results-title').textContent=perfect?'Все песни разгаданы!':game.correctCount>=n*.7?'Отличное попадание!':'Хорошая игра!';
  $('result-description').textContent=`Ты узнал ${game.correctCount} из ${n} песен. Подборка «${PACKS[game.pack]}».`;
  $('result-score').textContent=game.score;$('result-correct').textContent=`${game.correctCount}/${n}`;
  const key=recordKey(game),value=Number(storage.get(key,'0')),previous=Number.isFinite(value)&&value>=0&&value<=n*100?value:0,best=Math.max(previous,game.score);const saved=storage.set(key,best);
  $('result-best').textContent=best;$('record-message').textContent=!saved?'Рекорд не удалось сохранить в этом браузере.':game.score>previous?'Новый рекорд для этой подборки и длины партии!':'Рекорд сохраняется в этом браузере.';
  const review=mistakes(game);$('review-block').hidden=review.length===0;$('review-list').replaceChildren();
  for(const q of review){const card=document.createElement('article');card.className='review-song';const image=document.createElement('img');image.src=q.song.image;image.alt=`Фон песни ${q.song.title}`;image.loading='lazy';image.width=1600;image.height=900;const body=document.createElement('div');const title=document.createElement('h3');title.textContent=q.song.title;const artist=document.createElement('p');artist.textContent=q.song.artist;const chosen=document.createElement('p');chosen.className='chosen';const selected=q.options.find(s=>s.id===q.choice);chosen.textContent=selected?`Твой ответ: ${selected.title} — ${selected.artist}`:'Ответ пропущен';body.append(title,artist,chosen);card.append(image,body);$('review-list').append(card);}
  $('results-title').focus({preventScroll:true});
}
function goHome(){imageGeneration++;game=null;showScreen('home');updateSetup();$('start').focus({preventScroll:true});}
$('start').addEventListener('click',startGame);$('replay').addEventListener('click',startGame);$('home-button').addEventListener('click',goHome);$('choose-pack').addEventListener('click',goHome);$('next').addEventListener('click',advance);$('skip').addEventListener('click',()=>submit(null));$('retry-image').addEventListener('click',()=>loadQuestionImage(true));
$('host-room').onclick=()=>openParty('host');$('open-join').onclick=()=>openParty('join');
$('sound-toggle').onclick=()=>{excerpt.setEnabled(!excerpt.enabled);if(excerpt.enabled)void excerpt.unlock();};
for(const view of ['solo','host']){$(`${view}-audio-play`).onclick=()=>void excerpt.play();$(`${view}-audio-stop`).onclick=excerpt.pause;}
$('packs').addEventListener('click',event=>{const button=event.target.closest('[data-pack]');if(!button)return;pack=button.dataset.pack;updateSetup();});$('rounds').addEventListener('change',updateSetup);
$('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{$('notice').textContent='Этот браузер не разрешил полноэкранный режим.';}});
document.addEventListener('fullscreenchange',()=>{const active=!!document.fullscreenElement;$('fullscreen').setAttribute('aria-label',active?'Выйти из полного экрана':'На весь экран');$('fullscreen').querySelector('span').textContent=active?'Выйти из полного экрана':'На весь экран';});
document.addEventListener('keydown',event=>{if(event.altKey||event.ctrlKey||event.metaKey||event.repeat||event.target.matches('input,select,textarea')||$('game').hidden||!game)return;const q=game.questions[game.index];if(!q.answered&&/^[1-4]$/.test(event.key)&&imageReady){event.preventDefault();submit(q.options[Number(event.key)-1].id);}else if(q.answered&&event.key==='Enter'){event.preventDefault();advance();}});
loadSongs();
