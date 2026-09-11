import { defineConfig, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

// 自定义插件：让 Vite dev server 直接从项目根目录 serve 静态文件
// 解决 5173 端口下 /assets 图片和 /README.md 无法加载的问题
function serveRootFiles(): PluginOption {
  return {
    name: 'serve-root-files',
    configureServer(server) {
      // 项目根目录（client/ 的上一级）
      const rootDir = path.resolve(__dirname, '..')

      server.middlewares.use((req, res, next) => {
        // 去掉 query string
        const url = (req.url || '').split('?')[0]

        // /assets/* → 从根目录 assets/ 读取
        if (url.startsWith('/assets/')) {
          const filePath = path.join(rootDir, url)
          // 防止路径穿越
          if (!filePath.startsWith(rootDir)) {
            res.statusCode = 403
            res.end()
            return
          }
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath).toLowerCase()
            const mimeTypes: Record<string, string> = {
              '.png': 'image/png',
              '.jpg': 'image/jpeg',
              '.jpeg': 'image/jpeg',
              '.gif': 'image/gif',
              '.svg': 'image/svg+xml',
              '.webp': 'image/webp',
              '.ico': 'image/x-icon',
            }
            res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream')
            fs.createReadStream(filePath).pipe(res)
            return
          }
        }

        // /RULE.md → 从根目录读取
        if (url === '/RULE.md' || url === '/RULE' || url === '/RULE_EN.md') {
          const filePath = path.join(rootDir, url.split('/').pop() || 'RULE.md')
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
            fs.createReadStream(filePath).pipe(res)
            return
          }
        }

        next()
      })
    },
  }
}

export default defineConfig({
  cacheDir: 'node_modules/.vite-dev',
  plugins: [react(), serveRootFiles()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    host: true, // 监听所有网卡，允许内网设备（手机等）通过局域网 IP 访问
    port: 5173,
    allowedHosts: true,
    // 忽略编辑器原子写入产生的临时文件，避免文件监视器 EBUSY 崩溃
    watch: {
      ignored: ['**/.{*,*}.*.tmpdir/**', '**/*.tmp'],
    },
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
      },
      // /assets 不再代理到 3001，由 serveRootFiles 插件直接从根目录读取
    },
  },
})
