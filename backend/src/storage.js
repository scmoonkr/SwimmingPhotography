// 이미지 스토리지(S3 호환) — 사진 서비스와 같은 버킷·자격증명(.env 의 CLOUD_*)을 쓰되, 키 앞에 'erp/' 를 붙여 구분한다.
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

const bucket = () => process.env.CLOUD_BUCKET || 'swimmingphotography-bucket'
const base = () => (process.env.CLOUD_PUBLIC_URL || '').replace(/\/+$/, '')

let _client = null
function client() {
  if (_client) return _client
  const endpoint = process.env.CLOUD_ENDPOINT
  const accessKeyId = process.env.CLOUD_ACCESS_KEY_ID
  const secretAccessKey = process.env.CLOUD_SECRET_ACCESS_KEY
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('CLOUD_ENDPOINT / CLOUD_ACCESS_KEY_ID / CLOUD_SECRET_ACCESS_KEY 가 .env 에 설정되어야 합니다.')
  }
  _client = new S3Client({
    endpoint, region: process.env.CLOUD_REGION || 'auto',
    credentials: { accessKeyId, secretAccessKey }, forcePathStyle: false,
  })
  return _client
}

export const publicUrl = (key) => `${base()}/${key.split('/').map(encodeURIComponent).join('/')}`

export async function putObject(key, body, contentType) {
  await client().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType || 'application/octet-stream' }))
  return { key, url: publicUrl(key) }
}

export async function deleteObject(key) {
  await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }))
}

// 저장된 이미지 주소로 인정할 값 — 우리 스토리지의 erp/ 아래 주소만(임의 URL·javascript: 차단)
export function isOurImage(url) {
  const b = base()
  return !!b && String(url).startsWith(`${b}/erp/`)
}
export function keyOf(url) {
  const b = base()
  return decodeURIComponent(String(url).slice(b.length + 1))
}
