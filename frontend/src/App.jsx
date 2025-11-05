import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline, CircleMarker, Rectangle, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L, { Icon } from 'leaflet';
import { ThreeDot } from 'react-loading-indicators';
import VideoStream from './Components/VideoStream';
import MultiVideoGrid from './Components/MultiVideoGrid';


// --- MUI Date Picker Imports ---
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { DemoContainer } from '@mui/x-date-pickers/internals/demo';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import dayjs from 'dayjs';

import './App.css';

// --- Configuración Básicsa ---
const config = {
  API_BASE_URL: import.meta.env.VITE_API_URL || 'http://localhost:3001',
  APP_NAME: 'Pantera Tracker ',
  APP_SUBTITLE: '',
  APP_VERSION: '2.0.0',
  POLLING_INTERVAL: import.meta.env.VITE_POLLING_INTERVAL || 5000,
  DEVICE_TIMEOUT: 30000,
};

// Arreglo para el ícono por defecto de Leaflet en Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Paleta de colores para diferentes dispositivos
const DEVICE_COLORS = [
  '#110394',
  '#FF6B6B',
  '#4ECDC4',
  '#FFD93D',
  '#95E1D3',
  '#F38181',
  '#AA96DA',
  '#FCBAD3',
];

// Colores para diferentes recorridos
const JOURNEY_COLORS = [
  '#FF0000',
  '#00FF00',
  '#0000FF',
  '#FFFF00',
  '#FF00FF',
  '#00FFFF',
  '#FFA500',
  '#800080',
  '#008080',
  '#FFC0CB',
];

const getColorForDevice = (deviceId, allDevices) => {
  if (!deviceId) return DEVICE_COLORS[0];
  const index = allDevices.indexOf(deviceId);
  return DEVICE_COLORS[index % DEVICE_COLORS.length];
};


const isDeviceActive = (timestamp) => {
  const now = Date.now();
  const deviceTime = parseInt(timestamp);
  return (now - deviceTime) <= config.DEVICE_TIMEOUT;
};

// --- Componente para dibujar rectángulos CON BLOQUEO DEL MAPA ---
const RectangleDrawer = ({ onRectangleComplete }) => {
  const [startPoint, setStartPoint] = useState(null);
  const [currentPoint, setCurrentPoint] = useState(null);
  const map = useMap();

  useEffect(() => {
    // Cuando se inicia el dibujo, deshabilitar el arrastre del mapa
    if (startPoint) {
      map.dragging.disable();
      map.doubleClickZoom.disable();
      map.scrollWheelZoom.disable();
      map.boxZoom.disable();
      map.keyboard.disable();

      // Cambiar cursor
      map.getContainer().style.cursor = 'crosshair';
    } else {
      // Cuando termina el dibujo, habilitar de nuevo
      map.dragging.enable();
      map.doubleClickZoom.enable();
      map.scrollWheelZoom.enable();
      map.boxZoom.enable();
      map.keyboard.enable();

      // Restaurar cursor
      map.getContainer().style.cursor = '';
    }

    return () => {
      // Cleanup: asegurarse de que el mapa quede habilitado
      map.dragging.enable();
      map.doubleClickZoom.enable();
      map.scrollWheelZoom.enable();
      map.boxZoom.enable();
      map.keyboard.enable();
      map.getContainer().style.cursor = '';
    };
  }, [startPoint, map]);

  useMapEvents({
    click(e) {
      if (!startPoint) {
        setStartPoint(e.latlng);
      } else {
        const bounds = L.latLngBounds(startPoint, e.latlng);
        onRectangleComplete({
          minLat: bounds.getSouth(),
          maxLat: bounds.getNorth(),
          minLng: bounds.getWest(),
          maxLng: bounds.getEast()
        });
        setStartPoint(null);
        setCurrentPoint(null);
      }
    },
    mousemove(e) {
      if (startPoint) {
        setCurrentPoint(e.latlng);
      }
    },
    // Permitir cancelar con clic derecho o tecla ESC
    contextmenu(e) {
      e.originalEvent.preventDefault();
      setStartPoint(null);
      setCurrentPoint(null);
    }
  });

  // Escuchar tecla ESC para cancelar
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && startPoint) {
        setStartPoint(null);
        setCurrentPoint(null);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [startPoint]);

  if (startPoint && currentPoint) {
    const bounds = L.latLngBounds(startPoint, currentPoint);
    return (
      <Rectangle
        bounds={bounds}
        pathOptions={{
          color: '#3388ff',
          weight: 2,
          fillOpacity: 0.2,
          dashArray: '5, 5'
        }}
      />
    );
  }

  return null;
};

// --- Componentes de UI ---
const LoadingSpinner = () => (
  <div className="flex items-center mx-auto justify-center p-8">
    <ThreeDot color="#FFFFFF" size="medium" text="" textColor="" />
  </div>
);

const ErrorMessage = ({ error, onRetry }) => (
  <div className="glassmorphism-strong mt-40 md:-mt-60 rounded-4xl min-w-[90%] mx-auto p-8 text-center">
    <div className="text-red-400 mb-4">
      <h3 className="text-xl font-bold">Atención</h3>
    </div>
    <p className="text-white/70 mb-4">{error}</p>
    <button onClick={onRetry} className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors">
      Reintentar
    </button>
  </div>
);


