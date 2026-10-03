import album from './slideshow.json';
import {createShuffleBag} from './shuffle.mjs';

export function initSlideshow({stopExcerpt}){
  const $=id=>document.getElementById(id),panel=$('slideshow'),audio=$('slideshow-audio');
  const photos=createShuffleBag(album.photos),tracks=createShuffleBag(album.tracks),failedPhotos=new Set(),failedTracks=new Set();
  let active=false,paused=false,photoTimer,loadVersion=0,trackVersion=0,visibleLayer=0,history=[],position=-1,seconds=8,currentTrack=null,previousFocus=null;
  const layers=[$('slide-photo-a'),$('slide-photo-b')];
  audio.volume=.65;
  const schedule=()=>{clearTimeout(photoTimer);if(active&&!paused)photoTimer=setTimeout(nextPhoto,seconds*1000);};
  function renderMusic(message){$('slide-song').textContent=currentTrack?`${currentTrack.artist} — ${currentTrack.title}`:'Музыка из избранного';$('slide-music-status').textContent=message;}
  function showPhoto(photo){
    const version=++loadVersion,image=new Image();clearTimeout(photoTimer);$('slide-status').textContent='';
    image.onload=()=>{if(!active||version!==loadVersion)return;const next=1-visibleLayer;layers[next].src=photo.src;layers[next].width=photo.width;layers[next].height=photo.height;layers[next].classList.add('visible');layers[visibleLayer].classList.remove('visible');visibleLayer=next;$('slide-backdrop').style.backgroundImage=`url("${photo.src}")`;$('slide-count').textContent=`Фото ${position%album.photos.length+1} · ${album.photos.length} в альбоме`;$('slide-previous').disabled=position===0;schedule();};
    image.onerror=()=>{if(!active||version!==loadVersion)return;failedPhotos.add(photo.src);if(failedPhotos.size<album.photos.length){$('slide-status').textContent='Фото не загрузилось — показываем следующее';nextPhoto();}else{$('slide-status').textContent='Не удалось загрузить фото. Проверь интернет и нажми →';}};
    image.src=photo.src;
  }
  function nextPhoto(){if(!active)return;position++;if(position===history.length){let photo;do{photo=photos.next();}while(failedPhotos.has(photo.src)&&failedPhotos.size<album.photos.length);history.push(photo);}showPhoto(history[position]);}
  function previousPhoto(){if(position<1)return;position--;showPhoto(history[position]);}
  async function playMusic(){
    const version=trackVersion;if(!active||paused)return;
    try{await audio.play();if(active&&version===trackVersion)renderMusic('Полная песня · дальше включится случайная');}
    catch(error){if(!active||version!==trackVersion)return;if(error.name==='NotAllowedError'){renderMusic('Нажми ♫, чтобы включить музыку');audio.muted=true;renderSound();}else if(error.name!=='AbortError')renderMusic('Песня не загрузилась. Нажми «Другая песня»');}
  }
  function nextTrack(){
    if(!active)return;trackVersion++;let track;do{track=tracks.next();}while(failedTracks.has(track.src)&&failedTracks.size<album.tracks.length);
    if(failedTracks.size===album.tracks.length){renderMusic('Музыка недоступна. Проверь интернет и выбери другую песню');return;}
    currentTrack=track;$('slide-seek').value=0;$('slide-time').textContent='0:00';audio.src=track.src;renderMusic(paused?'На паузе':'Загружаем песню…');if(!paused)void playMusic();
  }
  audio.addEventListener('ended',nextTrack);
  audio.addEventListener('error',()=>{if(!active||!currentTrack)return;failedTracks.add(currentTrack.src);renderMusic('Песня не загрузилась — пробуем следующую');nextTrack();});
  audio.addEventListener('waiting',()=>{if(active&&!paused)renderMusic('Подгружаем музыку…');});
  audio.addEventListener('playing',()=>{if(active)renderMusic('Полная песня · дальше включится случайная');});
  const time=value=>`${Math.floor(value/60)}:${String(Math.floor(value%60)).padStart(2,'0')}`;
  audio.addEventListener('timeupdate',()=>{if(!active||!Number.isFinite(audio.duration))return;$('slide-seek').value=audio.currentTime/audio.duration*100;$('slide-time').textContent=`${time(audio.currentTime)} / ${time(audio.duration)}`;});
  $('slide-seek').oninput=()=>{if(Number.isFinite(audio.duration))audio.currentTime=Math.min(audio.duration-.08,Number($('slide-seek').value)/100*audio.duration);};
  function renderSound(){$('slide-sound').textContent=audio.muted?'♫ Включить звук':'♫ Звук вкл.';$('slide-sound').setAttribute('aria-pressed',String(!audio.muted));}
  function togglePause(){paused=!paused;$('slide-pause').textContent=paused?'▶ Продолжить':'Ⅱ Пауза';$('slide-pause').setAttribute('aria-pressed',String(paused));if(paused){clearTimeout(photoTimer);audio.pause();renderMusic('На паузе');}else{schedule();void playMusic();}}
  async function open(){
    if(!$('party').hidden){$('notice').textContent='Слайдшоу доступно после выхода из игры с телефонами.';return;}
    previousFocus=document.activeElement;stopExcerpt();active=true;paused=false;history=[];position=-1;failedPhotos.clear();failedTracks.clear();panel.hidden=false;document.querySelector('.shell').inert=true;document.body.classList.add('slideshow-open');
    $('slide-pause').textContent='Ⅱ Пауза';$('slide-pause').setAttribute('aria-pressed','false');$('slide-close').focus({preventScroll:true});renderSound();nextPhoto();nextTrack();
    await enterFullscreen();
  }
  async function enterFullscreen(){if(document.fullscreenElement===panel)return;try{await panel.requestFullscreen();}catch{if(active)$('slide-status').textContent='Слайдшоу открыто. Полный экран недоступен в этом браузере.';}}
  function close(exit=true){if(!active)return;active=false;loadVersion++;trackVersion++;clearTimeout(photoTimer);audio.pause();audio.removeAttribute('src');audio.load();panel.hidden=true;document.querySelector('.shell').inert=false;document.body.classList.remove('slideshow-open');if(exit&&document.fullscreenElement===panel)void document.exitFullscreen().catch(()=>{});previousFocus?.focus({preventScroll:true});}
  $('open-slideshow').onclick=open;$('slide-close').onclick=()=>close();$('slide-next').onclick=()=>{failedPhotos.clear();nextPhoto();};$('slide-previous').onclick=previousPhoto;$('slide-pause').onclick=togglePause;
  $('slide-next-song').onclick=()=>{failedTracks.clear();nextTrack();};$('slide-sound').onclick=()=>{audio.muted=!audio.muted;renderSound();if(!audio.muted&&!paused)void playMusic();};
  $('slide-interval').onchange=()=>{seconds=Number($('slide-interval').value);schedule();};$('slide-volume').oninput=()=>{audio.volume=Number($('slide-volume').value);};
  $('slide-fullscreen').onclick=enterFullscreen;
  document.addEventListener('fullscreenchange',()=>{$('slide-fullscreen').hidden=document.fullscreenElement===panel;});
  document.addEventListener('keydown',event=>{if(!active||event.altKey||event.ctrlKey||event.metaKey)return;if(event.key==='Escape'){event.preventDefault();close();}else if(!event.target.matches('select,input')&&event.key==='ArrowRight'){event.preventDefault();nextPhoto();}else if(!event.target.matches('select,input')&&event.key==='ArrowLeft'){event.preventDefault();previousPhoto();}else if(event.key===' '&&!event.target.matches('button,select,input')){event.preventDefault();togglePause();}else if(event.key==='Tab'){const focusable=[...panel.querySelectorAll('button,select,input')].filter(e=>!e.disabled),first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
}
