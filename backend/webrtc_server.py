import asyncio
import json
import logging
from typing import Dict, Set
from aiohttp import web
import socketio
from aiortc import RTCPeerConnection, RTCSessionDescription, VideoStreamTrack
from aiortc.contrib.media import MediaRelay

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

import aiohttp

# Configurar IPs de los otros 3 servidores
OTHER_SERVERS = []


# Configurar Socket.IO
sio = socketio.AsyncServer(
    async_mode='aiohttp',
    cors_allowed_origins='*',
    logger=True,
    engineio_logger=True
)

app = web.Application()
sio.attach(app)

# Almacenar conexiones activas
pcs: Dict[str, RTCPeerConnection] = {}
relay = MediaRelay()
active_streams: Dict[str, Set[str]] = {}  # device_id -> set of client_ids

@sio.event
async def connect(sid, environ):
    """Cliente web se conecta"""
    logger.info(f"Cliente web conectado: {sid}")
    await sio.emit('connection_status', {'status': 'connected'}, room=sid)

@sio.event
async def disconnect(sid):
    """Cliente web se desconecta"""
    logger.info(f"Cliente web desconectado: {sid}")
    
    # Limpiar recursos
    if sid in pcs:
        await pcs[sid].close()
        del pcs[sid]
    
    # Remover de streams activos
    for device_id, clients in active_streams.items():
        if sid in clients:
            clients.remove(sid)

# ⭐ NUEVO: Evento para recibir frames de la app Android
@sio.event
async def video_frame(sid, data):
    """Recibir frames del celular Android y reenviar a clientes web"""
    try:
        device_id = data.get('device_id')
        frame_number = data.get('frame_number', 0)
        
        # Registrar que el dispositivo está activo
        if device_id not in active_streams:
            active_streams[device_id] = set()
        
        # Reenviar el frame a todos los clientes web conectados (excepto el que lo envió)
        await sio.emit('video_frame_update', {
            'device_id': device_id,
            'frame_number': frame_number,
            'timestamp': data.get('timestamp'),
            'width': data.get('width'),
            'height': data.get('height'),
            'format': data.get('format'),
        }, skip_sid=sid)
        
        # Log cada 30 frames
        if frame_number % 30 == 0:
            logger.info(f"📹 Frame #{frame_number} de {device_id} recibido")
        
        # ⭐ RETRANSMITIR A OTROS SERVIDORES (cada 2 frames) ⭐
        if OTHER_SERVERS and frame_number % 2 == 0:
            asyncio.create_task(relay_frame_to_servers(data))
        
    except Exception as e:
        logger.error(f"Error procesando frame: {e}")

# ⭐ NUEVO: Evento para notificar cuando un dispositivo empieza a transmitir
@sio.event
async def device_streaming(sid, data):
    """Notificar que un dispositivo está transmitiendo"""
    try:
        device_id = data.get('device_id')
        status = data.get('status')
        
        logger.info(f"📹 Dispositivo {device_id} - Status: {status}")
        
        if status == 'active':
            if device_id not in active_streams:
                active_streams[device_id] = set()
            active_streams[device_id].add(sid)
            
            # Notificar a todos los clientes web
            await sio.emit('stream_available', {
                'device_id': device_id,
                'status': 'active'
            })
        elif status == 'inactive':
            if device_id in active_streams and sid in active_streams[device_id]:
                active_streams[device_id].remove(sid)
                if not active_streams[device_id]:
                    del active_streams[device_id]
            
            await sio.emit('stream_unavailable', {
                'device_id': device_id,
                'status': 'inactive'
            })
            
    except Exception as e:
        logger.error(f"Error en device_streaming: {e}")