// --- Modal de Selección de Dispositivo (Múltiples dispositivos) ---
const DeviceSelectionModal = ({ isOpen, onClose, onSelectDevice, devices }) => {
  const [selectedDevices, setSelectedDevices] = useState([]);

  if (!isOpen) return null;

  const handleToggleDevice = (deviceId) => {
    setSelectedDevices(prev => {
      if (prev.includes(deviceId)) {
        return prev.filter(id => id !== deviceId);
      } else {
        return [...prev, deviceId];
      }
    });
  };

  const handleSelectAll = () => {
    if (selectedDevices.length === devices.length) {
      setSelectedDevices([]);
    } else {
      setSelectedDevices(devices.map(d => d.device_id));
    }
  };

  const handleConfirm = () => {
    if (selectedDevices.length > 0) {
      onSelectDevice(selectedDevices);
      setSelectedDevices([]);
      onClose();
    }
  };

  const handleClose = () => {
    setSelectedDevices([]);
    onClose();
  };

  const allSelected = selectedDevices.length === devices.length && devices.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative glassmorphism-strong rounded-4xl p-8 mx-4 w-full max-w-md transform">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">Select Devices</h2>
          <button onClick={handleClose} className="text-white/60 cursor-pointer hover:text-white p-1 text-2xl">
            ✕
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-white mb-2">Choose devices to view area search records:</label>

          <button
            onClick={handleSelectAll}
            className={`w-full mb-3 px-4 py-3 rounded-xl font-semibold transition-all ${allSelected
                ? 'bg-sky-600 hover:bg-sky-700 text-white'
                : 'bg-white/10 hover:bg-white/20 text-white border border-white/20'
              }`}
          >
            {allSelected ? '✓ All Devices Selected' : 'Select All Devices'}
          </button>

          <div className="max-h-60 overflow-y-auto bg-white/10 border border-white/20 rounded-xl p-2">
            <div className="space-y-1">
              {devices.map((device) => (
                <label
                  key={device.device_id}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-all hover:bg-white/20 ${selectedDevices.includes(device.device_id) ? 'bg-sky-600/50 border-2 border-sky-400' : 'bg-white/5'
                    }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedDevices.includes(device.device_id)}
                    onChange={() => handleToggleDevice(device.device_id)}
                    className="w-4 h-4 text-sky-600 rounded focus:ring-2 focus:ring-sky-500"
                  />
                  <span className="text-white font-mono text-sm">{device.device_id}</span>
                </label>
              ))}
            </div>
          </div>

          {selectedDevices.length > 0 && (
            <p className="text-sky-400 text-sm mt-2">
              {selectedDevices.length} device{selectedDevices.length > 1 ? 's' : ''} selected
            </p>
          )}
        </div>

        <div className="flex gap-4">
          <button
            onClick={handleClose}
            className="flex-1 px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={selectedDevices.length === 0}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-sky-600 to-sky-700 hover:from-sky-700 hover:to-sky-800 text-white rounded-xl transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Modal de Búsqueda por Fecha ---
