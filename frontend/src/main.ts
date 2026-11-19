import { createApp } from 'vue'
// Fonts are bundled into the build so the app never needs the internet (judges and host share a LAN only).
import '@fontsource-variable/inter'
import '@fontsource-variable/space-grotesk'
import App from './App.vue'
import './style.css'

createApp(App).mount('#app')
