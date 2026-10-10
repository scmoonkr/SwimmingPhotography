// R2 / S3 호환 스토리지 업로드 헬퍼.
// 자격증명·엔드포인트·버킷은 .env 의 CLOUD_* 를 사용 (CLOUD_BUCKET = swimmingphotography-bucket).
// 오브젝트 키는 'SP-competitions-<id>/<파일명>' 프리픽스로 구분.
import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// env 는 dotenv.config 이후에 읽어야 하므로 지연 조회 (import 시점엔 아직 미로드)
const bucket = () => process.env.CLOUD_BUCKET || 'swimmingphotography-bucket'

let _client = null
function client() {
  if (_client) return _client
  const endpoint = process.env.CLOUD_ENDPOINT
  const region = process.env.CLOUD_REGION || 'auto'
  const accessKeyId = process.env.CLOUD_ACCESS_KEY_ID
  const secretAccessKey = process.env.CLOUD_SECRET_ACCESS_KEY
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('CLOUD_ENDPOINT / CLOUD_ACCESS_KEY_ID / CLOUD_SECRET_ACCESS_KEY 가 .env 에 설정되어야 합니다.')
  }
  _client = new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: false,
  })
  return _client
}

// 공개 URL (CLOUD_PUBLIC_URL 은 medalbankaquatics-bucket 의 공개 베이스여야 함)
export function publicUrl(key) {
  const base = (process.env.CLOUD_PUBLIC_URL || '').replace(/\/+$/, '')
  return `${base}/${key.split('/').map(encodeURIComponent).join('/')}`
}

export async function putObject(key, body, contentType) {
  await client().send(new PutObjectCommand({
    Bucket: bucket(),
    Key: key,
    Body: body,
    ContentType: contentType || 'application/octet-stream',
  }))
  return { key, url: publicUrl(key) }
}

export async function deleteObject(key) {
  await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }))
}

// 브라우저가 스토리지로 직접 올릴 주소(presigned PUT) — 영상처럼 큰 파일은 서버를 거치지 않는다.
// 올릴 때 Content-Type 헤더가 여기서 서명한 값과 같아야 한다. 버킷에 CORS(PUT) 설정이 있어야 브라우저에서 된다.
export function presignPut(key, contentType, expiresIn = 3600) {
  return getSignedUrl(client(), new PutObjectCommand({
    Bucket: bucket(), Key: key, ContentType: contentType || 'application/octet-stream',
  }), { expiresIn })
}

// 내려받기 주소(presigned GET) — 응답에 Content-Disposition: attachment 를 붙여 브라우저가 재생하지 않고 저장하게 한다.
// (스토리지가 다른 도메인이라 <a download> 만으로는 저장되지 않고 영상이 열려 버린다)
export function presignDownload(key, filename, expiresIn = 600) {
  const name = String(filename || key.split('/').pop() || 'download')
  const ascii = name.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_')
  return getSignedUrl(client(), new GetObjectCommand({
    Bucket: bucket(), Key: key,
    ResponseContentDisposition: `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
  }), { expiresIn })
}

// 오브젝트 확인 — 있으면 { size, contentType }, 없으면 null
export async function headObject(key) {
  try {
    const r = await client().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }))
    return { size: r.ContentLength ?? 0, contentType: r.ContentType || '' }
  } catch (e) {
    if (e?.$metadata?.httpStatusCode === 404 || e?.name === 'NotFound') return null
    throw e
  }
}

export { bucket }
