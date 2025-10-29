import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const VideoStream = ({ deviceId, serverUrl }) => {
  const videoRef = useRef(null);
  const [socket, setSocket] = useState(null);
  const [peerConnection, setPeerConnection] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Conectar a Socket.IO
    const newSocket = io(serverUrl, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    newSocket.on('connect', () => {
      console.log('✅ Conectado al servidor WebRTC');
      setIsConnected(true);
      setError(null);
      
      // Solicitar stream del dispositivo
      newSocket.emit('request_stream', { device_id: deviceId });
    });

    newSocket.on('disconnect', () => {
      console.log('❌ Desconectado del servidor WebRTC');
      setIsConnected(false);
    });

    newSocket.on('stream_available', async (data) => {
      console.log('🎥 Stream disponible:', data);
      if (data.device_id === deviceId) {
        await setupWebRTC(newSocket);
      }
    });

    newSocket.on('stream_unavailable', (data) => {
      console.log('❌ Stream no disponible:', data);
      setError(`El dispositivo ${deviceId} no está transmitiendo`);
    });

    newSocket.on('answer', async (data) => {
      if (peerConnection && data.device_id === deviceId) {
        try {
          await peerConnection.setRemoteDescription(
            new RTCSessionDescription(data.sdp)
          );
          console.log('✅ Respuesta WebRTC configurada');
        } catch (e) {
          console.error('❌ Error configurando respuesta:', e);
          setError('Error estableciendo conexión WebRTC');
        }
      }
    });

    newSocket.on('error', (data) => {
      console.error('❌ Error del servidor:', data);
      setError(data.message);
    });

    setSocket(newSocket);

    return () => {
      if (peerConnection) {
        peerConnection.close();
      }
      newSocket.close();
    };
  }, [deviceId, serverUrl]);

  const setupWebRTC = async (socket) => {
    try {
      // Crear conexión WebRTC
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });

      // Manejar tracks remotos (video del celular)
      pc.ontrack = (event) => {
        console.log('🎥 Track de video recibido');
        if (videoRef.current && event.streams[0]) {
          videoRef.current.srcObject = event.streams[0];
        }
      };

      // Manejar candidatos ICE
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('ice_candidate', {
            device_id: deviceId,
            candidate: event.candidate
          });
        }
      };

      // Manejar cambios de estado
      pc.onconnectionstatechange = () => {
        console.log('Estado de conexión:', pc.connectionState);
        if (pc.connectionState === 'connected') {
          setError(null);
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          setError('Conexión perdida');
        }
      };

      setPeerConnection(pc);

      // Crear oferta
      const offer = await pc.createOffer({
        offerToReceiveVideo: true,
        offerToReceiveAudio: false
      });

      await pc.setLocalDescription(offer);

      // Enviar oferta al servidor
      socket.emit('offer', {
        device_id: deviceId,
        sdp: {
          type: offer.type,
          sdp: offer.sdp
        }
      });

      console.log('✅ Oferta WebRTC enviada');

    } catch (e) {
      console.error('❌ Error configurando WebRTC:', e);
      setError('Error iniciando conexión de video');
    }
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
        <span style={{
          padding: '4px 12px',
          borderRadius: '12px',
          fontSize: '12px',
          backgroundColor: isConnected ? '#10b981' : '#ef4444'
        }}>
          {isConnected ? '● LIVE' : '● Disconnected'}
        </span>
      </div>
      
      {error && (
        <div style={{
          padding: '12px',
          backgroundColor: '#ef4444',
          color: '#fff',
          textAlign: 'center'
        }}>
          ⚠️ {error}
        </div>
      )}
      
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          width: '100%',
          height: 'auto',
          display: 'block',
          backgroundColor: '#000'
        }}
      />
    </div>
  );
};

export default VideoStream;