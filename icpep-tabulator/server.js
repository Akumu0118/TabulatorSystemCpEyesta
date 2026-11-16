// Serves the built app (dist/) and the API. Start with: npm start
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
const FILE = './data.json', PORT = 3000, ADMIN = process.env.ADMIN_PASS || 'admin'
let db = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE)) : { events: [], judges: [], scores: {} }
const persist = () => fs.writeFileSync(FILE, JSON.stringify(db))
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }
const body = req => new Promise(r => { let b = ''; req.on('data', d => b += d); req.on('end', () => r(b ? JSON.parse(b) : {})) })
http.createServer(async (req, res) => {
  const send = (o, c = 200) => { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)) }
  if (req.url === '/api/state') return send(db)
  if (req.url === '/api/info') return send({ port: PORT, ips: Object.values(os.networkInterfaces()).flat().filter(i => i.family === 'IPv4' && !i.internal).map(i => i.address) })
  if (req.url === '/api/config' && req.method === 'POST') {
    if (req.headers['x-admin-pass'] !== ADMIN) return send({ error: 'forbidden' }, 403)
    const b = await body(req); db.events = b.events; db.judges = b.judges; persist(); return send({ ok: true })
  }
  if (req.url === '/api/scores' && req.method === 'POST') {
    const { items = [] } = await body(req)
    items.forEach(i => { (((db.scores[i.eventId] ||= {})[i.candidateId] ||= {})[i.judgeId]) = i.scores }); persist(); return send({ ok: true })
  }
  let f = path.join('dist', req.url === '/' ? 'index.html' : req.url.split('?')[0])
  if (!fs.existsSync(f)) f = 'dist/index.html'
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res)
}).listen(PORT, '0.0.0.0', () => console.log('Tabulator running on port', PORT))
