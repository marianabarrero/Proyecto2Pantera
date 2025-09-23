#!/usr/bin/env python3
"""
Script de inicio para el servidor de ubicaciones
Ejecutar con: python run.py
"""

import os
import uvicorn
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv()

def main():
    """Función principal para iniciar el servidor"""
    # Obtener configuración de las variables de entorno
    host = os.getenv('HOST', '0.0.0.0')
    http_port = int(os.getenv('HTTP_PORT', 3001))
    reload = os.getenv('ENVIRONMENT') == 'development'
    
    print("🚀 Iniciando Location Tracker Server...")
    print(f"📡 HTTP API: http://{host}:{http_port}")
    print(f"📡 UDP Server: {host}:{os.getenv('UDP_PORT', 6001)}")
    print(f"🗄️  Database: {os.getenv('DB_HOST')}:{os.getenv('DB_PORT', 5432)}")
    
    # Iniciar el servidor
    uvicorn.run(
        "main:app",
        host=host,
        port=http_port,
        reload=reload,
        log_level="info",
        access_log=True
    )

if __name__ == "__main__":
    main()