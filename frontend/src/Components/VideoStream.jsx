import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import PropTypes from 'prop-types';

function VideoStream({ deviceId, serverUrl }) {
    const videoRef = useRef(null);
    const pcRef = useRef(null);
    const socketRef = useRef(null);
    const broadcasterSocketIdRef = useRef(null);
    const [status, setStatus] = useState('Conectando...');

    useEffect(() => {
        if (!deviceId || !serverUrl) return;

        console.log('🎬 Iniciando VideoStream para dispositivo:', deviceId);

        // 1. Conectar socket
        const socket = io(serverUrl, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });
        socketRef.current = socket;

        // 2. Configuración de PeerConnection
        const pcConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
        const pc = new RTCPeerConnection(pcConfig);
        pcRef.current = pc;

        // 3. Manejador cuando se recibe track de video
        pc.ontrack = (event) => {
            console.log('🎥 Track de video recibido:', event.streams);
            if (videoRef.current && event.streams[0]) {
                videoRef.current.srcObject = event.streams[0];
                setStatus('Video en vivo 🔴');
                console.log('✅ Video asignado al elemento <video>');
            }
        };

        // 4. Manejador para candidatos ICE
        pc.onicecandidate = (event) => {
            if (event.candidate && broadcasterSocketIdRef.current) {
                console.log('🧊 Enviando ICE candidate al broadcaster');
                socket.emit('ice-candidate', {
                    target: broadcasterSocketIdRef.current,
                    candidate: {
                        sdpMid: event.candidate.sdpMid,
                        sdpMLineIndex: event.candidate.sdpMLineIndex,
                        candidate: event.candidate.candidate
                    }
                });
            }
        };

        // 5. Monitorear estado de conexión
        pc.onconnectionstatechange = () => {
            console.log('🔄 Connection state:', pc.connectionState);
            if (pc.connectionState === 'connected') {
                setStatus('Video en vivo 🔴');
            } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                setStatus('Conexión perdida ❌');
            } else {
                setStatus(`Conectando... (${pc.connectionState})`);
            }
        };

        pc.oniceconnectionstatechange = () => {
            console.log('❄️ ICE connection state:', pc.iceConnectionState);
        };

        // 6. Socket listeners
        socket.on('connect', () => {
            console.log('✅ Socket conectado');
            setStatus('Registrando viewer...');
            
            // Registrarse como viewer
            const viewerId = `viewer_${Date.now()}`;
            socket.emit('register-viewer', { viewerId });
        });

        socket.on('available-broadcasters', (devices) => {
            console.log('📡 Broadcasters disponibles:', devices);
            
            if (devices.includes(deviceId)) {
                console.log('✅ Dispositivo encontrado, solicitando stream...');
                setStatus('Solicitando stream...');
                socket.emit('request-stream', { deviceId });
            } else {
                console.warn('⚠️ Dispositivo no disponible:', deviceId);
                setStatus('Dispositivo no disponible');
            }
        });

        // ⭐ RECIBIR OFFER DEL ANDROID ⭐
        socket.on('offer', async (data) => {
            try {
                console.log('📨 OFFER recibido del broadcaster');
                console.log('Sender:', data.sender);
                
                // Guardar el socketId del broadcaster
                broadcasterSocketIdRef.current = data.sender;
                
                setStatus('Procesando offer...');
                
                // Establecer remote description
                await pc.setRemoteDescription(new RTCSessionDescription({
                    type: 'offer',
                    sdp: data.sdp.sdp
                }));
                console.log('✅ Remote description establecida');

                // Crear ANSWER
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                console.log('✅ Local description establecida');

                // Enviar ANSWER al broadcaster
                console.log('📤 Enviando ANSWER al broadcaster');
                socket.emit('answer', {
                    target: data.sender,
                    sdp: {
                        type: answer.type,
                        sdp: answer.sdp
                    }
                });
                
                setStatus('Esperando video...');
                
            } catch (error) {
                console.error('❌ Error manejando offer:', error);
                setStatus('Error en negociación');
            }
        });

        // ⭐ RECIBIR ICE CANDIDATES DEL ANDROID ⭐
        socket.on('ice-candidate', async (data) => {
            try {
                console.log('🧊 ICE candidate recibido del broadcaster');
                
                const candidate = new RTCIceCandidate({
                    sdpMid: data.candidate.sdpMid,
                    sdpMLineIndex: data.candidate.sdpMLineIndex,
                    candidate: data.candidate.candidate
                });
                
                await pc.addIceCandidate(candidate);
                console.log('✅ ICE candidate añadido');
                
            } catch (error) {
                console.error('❌ Error añadiendo ICE candidate:', error);
            }
        });

        socket.on('broadcaster-disconnected', (data) => {
            if (data.deviceId === deviceId) {
                console.log('❌ Broadcaster desconectado');
                setStatus('Dispositivo desconectado');
            }
        });

        socket.on('disconnect', () => {
            console.log('❌ Socket desconectado');
            setStatus('Desconectado del servidor');
        });

        socket.on('connect_error', (err) => {
            console.error('❌ Error de conexión:', err.message);
            setStatus('Error de conexión');
        });

        socket.on('error', (err) => {
            console.error('❌ Error:', err.message);
            setStatus(`Error: ${err.message}`);
        });

        // 7. Cleanup
        return () => {
            console.log('🧹 Limpiando VideoStream...');
            if (pc) {
                pc.close();
            }
            if (socket) {
                socket.disconnect();
            }
        };
    }, [deviceId, serverUrl]);

    return (
        <div style={{ 
            position: 'relative', 
            width: '100%', 
            height: '100%', 
            backgroundColor: '#000',
            borderRadius: '16px',
            overflow: 'hidden'
        }}>
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{ 
                    width: '100%', 
                    height: '100%', 
                    objectFit: 'contain' 
                }}
            />
            <div style={{
                position: 'absolute',
                top: 10,
                left: 10,
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                color: 'white',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 'bold'
            }}>
                {status}
            </div>
            
            {/* Indicador de dispositivo */}
            <div style={{
                position: 'absolute',
                bottom: 10,
                left: 10,
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                color: 'white',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '12px'
            }}>
                📱 {deviceId}
            </div>
        </div>
    );
}

VideoStream.propTypes = {
    deviceId: PropTypes.string.isRequired,
    serverUrl: PropTypes.string.isRequired,
};

export default VideoStream;