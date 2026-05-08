import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import type { Plugin } from 'vite'

const filesToCopy = [
  {
    source: path.resolve(__dirname, '../../02-application-schema/schema.sql'),
    dest: path.resolve(__dirname, 'src/assets/schema.sql'),
  },
  {
    source: path.resolve(__dirname, '../../01-single-region-cdk-cloud-deployment/Single-Region-YugabyteDB-Architecture.png'),
    dest: path.resolve(__dirname, 'src/assets/Single-Region-YugabyteDB-Architecture.png'),
  },
  {
    source: path.resolve(__dirname, '../../03-api-layer/API-Layer.png'),
    dest: path.resolve(__dirname, 'src/assets/API-Layer.png'),
  },
]

function copyExternalAssetsPlugin(): Plugin {
  function copyAll() {
    for (const { source, dest } of filesToCopy) {
      fs.copyFileSync(source, dest)
    }
  }
  const sourceSet = new Set(filesToCopy.map((f) => f.source))
  return {
    name: 'copy-external-assets',
    buildStart() {
      copyAll()
    },
    configureServer(server) {
      copyAll()
      for (const { source } of filesToCopy) {
        server.watcher.add(source)
      }
      server.watcher.on('change', (changedPath) => {
        if (sourceSet.has(path.resolve(changedPath))) {
          copyAll()
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), copyExternalAssetsPlugin()],
})
