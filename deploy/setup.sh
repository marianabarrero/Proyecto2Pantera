#!/bin/bash

# Script de instalación para Ubuntu 24.04 (Noble) - CORREGIDO

echo "🚀 Iniciando configuración del servidor..."

# Actualizar sistema
apt-get update
apt-get upgrade -y

# Instalar Python 3.12 y sus herramientas (venv, etc.)
# CAMBIO: Usamos python3.12-full que incluye todo lo necesario
apt-get install -y python3.12-full

# Crear enlaces simbólicos (esto estaba bien)
ln -sf /usr/bin/python3.12 /usr/bin/python3
ln -sf /usr/bin/python3.12 /usr/bin/python

# Instalar Node.js, git, nginx (esto estaba bien)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
apt-get install -y nodejs git nginx

# Instalar PM2 globalmente (esto estaba bien)
npm install -g pm2

# Crear directorio para la aplicación
mkdir -p /opt/location-tracker
cd /opt/location-tracker

# Clonar el repositorio (esto estaba bien)
echo "📦 Clonando repositorio..."
read -p "Ingresa la URL del repositorio de GitHub: " REPO_URL
git clone $REPO_URL .

# Configurar Backend Python
echo "⚙️ Configurando Backend Python..."
cd backend

# Crear entorno virtual
python3 -m venv venv
source venv/bin/activate

# Instalar dependencias
# CAMBIO: Usamos "python3 -m pip" que es más robusto y evita problemas de PATH
echo "🐍 Instalando dependencias de Python..."
python3 -m pip install --upgrade pip
python3 -m pip install -r requirements.txt

# Crear archivo .env para backend (esto estaba bien)
echo "Configurando variables de entorno del backend..."
read -p "DB_HOST (RDS endpoint): " DB_HOST
read -p "DB_NAME: " DB_NAME
read -p "DB_USER: " DB_USER
read -sp "DB_PASSWORD: " DB_PASSWORD
echo
cat > .env <<EOL
DB_HOST=$DB_HOST
DB_PORT=5432
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
HTTP_PORT=3001
UDP_PORT=6001
ENVIRONMENT=production
EOL

# Iniciar backend con PM2
# CAMBIO CLAVE: Le decimos a PM2 la ruta exacta del intérprete de Python del entorno virtual.
# Esto soluciona el error "Interpreter python3 is NOT AVAILABLE".
echo "🚀 Iniciando backend con PM2..."
pm2 start run.py --name location-backend-py --interpreter /opt/location-tracker/backend/venv/bin/python
pm2 save
pm2 startup systemd -u ubuntu --hp /home/ubuntu

# Configurar Frontend (todo esto estaba bien)
echo "⚙️ Configurando Frontend..."
cd ../frontend
npm install
PUBLIC_IP=$(curl -s http://checkip.amazonaws.com)
cat > .env <<EOL
VITE_API_URL=http://$PUBLIC_IP:3001
VITE_POLLING_INTERVAL=5000
EOL
npm run build

# Configurar Nginx (todo esto estaba bien)
echo "🌐 Configurando Nginx..."
cat > /etc/nginx/sites-available/location-tracker <<'EOL'
server {
    listen 80;
    server_name _;
    root /opt/location-tracker/frontend/dist;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
    location /api {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
    }
}
EOL
ln -sf /etc/nginx/sites-available/location-tracker /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

# Configurar firewall (todo esto estaba bien)
echo "🔒 Configurando firewall..."
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 3001/tcp
ufw allow 6001/udp
ufw --force enable

echo "✅ Instalación completada!"
echo "IP pública de tu servidor: $PUBLIC_IP"