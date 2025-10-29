import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const VideoStream = ({ deviceId, serverUrl }) => {
  const canvasRef = useRef(null);
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const [frameCount, setFrameCount] = useState(0);
  const [fps, setFps] = useState(0);
  const lastFrameTimeRef = useRef(Date.now());
  const frameCounterRef = useRef(0);

  useEffect(() => {
    // Conectar a Socket.IO
    const newSocket = io(serverUrl, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    newSocket.on('connect', () => {
      console.log('✅ Conectado al servidor de video');
      setIsConnected(true);
      setError(null);
      
      // Solicitar frames del dispositivo
      newSocket.emit('request_stream', { device_id: deviceId });
    });

    newSocket.on('disconnect', () => {
      console.log('❌ Desconectado del servidor');
      setIsConnected(false);
    });

    newSocket.on('stream_available', (data) => {
      console.log('🎥 Stream disponible:', data);
      if (data.device_id === deviceId) {
        setError(null);
      }
    });

    newSocket.on('stream_unavailable', (data) => {
      console.log('❌ Stream no disponible:', data);
      if (data.device_id === deviceId) {
        setError(`El dispositivo ${deviceId} no está transmitiendo`);
      }
    });

    // ⭐ NUEVO: Escuchar frames de video de la app Android
    newSocket.on('video_frame_update', (data) => {
      if (data.device_id === deviceId && canvasRef.current) {
        drawFrameOnCanvas(data);
        setFrameCount(prev => prev + 1);
        
        // Calcular FPS
        frameCounterRef.current++;
        const now = Date.now();
        const elapsed = now - lastFrameTimeRef.current;
        if (elapsed >= 1000) {
          setFps(Math.round((frameCounterRef.current * 1000) / elapsed));
          frameCounterRef.current = 0;
          lastFrameTimeRef.current = now;
        }
      }
    });

    newSocket.on('stream_ended', (data) => {
      if (data.device_id === deviceId) {
        setError('Transmisión finalizada');
      }
    });

    newSocket.on('error', (data) => {
      console.error('❌ Error del servidor:', data);
      setError(data.message);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [deviceId, serverUrl]);

  const drawFrameOnCanvas = (frameData) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    // Establecer dimensiones del canvas
    if (canvas.width !== frameData.width || canvas.height !== frameData.height) {
      canvas.width = frameData.width || 640;
      canvas.height = frameData.height || 480;
    }

    // Por ahora dibujamos un placeholder (ya que los datos YUV necesitan conversión)
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Dibujar información del frame
    ctx.fillStyle = '#00ff00';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`📹 LIVE - Frame #${frameData.frame_number}`, canvas.width / 2, 40);
    
    ctx.font = '16px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`Device: ${deviceId}`, canvas.width / 2, 80);
    ctx.fillText(`Resolution: ${frameData.width}x${frameData.height}`, canvas.width / 2, 110);
    ctx.fillText(`Format: ${frameData.format}`, canvas.width / 2, 140);
    ctx.fillText(`Timestamp: ${new Date(frameData.timestamp).toLocaleTimeString()}`, canvas.width / 2, 170);
    
    // Dibujar borde verde para indicar que está recibiendo frames
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, canvas.width, canvas.height);
  };

  return (
    <div style={{ 
      width: '100%', 
      maxWidth: '800px', 
      margin: '0 auto',
      backgroundColor: '#000',
      borderRadius: '8px',
      overflow: 'hidden',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
    }}>
      <div style={{
        padding: '10px',
        backgroundColor: '#1a1a1a',
        color: '#fff',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span>📹 Device: {deviceId}</span>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span style={{
            padding: '4px 12px',
            borderRadius: '12px',
            fontSize: '12px',
            backgroundColor: '#666',
            color: '#fff'
          }}>
            {fps} FPS
          </span>
          <span style={{
            padding: '4px 12px',
            borderRadius: '12px',
            fontSize: '12px',
            backgroundColor: isConnected ? '#10b981' : '#ef4444'
          }}>
            {isConnected ? `● LIVE (${frameCount})` : '● Disconnected'}
          </span>
        </div>
      </div>
      
      {error && (
        <div style={{
          padding: '12px',
          backgroundColor: '#ef4444',
          color: '#fff',
          textAlign: 'center',
          fontWeight: 'bold'
        }}>
          ⚠️ {error}
        </div>
      )}
      
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: 'auto',
          display: 'block',
          backgroundColor: '#000'
        }}
      />
      
      <div style={{
        padding: '8px',
        backgroundColor: '#1a1a1a',
        color: '#888',
        fontSize: '12px',
        textAlign: 'center'
      }}>
        💡 Mostrando metadata de frames (conversión YUV pendiente)
      </div>
    </div>
  );
};

export default VideoStream;