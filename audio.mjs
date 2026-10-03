// One shared media element: automatic excerpts only after the answer is revealed.
export function validExcerpt(clip){return !!clip&&/^audio\/\d+\.[a-f0-9]{12}\.mp3$/.test(clip.src)&&Number.isFinite(clip.duration)&&clip.duration>0&&clip.duration<=15.1&&Number.isFinite(clip.sourceStart)&&clip.sourceStart>=0;}
export function createExcerptPlayer({audio,onChange=()=>{},enabled=true,onEnabledChange=()=>{}}){
  let selected=null,key=null,generation=0,phase='idle',primed=false,progress=0;
  const notify=()=>onChange({song:selected,key,phase,enabled,progress});
  audio.volume=.75;
  function stop(){if(!selected)return;generation++;audio.pause();audio.removeAttribute('src');audio.load();selected=null;key=null;phase='idle';progress=0;notify();}
  function setEnabled(value){enabled=!!value;if(!enabled){generation++;audio.pause();phase=selected?'ready':'idle';}onEnabledChange(enabled);notify();}
  async function unlock(){
    if(primed||selected||!enabled)return;
    const token=generation;primed=true;audio.src='audio/unlock.wav';audio.muted=false;
    try{await audio.play();}catch{primed=false;}
    finally{if(token===generation&&!selected){audio.pause();audio.muted=false;audio.removeAttribute('src');audio.load();}}
  }
  async function play(){
    if(!selected)return;
    if(!enabled)setEnabled(true);
    const token=++generation;phase='loading';progress=0;audio.pause();audio.muted=false;audio.src=selected.audio.src;audio.currentTime=0;notify();
    try{await audio.play();if(token===generation&&selected){phase='playing';notify();}}
    catch(error){if(token===generation&&selected){phase=error?.name==='NotAllowedError'?'blocked':'error';notify();}}
  }
  function pause(){generation++;audio.pause();phase=selected?'ready':'idle';notify();}
  function reveal(song,roundKey,autoplay){
    if(key===roundKey&&selected?.id===song?.id)return;
    stop();if(!validExcerpt(song?.audio))return;
    selected=song;key=roundKey;phase='ready';notify();if(autoplay&&enabled)void play();
  }
  audio.addEventListener('ended',()=>{if(selected){phase='ended';progress=1;notify();}});
  audio.addEventListener('error',()=>{if(selected&&audio.error){phase='error';notify();}});
  audio.addEventListener('timeupdate',()=>{if(selected){progress=Math.min(1,audio.currentTime/selected.audio.duration);notify();}});
  notify();return {unlock,stop,pause,play,reveal,setEnabled,get enabled(){return enabled;}};
}
