from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class LocationData(BaseModel):
    """Modelo para datos de ubicación"""
    latitude: float
    longitude: float
    timestamp_value: int
    created_at: Optional[datetime] = None
    device_id: Optional[str] = None # Añadido

class LocationResponse(BaseModel):
    """Respuesta para ubicación"""
    latitude: float
    longitude: float
    timestamp_value: int
    created_at: datetime
    device_id: Optional[str] = None # Añadido

class AllLocationsResponse(BaseModel):
    """Respuesta para todas las ubicaciones"""
    id: int
    latitude: float
    longitude: float
    timestamp_value: int
    accuracy: Optional[float] = None
    altitude: Optional[float] = None
    speed: Optional[float] = None
    provider: Optional[str] = None
    created_at: datetime
    device_id: Optional[str] = None # Añadido

class HealthResponse(BaseModel):
    """Respuesta del health check"""
    status: str
    timestamp: str

class ErrorResponse(BaseModel):
    """Respuesta de error"""
    message: str
    
class InternalErrorResponse(BaseModel):
    """Respuesta de error interno"""
    error: str