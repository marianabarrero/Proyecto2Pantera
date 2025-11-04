import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import PropTypes from 'prop-types';
import VideoStream from './VideoStream';

function MultiVideoGrid({ serverUrl }) {
    const [availableBroadcasters, setAvailableBroadcasters] = useState([]);
    const [socket, setSocket] = useState(null);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        if (!serverUrl) return;

        console.log('🌐 Conectando a servidor WebRTC para obtener broadcasters:', serverUrl);

        // Conectar socket
        const newSocket = io(serverUrl, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });

        setSocket(newSocket);

        // Listener de conexión
        newSocket.on('connect', () => {
            console.log('✅ Socket conectado para MultiVideoGrid');
            setIsConnected(true);
            
            // Registrarse como viewer para recibir lista de broadcasters
            const viewerId = `multiview_${Date.now()}`;
            newSocket.emit('register-viewer', { viewerId });
        });

        // Recibir lista de broadcasters disponibles
        newSocket.on('available-broadcasters', (devices) => {
            console.log('📡 Broadcasters disponibles:', devices);
            setAvailableBroadcasters(devices);
        });

        // Listener cuando un nuevo broadcaster se conecta
        newSocket.on('broadcaster-available', (data) => {
            console.log('📱 Nuevo broadcaster disponible:', data.deviceId);
            setAvailableBroadcasters(prev => {
                if (!prev.includes(data.deviceId)) {
                    return [...prev, data.deviceId];
                }
                return prev;
            });
        });

        // Listener cuando un broadcaster se desconecta
        newSocket.on('broadcaster-disconnected', (data) => {
            console.log('❌ Broadcaster desconectado:', data.deviceId);
            setAvailableBroadcasters(prev => 
                prev.filter(id => id !== data.deviceId)
            );
        });

        newSocket.on('disconnect', () => {
            console.log('⚠️ Socket desconectado de MultiVideoGrid');
            setIsConnected(false);
        });

        newSocket.on('connect_error', (err) => {
            console.error('❌ Error de conexión:', err.message);
            setIsConnected(false);
        });

        // Cleanup
        return () => {
            console.log('🧹 Limpiando MultiVideoGrid socket...');
            if (newSocket) {
                newSocket.disconnect();
            }
        };
    }, [serverUrl]);

    // Determinar el número de columnas según la cantidad de dispositivos
    const getGridColumns = (count) => {
        if (count === 1) return 'grid-cols-1';
        if (count === 2) return 'grid-cols-1 md:grid-cols-2';
        if (count === 3) return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
        if (count === 4) return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2';
        return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
    };

    if (!isConnected) {
        return (
            <div className="flex items-center justify-center p-8">
                <div className="text-white text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                    <p>Conectando al servidor de video...</p>
                </div>
            </div>
        );
    }

    if (availableBroadcasters.length === 0) {
        return (
            <div className="flex items-center justify-center p-8">
                <div className="text-white/60 text-center">
                    <p className="text-lg">📹 No hay dispositivos transmitiendo video en este momento</p>
                    <p className="text-sm mt-2">Esperando que los dispositivos inicien transmisión...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full h-full">
            <div className="mb-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-white font-bold text-lg">
                        📹 Transmisiones en Vivo ({availableBroadcasters.length})
                    </h3>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-white/80 text-sm">En Vivo</span>
                    </div>
                </div>
            </div>

            <div className={`grid ${getGridColumns(availableBroadcasters.length)} gap-4`}>
                {availableBroadcasters.map((deviceId) => (
                    <div 
                        key={deviceId}
                        className="bg-black/50 rounded-2xl overflow-hidden shadow-2xl"
                        style={{ 
                            minHeight: availableBroadcasters.length === 1 ? '500px' : '300px',
                            maxHeight: availableBroadcasters.length === 1 ? '600px' : '400px'
                        }}
                    >
                        <VideoStream
                            deviceId={deviceId}
                            serverUrl={serverUrl}
                        />
                    </div>
                ))}
            </div>

            {/* Info adicional */}
            <div className="mt-4 text-center text-white/60 text-sm">
                {availableBroadcasters.length === 1 ? (
                    <p>Mostrando 1 dispositivo en transmisión</p>
                ) : (
                    <p>Mostrando {availableBroadcasters.length} dispositivos en transmisión simultánea</p>
                )}
            </div>
        </div>
    );
}

MultiVideoGrid.propTypes = {
    serverUrl: PropTypes.string.isRequired,
};

export default MultiVideoGrid;