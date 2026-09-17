# 📱 SpotMusic Mobile para Android (v1.0.0)

SpotMusic Mobile es una aplicación nativa para dispositivos Android que combina lo mejor de dos mundos:
1. **Un Reproductor de Música Tradicional Avanzado**: Con interfaz **Neo-Acoustic Glass**, tornamesa de vinilo giratorio interactivo, halo de luz ambiental dinámico extraído de la carátula, ecualizador gráfico de 5 bandas con Bass Booster, temporizador de sueño inteligente (*Sleep Timer*) y gestor de cola de reproducción.
2. **Motor de Búsqueda y Descargas de SpotMusic**: Búsqueda en el catálogo mundial, descarga de canciones y playlists con metadatos oficiales en HD (600x600 px) e integración con el sistema de licencias en la nube de **KeyForge Pro**.

---

## 🚀 Archivo Instalador APK Listo

El archivo instalador para Android ya está compilado y disponible en:
- **`SpotMusic-1.0.0.apk`** (3.6 MB)
- Ubicación física en tu Mac: `/Users/cattaherrrera/Downloads/SpotMusic-Android/SpotMusic-1.0.0.apk`

---

## 📲 Cómo Instalar en tu Dispositivo Android

1. **Enviar el archivo al teléfono**:
   - Puedes enviarte el archivo `SpotMusic-1.0.0.apk` por WhatsApp, Telegram, subirlo a Google Drive o conectando tu teléfono por cable USB.
2. **Habilitar Instalación de Orígenes Desconocidos**:
   - Al abrir el archivo `.apk` por primera vez en Android, el sistema te preguntará si deseas permitir la instalación desde esa app (Chrome, Drive, Archivos). Pulsa **"Permitir"**.
3. **Instalar y Disfrutar**:
   - Pulsa **Instalar**. En pocos segundos tendrás el icono de **SpotMusic** en tu pantalla de inicio.

---

## 🎨 Características Destacadas

### 1. The Sonic Deck (Tornamesa de Vinilo Analógico)
- Animación realista de disco de vinilo a 33 RPM con surcos concéntricos y etiqueta central con la carátula en alta definición.
- Puedes pulsar el disco para pausar o reanudar la música.
- Botón de alternancia para cambiar entre el **Modo Vinilo** y el **Modo Tarjeta de Álbum**.
- **Halo Ambiental Dinámico**: El fondo de la pantalla adopta gradientes de color suaves adaptados al arte de la pista en reproducción.

### 2. Barra de Forma de Onda Táctil (Waveform Scrubber)
- En lugar de una barra de progreso estática y delgada, SpotMusic Mobile dibuja una onda acústica viva.
- Puedes arrastrar el dedo en cualquier punto de la onda para adelantar o retroceder la canción con fluidez milimétrica.
- Incluye el indicador de calidad de audio (**320 KBPS / Hi-Fi**).

### 3. Ecualizador Gráfico de 5 Bandas + Bass Booster
- Bandas afinadas: **60 Hz** (sub-graves), **230 Hz** (graves), **910 Hz** (medios), **3.6 kHz** (presencia vocal) y **14 kHz** (brillo y aire).
- Rango de ganancia: de -12 dB a +12 dB.
- **Potenciador de Bajos (Bass Boost)**: Dial independiente para reforzar frecuencias sub-graves.
- **Presets Integrados**: *Plano (Flat)*, *Potenciador de Bajos*, *Rock*, *Pop*, *Electrónica / EDM*, *Jazz*, *Vocal* y *Acústico*.

### 4. Temporizador de Sueño (Sleep Timer) con Desvanecimiento
- Configura el apagado automático en **15, 30, 45, 60 o 90 minutos**, o elige la opción **"Fin de Canción"** para que se detenga exactamente cuando termine el tema actual.
- Durante los últimos 15 segundos, la aplicación aplica un **desvanecimiento suave de volumen (fade-out gradual)** para no interrumpir abruptamente tu descanso.

### 5. Cola de Reproducción ("A continuación")
- Panel deslizable inferior con contador de pistas, reordenación táctil y eliminación individual o vaciado completo.
- Modos de reproducción: **Aleatorio inteligente (Shuffle)** y **Repetición (Desactivado / Todo / Pista actual)**.

### 6. Biblioteca Offline y Favoritos
- Organiza tu música en: **Todas las canciones**, **Favoritas (❤️)** e **Historial reciente**.
- Funciona 100% offline sin necesidad de conexión a internet para toda tu música descargada.

### 7. Licenciamiento KeyForge Pro Móvil
- Detecta automáticamente el identificador de hardware único de tu Android (**Device ID**).
- Activa tokens en 1 segundo y sincroniza la vigencia en tiempo real con Supabase.

---

## 🛠️ Comandos de Desarrollo

```bash
# Iniciar servidor de desarrollo en navegador
npm run dev

# Compilar assets web
npm run build

# Sincronizar cambios web con el proyecto nativo Android
npm run cap:sync

# Compilar nuevo APK Debug
cd android && ./gradlew assembleDebug
```
