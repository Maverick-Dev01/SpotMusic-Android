# SpotMusic 1.0.7

## Cambios

- Diálogos de aviso, confirmación y entrada de texto unificados, con tema claro/oscuro, navegación por teclado, Escape y retorno del foco. Cierre de paneles mediante Atrás en Android.
- Contraste de superficies, ondas y texto ajustado; las variantes translúcidas y el texto del acento siguen el color seleccionado.
- Corregidas búsquedas descartadas mientras había otra solicitud en curso y reproducción duplicada al pulsar el botón de una descarga.
- Ecualizador Web Audio real para archivos locales: cinco bandas, bajos y reducción de ganancia para evitar saturación. Controles deshabilitados con explicación para fuentes externas que no se procesan.
- Reintentar y cancelar descargas desde la lista de tareas. Se mantiene la cancelación cooperativa de transferencias nativas.
- Caché de resolución limitada a 100 entradas, caducidad de cinco minutos y consultas simultáneas compartidas.
- Reproducir sin cola abre la búsqueda; errores de audio visibles y actualización del estado al vaciar la cola.
- Incluye las correcciones de licencias, descarga única, escape HTML y actualización descritas en REVISION-2026-09-17.md.

## Verificación

- Nueve pruebas de regresión: licencia falsificada offline, bandera local no verificada, fechas de expiración, revocación, escape HTML, error de actualización, release estable/URL ajena, carrera de reproducción y cancelación de cola.
- Compilación TypeScript/Vite, sincronización Capacitor y ensamblado Android release.
- Navegador: aviso de descarga sin canción, cierre con Enter y recuperación del foco, creación persistente de playlist, validación de licencia vacía y diálogos claros/oscuros.
- Android 14 emulado, sesión de solo lectura: instalación de APK publicado 1.0.6 seguida de instalación 1.0.7 con `adb install -r`, ambas con Success. `versionCode=7`, `versionName=1.0.7`, sin flag DEBUGGABLE.
- Certificado SHA-256 idéntico al APK publicado 1.0.6: `5b5d7da7ada3d950d7668a54825382d6d6e97e61384a92743af508dd54f70b28`.

## Límites

El APK anterior utiliza certificado Android Debug. Esta entrega conserva ese certificado para permitir actualización y se compila con `debuggable false`. Debe planificarse una migración de firma, sin cambiarla arbitrariamente en una actualización.

La prueba de instalación con ADB valida aceptación de paquete/firma/versionCode; no sustituye la prueba táctil del permiso y el instalador desde una app ya instalada en un teléfono. No se verificó KeyForge con una licencia real ni todos los catálogos externos. La reproducción sigue usando HTMLAudio, no un servicio nativo Media3; el segundo plano prolongado depende del sistema. No se promete evasión de bloqueos ni un bitrate que la fuente no entregue.
