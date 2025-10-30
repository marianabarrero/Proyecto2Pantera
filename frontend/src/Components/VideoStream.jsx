import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import PropTypes from 'prop-types';

function VideoStream({ deviceId, serverUrl }) {
    const videoRef = useRef(null);
    const pcRef = useRef(null); // PeerConnection
    const socketRef = useRef(null);
    const [status, setStatus] = useState('Conectando...');

    useEffect(() => {
        if (!deviceId || !serverUrl) return;

        // 1. Conectar al socket
        const socket = io(serverUrl, {
            query: { deviceId },
            transports: ['websocket'],
        });
        socketRef.current = socket;

        // Configuración de PeerConnection
        const pcConfig = {
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }], // Servidor STUN de Google
        };
        const pc = new RTCPeerConnection(pcConfig);
        pcRef.current = pc;

        // 2. Manejador para cuando se recibe un track de video
        pc.ontrack = (event) => {
            console.log('Track de video recibido', event.streams);
            if (videoRef.current && event.streams.length > 0) {
                videoRef.current.srcObject = event.streams[0];
                setStatus('Video en vivo');
            }
        };

        // 3. Manejador para candidatos ICE
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('Enviando candidato ICE');
                socket.emit('ice_candidate', {
                    candidate: event.candidate.candidate,
                    sdpMid: event.candidate.sdpMid,
                    sdpMLineIndex: event.candidate.sdpMLineIndex,
                });
            }
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
                setStatus('Conexión perdida');
            } else if (pc.connectionState === 'connected') {
                setStatus('Video en vivo');
            } else {
                setStatus(pc.connectionState);
            }
        };

        // 4. Listeners del Socket
        socket.on('connect', () => {
            console.log('Socket conectado. Solicitando stream...');
            setStatus('Solicitando stream...');
            // Iniciar la negociación WebRTC
            startWebRTC();
        });

        socket.on('answer', async (sdp) => {
            try {
                console.log('Respuesta SDP recibida');
                await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
            } catch (error) {
                console.error('Error al establecer RemoteDescription:', error);
            }
        });

        socket.on('ice_candidate', async (candidateData) => {
            try {
                console.log('Candidato ICE recibido');
                const candidate = new RTCIceCandidate({
                    candidate: candidateData.candidate,
                    sdpMid: candidateData.sdpMid,
                    sdpMLineIndex: candidateData.sdpMLineIndex,
                });
                await pc.addIceCandidate(candidate);
            } catch (error) {
                console.error('Error al añadir candidato ICE:', error);
            }
        });

        socket.on('disconnect', () => {
            setStatus('Desconectado');
            console.log('Socket desconectado');
        });

        socket.on('connect_error', (err) => {
            setStatus('Error de conexión');
            console.error('Error de conexión con Socket.IO:', err.message);
        });

        // 5. Función para iniciar WebRTC (crear oferta)
        const startWebRTC = async () => {
            try {
                // Necesitamos recibir video
                pc.addTransceiver('video', { direction: 'recvonly' });

                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);

                console.log('Enviando oferta SDP');
                socket.emit('offer', { sdp: offer.sdp, type: offer.type });
            } catch (error) {
                console.error('Error al crear la oferta WebRTC:', error);
            }
        };

        // 6. Cleanup
        return () => {
            console.log('Limpiando VideoStream...');
            if (pc) {
                pc.close();
            }
            if (socket) {
                socket.disconnect();
            }
        };
    }, [deviceId, serverUrl]);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', backgroundColor: '#000' }}>
            <video
                ref={videoRef}
                autoPlay
                playsInline
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
            <div style={{
                position: 'absolute',
                top: 10,
                left: 10,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                color: 'white',
                padding: '5px 10px',
                borderRadius: '5px',
                fontSize: '14px'
            }}>
                {status}
            </div>
        </div>
    );
}

VideoStream.propTypes = {
    deviceId: PropTypes.string.isRequired,
    serverUrl: PropTypes.string.isRequired,
};

export default VideoStream;