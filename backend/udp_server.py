import asyncio
import socket
import json
import os
from dotenv import load_dotenv
from database import db

# Cargar variables de entorno
load_dotenv()

class UDPServer:
    def __init__(self):
        self.transport = None
        self.protocol = None
        self.port = int(os.getenv('UDP_PORT', 6001))
        
    def connection_made(self, transport):
        self.transport = transport
        
    def datagram_received(self, data, addr):
        """Procesa los mensajes UDP recibidos"""
        asyncio.create_task(self.process_message(data, addr))
        
    async def process_message(self, data, addr):
        """Procesa el mensaje UDP de forma asíncrona"""
        print(f"UDP mensaje recibido de {addr[0]}:{addr[1]}")
        
        try:
            # Parsear el mensaje JSON
            message = json.loads(data.decode())
            # Imprime el contenido completo del JSON recibido
            print(f"Datos recibidos: {message}")
            # Insertar en la base de datos
            location_id = await db.insert_location(message)
            print(f"Datos insertados en la base de datos con ID: {location_id}")
            
        except json.JSONDecodeError as e:
            print(f"Error parseando JSON: {e}")
        except Exception as e:
            print(f"Error procesando mensaje UDP: {e}")
            
    def error_received(self, exc):
        print(f"Error en UDP Server: {exc}")

class UDPProtocol(asyncio.DatagramProtocol):
    def __init__(self):
        self.server = UDPServer()
        
    def connection_made(self, transport):
        self.server.connection_made(transport)
        
    def datagram_received(self, data, addr):
        self.server.datagram_received(data, addr)
        
    def error_received(self, exc):
        self.server.error_received(exc)

async def start_udp_server():
    """Inicia el servidor UDP"""
    loop = asyncio.get_running_loop()
    
    # Crear el servidor UDP
    transport, protocol = await loop.create_datagram_endpoint(
        lambda: UDPProtocol(),
        local_addr=('0.0.0.0', int(os.getenv('UDP_PORT', 6001)))
    )
    
    print(f"UDP Server escuchando en 0.0.0.0:{os.getenv('UDP_PORT', 6001)}")
    
    return transport, protocol

async def stop_udp_server(transport):
    """Detiene el servidor UDP"""
    if transport:
        transport.close()
        print("UDP Server detenido")