@sio.event
async def offer(sid, data):
    """Manejar oferta WebRTC del celular (Android) - MANTENER PARA RETROCOMPATIBILIDAD"""
    try:
        device_id = data.get('device_id')
        offer_sdp = data.get('sdp')
        
        logger.info(f"Oferta recibida de dispositivo: {device_id}")
        
        # Crear nueva conexión peer
        pc = RTCPeerConnection()
        pcs[sid] = pc
        
        @pc.on("track")
        async def on_track(track):
            """Cuando recibimos video del celular"""
            logger.info(f"Track de video recibido de {device_id}: {track.kind}")
            
            if track.kind == "video":
                # Registrar stream activo
                if device_id not in active_streams:
                    active_streams[device_id] = set()
                active_streams[device_id].add(sid)
                
                # Notificar a clientes web que hay un nuevo stream disponible
                await sio.emit('stream_available', {
                    'device_id': device_id,
                    'status': 'active'
                })
                
                # Relay del stream a clientes web
                relayed_track = relay.subscribe(track)
                
                @pc.on("connectionstatechange")
                async def on_connectionstatechange():
                    logger.info(f"Estado de conexión: {pc.connectionState}")
                    if pc.connectionState == "failed" or pc.connectionState == "closed":
                        await sio.emit('stream_ended', {'device_id': device_id})
        
        # Configurar la oferta
        await pc.setRemoteDescription(
            RTCSessionDescription(sdp=offer_sdp['sdp'], type=offer_sdp['type'])
        )
        
        # Crear respuesta
        answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        
        # Enviar respuesta al celular
        await sio.emit('answer', {
            'device_id': device_id,
            'sdp': {
                'type': pc.localDescription.type,
                'sdp': pc.localDescription.sdp
            }
        }, room=sid)
        
        logger.info(f"Respuesta enviada a dispositivo: {device_id}")
        
    except Exception as e:
        logger.error(f"Error procesando oferta: {e}")
        await sio.emit('error', {'message': str(e)}, room=sid)

@sio.event
async def ice_candidate(sid, data):
    """Manejar candidatos ICE"""
    try:
        if sid in pcs:
            candidate = data.get('candidate')
            await pcs[sid].addIceCandidate(candidate)
            logger.info(f"Candidato ICE agregado para {sid}")
    except Exception as e:
        logger.error(f"Error agregando candidato ICE: {e}")

@sio.event
async def request_stream(sid, data):
    """Cliente web solicita stream de un dispositivo"""
    device_id = data.get('device_id')
    logger.info(f"Cliente {sid} solicita stream de {device_id}")
    
    # Notificar que el stream está disponible si existe
    if device_id in active_streams and active_streams[device_id]:
        await sio.emit('stream_available', {
            'device_id': device_id,
            'status': 'active'
        }, room=sid)
    else:
        await sio.emit('stream_unavailable', {
            'device_id': device_id,
            'message': 'Device not streaming'
        }, room=sid)

@sio.event
async def get_active_streams(sid, data):
    """Obtener lista de streams activos"""
    active_devices = list(active_streams.keys())
    await sio.emit('active_streams', {'devices': active_devices}, room=sid)

    # ⭐ AGREGAR ESTA FUNCIÓN COMPLETA ⭐
async def relay_frame_to_servers(frame_data):
    """Retransmitir frame a otros servidores"""
    try:
        async with aiohttp.ClientSession() as session:
            tasks = []
            for server_url in OTHER_SERVERS:
                task = session.post(
                    f"{server_url}/api/relay/video_frame",
                    json=frame_data,
                    timeout=aiohttp.ClientTimeout(total=1)
                )
                tasks.append(task)
            
            # Enviar sin esperar respuesta
            await asyncio.gather(*tasks, return_exceptions=True)
            
    except Exception as e:
        logger.error(f"Error retransmitiendo frame: {e}")

# ⭐ AGREGAR ESTE ENDPOINT HTTP ⭐
@app.route('/api/relay/video_frame', methods=['POST'])
async def relay_video_frame_endpoint(request):
    """Recibir frame retransmitido de otro servidor"""
    try:
        data = await request.json()
        
        # Emitir a clientes web locales
        await sio.emit('video_frame_update', data)
        
        return web.Response(
            text='{"status":"ok"}',
            content_type="application/json",
            status=200
        )
    except Exception as e:
        logger.error(f"Error en relay endpoint: {e}")
        return web.Response(
            text=f'{{"error":"{str(e)}"}}',
            content_type="application/json",
            status=500
        )



async def start_webrtc_server(host='0.0.0.0', port=8081):
    """Iniciar servidor WebRTC"""
    logger.info(f"🎥 Iniciando servidor WebRTC en {host}:{port}")
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, host, port)
    await site.start()
    logger.info(f"✅ Servidor WebRTC iniciado: ws://{host}:{port}")
    return runner

if __name__ == '__main__':
    asyncio.run(start_webrtc_server())