// SSE 브로드캐스트 — 연결된 모든 클라이언트(res)에 이벤트를 밀어준다.
// PM2 fork(단일 인스턴스) 기준. cluster로 늘리면 Redis/Mongo change stream 필요.
const clients = new Set()

export function addClient(res) {
  clients.add(res)
  res.on('close', () => clients.delete(res))
}

export function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of clients) {
    try { res.write(payload) } catch { clients.delete(res) }
  }
}

export const clientCount = () => clients.size
