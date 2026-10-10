// 버킷 CORS 설정 — 브라우저가 presigned PUT 으로 영상을 스토리지에 직접 올리려면 필요하다.
//   실행:  cd server && node scripts/set-bucket-cors.mjs          (설정)
//          cd server && node scripts/set-bucket-cors.mjs --show   (현재 설정만 보기)
// Origin 은 '*' 로 둔다 — 올리기 권한은 CORS 가 아니라 서버가 내준 서명 주소(presigned URL)가 쥐고 있다.
// (읽기(GET)는 버킷이 이미 공개라 CORS 와 무관하게 열려 있다.)
import dotenv from 'dotenv'
import { S3Client, GetBucketCorsCommand, PutBucketCorsCommand } from '@aws-sdk/client-s3'

dotenv.config({ path: new URL('../../.env', import.meta.url) })

const Bucket = process.env.CLOUD_BUCKET || 'swimmingphotography-bucket'
const client = new S3Client({
  endpoint: process.env.CLOUD_ENDPOINT,
  region: process.env.CLOUD_REGION || 'auto',
  credentials: { accessKeyId: process.env.CLOUD_ACCESS_KEY_ID, secretAccessKey: process.env.CLOUD_SECRET_ACCESS_KEY },
})

const show = async () => {
  try {
    const r = await client.send(new GetBucketCorsCommand({ Bucket }))
    console.log(JSON.stringify(r.CORSRules || [], null, 2))
  } catch (e) {
    console.log('(CORS 설정 없음)', e.name)
  }
}

if (!process.argv.includes('--show')) {
  await client.send(new PutBucketCorsCommand({
    Bucket,
    CORSConfiguration: {
      CORSRules: [{
        AllowedOrigins: ['*'],
        AllowedMethods: ['GET', 'HEAD', 'PUT'],
        AllowedHeaders: ['*'],
        ExposeHeaders: ['ETag'],
        MaxAgeSeconds: 3600,
      }],
    },
  }))
  console.log(`CORS 설정 완료: ${Bucket}`)
}
await show()
