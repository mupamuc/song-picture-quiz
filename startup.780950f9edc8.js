(()=>{
  let complete=false;
  const $=id=>document.getElementById(id);
  function fail(message){
    if(complete)return;
    clearTimeout(deadline);
    $('start').disabled=true;$('start').textContent='Не удалось запустить игру';
    $('host-room').disabled=true;$('open-join').disabled=true;
    $('start-summary').textContent=message;
    $('load-error').hidden=false;$('startup-error-detail').textContent=message;
  }
  const deadline=setTimeout(()=>fail('Загрузка заняла слишком долго. Проверь интернет и нажми «Обновить игру».'),12000);
  window.addEventListener('quiz:ready',()=>{complete=true;clearTimeout(deadline);$('load-error').hidden=true;});
  window.addEventListener('quiz:failed',event=>fail(event.detail||'Не удалось запустить приложение. Обнови игру.'));
  window.addEventListener('error',event=>{
    if(event.target?.tagName==='SCRIPT'&&event.target.hasAttribute('data-quiz-bundle'))fail('Не загрузился файл приложения. Нажми «Обновить игру».');
    else if(!complete&&event.filename)fail('Браузер не смог запустить приложение. Обнови игру; если ошибка повторится, попробуй другой браузер.');
  },true);
  $('reload-data').addEventListener('click',()=>{const url=new URL(location.href);url.searchParams.set('reload',Date.now().toString(36));location.replace(url.href);});
})();
