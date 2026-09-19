# Verificación de SpotMusic Mobile 1.0.21

- 17 pruebas automatizadas: licencia, actualizaciones, selección asíncrona de canciones, rechazo de previews, correspondencia de resultados, importación de 1000 canciones sin total declarado y eliminación de biblioteca/historial/carpetas.
- Compilación TypeScript/Vite y APK release Android.
- Emulador Android API 34: instalación sobre la versión anterior, búsqueda en la interfaz de Sneaky Snitch / Kevin MacLeod, reproducción nativa con duración real de 136.649 segundos. Archivo descargado de 3354558 bytes validado mediante MediaMetadataRetriever.
- Selección y eliminación de tres entradas de prueba desde la interfaz; sin desbordamiento horizontal en la barra de selección.
- Certificado SHA256 conservado: 5b5d7da7ada3d950d7668a54825382d6d6e97e61384a92743af508dd54f70b28.

## Límites de la verificación

La paginación de Spotify se probó con respuestas simuladas de 1000 canciones. La importación real de listas privadas requiere vincular una cuenta autorizada; no se simuló ni se utilizó una cuenta ajena. Las vistas públicas incompletas se identifican como parciales. Ninguna API garantiza la disponibilidad de toda canción en una fuente de audio completo.

El código web es compartido con iOS. Este equipo no tiene Xcode ni CocoaPods, por lo que no se generó ni publicó un IPA.

Se retiró el secreto de Spotify del código de la aplicación y se eliminan sus valores antiguos de almacenamiento web al iniciar. El secreto de versiones anteriores debe revocarse en Spotify Developer; quitarlo de una actualización no lo revoca.
