// R2 / S3 호환 스토리지 업로드 헬퍼.
// 자격증명·엔드포인트·버킷은 .env 의 CLOUD_* 를 사용 (CLOUD_BUCKET = swimmingphotography-bucket).
// 오브젝트 키는 'SP-competitions-<id>/<파일명>' 프리픽스로 구분.
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

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

export { bucket }
