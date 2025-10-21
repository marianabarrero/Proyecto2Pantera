import asyncio
import os
from datetime import datetime
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

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
async def get_latest_location(device_id: str = Query(None, description="ID del dispositivo (opcional)")):
    """Endpoint para obtener el último registro, opcionalmente filtrado por device_id"""
    try:
        result = await db.get_latest_location(device_id=device_id)
        if not result:
            raise HTTPException(status_code=404, detail="No hay datos disponibles")
        return LocationResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error obteniendo último registro: {e}")
        raise HTTPException(status_code=500, detail="Error interno del servidor")

@app.get("/api/location/latest-by-devices", response_model=list[LocationResponse])
async def get_latest_by_devices():
    """Endpoint para obtener la última ubicación de CADA dispositivo"""
    try:
        results = await db.get_latest_location_by_devices()
        if not results:
            raise HTTPException(status_code=404, detail="No hay datos disponibles")
        return [LocationResponse(**result) for result in results]
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error obteniendo últimas ubicaciones por dispositivo: {e}")
        raise HTTPException(status_code=500, detail="Error interno del servidor")

@app.get("/api/location/all", response_model=list[AllLocationsResponse])
async def get_all_locations(
    limit: int = Query(default=100, ge=1, le=1000),
    device_id: str = Query(None, description="ID del dispositivo (opcional)")
):
    """Endpoint para obtener todos los registros, opcionalmente filtrados por device_id"""
    try:
        results = await db.get_all_locations(limit, device_id=device_id)
        return [AllLocationsResponse(**result) for result in results]
    except Exception as e:
        print(f"Error obteniendo registros: {e}")
        raise HTTPException(status_code=500, detail="Error interno del servidor")

@app.get("/api/location/range", response_model=list[LocationResponse])
async def get_location_range(
    startDate: datetime = Query(..., description="Fecha de inicio en formato ISO 8601"),
    endDate: datetime = Query(..., description="Fecha de fin en formato ISO 8601"),
    device_id: str = Query(None, description="ID del dispositivo (opcional)")
):
    """Endpoint para obtener registros por rango de fechas, opcionalmente filtrados por device_id"""
    try:
        start_time = int(startDate.timestamp() * 1000)
        end_time = int(endDate.timestamp() * 1000)

        results = await db.get_locations_by_range(start_time, end_time, device_id=device_id)
        return [LocationResponse(**result) for result in results]

    except Exception as e:
        print(f"Error obteniendo registros por rango: {e}")
        raise HTTPException(
            status_code=500,
            detail="Error interno del servidor"
        )

@app.get("/api/devices", response_model=list[str])
async def get_devices():
    """Endpoint para obtener todos los device_id únicos"""
    try:
        devices = await db.get_all_device_ids()
        return devices
    except Exception as e:
        print(f"Error obteniendo dispositivos: {e}")
        raise HTTPException(status_code=500, detail="Error interno del servidor")

@app.get("/api/location/area-records", response_model=list[dict])
async def get_area_records(
    minLat: float = Query(..., description="Latitud mínima del área"),
    maxLat: float = Query(..., description="Latitud máxima del área"),
    minLng: float = Query(..., description="Longitud mínima del área"),
    maxLng: float = Query(..., description="Longitud máxima del área"),
    device_id: str = Query(..., description="ID del dispositivo")
):
    """Endpoint para obtener recorridos de un dispositivo dentro de un área rectangular"""
    try:
        results = await db.get_locations_in_area(minLat, maxLat, minLng, maxLng, device_id)
        
        if not results:
            return []
        
        # Separar en recorridos basados en diferencia de tiempo de 5 minutos
        journeys = []
        current_journey = []
        
        for i, point in enumerate(results):
            if i == 0:
                current_journey.append(point)
            else:
                prev_time = results[i-1]['timestamp_value']
                curr_time = point['timestamp_value']
                time_diff = curr_time - prev_time
                
                # Si la diferencia es mayor a 5 minutos (300000 ms), es un nuevo recorrido
                if time_diff > 300000:
                    if current_journey:
                        journeys.append(current_journey)
                    current_journey = [point]
                else:
                    current_journey.append(point)
        
        # Agregar el último recorrido
        if current_journey:
            journeys.append(current_journey)
        
        # Formatear respuesta
        formatted_journeys = []
        for idx, journey in enumerate(journeys):
            formatted_journeys.append({
                'journey_id': idx,
                'points': journey,
                'start_time': journey[0]['timestamp_value'],
                'end_time': journey[-1]['timestamp_value']
            })
        
        return formatted_journeys
    
    except Exception as e:
        print(f"Error obteniendo recorridos por área: {e}")
        raise HTTPException(status_code=500, detail="Error interno del servidor")

@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    """Endpoint de health check"""
    return HealthResponse(
        status="healthy",
        timestamp=datetime.now().isoformat()
    )

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv('HTTP_PORT', 3001))
    uvicorn.run(app, host="0.0.0.0", port=port)