import {validExcerpt} from './audio.mjs';
export const PACKS={all:'Все песни',guitar:'Под гитару',screenshots:'Наши любимые',english:'English hits'};
export function songKey(song){return `${song.artist.trim().toLocaleLowerCase('ru')}|${song.title.trim().toLocaleLowerCase('ru')}`;}
export function validateSongs(songs){
  if(!Array.isArray(songs)||songs.length<4)throw new Error('Нужны минимум четыре песни');
  const ids=new Set(),labels=new Set();
  for(const s of songs){
    if(!s||typeof s.id!=='string'||!s.id||typeof s.artist!=='string'||!s.artist.trim()||typeof s.title!=='string'||!s.title.trim()||!/^assets\/\d+\.webp$/.test(s.image)||!Array.isArray(s.categories)||s.categories.some(c=>!Object.hasOwn(PACKS,c)||c==='all'))throw new Error('Некорректная запись песни');
    if(ids.has(s.id)||labels.has(songKey(s)))throw new Error('Повтор песни');
    if(s.audio&&!validExcerpt(s.audio))throw new Error('Некорректный фрагмент песни');
    ids.add(s.id);labels.add(songKey(s));
  }
  return songs;
}
export function shuffle(items,rng=Math.random){
  const result=[...items];
  for(let i=result.length-1;i>0;i--){const j=Math.min(i,Math.max(0,Math.floor(rng()*(i+1))));[result[i],result[j]]=[result[j],result[i]];}
  return result;
}
export function poolFor(songs,pack){if(!Object.hasOwn(PACKS,pack))throw new Error('Неизвестная подборка');return pack==='all'?[...songs]:songs.filter(s=>s.categories.includes(pack));}
export function createGame(songs,pack='all',requested=20,rng=Math.random){
  const pool=poolFor(songs,pack);
  if(pool.length<4)throw new Error('В подборке недостаточно песен');
  if(!Number.isInteger(requested)||requested<1)throw new Error('Некорректная длина партии');
  const deck=shuffle(pool,rng).slice(0,Math.min(requested,pool.length));
  const questions=deck.map(song=>({song,options:shuffle([song,...shuffle(pool.filter(s=>s.id!==song.id),rng).slice(0,3)],rng),choice:undefined,answered:false,correct:false}));
  return {pack,requested,questions,index:0,score:0,correctCount:0,streak:0,bestStreak:0,finished:false};
}
export function answerGame(game,choice){
  if(game.finished)return null;
  const question=game.questions[game.index];
  if(question.answered)return null;
  if(choice!==null&&!question.options.some(s=>s.id===choice))throw new Error('Такого варианта нет');
  question.choice=choice;question.answered=true;question.correct=choice===question.song.id;
  if(question.correct){game.score+=100;game.correctCount++;game.streak++;game.bestStreak=Math.max(game.streak,game.bestStreak);}else game.streak=0;
  return {correct:question.correct,points:question.correct?100:0,song:question.song};
}
export function nextQuestion(game){
  if(game.finished||!game.questions[game.index].answered)return false;
  if(game.index+1===game.questions.length){game.finished=true;return false;}
  game.index++;return true;
}
export function mistakes(game){return game.questions.filter(q=>q.answered&&!q.correct);}
export function wordForm(n,one,few,many){const m=n%100;if(m>=11&&m<=14)return many;const d=n%10;return d===1?one:d>=2&&d<=4?few:many;}
export function recordKey(game){return `song-picture-quiz:best:v1:${game.pack}:${game.questions.length}`;}
