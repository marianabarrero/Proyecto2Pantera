import asyncio
import os
from datetime import datetime
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
# Se elimina la importación de 'parser' porque ya no es necesaria

from database import db
from udp_server import start_udp_server, stop_udp_server
from models import (
    LocationResponse,
    AllLocationsResponse,
    HealthResponse,
    ErrorResponse,
    InternalErrorResponse
)

# Cargar variables de entorno
load_dotenv()

# Crear la aplicación FastAPI
app = FastAPI(
    title="Location Tracker API",
    description="UDP receiver and API for location tracking",
    version="1.0.0"
)

# Configurar CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Variables globales para el servidor UDP
udp_transport = None
udp_protocol = None

@app.on_event("startup")
async def startup_event():
    """Eventos al iniciar la aplicación"""
    global udp_transport, udp_protocol

    try:
        await db.init_connection_pool()
        await db.create_table()
        udp_transport, udp_protocol = await start_udp_server()
        print(f"HTTP API escuchando en puerto {os.getenv('HTTP_PORT', 3001)}")
    except Exception as e:
        print(f"Error iniciando servidor: {e}")
        raise

@app.on_event("shutdown")
async def shutdown_event():
    """Eventos al cerrar la aplicación"""
    global udp_transport
    if udp_transport:
        await stop_udp_server(udp_transport)
    await db.close_connection_pool()

@app.get("/api/location/latest", response_model=LocationResponse)
async def get_latest_location():
    """Endpoint para obtener el último registro"""
    try:
        result = await db.get_latest_location()
        if not result:
            raise HTTPException(status_code=404, detail="No hay datos disponibles")
        return LocationResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error obteniendo último registro: {e}")
        raise HTTPException(status_code=500, detail="Error interno del servidor")

@app.get("/api/location/all", response_model=list[AllLocationsResponse])
async def get_all_locations(limit: int = Query(default=100, ge=1, le=1000)):
    """Endpoint para obtener todos los registros """
    try:
        results = await db.get_all_locations(limit)
        return [AllLocationsResponse(**result) for result in results]
    except Exception as e:
        print(f"Error obteniendo registros: {e}")
        raise HTTPException(status_code=500, detail="Error interno del servidor")

# --- FUNCIÓN CORREGIDA Y SIMPLIFICADA ---
@app.get("/api/location/range", response_model=list[LocationResponse])
async def get_location_range(
    # Cambiamos 'str' por 'datetime'. FastAPI se encargará de la conversión.
    startDate: datetime = Query(..., description="Fecha de inicio en formato ISO 8601"),
    endDate: datetime = Query(..., description="Fecha de fin en formato ISO 8601")
):
    """Endpoint para obtener registros por rango de fechas"""
    try:
        # Ya no necesitamos un formato de texto a otro, las variables ya son objetos datetime.
        start_time = int(startDate.timestamp() * 1000)
        end_time = int(endDate.timestamp() * 1000)

        results = await db.get_locations_by_range(start_time, end_time)
        return [LocationResponse(**result) for result in results]

    except Exception as e:
        print(f"Error obteniendo registros por rango: {e}")
        raise HTTPException(
            status_code=500,
            detail="Error interno del servidor"
        )

@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    """Health check"""
    return HealthResponse(
        status="OK",
        timestamp=datetime.now().isoformat()
    )

if __name__ == "__main__":
    import uvicorn
    http_port = int(os.getenv('HTTP_PORT', 3001))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=http_port,
        reload=False,
        log_level="info"
    )