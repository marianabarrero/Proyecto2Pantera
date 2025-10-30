import asyncio
import json
import logging
from typing import Dict, Set
from aiohttp import web
import socketio
import aiohttp
from aiortc import RTCPeerConnection, RTCSessionDescription
from aiortc.contrib.media import MediaRelay

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ⭐ URLs de los otros 3 servidores ⭐
# CAMBIAR SEGÚN EL SERVIDOR:
OTHER_SERVERS = []

# Configurar Socket.IO
sio = socketio.AsyncServer(
    async_mode='aiohttp',
    cors_allowed_origins='*',
    logger=True,
    engineio_logger=False
)

app = web.Application()
sio.attach(app)

# Almacenar conexiones activas
pcs: Dict[str, RTCPeerConnection] = {}
relay = MediaRelay()
active_streams: Dict[str, Set[str]] = {}

@sio.event
async def connect(sid, environ):
    """Cliente web se conecta"""
    logger.info(f"Cliente web conectado: {sid}")
    await sio.emit('connection_status', {'status': 'connected'}, room=sid)

@sio.event
async def disconnect(sid):
    """Cliente web se desconecta"""
    logger.info(f"Cliente web desconectado: {sid}")
    
    if sid in pcs:
        await pcs[sid].close()
        del pcs[sid]
    
    for device_id, clients in active_streams.items():
        if sid in clients:
            clients.remove(sid)

@sio.event
async def video_frame(sid, data):
    """Recibir frames del celular Android"""
    try:
        device_id = data.get('device_id')
        frame_number = data.get('frame_number', 0)
        
        if device_id not in active_streams:
            active_streams[device_id] = set()
        
        await sio.emit('video_frame_update', {
            'device_id': device_id,
            'frame_number': frame_number,
            'timestamp': data.get('timestamp'),
            'width': data.get('width'),
            'height': data.get('height'),
            'format': data.get('format'),
        }, skip_sid=sid)
        
        if frame_number % 30 == 0:
            logger.info(f"📹 Frame #{frame_number} de {device_id}")
        
        if OTHER_SERVERS and frame_number % 2 == 0:
            asyncio.create_task(relay_frame_to_servers(data))
        
    except Exception as e:
        logger.error(f"Error procesando frame: {e}")

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
            
            await asyncio.gather(*tasks, return_exceptions=True)
            
    except Exception as e:
        logger.error(f"Error retransmitiendo: {e}")

@sio.event
async def device_streaming(sid, data):
    """Dispositivo transmitiendo"""
    try:
        device_id = data.get('device_id')
        status = data.get('status')
        
        logger.info(f"📹 Dispositivo {device_id} - Status: {status}")
        
        if status == 'active':
            if device_id not in active_streams:
                active_streams[device_id] = set()
            active_streams[device_id].add(sid)
            
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
async def request_stream(sid, data):
    """Cliente web solicita stream"""
    device_id = data.get('device_id')
    logger.info(f"Cliente {sid} solicita stream de {device_id}")
    
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
    """Obtener streams activos"""
    active_devices = list(active_streams.keys())
    await sio.emit('active_streams', {'devices': active_devices}, room=sid)

# ⭐ ENDPOINTS HTTP (sintaxis correcta de aiohttp) ⭐
async def relay_video_frame_endpoint(request):
    """Recibir frame retransmitido de otro servidor"""
    try:
        data = await request.json()
        await sio.emit('video_frame_update', data)
        return web.Response(
            text='{"status":"ok"}',
            content_type="application/json",
            status=200
        )
    except Exception as e:
        logger.error(f"Error en relay: {e}")
        return web.Response(
            text=f'{{"error":"{str(e)}"}}',
            content_type="application/json",
            status=500
        )

async def health_check(request):
    """Health check del servidor de video"""
    return web.Response(
        text=json.dumps({
            "status": "healthy",
            "service": "webrtc_server",
            "active_devices": len(active_streams),
            "other_servers_configured": len(OTHER_SERVERS)
        }),
        content_type="application/json"
    )

async def start_webrtc_server(host='0.0.0.0', port=8081):
    """Iniciar servidor WebRTC"""
    
    # ⭐ Registrar rutas HTTP ⭐
    app.router.add_post('/api/relay/video_frame', relay_video_frame_endpoint)
    app.router.add_get('/health', health_check)
    
    logger.info(f"🎥 Iniciando servidor WebRTC en {host}:{port}")
    logger.info(f"📡 Servidores configurados para retransmisión: {len(OTHER_SERVERS)}")
    
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, host, port)
    await site.start()
    
    logger.info(f"✅ Servidor WebRTC iniciado: ws://{host}:{port}")
    logger.info(f"📊 Health check: http://{host}:{port}/health")
    
    return runner

if __name__ == '__main__':
    asyncio.run(start_webrtc_server())