#!/bin/bash

# Script de instalación para Ubuntu 24.04 (Noble)

echo "🚀 Iniciando configuración del servidor..."

# Actualizar sistema
apt-get update
apt-get upgrade -y

# Instalar Python 3.12 (disponible por defecto en Ubuntu 24.04)
apt-get install -y python3.12 python3.12-venv python3-pip

# Crear enlace simbólico para que 'python3' apunte a 'python3.12'
ln -sf /usr/bin/python3.12 /usr/bin/python3
ln -sf /usr/bin/python3.12 /usr/bin/python

# Instalar Node.js 20.x (para el frontend)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
apt-get install -y nodejs

# Instalar git y nginx
apt-get install -y git nginx

# Instalar PM2 globalmente
npm install -g pm2

# Crear directorio para la aplicación
mkdir -p /opt/location-tracker
cd /opt/location-tracker

# Clonar el repositorio
echo "📦 Clonando repositorio..."
read -p "Ingresa la URL del repositorio de GitHub: " REPO_URL
if [ -d ".git" ]; then
    echo "El repositorio ya existe. Haciendo pull de los últimos cambios..."
    git pull
else
    echo "Clonando el repositorio..."
    git clone $REPO_URL .
fi


# Configurar Backend Python
echo "⚙️ Configurando Backend Python..."
cd backend

# Crear entorno virtual
python3 -m venv venv
source venv/bin/activate

# Instalar dependencias
pip install --upgrade pip
pip install -r requirements.txt

# Crear archivo .env para backend
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

# Crear script de inicio para PM2
cat > start.sh <<'EOL'
#!/bin/bash
cd /opt/location-tracker/backend
source venv/bin/activate
python run.py
EOL

chmod +x start.sh

# Iniciar backend con PM2
pm2 start start.sh --name location-backend-py --interpreter bash
pm2 save
pm2 startup systemd -u ubuntu --hp /home/ubuntu

# Configurar Frontend
echo "⚙️ Configurando Frontend..."
cd ../frontend

# Instalar dependencias y crear .env
npm install

# Obtener IP pública de la instancia
PUBLIC_IP=$(curl -s http://checkip.amazonaws.com)

cat > .env <<EOL
VITE_API_URL=http://$PUBLIC_IP:3001
VITE_POLLING_INTERVAL=5000
EOL

# Construir frontend
npm run build

# Configurar Nginx
echo "🌐 Configurando Nginx..."
cat > /etc/nginx/sites-available/location-tracker <<'EOL'
server {
    listen 80;
    server_name _;
    
    root /opt/location-tracker/frontend/dist;
    index index.html;
    
    # Frontend
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
    
    # Proxy para API
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOL

# Habilitar el sitio
ln -sf /etc/nginx/sites-available/location-tracker /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Reiniciar Nginx
nginx -t && systemctl restart nginx

# Configurar firewall
echo "🔒 Configurando firewall..."
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 3001/tcp
ufw allow 6001/udp
ufw --force enable

# Crear scripts de actualización
cat > /opt/location-tracker/update-all.sh <<'EOL'
#!/bin/bash
echo "🔄 Actualizando toda la aplicación..."
cd /opt/location-tracker
git pull
# Actualizar backend
cd backend
source venv/bin/activate
pip install -r requirements.txt
pm2 restart location-backend-py
# Actualizar frontend
cd ../frontend
npm install
npm run build
# Recargar Nginx
sudo systemctl reload nginx
echo "✅ Actualización completa terminada"
EOL
chmod +x /opt/location-tracker/update-all.sh

echo "✅ Instalación completada!"
echo ""
echo "📝 Notas importantes:"
echo "1. El backend Python está corriendo en PM2 (API: 3001, UDP: 6001)"
echo "2. El frontend está servido por Nginx en el puerto 80"
echo "3. Para ver logs del backend: pm2 logs location-backend-py"
echo "4. Para actualizar toda la aplicación: /opt/location-tracker/update-all.sh"
echo "5. IP pública de tu servidor: $PUBLIC_IP"
echo ""
echo "🔑 Configuración de seguridad AWS:"
echo "Asegúrate de abrir estos puertos en el Security Group de tu EC2:"
echo "- 22 (SSH), 80 (HTTP), 3001 (API Backend), 6001 (UDP)"