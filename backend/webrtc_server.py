import asyncio
import json
import logging
from typing import Dict, Set
from aiohttp import web
import socketio
import aiohttp

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ⭐ URLs de los otros servidores (si tienes múltiples servidores) ⭐
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

# ⭐ NUEVAS ESTRUCTURAS DE DATOS ⭐
active_broadcasters: Dict[str, str] = {}  # deviceId -> socketId
active_viewers: Dict[str, Dict] = {}      # viewerId -> { socketId, watchingDevice }

@sio.event
async def connect(sid, environ):
    """Cliente se conecta"""
    logger.info(f"🔌 Cliente conectado: {sid}")
    await sio.emit('connection_status', {'status': 'connected'}, room=sid)

@sio.event
async def disconnect(sid):
    """Cliente se desconecta"""
    logger.info(f"❌ Cliente desconectado: {sid}")
    
    # Limpiar broadcaster si es uno
    for device_id, broadcaster_sid in list(active_broadcasters.items()):
        if broadcaster_sid == sid:
            del active_broadcasters[device_id]
            await sio.emit('broadcaster-disconnected', {
                'deviceId': device_id
            })
            logger.info(f"📱 Broadcaster {device_id} desconectado")
            break
    
    # Limpiar viewer si es uno
    for viewer_id, viewer_data in list(active_viewers.items()):
        if viewer_data['socketId'] == sid:
            del active_viewers[viewer_id]
            logger.info(f"🖥️ Viewer {viewer_id} desconectado")
            break

# ⭐ NUEVO: ANDROID SE REGISTRA COMO BROADCASTER ⭐
@sio.event
async def register_broadcaster(sid, data):
    """Android se registra como broadcaster"""
    device_id = data.get('deviceId')
    logger.info(f"📱 Broadcaster registrado: {device_id} (sid: {sid})")
    
    active_broadcasters[device_id] = sid
    
    # Notificar a todos los clientes web que hay un nuevo broadcaster
    await sio.emit('broadcaster-available', {
        'deviceId': device_id
    })
    
    logger.info(f"✅ Broadcaster {device_id} listo para transmitir")
    # Alias para compatibilidad con guiones
sio.on('register-broadcaster', register_broadcaster)

# ⭐ NUEVO: NAVEGADOR SE REGISTRA COMO VIEWER ⭐
@sio.event
async def register_viewer(sid, data):
    """Navegador se registra como viewer"""
    viewer_id = data.get('viewerId')
    logger.info(f"🖥️ Viewer registrado: {viewer_id} (sid: {sid})")
    
    active_viewers[viewer_id] = {
        'socketId': sid,
        'watchingDevice': None
    }
    
    # Enviar lista de broadcasters disponibles
    available_devices = list(active_broadcasters.keys())
    await sio.emit('available-broadcasters', available_devices, room=sid)
    
    logger.info(f"📡 Enviados {len(available_devices)} dispositivos disponibles a {viewer_id}")

# ⭐ NUEVO: NAVEGADOR SOLICITA STREAM DE UN DISPOSITIVO ⭐
@sio.event
async def request_stream(sid, data):
    """Navegador solicita stream de un dispositivo"""
    device_id = data.get('deviceId')
    broadcaster_sid = active_broadcasters.get(device_id)
    
    logger.info(f"📡 Viewer {sid} solicita stream de {device_id}")
    
    if broadcaster_sid:
        # Actualizar qué dispositivo está viendo
        for viewer_id, viewer_data in active_viewers.items():
            if viewer_data['socketId'] == sid:
                viewer_data['watchingDevice'] = device_id
                break
        
        # Notificar al broadcaster (Android) que hay un nuevo viewer
        await sio.emit('viewer-joined', {
            'viewerId': sid,
            'socketId': sid
        }, room=broadcaster_sid)
        
        logger.info(f"✅ Notificado a broadcaster {device_id} sobre viewer {sid}")
    else:
        await sio.emit('error', {
            'message': f'Device {device_id} not available'
        }, room=sid)
        logger.warning(f"⚠️ Device {device_id} no disponible")

# ⭐ NUEVO: RETRANSMITIR OFFER DE ANDROID A NAVEGADOR ⭐
@sio.event
async def offer(sid, data):
    """Retransmitir offer de Android a Navegador"""
    target = data.get('target')
    sdp = data.get('sdp')
    
    logger.info(f"📨 Retransmitiendo OFFER de {sid} a {target}")
    
    await sio.emit('offer', {
        'sender': sid,
        'sdp': sdp
    }, room=target)

# ⭐ NUEVO: RETRANSMITIR ANSWER DE NAVEGADOR A ANDROID ⭐
@sio.event
async def answer(sid, data):
    """Retransmitir answer de Navegador a Android"""
    target = data.get('target')
    sdp = data.get('sdp')
    
    logger.info(f"📨 Retransmitiendo ANSWER de {sid} a {target}")
    
    await sio.emit('answer', {
        'sender': sid,
        'sdp': sdp
    }, room=target)

# ⭐ NUEVO: RETRANSMITIR ICE CANDIDATES ⭐
@sio.event
async def ice_candidate(sid, data):
    """Retransmitir ICE candidates entre Android y Navegador"""
    target = data.get('target')
    candidate = data.get('candidate')
    
    logger.info(f"🧊 Retransmitiendo ICE de {sid} a {target}")
    
    await sio.emit('ice-candidate', {
        'sender': sid,
        'candidate': candidate
    }, room=target)

# ⭐ ENDPOINTS HTTP ⭐
async def health_check(request):
    """Health check del servidor de video"""
    return web.Response(
        text=json.dumps({
            "status": "healthy",
            "service": "webrtc_server",
            "active_broadcasters": len(active_broadcasters),
            "active_viewers": len(active_viewers),
            "broadcaster_devices": list(active_broadcasters.keys())
        }),
        content_type="application/json"
    )

async def get_active_devices(request):
    """Endpoint para obtener dispositivos activos"""
    return web.Response(
        text=json.dumps({
            "devices": list(active_broadcasters.keys())
        }),
        content_type="application/json"
    )

async def start_webrtc_server(host='0.0.0.0', port=8080):
    """Iniciar servidor WebRTC"""
    
    # Registrar rutas HTTP
    app.router.add_get('/health', health_check)
    app.router.add_get('/api/devices', get_active_devices)
    
    logger.info(f"🎥 Iniciando servidor WebRTC en {host}:{port}")
    logger.info(f"📡 Servidores configurados para retransmisión: {len(OTHER_SERVERS)}")
    
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, host, port)
    await site.start()
    
    logger.info(f"✅ Servidor WebRTC iniciado: ws://{host}:{port}")
    logger.info(f"📊 Health check: http://{host}:{port}/health")
    logger.info(f"📱 API devices: http://{host}:{port}/api/devices")
    
    return runner

if __name__ == '__main__':
    asyncio.run(start_webrtc_server())