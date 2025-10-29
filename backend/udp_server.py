import asyncio
import socket
import json
import os
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv()

class UDPServer:
    def __init__(self, database):  # ✅ Recibe db como parámetro
        self.transport = None
        self.protocol = None
        self.port = int(os.getenv('UDP_PORT', 6001))
        self.db = database  # ✅ Guarda referencia al db
        
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
            
            # Insertar en la base de datos
            location_id = await self.db.insert_location(message)  # ✅ Usa self.db
            print(f"Datos insertados: {location_id}")
            
        except json.JSONDecodeError as e:
            print(f"Error parseando JSON: {e}")
        except Exception as e:
            print(f"Error procesando mensaje UDP: {e}")
            import traceback
            traceback.print_exc()  # ✅ Para ver el error completo
            
    def error_received(self, exc):
        print(f"Error en UDP Server: {exc}")

class UDPProtocol(asyncio.DatagramProtocol):
    def __init__(self, database):  # ✅ Recibe db como parámetro
        self.server = UDPServer(database)
        
    def connection_made(self, transport):
        self.server.connection_made(transport)
        
    def datagram_received(self, data, addr):
        self.server.datagram_received(data, addr)
        
    def error_received(self, exc):
        self.server.error_received(exc)

async def start_udp_server(database):  # ✅ Recibe db como parámetro
    """Inicia el servidor UDP"""
    loop = asyncio.get_running_loop()
    
    # Crear el servidor UDP
    transport, protocol = await loop.create_datagram_endpoint(
        lambda: UDPProtocol(database),  # ✅ Pasa db al crear el protocolo
        local_addr=('0.0.0.0', int(os.getenv('UDP_PORT', 6001)))
    )
    
    print(f"UDP Server escuchando en 0.0.0.0:{os.getenv('UDP_PORT', 6001)}")
    
    return transport, protocol

async def stop_udp_server(transport):
    """Detiene el servidor UDP"""
    if transport:
        transport.close()
        print("UDP Server detenido")