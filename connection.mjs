// Set the deployed HTTPS WebSocket endpoint here, then rebuild the frontend.
export const RELAY_URL='';
export function roomServiceURL(location){return ['127.0.0.1','localhost'].includes(location.hostname)&&new URLSearchParams(location.search).get('transport')==='local'?'ws://127.0.0.1:8890/rooms':RELAY_URL;}
