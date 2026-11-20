// Must stay first: brings over a tablet's sheets from the laptop's old address before the store loads.
import './move-accept'
import { createApp } from 'vue'
// Fonts are bundled into the build so the app never needs the internet (judges and host share a LAN only).
import '@fontsource-variable/inter'
import '@fontsource-variable/space-grotesk'
import App from './App.vue'
import { registerServiceWorker } from './pwa'
import './style.css'

createApp(App).mount('#app')
registerServiceWorker()
