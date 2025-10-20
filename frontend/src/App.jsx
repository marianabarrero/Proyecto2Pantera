import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L, { Icon } from 'leaflet';
import { ThreeDot } from 'react-loading-indicators';

// --- MUI Date Picker Imports ---
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { DemoContainer } from '@mui/x-date-pickers/internals/demo';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import dayjs from 'dayjs';

import './App.css';

// --- Configuración Básica ---
const config = {
  API_BASE_URL: import.meta.env.VITE_API_URL || 'http://localhost:3001',
  APP_NAME: 'Pantera',
  APP_SUBTITLE: '',
  APP_VERSION: '2.0.0',
  POLLING_INTERVAL: import.meta.env.VITE_POLLING_INTERVAL || 5000,
  // Ya no se necesitan las claves de Jawg
};

// Arreglo para el ícono por defecto de Leaflet en Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

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

// --- NUEVO Modal de Búsqueda con MUI DateTimePicker ---
const DateSearchModal = ({ isOpen, onClose, onSearch }) => {
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Tema oscuro para los componentes de MUI
  const darkTheme = createTheme({
    palette: {
      mode: 'dark',
      primary: {
        main: '#0d47a1', // sky-500
      },
      background: {
        paper: '#1a237e',
      },
      text: {
        primary: '#FFFFFF',
        secondary: '#E5E7EB', // gray-200
      },
      typography: {
        fontFamily: 'Poppins, sans-serif',
      },
    },
    components: {
      MuiPickersToolbar: {
        styleOverrides: {
          root: {
            backgroundColor: 'rgba(13, 71, 161, 0.2)',
          },
        },
      },
      MuiDialogActions: {
        styleOverrides: {
          root: {
            // Estilo para los botones dentro de las acciones del diálogo
            '& .MuiButton-root': {
              color: '#FFFFFF', // Color de texto blanco
            },
          },
        },
      },
    },
  });

  const handleSearch = async () => {
    // Verificación de que ambas fechas estén seleccionadas
    if (!startDate || !endDate) {
      setError('Please select both a start and end date.');
      return;
    }
    // Verificación de que la fecha de fin sea posterior a la de inicio
    if (endDate.isBefore(startDate)) {
      setError('End date must be after the start date.');
      return;
    }

    setError(''); // Limpiar errores previos
    setIsLoading(true);

    try {
      // Simular búsqueda
      await new Promise(resolve => setTimeout(resolve, 1500));

      const searchData = {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      };

      onSearch(searchData);
      onClose(); // Cerrar el modal al finalizar
    } catch (err) {
      console.error('Error en búsqueda:', err);
      setError('An unexpected error occurred during the search.');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setStartDate(null);
    setEndDate(null);
    setError('');
  };

  // Resetea el formulario cuando el modal se cierra
  useEffect(() => {
    if (!isOpen) {
      resetForm();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal - Aumentado de tamaño para los pickers */}
      <div className="relative glassmorphism-strong rounded-4xl p-8 mx-4 w-full max-w-5xl transform">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">Select Date Range</h2>
          <button onClick={onClose} className="text-white/60 cursor-pointer hover:text-white p-1">
          </button>
        </div>

        <ThemeProvider theme={darkTheme}>
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <DemoContainer components={['DateTimePicker', 'DateTimePicker']}>
              <DateTimePicker
                label="Start Date"
                value={startDate}
                onChange={(newValue) => setStartDate(newValue)}
                maxDate={dayjs()} // No se pueden seleccionar fechas futuras
              />
              <DateTimePicker
                label="End Date"
                value={endDate}
                onChange={(newValue) => setEndDate(newValue)}
                minDate={startDate} // No se puede seleccionar antes de la fecha de inicio
                disabled={!startDate} // Deshabilitado hasta que se elija fecha de inicio
              />
            </DemoContainer>
          </LocalizationProvider>
        </ThemeProvider>

        {/* Error Message */}
        {error && (
          <div className="mt-4 text-center text-red-400 bg-red-900/50 p-3 rounded-xl">
            {error}
          </div>
        )}

        {/* Botones */}
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
            {isLoading ? (
              <>
                Searching...
              </>
            ) : (
              <>
                Search
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};


const LocationInfo = ({ location, formatTimestamp, onOpenDateSearch }) => (
  <>
    <div className='flex flex-col p-8 rounded-4xl glassmorphism-strong '>
      <div className=' rounded-4xl h-auto'>
        <h2 className='text-2xl font-bold text-white text-center rounded-4xl mb-8'>Last Location </h2>

        <div className='flex flex-row justify-between gap-4 rounded-xl mb-3 pl-2 pr-6 py-2'>
          <div className='flex flex-row gap-2 justify-left'>
            <h3 className='text-l text-white rounded-xl inline-block'>Latitude:</h3>
          </div>
          <div className="flex flex-col items-end">
            <span className='text-white/80 font-mono'>{parseFloat(location.latitude).toFixed(8)}</span>
          </div>
        </div>

        <div className='flex flex-row justify-between gap-4 rounded-xl mb-3 pl-2 pr-6 py-2'>
          <div className='flex flex-row gap-2 justify-left'>
            <h3 className='text-l text-white rounded-xl inline-block'>Longitude:</h3>
          </div>
          <div className="flex flex-col items-end">
            <span className='text-white/80 font-mono'>{parseFloat(location.longitude).toFixed(8)}</span>
          </div>
        </div>

        <div className='flex flex-row justify-between gap-4 rounded-xl mb-3 pl-2 pr-6 py-2'>
          <div className='flex flex-row gap-2 group justify-left'>
            <h3 className='text-l text-white rounded-xl inline-block'>Timestamp:</h3>
          </div>
          <div className="flex flex-col items-end">
            <span className='text-white/80 font-mono'>{formatTimestamp(location.timestamp_value)}</span>
          </div>
        </div>
      </div>
      <button
        onClick={onOpenDateSearch}
        className='button-hover inline-flex items-center justify-center gap-2 font-semibold rounded-full transition-all duration-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-800 disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-sky-600 to-sky-700 text-white hover:from-sky-700 hover:to-sky-800 px-20 py-3 md:px-20 md:py-2 text-base md:text-lg mt-2 mx-auto'
      >
        <span className='group-hover:text-white/90 duration-300'>Search by Date</span>
      </button>
    </div>
  </>
);

// --- Componente que actualiza la vista del mapa ---
const MapUpdater = ({ position }) => {
  const map = useMap();
  useEffect(() => {
    map.flyTo(position, map.getZoom(), {
      duration: 1.5,
      easeLinearity: 0.25
    });
  }, [position, map]);
  return null;
};

// --- Componente del Mapa ---
const LocationMap = ({ location, formatTimestamp, path }) => {
  const position = [parseFloat(location.latitude), parseFloat(location.longitude)];

  const customIcon = new Icon({
    iconUrl: "/icon.png",
    iconSize: [70, 70]
  });

  const polylineOptions = { color: '#110394', weight: 4 };

  return (
    <div className='glassmorphism-strong rounded-4xl backdrop-blur-lg shadow-lg p-4 max-w-4xl w-full mx-4'>
      <MapContainer
        center={position}
        zoom={18}
        style={{ height: '45rem', width: '100%', borderRadius: '1rem' }}
      >
        {/* --- CAMBIO AQUÍ --- */}
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <Marker position={position} icon={customIcon}>
          <Popup>
            <div className="text-center">
              <strong>Ubicación actual</strong><br />
              <small>Recibida: {formatTimestamp(location.timestamp_value)}</small><br />
              <small>Lat: {parseFloat(location.latitude).toFixed(6)}</small><br />
              <small>Lng: {parseFloat(location.longitude).toFixed(6)}</small>
            </div>
          </Popup>
        </Marker>
        <Polyline pathOptions={polylineOptions} positions={path} />
        <MapUpdater position={position} />
      </MapContainer>
    </div>
  );
};

// --- Componente Principal ---
function App() {
  const [locationData, setLocationData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [path, setPath] = useState([]);
  const [isDateSearchModalOpen, setIsDateSearchModalOpen] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(true);
  const [currentUser, setCurrentUser] = useState('user_1'); // 'user_1' o 'user_2'
  const [users, setUsers] = useState({
    user_1: { name: 'Usuario 1', color: '#110394' },
    user_2: { name: 'Usuario 2', color: '#940311' }
  });

  const fetchLatestLocation = async () => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/location/latest?user_id=${currentUser}`);


      if (!response.ok) {
        if (response.status === 404) {
          setError('No hay datos de ubicación disponibles');
          setLocationData(null);
        } else {
          throw new Error('Error al obtener datos');
        }
      } else {
        const data = await response.json();
        setLocationData(data);

        // --- LÓGICA PARA ACTUALIZAR LA TRAYECTORIA ---
        const newPosition = [parseFloat(data.latitude), parseFloat(data.longitude)];
        // Evita añadir puntos duplicados si la ubicación no ha cambiado
        setPath(prevPath => {
          const lastPoint = prevPath[prevPath.length - 1];
          if (!lastPoint || lastPoint[0] !== newPosition[0] || lastPoint[1] !== newPosition[1]) {
            return [...prevPath, newPosition];
          }
          return prevPath;
        });

        setError(null);
      }
    } catch (err) {
      setError('Error de conexión con el servidor');
      console.error('Error fetching location:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDateSearch = async (searchData) => {
    console.log('Búsqueda por fecha iniciada:', searchData);
    setLoading(true);
    setIsLiveMode(false); // Detenemos el modo en vivo
    setError(null);

    try {
      const { startDate, endDate } = searchData;
      // Construimos la URL con los parámetros de fecha
      const response = await fetch(`${config.API_BASE_URL}/api/location/range?user_id=${currentUser}&startDate=${startDate}&endDate=${endDate}`);

      if (!response.ok) {
        throw new Error('Error al obtener el historial de ubicaciones');
      }

      const historicalData = await response.json();

      if (historicalData.length > 0) {
        // Creamos la nueva ruta para la polilínea
        const newPath = historicalData.map(point => [
          parseFloat(point.latitude),
          parseFloat(point.longitude)
        ]);
        setPath(newPath);

        // Actualizamos la ubicación principal a la última del rango para centrar el mapa
        const lastLocationInRange = historicalData[historicalData.length - 1];
        setLocationData({
          latitude: lastLocationInRange.latitude,
          longitude: lastLocationInRange.longitude,
          timestamp_value: lastLocationInRange.timestamp_value
        });

      } else {
        // Si no hay datos, limpiamos la ruta y mostramos un mensaje
        setPath([]);
        setError('No hay datos de ubicación en este tiempo.');
        setLocationData(null); // Opcional: limpiar la última ubicación conocida
      }

    } catch (err) {
      setError('Error de conexión al buscar el historial.');
      console.error('Error fetching date range:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let interval;
    if (isLiveMode) {
      // Cargar la ubicación más reciente solo al entrar en modo en vivo
      fetchLatestLocation();
      // Activar el polling (actualización automática)
      interval = setInterval(fetchLatestLocation, config.POLLING_INTERVAL);
    }

    // Esta función se ejecuta para limpiar el intervalo cuando el modo cambia
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [currentUser, isLiveMode]); // <-- Añade isLiveMode como dependencia

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
          <ErrorMessage error={error} onRetry={isLiveMode ? fetchLatestLocation : () => window.location.reload()} retryText={isLiveMode ? "Reintentar" : "Volver al menú principal"} />
        ) : locationData ? (
          <>
            {/* --- BOTÓN PARA VOLVER A MODO EN VIVO --- */}
            {!isLiveMode && (
              <div className="absolute top-40 left-1/2 -translate-x-1/2 z-40">
                <button
                  onClick={() => {
                    setIsLiveMode(true);
                    setPath([]); // Limpiamos la ruta histórica
                    setError(null);
                    setLoading(true); // Mostramos spinner mientras carga la última ubicación
                  }}
                  className="flex items-left gap-2 px-6 py-3 bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white rounded-xl shadow-lg transition-all font-medium"
                >
                  Return to live mode
                </button>
              </div>
            )}
            <div className="w-full md:w-3/4 animate-slide-in-left interactive-glow rounded-4xl">
              <LocationMap location={locationData} formatTimestamp={formatTimestamp} path={path} />
            </div>
            <div className="w-full md:w-1/4 flex flex-col gap-8 text-center animate-slide-in-right">
              <h1 className="font-bold text-7xl bg-gradient-to-r from-sky-400 to-cyan-300 text-transparent bg-clip-text" style={{ fontFamily: 'Poppins, sans-serif' }}>
                {config.APP_NAME}
              </h1>
              {/* --- Selector de Usuario --- */}
  <div className="flex justify-center gap-4">
    {Object.keys(users).map(userId => (
      <button
        key={userId}
        onClick={() => setCurrentUser(userId)}
        className={`px-4 py-2 rounded-lg transition-colors ${
          currentUser === userId
            ? 'bg-sky-600 text-white'
            : 'bg-white/10 text-white/70 hover:bg-white/20'
        }`}
      >
        {users[userId].name}
      </button>
    ))}
  </div>
            <LocationInfo
              location={locationData}
              formatTimestamp={formatTimestamp}
              onOpenDateSearch={() => setIsDateSearchModalOpen(true)}
            />
          </div>
          </>
        ) : (
          <div className="glassmorphism-strong min-w-[90%] mx-auto rounded-4xl p-8 text-center">
            <p className="text-white/70 mb-4">Esperando datos de ubicación...</p>
          </div>
        )}
      </main>

      <DateSearchModal
        isOpen={isDateSearchModalOpen}
        onClose={() => setIsDateSearchModalOpen(false)}
        onSearch={handleDateSearch}
      />
    </div>
  );
}

export default App;