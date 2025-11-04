import asyncio
import json
import logging
import os
import ssl
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

# ⭐ ESTRUCTURAS DE DATOS MEJORADAS ⭐
active_broadcasters: Dict[str, str] = {}  # deviceId -> socketId
active_viewers: Dict[str, Dict] = {}      # viewerId -> { socketId, watchingDevice }
# ⭐ NUEVO: Rastrear viewers por broadcaster ⭐
broadcaster_viewers: Dict[str, Set[str]] = {}  # deviceId -> Set[viewerSocketId]

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
            
            # ⭐ NUEVO: Limpiar viewers asociados ⭐
            if device_id in broadcaster_viewers:
                del broadcaster_viewers[device_id]
            
            await sio.emit('broadcaster-disconnected', {
                'deviceId': device_id
            })
            logger.info(f"📱 Broadcaster {device_id} desconectado")
            break
    
    # Limpiar viewer si es uno
    for viewer_id, viewer_data in list(active_viewers.items()):
        if viewer_data['socketId'] == sid:
            watching_device = viewer_data.get('watchingDevice')
            
            # ⭐ NUEVO: Notificar al broadcaster que el viewer se desconectó ⭐
            if watching_device and watching_device in active_broadcasters:
                broadcaster_sid = active_broadcasters[watching_device]
                await sio.emit('viewer-disconnected', {
                    'viewerId': sid
                }, room=broadcaster_sid)
                logger.info(f"📤 Notificado a broadcaster {watching_device} que viewer {sid} se desconectó")
                
                # Remover de la lista de viewers del broadcaster
                if watching_device in broadcaster_viewers:
                    broadcaster_viewers[watching_device].discard(sid)
            
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
    
    # ⭐ NUEVO: Inicializar set de viewers para este broadcaster ⭐
    if device_id not in broadcaster_viewers:
        broadcaster_viewers[device_id] = set()
    
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

# Alias para compatibilidad con guiones
sio.on('register-viewer', register_viewer)

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
        
        # ⭐ NUEVO: Agregar viewer al set del broadcaster ⭐
        if device_id not in broadcaster_viewers:
            broadcaster_viewers[device_id] = set()
        broadcaster_viewers[device_id].add(sid)
        
        logger.info(f"📊 Viewers activos para {device_id}: {len(broadcaster_viewers[device_id])}")
        
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

# Alias para compatibilidad con guiones
sio.on('request-stream', request_stream)

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

# ⭐ MODIFICADO: RETRANSMITIR ANSWER DE NAVEGADOR A ANDROID ⭐
@sio.event
async def answer(sid, data):
    """Retransmitir answer de Navegador a Android"""
    target = data.get('target')
    sdp = data.get('sdp')
    
    logger.info(f"📨 Retransmitiendo ANSWER de {sid} a {target}")
    
    # ⭐ NUEVO: Incluir el sender ID para que Android sepa de qué viewer viene ⭐
    await sio.emit('answer', {
        'sender': sid,
        'sdp': sdp
    }, room=target)

# ⭐ MODIFICADO: RETRANSMITIR ICE CANDIDATES ⭐
@sio.event
async def ice_candidate(sid, data):
    """Retransmitir ICE candidates entre Android y Navegador"""
    target = data.get('target')
    candidate = data.get('candidate')
    
    logger.info(f"🧊 Retransmitiendo ICE de {sid} a {target}")
    
    # ⭐ NUEVO: Incluir el sender ID para que Android sepa de qué viewer viene ⭐
    await sio.emit('ice-candidate', {
        'sender': sid,
        'candidate': candidate
    }, room=target)

# Alias para compatibilidad con guiones
sio.on('ice-candidate', ice_candidate)

# ⭐ NUEVO: RECIBIR DETECCIONES DE PERSONAS ⭐
@sio.event
async def person_detection(sid, data):
    """Recibir conteo de personas detectadas desde viewer/raspberry"""
    device_id = data.get('deviceId')
    person_count = data.get('personCount', 0)
    timestamp = data.get('timestamp')
    
    logger.info(f"👤 Detección recibida de {sid}: {person_count} persona(s) en {device_id}")
    
    # Broadcast a TODOS los clientes conectados (web viewers)
    await sio.emit('detection-update', {
        'deviceId': device_id,
        'personCount': person_count,
        'timestamp': timestamp,
        'source': sid
    })
    
    logger.info(f"📡 Detección enviada a todos los clientes web")

# Alias para compatibilidad
sio.on('person-detection', person_detection)

# ⭐ ENDPOINTS HTTP ⭐
async def health_check(request):
    """Health check del servidor de video"""
    # ⭐ NUEVO: Incluir estadísticas de viewers por broadcaster ⭐
    viewers_per_broadcaster = {
        device_id: len(viewers)
        for device_id, viewers in broadcaster_viewers.items()
    }
    
    return web.Response(
        text=json.dumps({
            "status": "healthy",
            "service": "webrtc_server",
            "active_broadcasters": len(active_broadcasters),
            "active_viewers": len(active_viewers),
            "broadcaster_devices": list(active_broadcasters.keys()),
            "viewers_per_broadcaster": viewers_per_broadcaster
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

# 🔧 FUNCIÓN ACTUALIZADA CON SOPORTE SSL/WSS
async def start_webrtc_server(host='0.0.0.0', port=8081):
    """Iniciar servidor WebRTC con soporte SSL/TLS opcional"""
    
    # Registrar rutas HTTP
    app.router.add_get('/health', health_check)
    app.router.add_get('/api/devices', get_active_devices)
    
    logger.info(f"🎥 Iniciando servidor WebRTC en {host}:{port}")
    logger.info(f"📡 Servidores configurados para retransmisión: {len(OTHER_SERVERS)}")
    
    # 🔒 Configurar SSL si hay certificados disponibles
    ssl_context = None
    ssl_cert = os.getenv('SSL_CERT')
    ssl_key = os.getenv('SSL_KEY')
    
    if ssl_cert and ssl_key:
        try:
            ssl_context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
            ssl_context.load_cert_chain(ssl_cert, ssl_key)
            logger.info(f"🔒 SSL habilitado - Certificado: {ssl_cert}")
        except Exception as e:
            logger.error(f"❌ Error cargando certificados SSL: {e}")
            logger.warning(f"⚠️ Continuando sin SSL...")
            ssl_context = None
    else:
        logger.info(f"ℹ️ SSL no configurado - usando conexión no segura")
        logger.info(f"ℹ️ Para habilitar SSL, configura SSL_CERT y SSL_KEY en variables de entorno")
    
    runner = web.AppRunner(app)
    await runner.setup()
    
    # Crear sitio con o sin SSL
    site = web.TCPSite(runner, host, port, ssl_context=ssl_context)
    await site.start()
    
    # Mostrar URL correcta según SSL
    protocol = 'wss' if ssl_context else 'ws'
    http_protocol = 'https' if ssl_context else 'http'
    
    logger.info(f"✅ Servidor WebRTC iniciado: {protocol}://{host}:{port}")
    logger.info(f"📊 Health check: {http_protocol}://{host}:{port}/health")
    logger.info(f"📱 API devices: {http_protocol}://{host}:{port}/api/devices")
    
    if ssl_context:
        logger.info(f"🔒 Conexiones seguras WSS habilitadas")
    else:
        logger.warning(f"⚠️ Conexiones no seguras WS - Considera habilitar SSL para producción")
    
    return runner

if __name__ == '__main__':
    asyncio.run(start_webrtc_server())