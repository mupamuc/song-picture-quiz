export function connectRoomService({url,hello,onState,onStatus,onLost,onReject}){
  let socket=null,closed=false,attempt=0,retry=null,deadline=null,accepted=false,lastCode=hello.code;
  const send=data=>{if(socket?.readyState!==WebSocket.OPEN)return false;socket.send(JSON.stringify(data));return true;};
  function connect(){
    if(closed)return;clearTimeout(retry);clearTimeout(deadline);accepted=false;
    const ws=new WebSocket(url);socket=ws;onStatus('Соединяемся с игровой комнатой…');
    deadline=setTimeout(()=>{if(socket===ws&&!accepted){onLost('Сервис игры не отвечает. Проверь интернет и попробуй восстановить соединение.');ws.close();}},12000);
    ws.onopen=()=>send(lastCode&&hello.type==='host'?{type:'resume-host',code:lastCode,owner:hello.owner}:hello);
    ws.onmessage=event=>{
      if(socket!==ws)return;let data;try{data=JSON.parse(event.data);}catch{return;}
      if(data.type==='state'&&data.state?.version===1&&Array.isArray(data.state.players)){
        if(data.state.question&&!/^assets\/\d+\.webp$/.test(data.state.question.image))return;
        clearTimeout(deadline);accepted=true;attempt=0;lastCode=data.code;onState(data.state,data.code);return;
      }
      if(data.type==='paused')onLost(data.message);
      if(data.type==='reject'||data.type==='ended'){closed=true;clearTimeout(deadline);onReject(data.message);ws.close();}
    };
    ws.onerror=()=>{};
    ws.onclose=()=>{clearTimeout(deadline);if(closed||socket!==ws)return;onLost('Соединение потеряно. Восстанавливаем связь с комнатой…');if(attempt<3)retry=setTimeout(connect,[1000,2500,5000][attempt++]);};
  }
  connect();return {send,reconnect(){if(closed)return;attempt=0;const old=socket;socket=null;old?.close();connect();},close(){closed=true;clearTimeout(retry);clearTimeout(deadline);send({type:'leave'});socket?.close();}};
}