const DateSearchModal = ({ isOpen, onClose, onSearch, devices }) => {
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [selectedDevice, setSelectedDevice] = useState('all');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const darkTheme = createTheme({
    palette: {
      mode: 'dark',
      primary: {
        main: '#0ea5e9',
      },
      background: {
        default: '#1e293b',
        paper: '#334155',
      },
    },
    components: {
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: 'rgba(255, 255, 255, 0.3)',
            },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: 'rgba(14, 165, 233, 0.5)',
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: '#0ea5e9',
            },
          },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: {
            color: 'rgba(255, 255, 255, 0.7)',
          },
        },
      },
    },
  });

  useEffect(() => {
    if (!isOpen) {
      resetForm();
    }
  }, [isOpen]);

  const resetForm = () => {
    setStartDate(null);
    setEndDate(null);
    setSelectedDevice('all');
    setError('');
  };

  const handleSearch = async () => {
    if (!startDate || !endDate) {
      setError('Por favor, selecciona ambas fechas.');
      return;
    }

    if (endDate.isBefore(startDate)) {
      setError('La fecha de fin debe ser posterior a la fecha de inicio.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await onSearch({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        deviceId: selectedDevice === 'all' ? null : selectedDevice
      });
      onClose();
    } catch (err) {
      setError('Error al realizar la búsqueda. Inténtalo de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glassmorphism-strong rounded-4xl p-8 mx-4 w-full max-w-5xl transform">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">Select Date Range</h2>
          <button onClick={onClose} className="text-white/60 cursor-pointer hover:text-white p-1 text-2xl">
            ✕
          </button>
        </div>

        <ThemeProvider theme={darkTheme}>
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <DemoContainer components={['DateTimePicker', 'DateTimePicker']}>
              <DateTimePicker
                label="Start Date"
                value={startDate}
                onChange={(newValue) => setStartDate(newValue)}
                maxDate={dayjs()}
              />
              <DateTimePicker
                label="End Date"
                value={endDate}
                onChange={(newValue) => setEndDate(newValue)}
                minDate={startDate}
                disabled={!startDate}
              />
            </DemoContainer>
          </LocalizationProvider>
        </ThemeProvider>

        {devices.length > 0 && (
          <div className="mt-6">
            <label className="block text-white mb-2">Filter by Device:</label>
            <div className="max-h-60 overflow-y-auto bg-white/10 border border-white/20 rounded-xl p-2">
              <div className="space-y-1">
                <label
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-all hover:bg-white/20 ${selectedDevice === 'all' ? 'bg-sky-600/50 border-2 border-sky-400' : 'bg-white/5'
                    }`}
                >
                  <input
                    type="radio"
                    name="device-filter"
                    value="all"
                    checked={selectedDevice === 'all'}
                    onChange={(e) => setSelectedDevice(e.target.value)}
                    className="w-4 h-4 text-sky-600 focus:ring-2 focus:ring-sky-500"
                  />
                  <span className="text-white font-mono text-sm">All Devices</span>
                </label>
                {devices.map((device) => (
                  <label
                    key={device.device_id}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-all hover:bg-white/20 ${selectedDevice === device.device_id ? 'bg-sky-600/50 border-2 border-sky-400' : 'bg-white/5'
                      }`}
                  >
                    <input
                      type="radio"
                      name="device-filter"
                      value={device.device_id}
                      checked={selectedDevice === device.device_id}
                      onChange={(e) => setSelectedDevice(e.target.value)}
                      className="w-4 h-4 text-sky-600 focus:ring-2 focus:ring-sky-500"
                    />
                    <span className="text-white font-mono text-sm">{device.device_id}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 text-center text-red-400 bg-red-900/50 p-3 rounded-xl">
            {error}
          </div>
        )}

        <div className="flex gap-4 pt-6 mt-4 border-t border-white/20">
          <button
            onClick={resetForm}
            className="flex-1 px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all font-medium"
            disabled={isLoading}
          >
            Clean
          </button>
          <button
            onClick={handleSearch}
            disabled={isLoading || !startDate || !endDate}
            className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-sky-600 to-sky-700 hover:from-sky-700 hover:to-sky-800 text-white rounded-xl transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </div>
    </div>
  );
};
// --- Modal para Guardar Geocerca ---
const SaveGeofenceModal = ({ isOpen, onClose, onSave, area, devices, journeys }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setName('');
      setDescription('');
      setError('');
    }
  }, [isOpen]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Please enter a name for the geofence');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        area,
        devices,
        journeys
      });
      onClose();
    } catch (err) {
      setError('Error saving geofence. Please try again.');
      console.error('Error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glassmorphism-strong rounded-4xl p-8 mx-4 w-full max-w-md transform">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">💾 Save Geofence</h2>
          <button onClick={onClose} className="text-white/60 cursor-pointer hover:text-white p-1 text-2xl">
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-white mb-2 font-medium">Geofence Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Downtown Area, Route 1"
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/50 transition-all"
              maxLength={100}
            />
          </div>

          <div>
            <label className="block text-white mb-2 font-medium">Description (Optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add notes about this geofence..."
              rows={3}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/50 transition-all resize-none"
              maxLength={500}
            />
          </div>

          <div className="bg-sky-500/10 border border-sky-500/30 rounded-xl p-4">
            <h3 className="text-white font-semibold mb-2">Summary:</h3>
            <div className="text-white/70 text-sm space-y-1">
              <p>📍 Devices: {devices?.length || 0}</p>
              <p>🛣️ Journeys: {journeys?.length || 0}</p>
              {area && (
                <p className="text-xs mt-2 text-white/50">
                  Area: {area.minLat.toFixed(4)}, {area.minLng.toFixed(4)} → {area.maxLat.toFixed(4)}, {area.maxLng.toFixed(4)}
                </p>
              )}
            </div>
          </div>

          {error && (
            <div className="text-center text-red-400 bg-red-900/50 p-3 rounded-xl text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-4 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all font-medium"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading || !name.trim()}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-xl transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Saving...' : '💾 Save Geofence'}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Modal para Ver Geocercas Guardadas ---
//--- Modal para Ver Geocercas Guardadas ---
const GeofencesListModal = ({ isOpen, onClose, onLoadGeofence, onDeleteGeofence }) => {
  const [geofences, setGeofences] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchGeofences();
    }
  }, [isOpen]);

  const fetchGeofences = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/geofences?created_by=julicarolinav`);
      if (response.ok) {
        const data = await response.json();
        setGeofences(data);
      } else {
        throw new Error('Failed to fetch geofences');
      }
    } catch (err) {
      setError('Error loading geofences');
      console.error('Error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoad = async (geofenceId) => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/geofences/${geofenceId}`);
      if (response.ok) {
        const data = await response.json();
        onLoadGeofence(data);
        onClose();
      }
    } catch (err) {
      console.error('Error loading geofence:', err);
    }
  };

  const handleDelete = async (geofenceId) => {
    if (window.confirm('Are you sure you want to delete this geofence?')) {
      try {
        const response = await fetch(`${config.API_BASE_URL}/api/geofences/${geofenceId}`, {
          method: 'DELETE'
        });
        if (response.ok) {
          fetchGeofences();
          if (onDeleteGeofence) onDeleteGeofence(geofenceId);
        }
      } catch (err) {
        console.error('Error deleting geofence:', err);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glassmorphism-strong rounded-4xl p-8 mx-4 w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col transform">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">📁 Saved Geofences</h2>
          <button onClick={onClose} className="text-white/60 cursor-pointer hover:text-white p-1 text-2xl">
            ✕
          </button>
        </div>

        {isLoading ? (
          <LoadingSpinner />
        ) : error ? (
          <div className="text-center text-red-400 p-8">{error}</div>
        ) : geofences.length === 0 ? (
          <div className="text-center text-white/60 py-12">
            <p className="text-lg mb-2">📭 No saved geofences yet</p>
            <p className="text-sm">Create a geofence in Area Search mode to save it</p>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 space-y-3">
            {geofences.map((geofence) => (
              <div
                key={geofence.id}
                className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-4 transition-all"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="text-white font-bold text-lg mb-1">{geofence.name}</h3>
                    {geofence.description && (
                      <p className="text-white/60 text-sm mb-2">{geofence.description}</p>
                    )}
                    <div className="flex flex-wrap gap-3 text-xs text-white/50">
                      <span>📍 {geofence.device_ids?.length || 0} devices</span>
                      <span>🛣️ {geofence.journey_count || 0} journeys</span>
                      <span>📅 {new Date(geofence.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => handleLoad(geofence.id)}
                      className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-all text-sm font-medium"
                    >
                      📂 Load
                    </button>
                    <button
                      onClick={() => handleDelete(geofence.id)}
                      className="px-4 py-2 bg-red-600/80 hover:bg-red-700 text-white rounded-lg transition-all text-sm font-medium"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-white/10">
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Lista de Dispositivos ---
// --- Lista de Dispositivos ---
// --- Lista de Dispositivos ---
const DevicesList = ({ allDevices, activeDeviceIds, onOpenDateSearch, onOpenTravelRecord, onDeviceClick, isLiveMode, onOpenGeofencesList }) => {
  return (
    <div className='flex flex-col p-8 rounded-4xl glassmorphism-strong'>
      <div className='rounded-4xl h-auto'>
        <h2 className='text-2xl font-bold text-white text-center rounded-4xl mb-8'>
          Devices
        </h2>

        {allDevices.length === 0 ? (
          <div className="text-center text-white/60 py-8">
            <p>No devices registered yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {allDevices.map((device, index) => {
              const isActive = activeDeviceIds.includes(device.device_id);
              const isClickable = !isLiveMode && isActive;
              const deviceColor = getColorForDevice(device.device_id, activeDeviceIds);

              return (
                <div
                  key={device.device_id}
                  onClick={() => isClickable ? onDeviceClick(device.device_id) : null}
                  className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${isClickable ? 'cursor-pointer hover:scale-105 hover:shadow-lg' : ''
                    }`}
                  style={{
                    background: isClickable
                      ? `linear-gradient(135deg, ${deviceColor}15, ${deviceColor}25)`
                      : 'rgba(255, 255, 255, 0.05)',
                    border: isClickable
                      ? `2px solid ${deviceColor}60`
                      : '1px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: isClickable
                      ? `0 0 15px ${deviceColor}40`
                      : 'none'
                  }}
                  title={isClickable ? 'Click to zoom to device path' : ''}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-4 h-4 rounded-full shadow-lg`}
                      style={{
                        backgroundColor: isActive ? deviceColor : '#ef4444',
                        boxShadow: isActive
                          ? `0 0 15px ${deviceColor}80, 0 0 25px ${deviceColor}40`
                          : '0 0 10px rgba(239, 68, 68, 0.6)'
                      }}
                    />
                    <span className="text-white font-mono text-sm font-medium">
                      {device.device_id}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {isActive && !isLiveMode && (
                      <div
                        className="w-6 h-1 rounded-full"
                        style={{
                          backgroundColor: deviceColor,
                          boxShadow: `0 0 8px ${deviceColor}`
                        }}
                      />
                    )}
                    <span
                      className={`text-xs px-2 py-1 rounded-full font-medium ${isActive
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-red-500/20 text-red-400'
                        }`}
                    >
                      {isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <button
        onClick={onOpenTravelRecord}
        className='button-hover inline-flex items-center justify-center gap-2 font-semibold rounded-full transition-all duration-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-transparent mt-6'
      >
        <span className='text-white group-hover:text-white/90 duration-300'>Area Search</span>
      </button>

      <button
        onClick={onOpenDateSearch}
        className='button-hover inline-flex items-center justify-center gap-2 font-semibold rounded-full transition-all duration-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-transparent mt-6'
      >
        <span className='text-white group-hover:text-white/90 duration-300'>Search by Date</span>
      </button>

      <button
        onClick={onOpenGeofencesList}
        className='button-hover inline-flex items-center justify-center gap-2 font-semibold rounded-full transition-all duration-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-transparent mt-6'
      >
        <span className='text-white group-hover:text-white/90 duration-300'>📁 Saved Geofences</span>
      </button>
    </div>
  );
};

// --- Map Updater ---
// --- Map Updater ---
const MapUpdater = ({ bounds, hasUserInteracted }) => {
  const map = useMap();

  useEffect(() => {
    if (bounds && bounds.length > 0 && !hasUserInteracted) {
      if (bounds.length > 1) {
        try {
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
        } catch (e) {
          console.error('Error ajustando bounds:', e);
        }
      } else {
        map.flyTo(bounds[0], 18, {
          duration: 1.5,
          easeLinearity: 0.25
        });
      }
    }
  }, [bounds, map, hasUserInteracted]);

  return null;
};

// --- Device Zoom Handler ---
// --- Device Zoom Handler ---
const DeviceZoomHandler = ({ deviceId, paths }) => {
  const map = useMap();

  useEffect(() => {
    if (deviceId && paths[deviceId] && paths[deviceId].length > 0) {
      const devicePath = paths[deviceId];

      // Pequeño delay para asegurar que el mapa esté listo
      setTimeout(() => {
        if (devicePath.length === 1) {
          // Si solo hay un punto, hacer zoom a ese punto
          map.flyTo(devicePath[0], 15, {
            duration: 1.5,
            easeLinearity: 0.25
          });
        } else {
          // Si hay múltiples puntos, ajustar el mapa para mostrar todo el recorrido
          try {
            const bounds = L.latLngBounds(devicePath);
            map.fitBounds(bounds, {
              padding: [50, 50],
              maxZoom: 16,
              animate: true,
              duration: 1.5
            });
          } catch (e) {
            console.error('Error al hacer zoom al dispositivo:', e);
          }
        }
      }, 100);
    }
  }, [deviceId, paths, map]);

  return null;
};

// --- Componente del Mapa ---
const LocationMap = ({
  locations,
  formatTimestamp,
  paths,
  allDevices,
  travelRecordMode,
  onAreaDrawn,
  journeys,
  travelRecordDevice,
  selectedDeviceForZoom,
  onSaveGeofence,
  isDrawingAllowed
}) => {
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [selectedJourneyIndex, setSelectedJourneyIndex] = useState(null);
  // Desactivar MapUpdater cuando se selecciona un dispositivo
  useEffect(() => {
    if (selectedDeviceForZoom) {
      setHasUserInteracted(true);
    }
  }, [selectedDeviceForZoom]);

  const centerLocation = locations.length > 0
    ? locations[0]
    : { latitude: 11.01315, longitude: -74.82767 };
  const position = [parseFloat(centerLocation.latitude), parseFloat(centerLocation.longitude)];

  const allPathPoints = Object.values(paths).flat();
  const currentLocationPoints = locations.map(loc => [parseFloat(loc.latitude), parseFloat(loc.longitude)]);

  let journeyPoints = [];
  if (journeys.length > 0) {
    journeys.forEach(journey => {
      journey.points.forEach(point => {
        journeyPoints.push([parseFloat(point.latitude), parseFloat(point.longitude)]);
      });
    });
  }

  const allPoints = [...allPathPoints, ...currentLocationPoints, ...journeyPoints];
  const bounds = allPoints.length > 0 ? allPoints : [position];

  const InteractionDetector = () => {
    const map = useMap();

    useEffect(() => {
      const handleInteraction = () => {
        setHasUserInteracted(true);
      };

      map.on('zoomstart', handleInteraction);
      map.on('dragstart', handleInteraction);

      return () => {
        map.off('zoomstart', handleInteraction);
        map.off('dragstart', handleInteraction);
      };
    }, [map]);

    return null;
  };
  const JourneyZoomController = ({ journeyIndex }) => {
    const map = useMap();

    useEffect(() => {
      if (journeyIndex !== null && journeys[journeyIndex]) {
        const journey = journeys[journeyIndex];
        const journeyBounds = journey.points.map(p => [parseFloat(p.latitude), parseFloat(p.longitude)]);

        if (journeyBounds.length > 0) {
          try {
            map.fitBounds(journeyBounds, {
              padding: [50, 50],
              maxZoom: 16,
              duration: 1
            });
          } catch (e) {
            console.error('Error al hacer zoom al journey:', e);
          }
        }
      }
    }, [journeyIndex, map]);

    return null;
  };

  return (
    <div className='glassmorphism-strong rounded-4xl backdrop-blur-lg shadow-lg p-4 w-full mx-4'>
      {travelRecordMode && (
        <div className="mb-2 p-3 bg-sky-500/20 border border-sky-500/50 rounded-xl">
          <p className="text-white text-sm text-center">
            📍 <strong>Click on the map to set the first corner.</strong>
            <br />
            Move the mouse and <strong>click a second time</strong> to complete the area.
            <span className="text-xs text-white/70">Press ESC or right-click to cancel.</span>
          </p>
        </div>
      )}

      <MapContainer
        center={position}
        zoom={18}
        style={{ height: '45rem', width: '100%', borderRadius: '1rem' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

        {travelRecordMode && isDrawingAllowed && <RectangleDrawer onRectangleComplete={onAreaDrawn} />}
        {selectedDeviceForZoom && <DeviceZoomHandler deviceId={selectedDeviceForZoom} paths={paths} />}



        {journeys.length > 0 && journeys.map((journey, index) => (
          <Polyline
            key={`journey-${index}`}
            pathOptions={{
              color: JOURNEY_COLORS[index % JOURNEY_COLORS.length],
              weight: 5,
              opacity: 0.8
            }}
            positions={journey.points.map(p => [parseFloat(p.latitude), parseFloat(p.longitude)])}
          />
        ))}

        {!travelRecordMode && locations.map((location, index) => {
          // Saltar ubicaciones sin device_id válido
          if (!location.device_id || location.device_id === 'Device' || location.device_id === 'unknown') {
            return null;
          }

          const markerPosition = [parseFloat(location.latitude), parseFloat(location.longitude)];
          const activeDeviceIds = locations.map(loc => loc.device_id);
          const deviceColor = getColorForDevice(location.device_id, activeDeviceIds);

          return (
            <CircleMarker
              key={location.device_id}
              center={markerPosition}
              radius={12}
              pathOptions={{
                fillColor: deviceColor,
                fillOpacity: 0.9,
                color: deviceColor,
                weight: 3,
                opacity: 1
              }}
            >
              <Popup>
                <div className="text-center">
                  <strong>{location.device_id || 'Device'}</strong><br />
                  <small>Updated: {formatTimestamp(location.timestamp_value)}</small><br />
                  <small>Lat: {parseFloat(location.latitude).toFixed(6)}</small><br />
                  <small>Lng: {parseFloat(location.longitude).toFixed(6)}</small>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

        {!travelRecordMode && Object.entries(paths).map(([deviceId, devicePath]) => {
          // Saltar rutas sin device_id válido
          if (devicePath.length === 0 || !deviceId || deviceId === 'Device' || deviceId === 'unknown') {
            return null;
          }
          const activeDeviceIds = locations.map(loc => loc.device_id);
          return (
            <Polyline
              key={deviceId}
              pathOptions={{
                color: getColorForDevice(deviceId, activeDeviceIds),
                weight: 4
              }}
              positions={devicePath}
            />
          );
        })}

        {!selectedDeviceForZoom && <MapUpdater bounds={bounds} hasUserInteracted={hasUserInteracted} />}
        <InteractionDetector />
        <JourneyZoomController journeyIndex={selectedJourneyIndex} />
      </MapContainer>

      {!travelRecordMode && locations.length > 1 && (
        <div className="mt-4 p-4 bg-white/10 rounded-xl">
          <h3 className="text-white font-bold mb-2">Active Devices:</h3>
          <div className="flex flex-wrap gap-2">
            {locations.filter(loc => loc.device_id && loc.device_id !== 'Device' && loc.device_id !== 'unknown').map((location) => (
              <div key={location.device_id} className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: getColorForDevice(location.device_id, locations.map(loc => loc.device_id)) }}
                />
                <span className="text-white text-sm">{location.device_id}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {journeys.length > 0 && (
        <div className="mt-4 p-4 bg-white/10 rounded-xl max-h-64 overflow-y-auto">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-white font-bold">
              Area Search for: {Array.isArray(travelRecordDevice) ? travelRecordDevice.join(', ') : travelRecordDevice}
            </h3>
            <button
              onClick={onSaveGeofence}
              className="px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-lg transition-all font-medium text-sm flex items-center gap-2"
              title="Save this geofence"
            >
              💾 Save Geofence
            </button>
          </div>
          <div className="space-y-2">
            {journeys.map((journey, index) => {
              const startDate = new Date(journey.start_time);
              const endDate = new Date(journey.end_time);
              const isSelected = selectedJourneyIndex === index;

              return (
                <button
                  key={`legend-${index}`}
                  onClick={() => setSelectedJourneyIndex(index)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all cursor-pointer hover:bg-white/20 ${isSelected ? 'bg-sky-600/30 border-2 border-sky-400' : 'bg-white/5'
                    }`}
                >
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: JOURNEY_COLORS[index % JOURNEY_COLORS.length] }}
                  />
                  <div className="text-white text-xs text-left flex-1">
                    <div className="font-semibold">
                      Journey {index + 1}
                      {journey.device_id && <span className="text-sky-400 ml-2">({journey.device_id})</span>}
                    </div>
                    <div className="text-white/70">
                      {startDate.toLocaleString('es-ES', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })} - {endDate.toLocaleString('es-ES', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  </div>
                  {isSelected && (
                    <div className="text-sky-400 text-lg">
                      📍
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
// --- App Principal ---
function App() {
  const [locationsData, setLocationsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [paths, setPaths] = useState({});
  const [allDevices, setAllDevices] = useState([]);
  const [activeDeviceIds, setActiveDeviceIds] = useState([]);
  const [isDateSearchModalOpen, setIsDateSearchModalOpen] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(true);


  const [travelRecordMode, setTravelRecordMode] = useState(false);
  const [isDeviceSelectionModalOpen, setIsDeviceSelectionModalOpen] = useState(false);
  const [selectedDeviceForTravel, setSelectedDeviceForTravel] = useState([]);
  const [journeys, setJourneys] = useState([]);
  const [selectedDeviceForZoom, setSelectedDeviceForZoom] = useState(null);
  const [currentArea, setCurrentArea] = useState(null);
  const [isSaveGeofenceModalOpen, setIsSaveGeofenceModalOpen] = useState(false);
  const [isGeofencesListModalOpen, setIsGeofencesListModalOpen] = useState(false);
  const [isDrawingAllowed, setIsDrawingAllowed] = useState(true);
  const [showVideoStream, setShowVideoStream] = useState(false);
  const [selectedDeviceForVideo, setSelectedDeviceForVideo] = useState(null);

  const fetchAllDevices = async () => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/devices`);
      if (response.ok) {
        const data = await response.json();
        const devicesArray = Array.isArray(data)
          ? data
            .map(d => typeof d === 'string' ? { device_id: d } : d)
            .filter(d => d.device_id && d.device_id !== 'Device' && d.device_id !== 'unknown' && d.device_id.trim() !== '')
          : [];
        setAllDevices(devicesArray);
      }
    } catch (err) {
      console.error('Error fetching devices:', err);
    }
  };

  const filterActiveDevices = (locations) => {
    return locations.filter(location => isDeviceActive(location.timestamp_value));
  };

  const cleanInactivePaths = (activeDeviceIds) => {
    setPaths(prevPaths => {
      const newPaths = {};
      activeDeviceIds.forEach(deviceId => {
        if (prevPaths[deviceId]) {
          newPaths[deviceId] = prevPaths[deviceId];
        }
      });
      return newPaths;
    });
  };

  const fetchLatestLocations = async () => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/location/latest-by-devices`);

      if (!response.ok) {
        if (response.status === 404) {
          setLocationsData([]);
          setActiveDeviceIds([]);
        } else {
          throw new Error('Error al obtener datos');
        }
      } else {
        const data = await response.json();

        // Filtrar ubicaciones sin device_id válido
        const validData = data.filter(loc =>
          loc.device_id &&
          loc.device_id !== 'Device' &&
          loc.device_id !== 'unknown' &&
          loc.device_id.trim() !== ''
        );

        const activeLocations = filterActiveDevices(validData);
        setLocationsData(activeLocations);

        const activeIds = activeLocations.map(loc => loc.device_id);
        setActiveDeviceIds(activeIds);

        cleanInactivePaths(activeIds);

        setPaths(prevPaths => {
          const newPaths = { ...prevPaths };

          activeLocations.forEach(location => {
            const deviceId = location.device_id || 'unknown';
            const newPosition = [parseFloat(location.latitude), parseFloat(location.longitude)];
            const devicePath = newPaths[deviceId] || [];
            const lastPoint = devicePath[devicePath.length - 1];

            if (!lastPoint || lastPoint[0] !== newPosition[0] || lastPoint[1] !== newPosition[1]) {
              newPaths[deviceId] = [...devicePath, newPosition];
            }
          });

          return newPaths;
        });

        setError(null);
      }
    } catch (err) {
      setError('Error de conexión con el servidor');
      console.error('Error fetching locations:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDateSearch = async (searchData) => {
    setLoading(true);
    setIsLiveMode(false);
    setError(null);

    try {
      const { startDate, endDate, deviceId } = searchData;
      const url = deviceId
        ? `${config.API_BASE_URL}/api/location/range?startDate=${startDate}&endDate=${endDate}&device_id=${deviceId}`
        : `${config.API_BASE_URL}/api/location/range?startDate=${startDate}&endDate=${endDate}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('Error al obtener el historial de ubicaciones');
      }

      const historicalData = await response.json();

      // Filtrar datos sin device_id válido
      const validHistoricalData = historicalData.filter(point =>
        point.device_id &&
        point.device_id !== 'Device' &&
        point.device_id !== 'unknown' &&
        point.device_id.trim() !== ''
      );

      if (validHistoricalData.length > 0) {
        const pathsByDevice = {};
        const locationsByDevice = {};

        validHistoricalData.forEach(point => {
          const devId = point.device_id;
          if (!pathsByDevice[devId]) {
            pathsByDevice[devId] = [];
          }
          pathsByDevice[devId].push([
            parseFloat(point.latitude),
            parseFloat(point.longitude)
          ]);

          locationsByDevice[devId] = point;
        });

        setPaths(pathsByDevice);

        const allLocations = Object.values(locationsByDevice);
        setLocationsData(allLocations);

        setActiveDeviceIds(Object.keys(locationsByDevice));

      } else {
        setPaths({});
        setError('No hay datos de ubicación en este tiempo.');
        setLocationsData([]);
        setActiveDeviceIds([]);
      }

    } catch (err) {
      setError('Error de conexión al buscar el historial.');
      console.error('Error fetching date range:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenTravelRecord = () => {
    setIsDeviceSelectionModalOpen(true);
  };

  const handleDeviceSelected = (deviceIds) => {
    setSelectedDeviceForTravel(deviceIds);
    setTravelRecordMode(true);
    setIsLiveMode(false);
    setJourneys([]);
    setLocationsData([]);
    setPaths({});
    setIsDrawingAllowed(true);
  };

  const handleAreaDrawn = async (area) => {
    if (!selectedDeviceForTravel || selectedDeviceForTravel.length === 0) return;
    setCurrentArea(area);
    setIsDrawingAllowed(false);
    setLoading(true);
    try {
      const allJourneys = [];

      for (const deviceId of selectedDeviceForTravel) {
        const url = `${config.API_BASE_URL}/api/location/area-records?minLat=${area.minLat}&maxLat=${area.maxLat}&minLng=${area.minLng}&maxLng=${area.maxLng}&device_id=${deviceId}`;

        const response = await fetch(url);

        if (response.ok) {
          const data = await response.json();
          const journeysWithDevice = data.map(journey => ({
            ...journey,
            device_id: deviceId
          }));
          allJourneys.push(...journeysWithDevice);
        }
      }

      if (allJourneys.length > 0) {
        setJourneys(allJourneys);
        setError(null);
      } else {
        setError('No se encontraron recorridos en esta área para los dispositivos seleccionados.');
        setJourneys([]);
      }
    } catch (err) {
      setError('Error al buscar recorridos en el área.');
      console.error('Error fetching area records:', err);
    } finally {
      setLoading(false);
    }
  };
  const handleDeviceClick = (deviceId) => {
    if (!isLiveMode) {
      setSelectedDeviceForZoom(deviceId);
      // Resetear después de un tiempo para permitir múltiples clicks
      setTimeout(() => setSelectedDeviceForZoom(null), 2000);
    }
  };


  const handleExitTravelRecord = () => {
    setTravelRecordMode(false);
    setSelectedDeviceForTravel([]);
    setJourneys([]);
    setCurrentArea(null);
    setIsLiveMode(true);
    setLoading(true);
    setIsDrawingAllowed(true);
  };
  const handleSaveGeofence = async (geofenceData) => {
    try {
      // Preparar el payload de la geocerca (sin journeys)
      const geofencePayload = {
        name: geofenceData.name,
        description: geofenceData.description || '',
        min_lat: geofenceData.area.minLat,
        max_lat: geofenceData.area.maxLat,
        min_lng: geofenceData.area.minLng,
        max_lng: geofenceData.area.maxLng,
        device_ids: geofenceData.devices,
        created_by: 'julicarolinav'
      };

      // Preparar los journeys en el formato correcto
      const journeysPayload = geofenceData.journeys && geofenceData.journeys.length > 0
        ? geofenceData.journeys.map(journey => ({
          device_id: journey.device_id,
          start_time: journey.start_time,
          end_time: journey.end_time,
          points: journey.points
        }))
        : null;

      // Crear el payload completo
      const payload = {
        geofence: geofencePayload,
        journeys: journeysPayload
      };

      console.log('Sending payload:', JSON.stringify(payload, null, 2)); // Para debug

      const response = await fetch(`${config.API_BASE_URL}/api/geofences`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Server error:', errorData);
        throw new Error(`Failed to save geofence: ${JSON.stringify(errorData)}`);
      }

      const result = await response.json();
      console.log('Geofence saved successfully:', result);
      alert('✅ Geofence saved successfully!');
    } catch (err) {
      console.error('Error saving geofence:', err);
      throw err;
    }
  };
  // Cargar la geocerca en el mapas
  const handleLoadGeofence = (geofenceData) => {
    // Cargar la geocerca en el mapa
    setSelectedDeviceForTravel(geofenceData.device_ids);
    setTravelRecordMode(true);
    setIsLiveMode(false);
    setJourneys(geofenceData.journeys);
    setCurrentArea({
      minLat: geofenceData.min_lat,
      maxLat: geofenceData.max_lat,
      minLng: geofenceData.min_lng,
      maxLng: geofenceData.max_lng
    });
    setLocationsData([]);
    setPaths({});
  };


  useEffect(() => {
    fetchAllDevices();
  }, []);

  useEffect(() => {
    let interval;
    if (isLiveMode) {
      fetchLatestLocations();
      interval = setInterval(() => {
        fetchLatestLocations();
        fetchAllDevices();
      }, config.POLLING_INTERVAL);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isLiveMode]);

  const formatTimestamp = (timestamp) => {
    const date = new Date(parseInt(timestamp));
    return date.toLocaleString('es-ES', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  };

  return (
    <div className="min-h-screen transition-all duration-500 dark">
      <div className="fixed inset-0 -z-10 transition-all duration-500">
        <div className="absolute inset-0 animated-gradient"></div>
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-20 left-10 w-72 h-72 md:w-96 md:h-96 bg-black rounded-full filter blur-3xl opacity-40 animate-float"></div>
          <div className="absolute bottom-20 right-10 w-64 h-64 md:w-80 md:h-80 bg-black rounded-full filter blur-3xl opacity-30 animate-float"></div>
          <div className="absolute top-1/2 left-1/2 w-48 h-48 md:w-64 md:h-64 bg-black rounded-full filter blur-3xl opacity-20 animate-float"></div>
        </div>
      </div>

      <main className='flex flex-col md:flex-row items-center justify-center gap-8 max-w-[90%] mx-auto min-h-screen py-10'>
        {loading ? (
          <LoadingSpinner />
        ) : error ? (
          <ErrorMessage error={error} onRetry={isLiveMode ? fetchLatestLocations : () => window.location.reload()} />
        ) : (
          <>
            {!isLiveMode && !travelRecordMode && (
              <div className="absolute top-40 left-1/2 -translate-x-1/2 z-40">
                <button
                  onClick={() => {
                    setIsLiveMode(true);
                    setPaths({});
                    setError(null);
                    setLoading(true);
                  }}
                  className="flex items-left gap-2 px-6 py-3 bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white rounded-xl shadow-lg transition-all font-medium"
                >
                  Return to live mode
                </button>
              </div>
            )}

            {travelRecordMode && (
              <div className="absolute top-40 left-1/2 -translate-x-1/2 z-40">
                <button
                  onClick={handleExitTravelRecord}
                  className="flex items-left gap-2 px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-xl shadow-lg transition-all font-medium"
                >
                  Exit Area Search Mode
                </button>
              </div>
            )}

            <div className="w-full md:w-3/4 animate-slide-in-left interactive-glow rounded-4xl">
              <LocationMap
                locations={locationsData}
                formatTimestamp={formatTimestamp}
                paths={paths}
                allDevices={allDevices}
                travelRecordMode={travelRecordMode}
                onAreaDrawn={handleAreaDrawn}
                journeys={journeys}
                travelRecordDevice={selectedDeviceForTravel}
                selectedDeviceForZoom={selectedDeviceForZoom}
                onSaveGeofence={() => setIsSaveGeofenceModalOpen(true)}
                isDrawingAllowed={isDrawingAllowed}
              />
            </div>
            <div className="w-full md:w-1/4 flex flex-col gap-8 text-center animate-slide-in-right">
              <h1 className="font-bold text-7xl bg-gradient-to-r from-sky-400 to-cyan-300 text-transparent bg-clip-text" style={{ fontFamily: 'Poppins, sans-serif' }}>
                {config.APP_NAME}
              </h1>
              <DevicesList
                allDevices={allDevices}
                activeDeviceIds={activeDeviceIds}
                onOpenDateSearch={() => setIsDateSearchModalOpen(true)}
                onOpenTravelRecord={handleOpenTravelRecord}
                onDeviceClick={handleDeviceClick}
                isLiveMode={isLiveMode}
                onOpenGeofencesList={() => setIsGeofencesListModalOpen(true)}
              />
              {isLiveMode && activeDeviceIds.length > 0 && !showVideoStream && (
                <div className="mt-4">
                  <button
                    onClick={() => setShowVideoStream(true)}
                    className="w-full button-hover inline-flex items-center justify-center gap-2 font-semibold rounded-full transition-all duration-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-6 py-3 shadow-lg"
                  >
                    📹 Ver Todas las Transmisiones en Vivo
                  </button>
                </div>
              )}

            </div>

           
            {/* ⭐ MODAL DE VIDEO - MÚLTIPLES DISPOSITIVOS ⭐ */}
{showVideoStream && (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={() => setShowVideoStream(false)} />
    <div className="relative z-10 w-full max-w-7xl h-[90vh]">
      <div className="glassmorphism-strong rounded-4xl p-6 h-full flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-white">📹 Transmisiones en Vivo</h2>
          <button
            onClick={() => setShowVideoStream(false)}
            className="text-white/60 hover:text-white p-2 text-3xl transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          <MultiVideoGrid
            serverUrl={import.meta.env.VITE_WEBRTC_URL || 'https://panteratracker.tech'}
          />
        </div>

        <div className="mt-4 flex justify-center">
          <button
            onClick={() => setShowVideoStream(false)}
            className="px-8 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-all font-medium shadow-lg"
          >
            Cerrar Todas las Transmisiones
          </button>
        </div>
      </div>
    </div>
  </div>
)}
{/* ⭐ FIN DEL MODAL DE VIDEO ⭐ */}
          </>
        )}
      </main>


      <DateSearchModal
        isOpen={isDateSearchModalOpen}
        onClose={() => setIsDateSearchModalOpen(false)}
        onSearch={handleDateSearch}
        devices={allDevices}
      />

      <DeviceSelectionModal
        isOpen={isDeviceSelectionModalOpen}
        onClose={() => setIsDeviceSelectionModalOpen(false)}
        onSelectDevice={handleDeviceSelected}
        devices={allDevices}
      />

      <SaveGeofenceModal
        isOpen={isSaveGeofenceModalOpen}
        onClose={() => setIsSaveGeofenceModalOpen(false)}
        onSave={handleSaveGeofence}
        area={currentArea}
        devices={selectedDeviceForTravel}
        journeys={journeys}
      />

      <GeofencesListModal
        isOpen={isGeofencesListModalOpen}
        onClose={() => setIsGeofencesListModalOpen(false)}
        onLoadGeofence={handleLoadGeofence}
      />
    </div>
  );
}

export default App;